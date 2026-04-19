namespace SlackApp.Modules.Identity.Domain;

public sealed class UserAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Email { get; set; } = string.Empty;

    public string NormalizedEmail { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public string NormalizedUserName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();

    public ICollection<PasswordResetTokenRecord> PasswordResetTokens { get; set; } = new List<PasswordResetTokenRecord>();
}
