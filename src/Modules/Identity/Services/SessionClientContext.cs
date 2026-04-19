namespace SlackApp.Modules.Identity.Services;

public sealed record SessionClientContext(string? UserAgent, string? IpAddress);

public sealed record AuthenticatedSession(Domain.UserAccount User, Domain.UserSession Session);
