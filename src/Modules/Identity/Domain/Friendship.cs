namespace SlackApp.Modules.Identity.Domain;

public sealed class Friendship
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid FirstUserId { get; set; }

    public Guid SecondUserId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }
}
