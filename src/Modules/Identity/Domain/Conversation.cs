namespace SlackApp.Modules.Identity.Domain;

public sealed class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Kind { get; set; } = "room";

    public Guid? RoomId { get; set; }

    public Guid? DirectFirstUserId { get; set; }

    public Guid? DirectSecondUserId { get; set; }

    public long CurrentWatermark { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
