namespace SlackApp.Modules.Identity.Infrastructure;

public sealed class IdentityModuleOptions
{
    public const string SectionName = "Identity";

    public string DatabaseProvider { get; set; } = "Postgres";

    public bool InitializeOnStartup { get; set; } = true;

    public string CookieName { get; set; } = "slackapp.session";

    public TimeSpan SessionLifetime { get; set; } = TimeSpan.FromHours(12);

    public TimeSpan PersistentSessionLifetime { get; set; } = TimeSpan.FromDays(30);

    public TimeSpan PasswordResetTokenLifetime { get; set; } = TimeSpan.FromHours(1);
}
