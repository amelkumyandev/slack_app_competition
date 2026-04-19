namespace SlackApp.Modules.Identity.Domain;

public sealed class ConversationReadState
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ConversationId { get; set; }

    public Guid UserAccountId { get; set; }

    public long LastReadWatermark { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
