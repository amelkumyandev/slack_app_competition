namespace SlackApp.Modules.Identity.Domain;

public sealed class MessageAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ConversationId { get; set; }

    public Guid MessageId { get; set; }

    public Guid UploadedByUserId { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;

    public string StoredFileName { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;

    public string ContentType { get; set; } = "application/octet-stream";

    public long ByteSize { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }
}
