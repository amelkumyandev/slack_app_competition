namespace SlackApp.Modules.Identity.Domain;

public sealed class RoomMember
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RoomId { get; set; }

    public Guid UserId { get; set; }

    public DateTimeOffset JoinedAtUtc { get; set; }
}
