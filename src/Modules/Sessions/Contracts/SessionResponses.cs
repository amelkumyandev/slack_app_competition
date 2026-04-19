namespace SlackApp.Modules.Sessions.Contracts;

public sealed record UserSessionResponse(
    Guid Id,
    bool IsCurrent,
    bool CanRevoke,
    string State,
    bool RememberMe,
    string? UserAgent,
    string? IpAddress,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset LastSeenAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? RevokedAtUtc);

public sealed record UserSessionsResponse(IReadOnlyList<UserSessionResponse> Sessions);

public sealed record SessionRevocationResponse(string Message, Guid SessionId);
