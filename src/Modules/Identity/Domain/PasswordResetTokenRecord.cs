namespace SlackApp.Modules.Identity.Domain;

public sealed class PasswordResetTokenRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserAccountId { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset RequestedAtUtc { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? UsedAtUtc { get; set; }

    public UserAccount User { get; set; } = null!;
}
