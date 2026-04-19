using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Presence.Services;

namespace SlackApp.Modules.Messaging.Services;

public sealed class ConversationService(
    IdentityDbContext dbContext,
    IRealtimeNotifier realtimeNotifier,
    TimeProvider timeProvider)
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public async Task<ConversationQueryResult<ConversationTimelineResponse>> GetHistoryAsync(
        Guid userId,
        Guid conversationId,
        long? beforeWatermark,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: false, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ConversationTimelineResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var normalizedPageSize = Math.Clamp(pageSize, 1, 100);
        var createdMessagesQuery = dbContext.ConversationMessages
            .Where(candidate =>
                candidate.ConversationId == conversationId &&
                candidate.EventType == MessagingEventTypes.MessageCreated &&
                candidate.MessageId != null);

        if (beforeWatermark is { } watermarkCursor)
        {
            createdMessagesQuery = createdMessagesQuery.Where(candidate => candidate.Watermark < watermarkCursor);
        }

        var descendingCreatedMessages = await createdMessagesQuery
            .OrderByDescending(candidate => candidate.Watermark)
            .Take(normalizedPageSize)
            .ToListAsync(cancellationToken);

        if (descendingCreatedMessages.Count == 0)
        {
            return ConversationQueryResult<ConversationTimelineResponse>.Success(new ConversationTimelineResponse(
                conversationId,
                access.Conversation!.CurrentWatermark,
                normalizedPageSize,
                null,
                Array.Empty<ChatMessageResponse>()));
        }

        var pageMessageIds = descendingCreatedMessages
            .Select(candidate => candidate.MessageId!.Value)
            .Distinct()
            .ToArray();

        var pageEvents = await dbContext.ConversationMessages
            .Where(candidate =>
                candidate.ConversationId == conversationId &&
                candidate.MessageId != null &&
                pageMessageIds.Contains(candidate.MessageId.Value))
            .OrderBy(candidate => candidate.Watermark)
            .ToListAsync(cancellationToken);

        var attachmentLookup = await LoadAttachmentLookupAsync(pageMessageIds, cancellationToken);

        var materializedMessages = pageEvents
            .GroupBy(candidate => candidate.MessageId!.Value)
            .Select(MaterializeMessage)
            .OrderBy(candidate => candidate.CreatedWatermark)
            .ToArray();

        var replyMessageIds = materializedMessages
            .Where(candidate => candidate.ReplyToMessageId is not null)
            .Select(candidate => candidate.ReplyToMessageId!.Value)
            .Except(materializedMessages.Select(candidate => candidate.MessageId))
            .Distinct()
            .ToArray();

        var replyLookup = await LoadReplyPreviewLookupAsync(conversationId, replyMessageIds, cancellationToken);

        foreach (var message in materializedMessages)
        {
            replyLookup[message.MessageId] = message;
        }

        var userLookup = await LoadUserLookupAsync(
            materializedMessages.Select(candidate => candidate.AuthorUserId)
                .Concat(replyLookup.Values.Select(candidate => candidate.AuthorUserId)),
            cancellationToken);

        var response = new ConversationTimelineResponse(
            conversationId,
            access.Conversation!.CurrentWatermark,
            normalizedPageSize,
            descendingCreatedMessages.Count == normalizedPageSize ? descendingCreatedMessages[^1].Watermark : null,
            materializedMessages.Select(candidate => MapChatMessage(candidate, userId, access, userLookup, replyLookup, attachmentLookup)).ToArray());

        return ConversationQueryResult<ConversationTimelineResponse>.Success(response);
    }

    public async Task<ConversationQueryResult<ConversationAccessGrant>> GetAccessAsync(
        Guid userId,
        Guid conversationId,
        bool requireWrite,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ConversationAccessGrant>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        return ConversationQueryResult<ConversationAccessGrant>.Success(new ConversationAccessGrant(
            access.Conversation!.Id,
            access.Conversation.Kind,
            access.Conversation.RoomId,
            access.OtherUserId,
            access.AccessMode,
            access.CanWrite,
            access.CanDeleteAnyMessage));
    }

    public async Task<ConversationQueryResult<ChatMessageResponse>> GetMessageAsync(
        Guid userId,
        Guid conversationId,
        Guid messageId,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: false, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var materializedMessage = await LoadMaterializedMessageAsync(conversationId, messageId, cancellationToken);
        if (materializedMessage is null)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "message_not_found",
                "That message could not be found.",
                StatusCodes.Status404NotFound);
        }

        var userLookup = await LoadUserLookupAsync([materializedMessage.AuthorUserId], cancellationToken);
        var replyLookup = await LoadReplyPreviewLookupAsync(
            conversationId,
            materializedMessage.ReplyToMessageId is { } replyId ? [replyId] : [],
            cancellationToken);
        var attachmentLookup = await LoadAttachmentLookupAsync([materializedMessage.MessageId], cancellationToken);

        return ConversationQueryResult<ChatMessageResponse>.Success(
            MapChatMessage(materializedMessage, userId, access, userLookup, replyLookup, attachmentLookup));
    }

    public async Task<ConversationQueryResult<ConversationSyncResponse>> GetSyncAsync(
        Guid userId,
        Guid conversationId,
        long afterWatermark,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: false, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ConversationSyncResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var messages = await dbContext.ConversationMessages
            .Where(candidate => candidate.ConversationId == conversationId && candidate.Watermark > afterWatermark)
            .OrderBy(candidate => candidate.Watermark)
            .ToListAsync(cancellationToken);

        return ConversationQueryResult<ConversationSyncResponse>.Success(new ConversationSyncResponse(
            conversationId,
            afterWatermark,
            access.Conversation!.CurrentWatermark,
            false,
            messages.Select(MapEvent).ToArray()));
    }

    public async Task<ConversationQueryResult<ConversationReadStateResponse>> MarkConversationReadAsync(
        Guid userId,
        Guid conversationId,
        long? watermark,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: false, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ConversationReadStateResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var now = timeProvider.GetUtcNow();
        var targetWatermark = Math.Clamp(watermark ?? access.Conversation!.CurrentWatermark, 0, access.Conversation!.CurrentWatermark);
        var readState = await dbContext.ConversationReadStates
            .SingleOrDefaultAsync(
                candidate => candidate.ConversationId == conversationId && candidate.UserAccountId == userId,
                cancellationToken);

        if (readState is null)
        {
            readState = new ConversationReadState
            {
                ConversationId = conversationId,
                UserAccountId = userId,
                LastReadWatermark = targetWatermark,
                UpdatedAtUtc = now
            };

            dbContext.ConversationReadStates.Add(readState);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        else if (targetWatermark > readState.LastReadWatermark)
        {
            readState.LastReadWatermark = targetWatermark;
            readState.UpdatedAtUtc = now;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var unreadCount = await CountUnreadMessagesAsync(userId, conversationId, readState.LastReadWatermark, cancellationToken);
        return ConversationQueryResult<ConversationReadStateResponse>.Success(new ConversationReadStateResponse(
            conversationId,
            readState.LastReadWatermark,
            unreadCount));
    }

    public async Task<IReadOnlyDictionary<Guid, ConversationSummarySnapshot>> GetConversationSummaryLookupAsync(
        Guid userId,
        IEnumerable<Guid> conversationIds,
        CancellationToken cancellationToken)
    {
        var ids = conversationIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, ConversationSummarySnapshot>();
        }

        var conversations = await dbContext.Conversations
            .Where(candidate => ids.Contains(candidate.Id))
            .ToDictionaryAsync(candidate => candidate.Id, cancellationToken);

        var readStateLookup = await dbContext.ConversationReadStates
            .Where(candidate => candidate.UserAccountId == userId && ids.Contains(candidate.ConversationId))
            .ToDictionaryAsync(candidate => candidate.ConversationId, cancellationToken);

        var events = await dbContext.ConversationMessages
            .Where(candidate => ids.Contains(candidate.ConversationId) && candidate.MessageId != null)
            .OrderBy(candidate => candidate.Watermark)
            .ToListAsync(cancellationToken);

        var materializedLookup = events
            .GroupBy(candidate => candidate.ConversationId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .GroupBy(candidate => candidate.MessageId!.Value)
                    .Select(MaterializeMessage)
                    .OrderByDescending(candidate => candidate.CreatedWatermark)
                    .ToArray());

        var latestMessageIds = materializedLookup.Values
            .Select(candidate => candidate.FirstOrDefault()?.MessageId)
            .Where(candidate => candidate is not null)
            .Select(candidate => candidate!.Value)
            .ToArray();

        var attachmentLookup = await LoadAttachmentLookupAsync(latestMessageIds, cancellationToken);
        var snapshots = new Dictionary<Guid, ConversationSummarySnapshot>(ids.Length);

        foreach (var conversationId in ids)
        {
            conversations.TryGetValue(conversationId, out var conversation);
            materializedLookup.TryGetValue(conversationId, out var materializedMessages);
            materializedMessages ??= Array.Empty<MaterializedMessage>();

            var latestMessage = materializedMessages.FirstOrDefault();
            var latestWatermark = conversation?.CurrentWatermark ?? 0;
            var lastReadWatermark = readStateLookup.TryGetValue(conversationId, out var readState)
                ? Math.Min(readState.LastReadWatermark, latestWatermark)
                : 0;
            var unreadCount = materializedMessages.Count(candidate =>
                candidate.AuthorUserId != userId &&
                candidate.CreatedWatermark > lastReadWatermark);

            snapshots[conversationId] = new ConversationSummarySnapshot(
                latestWatermark,
                lastReadWatermark,
                unreadCount,
                materializedMessages.Length,
                BuildPreviewText(latestMessage, attachmentLookup),
                latestMessage?.CreatedAtUtc);
        }

        return snapshots;
    }

    public async Task<ConversationQueryResult<DirectConversationListResponse>> GetDirectConversationsAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var conversations = await dbContext.Conversations
            .Where(candidate =>
                candidate.Kind == ConversationKinds.Direct &&
                (candidate.DirectFirstUserId == userId || candidate.DirectSecondUserId == userId))
            .OrderByDescending(candidate => candidate.CurrentWatermark)
            .ToListAsync(cancellationToken);

        if (conversations.Count == 0)
        {
            return ConversationQueryResult<DirectConversationListResponse>.Success(
                new DirectConversationListResponse(Array.Empty<DirectConversationSummaryResponse>()));
        }

        var otherUserIds = conversations
            .Select(candidate => candidate.DirectFirstUserId == userId ? candidate.DirectSecondUserId!.Value : candidate.DirectFirstUserId!.Value)
            .Distinct()
            .ToArray();

        var userLookup = await LoadUserLookupAsync(otherUserIds, cancellationToken);
        var friendshipPairs = await LoadFriendshipPairsAsync(userId, otherUserIds, cancellationToken);
        var banPairs = await LoadBanPairsAsync(userId, otherUserIds, cancellationToken);
        var readableConversationIds = new List<Guid>();
        var relationshipLookup = new Dictionary<Guid, (Guid OtherUserId, string UserName, string AccessMode)>();

        foreach (var conversation in conversations)
        {
            var otherUserId = conversation.DirectFirstUserId == userId
                ? conversation.DirectSecondUserId!.Value
                : conversation.DirectFirstUserId!.Value;

            var relationship = ResolveDirectRelationship(userId, otherUserId, friendshipPairs, banPairs);
            if (!relationship.CanRead)
            {
                continue;
            }

            readableConversationIds.Add(conversation.Id);
            relationshipLookup[conversation.Id] = (
                otherUserId,
                ResolveUserName(otherUserId, userLookup),
                relationship.AccessMode);
        }

        var snapshotLookup = await GetConversationSummaryLookupAsync(userId, readableConversationIds, cancellationToken);
        var summaries = new List<DirectConversationSummaryResponse>(readableConversationIds.Count);

        foreach (var conversationId in readableConversationIds)
        {
            var relationship = relationshipLookup[conversationId];
            var snapshot = snapshotLookup.TryGetValue(conversationId, out var summarySnapshot)
                ? summarySnapshot
                : ConversationSummarySnapshot.Empty;

            summaries.Add(new DirectConversationSummaryResponse(
                conversationId,
                relationship.OtherUserId,
                relationship.UserName,
                relationship.AccessMode,
                snapshot.LatestWatermark,
                snapshot.LastReadWatermark,
                snapshot.UnreadCount,
                snapshot.MessageCount,
                snapshot.LastMessagePreview,
                snapshot.LastMessageAtUtc));
        }

        return ConversationQueryResult<DirectConversationListResponse>.Success(new DirectConversationListResponse(
            summaries.OrderByDescending(candidate => candidate.LastMessageAtUtc ?? DateTimeOffset.MinValue)
                .ThenBy(candidate => candidate.TargetUserName, StringComparer.OrdinalIgnoreCase)
                .ToArray()));
    }

    public async Task<ConversationQueryResult<DirectConversationSummaryResponse>> OpenDirectConversationAsync(
        Guid userId,
        OpenDirectConversationRequest request,
        CancellationToken cancellationToken)
    {
        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return ConversationQueryResult<DirectConversationSummaryResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == userId)
        {
            return ConversationQueryResult<DirectConversationSummaryResponse>.Failure(
                "direct_conversation_self_blocked",
                "Direct conversations are only available between distinct users.",
                StatusCodes.Status400BadRequest);
        }

        var (firstUserId, secondUserId) = NormalizePair(userId, targetUser.Value.Id);
        var friendshipExists = await dbContext.Friendships.AnyAsync(candidate =>
            candidate.FirstUserId == firstUserId && candidate.SecondUserId == secondUserId, cancellationToken);

        var banExists = await HasAnyBanBetweenUsersAsync(userId, targetUser.Value.Id, cancellationToken);
        var conversation = await dbContext.Conversations.SingleOrDefaultAsync(candidate =>
            candidate.Kind == ConversationKinds.Direct &&
            candidate.DirectFirstUserId == firstUserId &&
            candidate.DirectSecondUserId == secondUserId, cancellationToken);

        if (banExists)
        {
            if (conversation is null)
            {
                return ConversationQueryResult<DirectConversationSummaryResponse>.Failure(
                    "direct_conversation_blocked_ban",
                    "Direct messages are frozen because one of these users has an active ban.",
                    StatusCodes.Status409Conflict);
            }

            return ConversationQueryResult<DirectConversationSummaryResponse>.Success(await BuildDirectConversationSummaryAsync(
                userId,
                conversation,
                targetUser.Value.Id,
                targetUser.Value.UserName,
                ConversationAccessModes.ReadOnly,
                cancellationToken));
        }

        if (!friendshipExists)
        {
            return ConversationQueryResult<DirectConversationSummaryResponse>.Failure(
                "direct_conversation_not_allowed",
                "Direct messages require a confirmed friendship.",
                StatusCodes.Status409Conflict);
        }

        if (conversation is null)
        {
            var now = timeProvider.GetUtcNow();
            conversation = new Conversation
            {
                Kind = ConversationKinds.Direct,
                DirectFirstUserId = firstUserId,
                DirectSecondUserId = secondUserId,
                CurrentWatermark = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.Conversations.Add(conversation);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return ConversationQueryResult<DirectConversationSummaryResponse>.Success(await BuildDirectConversationSummaryAsync(
            userId,
            conversation,
            targetUser.Value.Id,
            targetUser.Value.UserName,
            ConversationAccessModes.ReadWrite,
            cancellationToken));
    }

    public async Task<ConversationQueryResult<ChatMessageResponse>> SendMessageAsync(
        Guid userId,
        Guid conversationId,
        PostMessageRequest request,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: true, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var normalizedText = ValidateMessageText(request.Text);
        if (normalizedText is null)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "invalid_message_text",
                "A message must contain between 1 and 4000 characters after trimming.",
                StatusCodes.Status400BadRequest);
        }

        MaterializedMessage? replyTarget = null;
        if (request.ReplyToMessageId is { } replyToMessageId)
        {
            replyTarget = await LoadMaterializedMessageAsync(conversationId, replyToMessageId, cancellationToken);
            if (replyTarget is null)
            {
                return ConversationQueryResult<ChatMessageResponse>.Failure(
                    "reply_target_not_found",
                    "That reply target could not be found in this conversation.",
                    StatusCodes.Status404NotFound);
            }
        }

        var now = timeProvider.GetUtcNow();
        var logicalMessageId = Guid.NewGuid();
        access.Conversation!.CurrentWatermark += 1;
        access.Conversation.UpdatedAtUtc = now;

        var message = new ConversationMessage
        {
            ConversationId = conversationId,
            MessageId = logicalMessageId,
            Watermark = access.Conversation.CurrentWatermark,
            EventType = MessagingEventTypes.MessageCreated,
            ActorUserId = userId,
            ReplyToMessageId = request.ReplyToMessageId,
            TextContent = normalizedText,
            PayloadJson = SerializePayload(new
            {
                messageId = logicalMessageId,
                text = normalizedText,
                replyToMessageId = request.ReplyToMessageId
            }),
            CreatedAtUtc = now
        };

        dbContext.ConversationMessages.Add(message);
        await dbContext.SaveChangesAsync(cancellationToken);

        var userLookup = await LoadUserLookupAsync([userId], cancellationToken);
        var replyLookup = new Dictionary<Guid, MaterializedMessage>();
        if (replyTarget is not null)
        {
            replyLookup[replyTarget.MessageId] = replyTarget;
        }
        var attachmentLookup = new Dictionary<Guid, IReadOnlyList<MessageAttachmentResponse>>();

        var response = MapChatMessage(MaterializeMessage([message]), userId, access, userLookup, replyLookup, attachmentLookup);
        await realtimeNotifier.NotifyConversationAsync(
            message.EventType,
            conversationId,
            message.Watermark,
            MapEvent(message),
            cancellationToken);

        return ConversationQueryResult<ChatMessageResponse>.Success(response);
    }

    public async Task<ConversationQueryResult<ChatMessageResponse>> EditMessageAsync(
        Guid userId,
        Guid conversationId,
        Guid messageId,
        EditMessageRequest request,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: true, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var normalizedText = ValidateMessageText(request.Text);
        if (normalizedText is null)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "invalid_message_text",
                "A message must contain between 1 and 4000 characters after trimming.",
                StatusCodes.Status400BadRequest);
        }

        var events = await LoadMessageEventsAsync(conversationId, messageId, cancellationToken);
        if (events.Count == 0)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "message_not_found",
                "That message could not be found.",
                StatusCodes.Status404NotFound);
        }

        var materializedMessage = MaterializeMessage(events);
        if (materializedMessage.AuthorUserId != userId)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "message_edit_forbidden",
                "Only the original author can edit that message.",
                StatusCodes.Status403Forbidden);
        }

        if (materializedMessage.IsDeleted)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "message_deleted",
                "Deleted messages cannot be edited.",
                StatusCodes.Status409Conflict);
        }

        if (string.Equals(materializedMessage.Text, normalizedText, StringComparison.Ordinal))
        {
            var existingLookup = await LoadUserLookupAsync([materializedMessage.AuthorUserId], cancellationToken);
            var existingReplyLookup = await LoadReplyPreviewLookupAsync(conversationId, materializedMessage.ReplyToMessageId is { } existingReplyId ? [existingReplyId] : [], cancellationToken);
            var existingAttachmentLookup = await LoadAttachmentLookupAsync([materializedMessage.MessageId], cancellationToken);
            return ConversationQueryResult<ChatMessageResponse>.Success(
                MapChatMessage(materializedMessage, userId, access, existingLookup, existingReplyLookup, existingAttachmentLookup));
        }

        var now = timeProvider.GetUtcNow();
        access.Conversation!.CurrentWatermark += 1;
        access.Conversation.UpdatedAtUtc = now;

        var editEvent = new ConversationMessage
        {
            ConversationId = conversationId,
            MessageId = messageId,
            Watermark = access.Conversation.CurrentWatermark,
            EventType = MessagingEventTypes.MessageUpdated,
            ActorUserId = userId,
            ReplyToMessageId = materializedMessage.ReplyToMessageId,
            TextContent = normalizedText,
            PayloadJson = SerializePayload(new
            {
                messageId,
                text = normalizedText
            }),
            CreatedAtUtc = now
        };

        dbContext.ConversationMessages.Add(editEvent);
        await dbContext.SaveChangesAsync(cancellationToken);

        var updatedEvents = events.Append(editEvent).OrderBy(candidate => candidate.Watermark).ToArray();
        var updatedMessage = MaterializeMessage(updatedEvents);
        var userLookup = await LoadUserLookupAsync([updatedMessage.AuthorUserId], cancellationToken);
        var replyLookup = await LoadReplyPreviewLookupAsync(conversationId, updatedMessage.ReplyToMessageId is { } replyId ? [replyId] : [], cancellationToken);
        var attachmentLookup = await LoadAttachmentLookupAsync([updatedMessage.MessageId], cancellationToken);
        var response = MapChatMessage(updatedMessage, userId, access, userLookup, replyLookup, attachmentLookup);

        await realtimeNotifier.NotifyConversationAsync(
            editEvent.EventType,
            conversationId,
            editEvent.Watermark,
            MapEvent(editEvent),
            cancellationToken);

        return ConversationQueryResult<ChatMessageResponse>.Success(response);
    }

    public async Task<ConversationQueryResult<ChatMessageResponse>> DeleteMessageAsync(
        Guid userId,
        Guid conversationId,
        Guid messageId,
        CancellationToken cancellationToken)
    {
        var access = await AuthorizeConversationAccessAsync(userId, conversationId, requireWrite: false, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                access.ErrorCode!,
                access.ErrorMessage!,
                access.StatusCode);
        }

        var events = await LoadMessageEventsAsync(conversationId, messageId, cancellationToken);
        if (events.Count == 0)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "message_not_found",
                "That message could not be found.",
                StatusCodes.Status404NotFound);
        }

        var materializedMessage = MaterializeMessage(events);
        var canDelete = !materializedMessage.IsDeleted &&
            ((materializedMessage.AuthorUserId == userId && access.CanWrite) || access.CanDeleteAnyMessage);

        if (!canDelete)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "message_delete_forbidden",
                "You do not have permission to delete that message.",
                StatusCodes.Status403Forbidden);
        }

        var now = timeProvider.GetUtcNow();
        access.Conversation!.CurrentWatermark += 1;
        access.Conversation.UpdatedAtUtc = now;

        var deleteEvent = new ConversationMessage
        {
            ConversationId = conversationId,
            MessageId = messageId,
            Watermark = access.Conversation.CurrentWatermark,
            EventType = MessagingEventTypes.MessageDeleted,
            ActorUserId = userId,
            ReplyToMessageId = materializedMessage.ReplyToMessageId,
            PayloadJson = SerializePayload(new
            {
                messageId,
                deletedByUserId = userId
            }),
            CreatedAtUtc = now
        };

        dbContext.ConversationMessages.Add(deleteEvent);
        await dbContext.SaveChangesAsync(cancellationToken);

        var updatedEvents = events.Append(deleteEvent).OrderBy(candidate => candidate.Watermark).ToArray();
        var updatedMessage = MaterializeMessage(updatedEvents);
        var userLookup = await LoadUserLookupAsync([updatedMessage.AuthorUserId], cancellationToken);
        var replyLookup = await LoadReplyPreviewLookupAsync(conversationId, updatedMessage.ReplyToMessageId is { } replyId ? [replyId] : [], cancellationToken);
        var attachmentLookup = await LoadAttachmentLookupAsync([updatedMessage.MessageId], cancellationToken);
        var response = MapChatMessage(updatedMessage, userId, access, userLookup, replyLookup, attachmentLookup);

        await realtimeNotifier.NotifyConversationAsync(
            deleteEvent.EventType,
            conversationId,
            deleteEvent.Watermark,
            MapEvent(deleteEvent),
            cancellationToken);

        return ConversationQueryResult<ChatMessageResponse>.Success(response);
    }

    public async Task<ConversationEventResponse> AppendRoomActivityAsync(
        Guid conversationId,
        Guid roomId,
        string eventType,
        Guid? actorUserId,
        object payload,
        CancellationToken cancellationToken)
    {
        var conversation = await dbContext.Conversations.SingleAsync(candidate =>
            candidate.Id == conversationId &&
            candidate.RoomId == roomId, cancellationToken);

        var now = timeProvider.GetUtcNow();
        conversation.CurrentWatermark += 1;
        conversation.UpdatedAtUtc = now;

        var message = new ConversationMessage
        {
            ConversationId = conversationId,
            Watermark = conversation.CurrentWatermark,
            EventType = eventType,
            ActorUserId = actorUserId,
            PayloadJson = SerializePayload(payload),
            CreatedAtUtc = now
        };

        dbContext.ConversationMessages.Add(message);
        await dbContext.SaveChangesAsync(cancellationToken);

        var response = MapEvent(message);
        await realtimeNotifier.NotifyConversationAsync(
            eventType,
            conversationId,
            message.Watermark,
            response,
            cancellationToken);

        return response;
    }

    private async Task<ConversationAccessDescriptor> AuthorizeConversationAccessAsync(
        Guid userId,
        Guid conversationId,
        bool requireWrite,
        CancellationToken cancellationToken)
    {
        var conversation = await dbContext.Conversations.SingleOrDefaultAsync(candidate => candidate.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return ConversationAccessDescriptor.Failure(
                "conversation_not_found",
                "That conversation could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (conversation.RoomId is { } roomId)
        {
            var room = await dbContext.Rooms.SingleOrDefaultAsync(candidate => candidate.Id == roomId, cancellationToken);
            if (room is null)
            {
                return ConversationAccessDescriptor.Failure(
                    "conversation_not_found",
                    "That conversation could not be found.",
                    StatusCodes.Status404NotFound);
            }

            var isOwner = room.OwnerUserId == userId;
            var isMember = isOwner || await dbContext.RoomMembers.AnyAsync(candidate =>
                candidate.RoomId == roomId && candidate.UserId == userId, cancellationToken);

            if (!isMember)
            {
                return ConversationAccessDescriptor.Failure(
                    "conversation_access_denied",
                    "Only room members can access that conversation.",
                    StatusCodes.Status403Forbidden);
            }

            if (requireWrite && !isMember)
            {
                return ConversationAccessDescriptor.Failure(
                    "conversation_write_denied",
                    "Only room members can post to that conversation.",
                    StatusCodes.Status403Forbidden);
            }

            var isAdmin = isOwner || await dbContext.RoomAdmins.AnyAsync(candidate =>
                candidate.RoomId == roomId && candidate.UserId == userId, cancellationToken);

            return ConversationAccessDescriptor.Success(
                conversation,
                ConversationAccessModes.ReadWrite,
                canWrite: true,
                canDeleteAnyMessage: isAdmin,
                otherUserId: null);
        }

        if (conversation.Kind == ConversationKinds.Direct &&
            conversation.DirectFirstUserId is { } firstUserId &&
            conversation.DirectSecondUserId is { } secondUserId)
        {
            if (firstUserId != userId && secondUserId != userId)
            {
                return ConversationAccessDescriptor.Failure(
                    "conversation_access_denied",
                    "Only direct-message participants can access that conversation.",
                    StatusCodes.Status403Forbidden);
            }

            var otherUserId = firstUserId == userId ? secondUserId : firstUserId;
            var banExists = await HasAnyBanBetweenUsersAsync(userId, otherUserId, cancellationToken);

            if (banExists)
            {
                if (requireWrite)
                {
                    return ConversationAccessDescriptor.Failure(
                        "direct_conversation_read_only",
                        "Direct messages are read-only because one of these users has an active ban.",
                        StatusCodes.Status409Conflict);
                }

                return ConversationAccessDescriptor.Success(
                    conversation,
                    ConversationAccessModes.ReadOnly,
                    canWrite: false,
                    canDeleteAnyMessage: false,
                    otherUserId: otherUserId);
            }

            var (normalizedFirstUserId, normalizedSecondUserId) = NormalizePair(userId, otherUserId);
            var friendshipExists = await dbContext.Friendships.AnyAsync(candidate =>
                candidate.FirstUserId == normalizedFirstUserId &&
                candidate.SecondUserId == normalizedSecondUserId, cancellationToken);

            if (!friendshipExists)
            {
                return ConversationAccessDescriptor.Failure(
                    "direct_conversation_not_allowed",
                    "Direct messages require a confirmed friendship.",
                    StatusCodes.Status403Forbidden);
            }

            return ConversationAccessDescriptor.Success(
                conversation,
                ConversationAccessModes.ReadWrite,
                canWrite: true,
                canDeleteAnyMessage: false,
                otherUserId: otherUserId);
        }

        return ConversationAccessDescriptor.Failure(
            "conversation_access_denied",
            "That conversation type is not available yet.",
            StatusCodes.Status403Forbidden);
    }

    private async Task<Dictionary<Guid, MaterializedMessage>> LoadReplyPreviewLookupAsync(
        Guid conversationId,
        IEnumerable<Guid> replyMessageIds,
        CancellationToken cancellationToken)
    {
        var ids = replyMessageIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, MaterializedMessage>();
        }

        var events = await dbContext.ConversationMessages
            .Where(candidate =>
                candidate.ConversationId == conversationId &&
                candidate.MessageId != null &&
                ids.Contains(candidate.MessageId.Value))
            .OrderBy(candidate => candidate.Watermark)
            .ToListAsync(cancellationToken);

        return events
            .GroupBy(candidate => candidate.MessageId!.Value)
            .ToDictionary(group => group.Key, group => MaterializeMessage(group));
    }

    private async Task<Dictionary<Guid, IReadOnlyList<MessageAttachmentResponse>>> LoadAttachmentLookupAsync(
        IEnumerable<Guid> messageIds,
        CancellationToken cancellationToken)
    {
        var ids = messageIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<MessageAttachmentResponse>>();
        }

        var attachments = await dbContext.MessageAttachments
            .Where(candidate => ids.Contains(candidate.MessageId))
            .ToListAsync(cancellationToken);

        return attachments
            .OrderBy(candidate => candidate.CreatedAtUtc)
            .GroupBy(candidate => candidate.MessageId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<MessageAttachmentResponse>)group
                    .Select(MapAttachment)
                    .ToArray());
    }

    private async Task<int> CountUnreadMessagesAsync(
        Guid userId,
        Guid conversationId,
        long lastReadWatermark,
        CancellationToken cancellationToken)
    {
        return await dbContext.ConversationMessages.CountAsync(
            candidate =>
                candidate.ConversationId == conversationId &&
                candidate.EventType == MessagingEventTypes.MessageCreated &&
                candidate.MessageId != null &&
                candidate.ActorUserId != userId &&
                candidate.Watermark > lastReadWatermark,
            cancellationToken);
    }

    private async Task<MaterializedMessage?> LoadMaterializedMessageAsync(
        Guid conversationId,
        Guid messageId,
        CancellationToken cancellationToken)
    {
        var events = await LoadMessageEventsAsync(conversationId, messageId, cancellationToken);
        return events.Count == 0 ? null : MaterializeMessage(events);
    }

    private async Task<List<ConversationMessage>> LoadMessageEventsAsync(
        Guid conversationId,
        Guid messageId,
        CancellationToken cancellationToken)
    {
        return await dbContext.ConversationMessages
            .Where(candidate =>
                candidate.ConversationId == conversationId &&
                candidate.MessageId == messageId)
            .OrderBy(candidate => candidate.Watermark)
            .ToListAsync(cancellationToken);
    }

    private async Task<Dictionary<Guid, UserLookup>> LoadUserLookupAsync(IEnumerable<Guid> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, UserLookup>();
        }

        return await dbContext.UserAccounts
            .Where(candidate => ids.Contains(candidate.Id))
            .Select(candidate => new UserLookup(candidate.Id, candidate.UserName, candidate.NormalizedUserName))
            .ToDictionaryAsync(candidate => candidate.Id, cancellationToken);
    }

    private async Task<ContactServiceResult<UserLookup>> ResolveTargetUserAsync(string targetUserName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(targetUserName))
        {
            return ContactServiceResult<UserLookup>.Failure(
                "invalid_target_username",
                "A target username is required.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedTargetUserName = Normalize(targetUserName);
        var targetUser = await dbContext.UserAccounts
            .Where(candidate => candidate.NormalizedUserName == normalizedTargetUserName)
            .Select(candidate => new UserLookup(candidate.Id, candidate.UserName, candidate.NormalizedUserName))
            .SingleOrDefaultAsync(cancellationToken);

        if (targetUser is null)
        {
            return ContactServiceResult<UserLookup>.Failure(
                "target_user_not_found",
                "No user account was found for that username.",
                StatusCodes.Status404NotFound);
        }

        return ContactServiceResult<UserLookup>.Success(targetUser);
    }

    private async Task<HashSet<string>> LoadFriendshipPairsAsync(Guid userId, IEnumerable<Guid> otherUserIds, CancellationToken cancellationToken)
    {
        var ids = otherUserIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return [];
        }

        var friendships = await dbContext.Friendships
            .Where(candidate =>
                (candidate.FirstUserId == userId && ids.Contains(candidate.SecondUserId)) ||
                (candidate.SecondUserId == userId && ids.Contains(candidate.FirstUserId)))
            .ToListAsync(cancellationToken);

        return friendships
            .Select(candidate => BuildPairKey(candidate.FirstUserId, candidate.SecondUserId))
            .ToHashSet(StringComparer.Ordinal);
    }

    private async Task<HashSet<string>> LoadBanPairsAsync(Guid userId, IEnumerable<Guid> otherUserIds, CancellationToken cancellationToken)
    {
        var ids = otherUserIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return [];
        }

        var bans = await dbContext.UserBans
            .Where(candidate =>
                (candidate.SourceUserId == userId && ids.Contains(candidate.TargetUserId)) ||
                (candidate.TargetUserId == userId && ids.Contains(candidate.SourceUserId)))
            .ToListAsync(cancellationToken);

        return bans
            .Select(candidate => BuildPairKey(candidate.SourceUserId, candidate.TargetUserId))
            .ToHashSet(StringComparer.Ordinal);
    }

    private async Task<bool> HasAnyBanBetweenUsersAsync(Guid firstUserId, Guid secondUserId, CancellationToken cancellationToken)
    {
        return await dbContext.UserBans.AnyAsync(candidate =>
            (candidate.SourceUserId == firstUserId && candidate.TargetUserId == secondUserId) ||
            (candidate.SourceUserId == secondUserId && candidate.TargetUserId == firstUserId), cancellationToken);
    }

    private async Task<DirectConversationSummaryResponse> BuildDirectConversationSummaryAsync(
        Guid currentUserId,
        Conversation conversation,
        Guid otherUserId,
        string otherUserName,
        string accessMode,
        CancellationToken cancellationToken)
    {
        var summary = (await GetConversationSummaryLookupAsync(currentUserId, [conversation.Id], cancellationToken))
            .GetValueOrDefault(conversation.Id, ConversationSummarySnapshot.Empty);

        return new DirectConversationSummaryResponse(
            conversation.Id,
            otherUserId,
            otherUserName,
            accessMode,
            summary.LatestWatermark,
            summary.LastReadWatermark,
            summary.UnreadCount,
            summary.MessageCount,
            summary.LastMessagePreview,
            summary.LastMessageAtUtc);
    }

    private static ConversationEventResponse MapEvent(ConversationMessage message)
    {
        return new ConversationEventResponse(
            message.Id,
            message.ConversationId,
            message.Watermark,
            message.EventType,
            message.ActorUserId,
            message.MessageId,
            message.ReplyToMessageId,
            message.TextContent,
            JsonSerializer.Deserialize<JsonElement>(message.PayloadJson),
            message.CreatedAtUtc);
    }

    private static MaterializedMessage MaterializeMessage(IEnumerable<ConversationMessage> events)
    {
        var orderedEvents = events.OrderBy(candidate => candidate.Watermark).ToArray();
        var createdEvent = orderedEvents.Single(candidate => candidate.EventType == MessagingEventTypes.MessageCreated);
        var lastEvent = orderedEvents[^1];
        var latestUpdate = orderedEvents.LastOrDefault(candidate => candidate.EventType == MessagingEventTypes.MessageUpdated);
        var deleteEvent = orderedEvents.LastOrDefault(candidate => candidate.EventType == MessagingEventTypes.MessageDeleted);

        return new MaterializedMessage(
            createdEvent.MessageId!.Value,
            createdEvent.ConversationId,
            createdEvent.Watermark,
            lastEvent.Watermark,
            createdEvent.ActorUserId ?? Guid.Empty,
            deleteEvent is null ? latestUpdate?.TextContent ?? createdEvent.TextContent : null,
            createdEvent.ReplyToMessageId,
            createdEvent.CreatedAtUtc,
            latestUpdate?.CreatedAtUtc,
            deleteEvent?.CreatedAtUtc,
            latestUpdate is not null,
            deleteEvent is not null);
    }

    private static ChatMessageResponse MapChatMessage(
        MaterializedMessage message,
        Guid currentUserId,
        ConversationAccessDescriptor access,
        IReadOnlyDictionary<Guid, UserLookup> userLookup,
        IReadOnlyDictionary<Guid, MaterializedMessage> replyLookup,
        IReadOnlyDictionary<Guid, IReadOnlyList<MessageAttachmentResponse>> attachmentLookup)
    {
        ReplyPreviewResponse? replyPreview = null;
        if (message.ReplyToMessageId is { } replyToMessageId &&
            replyLookup.TryGetValue(replyToMessageId, out var reply))
        {
            replyPreview = new ReplyPreviewResponse(
                reply.MessageId,
                reply.AuthorUserId,
                ResolveUserName(reply.AuthorUserId, userLookup),
                reply.IsDeleted ? null : reply.Text,
                reply.IsDeleted);
        }

        var canEdit = access.CanWrite && !message.IsDeleted && message.AuthorUserId == currentUserId;
        var canDelete = !message.IsDeleted &&
            ((message.AuthorUserId == currentUserId && access.CanWrite) || access.CanDeleteAnyMessage);
        var attachments = attachmentLookup.TryGetValue(message.MessageId, out var currentAttachments)
            ? currentAttachments
            : Array.Empty<MessageAttachmentResponse>();

        return new ChatMessageResponse(
            message.MessageId,
            message.ConversationId,
            message.CreatedWatermark,
            message.LatestWatermark,
            message.AuthorUserId,
            ResolveUserName(message.AuthorUserId, userLookup),
            message.Text,
            message.ReplyToMessageId,
            replyPreview,
            message.CreatedAtUtc,
            message.EditedAtUtc,
            message.DeletedAtUtc,
            message.IsEdited,
            message.IsDeleted,
            canEdit,
            canDelete,
            attachments);
    }

    private static MessageAttachmentResponse MapAttachment(MessageAttachment attachment)
    {
        return new MessageAttachmentResponse(
            attachment.Id,
            attachment.OriginalFileName,
            attachment.ContentType,
            attachment.ByteSize,
            attachment.UploadedByUserId,
            attachment.CreatedAtUtc,
            $"/api/attachments/{attachment.Id:D}/download");
    }

    private static string? BuildPreviewText(
        MaterializedMessage? latestMessage,
        IReadOnlyDictionary<Guid, IReadOnlyList<MessageAttachmentResponse>> attachmentLookup)
    {
        if (latestMessage is null)
        {
            return null;
        }

        if (latestMessage.IsDeleted)
        {
            return "Message deleted";
        }

        if (!string.IsNullOrWhiteSpace(latestMessage.Text))
        {
            return latestMessage.Text;
        }

        return attachmentLookup.TryGetValue(latestMessage.MessageId, out var attachments) && attachments.Count > 0
            ? $"Attachment: {attachments[0].OriginalFileName}"
            : null;
    }

    private static DirectRelationship ResolveDirectRelationship(
        Guid currentUserId,
        Guid otherUserId,
        IReadOnlySet<string> friendshipPairs,
        IReadOnlySet<string> banPairs)
    {
        var pairKey = BuildPairKey(currentUserId, otherUserId);
        if (banPairs.Contains(pairKey))
        {
            return new DirectRelationship(true, ConversationAccessModes.ReadOnly);
        }

        return friendshipPairs.Contains(pairKey)
            ? new DirectRelationship(true, ConversationAccessModes.ReadWrite)
            : new DirectRelationship(false, ConversationAccessModes.None);
    }

    private static string ResolveUserName(Guid userId, IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        return userLookup.TryGetValue(userId, out var user) ? user.UserName : "Unknown user";
    }

    private static string? ValidateMessageText(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        return normalized.Length is >= 1 and <= 4000 ? normalized : null;
    }

    private static string Normalize(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static (Guid FirstUserId, Guid SecondUserId) NormalizePair(Guid firstUserId, Guid secondUserId)
    {
        return firstUserId.CompareTo(secondUserId) <= 0
            ? (firstUserId, secondUserId)
            : (secondUserId, firstUserId);
    }

    private static string BuildPairKey(Guid firstUserId, Guid secondUserId)
    {
        var (normalizedFirstUserId, normalizedSecondUserId) = NormalizePair(firstUserId, secondUserId);
        return $"{normalizedFirstUserId:D}:{normalizedSecondUserId:D}";
    }

    private static string SerializePayload(object payload)
    {
        return JsonSerializer.Serialize(payload, SerializerOptions);
    }

    private sealed record UserLookup(Guid Id, string UserName, string NormalizedUserName);

    private sealed record MaterializedMessage(
        Guid MessageId,
        Guid ConversationId,
        long CreatedWatermark,
        long LatestWatermark,
        Guid AuthorUserId,
        string? Text,
        Guid? ReplyToMessageId,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset? EditedAtUtc,
        DateTimeOffset? DeletedAtUtc,
        bool IsEdited,
        bool IsDeleted);

    private sealed record DirectRelationship(bool CanRead, string AccessMode);
}

