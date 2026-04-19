namespace SlackApp.Modules.Identity.Domain;

public sealed class UserSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserAccountId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset LastSeenAtUtc { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public bool RememberMe { get; set; }

    public string? UserAgent { get; set; }

    public string? IpAddress { get; set; }

    public UserAccount User { get; set; } = null!;
}
