namespace SlackApp.Modules.Identity.Contracts;

public sealed record RegisterRequest(string Email, string UserName, string Password, bool RememberMe = false);

public sealed record LoginRequest(string EmailOrUserName, string Password, bool RememberMe = false);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record RequestPasswordResetRequest(string EmailOrUserName);

public sealed record ConfirmPasswordResetRequest(string Token, string NewPassword);

public sealed record DeleteAccountRequest(string CurrentPassword);
