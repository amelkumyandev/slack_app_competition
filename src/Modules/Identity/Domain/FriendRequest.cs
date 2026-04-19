namespace SlackApp.Modules.Identity.Domain;

public sealed class FriendRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RequesterUserId { get; set; }

    public Guid AddresseeUserId { get; set; }

    public Guid? SourceRoomId { get; set; }

    public DateTimeOffset RequestedAtUtc { get; set; }

    public DateTimeOffset? RespondedAtUtc { get; set; }

    public FriendRequestStatus Status { get; set; } = FriendRequestStatus.Pending;
}