public sealed class ConversationQueryResult<T>
{
    private ConversationQueryResult(T? value, ConversationQueryError? error)
    {
        Value = value;
        Error = error;
    }

    public bool Succeeded => Error is null;

    public T? Value { get; }

    public ConversationQueryError? Error { get; }

    public static ConversationQueryResult<T> Success(T value)
    {
        return new ConversationQueryResult<T>(value, null);
    }

    public static ConversationQueryResult<T> Failure(string code, string message, int statusCode)
    {
        return new ConversationQueryResult<T>(default, new ConversationQueryError(code, message, statusCode));
    }
}

public sealed record ConversationQueryError(string Code, string Message, int StatusCode);

internal sealed class ConversationAccessDescriptor
{
    private ConversationAccessDescriptor(
        Conversation? conversation,
        string accessMode,
        bool canWrite,
        bool canDeleteAnyMessage,
        Guid? otherUserId,
        string? errorCode,
        string? errorMessage,
        int statusCode)
    {
        Conversation = conversation;
        AccessMode = accessMode;
        CanWrite = canWrite;
        CanDeleteAnyMessage = canDeleteAnyMessage;
        OtherUserId = otherUserId;
        ErrorCode = errorCode;
        ErrorMessage = errorMessage;
        StatusCode = statusCode;
    }

