namespace SlackApp.Modules.Identity.Domain;

public sealed class ConversationMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ConversationId { get; set; }

    public Guid? MessageId { get; set; }

    public long Watermark { get; set; }

    public string EventType { get; set; } = string.Empty;

    public Guid? ActorUserId { get; set; }

    public Guid? ReplyToMessageId { get; set; }

    public string? TextContent { get; set; }

    public string PayloadJson { get; set; } = "{}";

    public DateTimeOffset CreatedAtUtc { get; set; }
}
