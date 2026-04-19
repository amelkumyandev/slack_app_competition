namespace SlackApp.Modules.Identity.Domain;

public sealed class RoomBan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RoomId { get; set; }

    public Guid UserId { get; set; }

    public Guid BannedByUserId { get; set; }

    public string? Reason { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }
}
