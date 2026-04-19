using System.Text.Json;

namespace SlackApp.Modules.Messaging.Contracts;

public sealed record ConversationEventResponse(
    Guid Id,
    Guid ConversationId,
    long Watermark,
    string EventType,
    Guid? ActorUserId,
    Guid? MessageId,
    Guid? ReplyToMessageId,
    string? TextContent,
    JsonElement Payload,
    DateTimeOffset CreatedAtUtc);

public sealed record ReplyPreviewResponse(
    Guid MessageId,
    Guid AuthorUserId,
    string AuthorUserName,
    string? Text,
    bool IsDeleted);

public sealed record MessageAttachmentResponse(
    Guid Id,
    string OriginalFileName,
    string ContentType,
    long ByteSize,
    Guid UploadedByUserId,
    DateTimeOffset CreatedAtUtc,
    string DownloadPath);

public sealed record ChatMessageResponse(
    Guid MessageId,
    Guid ConversationId,
    long CreatedWatermark,
    long LatestWatermark,
    Guid AuthorUserId,
    string AuthorUserName,
    string? Text,
    Guid? ReplyToMessageId,
    ReplyPreviewResponse? ReplyPreview,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? EditedAtUtc,
    DateTimeOffset? DeletedAtUtc,
    bool IsEdited,
    bool IsDeleted,
    bool CanEdit,
    bool CanDelete,
    IReadOnlyList<MessageAttachmentResponse> Attachments);

public sealed record ConversationTimelineResponse(
    Guid ConversationId,
    long LatestWatermark,
    int PageSize,
    long? NextCursor,
    IReadOnlyList<ChatMessageResponse> Messages);

public sealed record ConversationSyncResponse(
    Guid ConversationId,
    long AfterWatermark,
    long LatestWatermark,
    bool RequiresFullRefresh,
    IReadOnlyList<ConversationEventResponse> MissingMessages);

public sealed record DirectConversationSummaryResponse(
    Guid ConversationId,
    Guid TargetUserId,
    string TargetUserName,
    string AccessMode,
    long LatestWatermark,
    int MessageCount,
    string? LastMessagePreview,
    DateTimeOffset? LastMessageAtUtc);

public sealed record DirectConversationListResponse(IReadOnlyList<DirectConversationSummaryResponse> Conversations);
