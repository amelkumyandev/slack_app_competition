using System.Text.Json;

namespace SlackApp.Modules.Presence.Contracts;

public sealed record ConnectionReadyResponse(
    string ConnectionId,
    Guid UserId,
    string UserGroup,
    string SupportedConversationPrefix,
    string SyncMode,
    DateTimeOffset ServerTimeUtc);

public sealed record ConversationSubscriptionResponse(
    string ConversationKey,
    string GroupName,
    string Status,
    DateTimeOffset ServerTimeUtc);

public sealed record ServerHeartbeatResponse(DateTimeOffset ServerTimeUtc);

public sealed record RealtimeEnvelope(
    string EventType,
    string Scope,
    string Target,
    Guid? ConversationId,
    long? Watermark,
    DateTimeOffset ServerTimeUtc,
    JsonElement Payload);

public static class RealtimeClientMethods
{
    public const string ConnectionReady = "connection.ready";
    public const string SubscriptionUpdated = "subscription.updated";
    public const string EventReceived = "event.received";
}

public static class RealtimeHubMethods
{
    public const string SubscribeConversation = "SubscribeConversation";
    public const string UnsubscribeConversation = "UnsubscribeConversation";
    public const string Heartbeat = "Heartbeat";
    public const string Ping = "Ping";
}

public static class RealtimeGroups
{
    public static string User(Guid userId)
    {
        return $"user:{userId:D}";
    }

    public static string RoomConversation(Guid roomId)
    {
        return $"room:{roomId:D}";
    }

    public static string ConversationId(Guid conversationId)
    {
        return $"conversation:{conversationId:D}";
    }

    public static string Conversation(string conversationKey)
    {
        return $"conversation:{conversationKey}";
    }
}
