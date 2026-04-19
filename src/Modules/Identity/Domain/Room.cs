namespace SlackApp.Modules.Identity.Domain;

public sealed class Room
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ConversationId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string NormalizedName { get; set; } = string.Empty;

    public string? Description { get; set; }

    public RoomVisibility Visibility { get; set; } = RoomVisibility.Public;

    public Guid OwnerUserId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
