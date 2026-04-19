namespace SlackApp.Modules.Identity.Domain;

public sealed class RoomAdmin
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RoomId { get; set; }

    public Guid UserId { get; set; }

    public Guid GrantedByUserId { get; set; }

    public DateTimeOffset GrantedAtUtc { get; set; }
}
