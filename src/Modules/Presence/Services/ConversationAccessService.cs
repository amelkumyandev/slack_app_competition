using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Presence.Contracts;

namespace SlackApp.Modules.Presence.Services;

public sealed class ConversationAccessService(IdentityDbContext dbContext)
{
    public bool TryBuildConversationGroup(string conversationKey, out string normalizedConversationKey, out string groupName)
    {
        normalizedConversationKey = string.Empty;
        groupName = string.Empty;

        if (string.IsNullOrWhiteSpace(conversationKey))
        {
            return false;
        }

        var trimmedKey = conversationKey.Trim();
        if (trimmedKey.StartsWith("conversation:", StringComparison.OrdinalIgnoreCase))
        {
            var conversationIdText = trimmedKey["conversation:".Length..];
            if (!Guid.TryParse(conversationIdText, out var conversationId))
            {
                return false;
            }

            normalizedConversationKey = RealtimeGroups.ConversationId(conversationId);
            groupName = normalizedConversationKey;
            return true;
        }

        if (!trimmedKey.StartsWith("room:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var roomIdText = trimmedKey["room:".Length..];
        if (!Guid.TryParse(roomIdText, out var roomId))
        {
            return false;
        }

        normalizedConversationKey = RealtimeGroups.RoomConversation(roomId);
        groupName = RealtimeGroups.Conversation(normalizedConversationKey);
        return true;
    }

    public async Task<(bool Succeeded, string NormalizedConversationKey, string GroupName, Guid? ConversationId)> ResolveConversationGroupAsync(
        string conversationKey,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(conversationKey))
        {
            return (false, string.Empty, string.Empty, null);
        }

        var trimmedKey = conversationKey.Trim();
        if (trimmedKey.StartsWith("conversation:", StringComparison.OrdinalIgnoreCase))
        {
            if (!Guid.TryParse(trimmedKey["conversation:".Length..], out var conversationId))
            {
                return (false, string.Empty, string.Empty, null);
            }

            var exists = await dbContext.Conversations.AnyAsync(candidate => candidate.Id == conversationId, cancellationToken);
            return exists
                ? (true, RealtimeGroups.ConversationId(conversationId), RealtimeGroups.ConversationId(conversationId), conversationId)
                : (false, string.Empty, string.Empty, null);
        }

        if (!trimmedKey.StartsWith("room:", StringComparison.OrdinalIgnoreCase))
        {
            return (false, string.Empty, string.Empty, null);
        }

        if (!Guid.TryParse(trimmedKey["room:".Length..], out var roomId))
        {
            return (false, string.Empty, string.Empty, null);
        }

        var room = await dbContext.Rooms.SingleOrDefaultAsync(candidate => candidate.Id == roomId, cancellationToken);
        if (room is null)
        {
            return (false, string.Empty, string.Empty, null);
        }

        var normalizedConversationKey = RealtimeGroups.ConversationId(room.ConversationId);
        return (true, normalizedConversationKey, normalizedConversationKey, room.ConversationId);
    }

    public async Task<ConversationAccessDecision> AuthorizeSubscriptionAsync(
        Guid userId,
        string conversationKey,
        CancellationToken cancellationToken)
    {
        var resolution = await ResolveConversationGroupAsync(conversationKey, cancellationToken);
        if (!resolution.Succeeded || resolution.ConversationId is null)
        {
            return new ConversationAccessDecision(false, "invalid_conversation_key", "Only room and conversation keys are supported right now.", string.Empty, string.Empty);
        }

        var conversation = await dbContext.Conversations.SingleOrDefaultAsync(candidate => candidate.Id == resolution.ConversationId.Value, cancellationToken);
        if (conversation is null)
        {
            return new ConversationAccessDecision(false, "conversation_not_found", "That conversation could not be found.", resolution.NormalizedConversationKey, resolution.GroupName);
        }

        if (conversation.RoomId is { } roomId)
        {
            var room = await dbContext.Rooms.SingleOrDefaultAsync(candidate => candidate.Id == roomId, cancellationToken);
            if (room is null)
            {
                return new ConversationAccessDecision(false, "conversation_not_found", "That room conversation could not be found.", resolution.NormalizedConversationKey, resolution.GroupName);
            }

            if (room.OwnerUserId == userId)
            {
                return new ConversationAccessDecision(true, "allowed", "Subscription allowed.", resolution.NormalizedConversationKey, resolution.GroupName);
            }

            var isMember = await dbContext.RoomMembers.AnyAsync(candidate => candidate.RoomId == roomId && candidate.UserId == userId, cancellationToken);
            if (!isMember)
            {
                return new ConversationAccessDecision(false, "conversation_access_denied", "Only room members can subscribe to that conversation.", resolution.NormalizedConversationKey, resolution.GroupName);
            }

            return new ConversationAccessDecision(true, "allowed", "Subscription allowed.", resolution.NormalizedConversationKey, resolution.GroupName);
        }

        if (conversation.Kind == "direct" &&
            conversation.DirectFirstUserId is { } firstUserId &&
            conversation.DirectSecondUserId is { } secondUserId)
        {
            if (firstUserId != userId && secondUserId != userId)
            {
                return new ConversationAccessDecision(false, "conversation_access_denied", "Only direct-message participants can subscribe to that conversation.", resolution.NormalizedConversationKey, resolution.GroupName);
            }

            var otherUserId = firstUserId == userId ? secondUserId : firstUserId;
            var hasBan = await dbContext.UserBans.AnyAsync(candidate =>
                (candidate.SourceUserId == userId && candidate.TargetUserId == otherUserId) ||
                (candidate.SourceUserId == otherUserId && candidate.TargetUserId == userId), cancellationToken);

            if (hasBan)
            {
                return new ConversationAccessDecision(true, "allowed", "Subscription allowed in read-only mode.", resolution.NormalizedConversationKey, resolution.GroupName);
            }

            var (normalizedFirstUserId, normalizedSecondUserId) = NormalizePair(userId, otherUserId);
            var friendshipExists = await dbContext.Friendships.AnyAsync(candidate =>
                candidate.FirstUserId == normalizedFirstUserId &&
                candidate.SecondUserId == normalizedSecondUserId, cancellationToken);

            return friendshipExists
                ? new ConversationAccessDecision(true, "allowed", "Subscription allowed.", resolution.NormalizedConversationKey, resolution.GroupName)
                : new ConversationAccessDecision(false, "conversation_access_denied", "Direct messages require a confirmed friendship.", resolution.NormalizedConversationKey, resolution.GroupName);
        }

        return new ConversationAccessDecision(false, "conversation_access_denied", "That conversation type is not available yet.", resolution.NormalizedConversationKey, resolution.GroupName);
    }

    private static (Guid FirstUserId, Guid SecondUserId) NormalizePair(Guid firstUserId, Guid secondUserId)
    {
        return firstUserId.CompareTo(secondUserId) <= 0
            ? (firstUserId, secondUserId)
            : (secondUserId, firstUserId);
    }
}

public sealed record ConversationAccessDecision(
    bool Allowed,
    string Code,
    string Message,
    string NormalizedConversationKey,
    string GroupName);
