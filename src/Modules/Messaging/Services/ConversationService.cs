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
    public async Task<ConversationQueryResult<ConversationHistoryResponse>> GetHistoryAsync(
        Guid userId,
        Guid conversationId,
        long? beforeWatermark,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var authorization = await AuthorizeConversationAccessAsync(userId, conversationId, cancellationToken);
        if (!authorization.Succeeded)
        {
            return ConversationQueryResult<ConversationHistoryResponse>.Failure(
                authorization.ErrorCode!,
                authorization.ErrorMessage!,
                authorization.StatusCode);
        }

        var normalizedPageSize = Math.Clamp(pageSize, 1, 100);
        var query = dbContext.ConversationMessages
            .Where(candidate => candidate.ConversationId == conversationId);

        if (beforeWatermark is { } watermarkCursor)
        {
            query = query.Where(candidate => candidate.Watermark < watermarkCursor);
        }

        var descendingMessages = await query
            .OrderByDescending(candidate => candidate.Watermark)
            .Take(normalizedPageSize)
            .ToListAsync(cancellationToken);

        var orderedMessages = descendingMessages
            .OrderBy(candidate => candidate.Watermark)
            .Select(MapMessage)
            .ToArray();

        return ConversationQueryResult<ConversationHistoryResponse>.Success(new ConversationHistoryResponse(
            conversationId,
            authorization.Conversation!.CurrentWatermark,
            normalizedPageSize,
            orderedMessages));
    }

    public async Task<ConversationQueryResult<ConversationSyncResponse>> GetSyncAsync(
        Guid userId,
        Guid conversationId,
        long afterWatermark,
        CancellationToken cancellationToken)
    {
        var authorization = await AuthorizeConversationAccessAsync(userId, conversationId, cancellationToken);
        if (!authorization.Succeeded)
        {
            return ConversationQueryResult<ConversationSyncResponse>.Failure(
                authorization.ErrorCode!,
                authorization.ErrorMessage!,
                authorization.StatusCode);
        }

        var messages = await dbContext.ConversationMessages
            .Where(candidate => candidate.ConversationId == conversationId && candidate.Watermark > afterWatermark)
            .OrderBy(candidate => candidate.Watermark)
            .ToListAsync(cancellationToken);

        return ConversationQueryResult<ConversationSyncResponse>.Success(new ConversationSyncResponse(
            conversationId,
            afterWatermark,
            authorization.Conversation!.CurrentWatermark,
            false,
            messages.Select(MapMessage).ToArray()));
    }

    public async Task<ConversationMessageResponse> AppendRoomActivityAsync(
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

        var payloadElement = JsonSerializer.SerializeToElement(payload);
        var message = new ConversationMessage
        {
            ConversationId = conversationId,
            Watermark = conversation.CurrentWatermark,
            EventType = eventType,
            ActorUserId = actorUserId,
            PayloadJson = payloadElement.GetRawText(),
            CreatedAtUtc = now
        };

        dbContext.ConversationMessages.Add(message);
        await dbContext.SaveChangesAsync(cancellationToken);

        var response = MapMessage(message);
        await realtimeNotifier.NotifyConversationAsync(
            eventType,
            conversationId,
            message.Watermark,
            response,
            cancellationToken);

        return response;
    }

    private async Task<ConversationAuthorizationResult> AuthorizeConversationAccessAsync(
        Guid userId,
        Guid conversationId,
        CancellationToken cancellationToken)
    {
        var conversation = await dbContext.Conversations.SingleOrDefaultAsync(candidate => candidate.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return ConversationAuthorizationResult.Failure(
                "conversation_not_found",
                "That conversation could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (conversation.RoomId is { } roomId)
        {
            var room = await dbContext.Rooms.SingleOrDefaultAsync(candidate => candidate.Id == roomId, cancellationToken);
            if (room is null)
            {
                return ConversationAuthorizationResult.Failure(
                    "conversation_not_found",
                    "That conversation could not be found.",
                    StatusCodes.Status404NotFound);
            }

            if (room.OwnerUserId == userId)
            {
                return ConversationAuthorizationResult.Success(conversation);
            }

            var isMember = await dbContext.RoomMembers.AnyAsync(candidate =>
                candidate.RoomId == roomId && candidate.UserId == userId, cancellationToken);

            if (!isMember)
            {
                return ConversationAuthorizationResult.Failure(
                    "conversation_access_denied",
                    "Only room members can access that conversation.",
                    StatusCodes.Status403Forbidden);
            }

            return ConversationAuthorizationResult.Success(conversation);
        }

        return ConversationAuthorizationResult.Failure(
            "conversation_access_denied",
            "That conversation type is not available yet.",
            StatusCodes.Status403Forbidden);
    }

    private static ConversationMessageResponse MapMessage(ConversationMessage message)
    {
        return new ConversationMessageResponse(
            message.Id,
            message.ConversationId,
            message.Watermark,
            message.EventType,
            message.ActorUserId,
            JsonSerializer.Deserialize<JsonElement>(message.PayloadJson),
            message.CreatedAtUtc);
    }
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

internal sealed class ConversationAuthorizationResult
{
    private ConversationAuthorizationResult(Conversation? conversation, string? errorCode, string? errorMessage, int statusCode)
    {
        Conversation = conversation;
        ErrorCode = errorCode;
        ErrorMessage = errorMessage;
        StatusCode = statusCode;
    }

    public bool Succeeded => Conversation is not null;

    public Conversation? Conversation { get; }

    public string? ErrorCode { get; }

    public string? ErrorMessage { get; }

    public int StatusCode { get; }

    public static ConversationAuthorizationResult Success(Conversation conversation)
    {
        return new ConversationAuthorizationResult(conversation, null, null, StatusCodes.Status200OK);
    }

    public static ConversationAuthorizationResult Failure(string code, string message, int statusCode)
    {
        return new ConversationAuthorizationResult(null, code, message, statusCode);
    }
}