    public bool Succeeded => Conversation is not null;

    public Conversation? Conversation { get; }

    public string AccessMode { get; }

    public bool CanWrite { get; }

    public bool CanDeleteAnyMessage { get; }

    public Guid? OtherUserId { get; }

    public string? ErrorCode { get; }

    public string? ErrorMessage { get; }

    public int StatusCode { get; }

    public static ConversationAccessDescriptor Success(
        Conversation conversation,
        string accessMode,
        bool canWrite,
        bool canDeleteAnyMessage,
        Guid? otherUserId)
    {
        return new ConversationAccessDescriptor(
            conversation,
            accessMode,
            canWrite,
            canDeleteAnyMessage,
            otherUserId,
            null,
            null,
            StatusCodes.Status200OK);
    }

    public static ConversationAccessDescriptor Failure(string code, string message, int statusCode)
    {
        return new ConversationAccessDescriptor(
            null,
            ConversationAccessModes.None,
            canWrite: false,
            canDeleteAnyMessage: false,
            otherUserId: null,
            code,
            message,
            statusCode);
    }
}

internal static class MessagingEventTypes
{
    public const string MessageCreated = "message.created";
    public const string MessageUpdated = "message.updated";
    public const string MessageDeleted = "message.deleted";
}

internal static class ConversationKinds
{
    public const string Direct = "direct";
}

