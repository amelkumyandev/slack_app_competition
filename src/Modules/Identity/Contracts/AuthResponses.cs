namespace SlackApp.Modules.Identity.Contracts;

public sealed record CurrentUserResponse(
    Guid Id,
    string Email,
    string UserName,
    Guid SessionId,
    bool RememberMe,
    DateTimeOffset SessionExpiresAtUtc);

public sealed record AuthResponse(CurrentUserResponse User);

public sealed record MessageResponse(string Message);

public sealed record PasswordResetRequestResponse(string Message, string? PreviewToken, DateTimeOffset? ExpiresAtUtc);

public sealed record DeleteAccountShellResponse(string Status, string Message);
