namespace SlackApp.Modules.Identity.Domain;

public sealed class UserBan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SourceUserId { get; set; }

    public Guid TargetUserId { get; set; }

    public string? Reason { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }
}