internal static class ConversationAccessModes
{
    public const string None = "none";
    public const string ReadOnly = "read_only";
    public const string ReadWrite = "read_write";
}

internal sealed class ContactServiceResult<T>
{
    private ContactServiceResult(T? value, ContactServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public bool Succeeded => Error is null;

    public T? Value { get; }

    public ContactServiceError? Error { get; }

    public static ContactServiceResult<T> Success(T value)
    {
        return new ContactServiceResult<T>(value, null);
    }

    public static ContactServiceResult<T> Failure(string code, string message, int statusCode)
    {
        return new ContactServiceResult<T>(default, new ContactServiceError(code, message, statusCode));
    }
}

internal sealed record ContactServiceError(string Code, string Message, int StatusCode);

public sealed record ConversationAccessGrant(
    Guid ConversationId,
    string ConversationKind,
    Guid? RoomId,
    Guid? OtherUserId,
    string AccessMode,
    bool CanWrite,
    bool CanDeleteAnyMessage);

public sealed record ConversationSummarySnapshot(
    long LatestWatermark,
    long LastReadWatermark,
    int UnreadCount,
    int MessageCount,
    string? LastMessagePreview,
    DateTimeOffset? LastMessageAtUtc)
{
    public static ConversationSummarySnapshot Empty { get; } = new(0, 0, 0, 0, null, null);
}
