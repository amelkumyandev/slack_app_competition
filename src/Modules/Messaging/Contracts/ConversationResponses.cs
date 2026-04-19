using System.Text.Json;

namespace SlackApp.Modules.Messaging.Contracts;

public sealed record ConversationMessageResponse(
    Guid Id,
    Guid ConversationId,
    long Watermark,
    string EventType,
    Guid? ActorUserId,
    JsonElement Payload,
    DateTimeOffset CreatedAtUtc);

public sealed record ConversationHistoryResponse(
    Guid ConversationId,
    long LatestWatermark,
    int PageSize,
    IReadOnlyList<ConversationMessageResponse> Messages);

public sealed record ConversationSyncResponse(
    Guid ConversationId,
    long AfterWatermark,
    long LatestWatermark,
    bool RequiresFullRefresh,
    IReadOnlyList<ConversationMessageResponse> MissingMessages);
