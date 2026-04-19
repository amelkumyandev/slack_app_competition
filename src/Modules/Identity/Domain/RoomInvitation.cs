namespace SlackApp.Modules.Identity.Domain;

public sealed class RoomInvitation
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RoomId { get; set; }

    public Guid InvitedUserId { get; set; }

    public Guid InvitedByUserId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset? RespondedAtUtc { get; set; }

    public RoomInvitationStatus Status { get; set; } = RoomInvitationStatus.Pending;
}
