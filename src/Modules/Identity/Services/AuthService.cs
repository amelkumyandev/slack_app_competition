using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Infrastructure;

namespace SlackApp.Modules.Identity.Services;

public sealed class AuthService(
    IdentityDbContext dbContext,
    IPasswordHasher<UserAccount> passwordHasher,
    PasswordResetTokenService passwordResetTokenService,
    IdentityModuleOptions options,
    TimeProvider timeProvider,
    ILogger<AuthService> logger)
{
    public async Task<ServiceResult<AuthenticatedSession>> RegisterAsync(
        RegisterRequest request,
        SessionClientContext clientContext,
        CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        var userName = request.UserName.Trim();

        if (string.IsNullOrWhiteSpace(email))
        {
            return ServiceResult<AuthenticatedSession>.Failure("invalid_email", "Email is required.", StatusCodes.Status400BadRequest);
        }

        if (string.IsNullOrWhiteSpace(userName))
        {
            return ServiceResult<AuthenticatedSession>.Failure("invalid_username", "Username is required.", StatusCodes.Status400BadRequest);
        }

        var passwordError = ValidatePassword(request.Password);
        if (passwordError is not null)
        {
            return ServiceResult<AuthenticatedSession>.Failure("invalid_password", passwordError, StatusCodes.Status400BadRequest);
        }

        var normalizedEmail = Normalize(email);
        var normalizedUserName = Normalize(userName);

        if (await dbContext.UserAccounts.AnyAsync(candidate => candidate.NormalizedEmail == normalizedEmail, cancellationToken))
        {
            return ServiceResult<AuthenticatedSession>.Failure("email_in_use", "That email address is already registered.", StatusCodes.Status409Conflict);
        }

        if (await dbContext.UserAccounts.AnyAsync(candidate => candidate.NormalizedUserName == normalizedUserName, cancellationToken))
        {
            return ServiceResult<AuthenticatedSession>.Failure("username_in_use", "That username is already taken.", StatusCodes.Status409Conflict);
        }

        var now = timeProvider.GetUtcNow();
        var user = new UserAccount
        {
            Email = email,
            NormalizedEmail = normalizedEmail,
            UserName = userName,
            NormalizedUserName = normalizedUserName,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

        var session = CreateSession(user, request.RememberMe, clientContext, now);

        dbContext.UserAccounts.Add(user);
        dbContext.UserSessions.Add(session);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Registered new user {UserId}", user.Id);

        return ServiceResult<AuthenticatedSession>.Success(new AuthenticatedSession(user, session));
    }

    public async Task<ServiceResult<AuthenticatedSession>> LoginAsync(
        LoginRequest request,
        SessionClientContext clientContext,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.EmailOrUserName))
        {
            return ServiceResult<AuthenticatedSession>.Failure("invalid_login", "Email or username is required.", StatusCodes.Status400BadRequest);
        }

        var normalized = Normalize(request.EmailOrUserName);
        var user = await dbContext.UserAccounts.SingleOrDefaultAsync(candidate =>
            candidate.NormalizedEmail == normalized || candidate.NormalizedUserName == normalized, cancellationToken);

        if (user is null)
        {
            return ServiceResult<AuthenticatedSession>.Failure("invalid_credentials", "Invalid credentials.", StatusCodes.Status401Unauthorized);
        }

        var verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return ServiceResult<AuthenticatedSession>.Failure("invalid_credentials", "Invalid credentials.", StatusCodes.Status401Unauthorized);
        }

        if (verificationResult == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
            user.UpdatedAtUtc = timeProvider.GetUtcNow();
        }

        var session = CreateSession(user, request.RememberMe, clientContext, timeProvider.GetUtcNow());
        dbContext.UserSessions.Add(session);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ServiceResult<AuthenticatedSession>.Success(new AuthenticatedSession(user, session));
    }

    public async Task<ServiceResult<CurrentUserResponse>> GetCurrentUserAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var session = await dbContext.UserSessions
            .Include(candidate => candidate.User)
            .SingleOrDefaultAsync(candidate => candidate.Id == sessionId && candidate.UserAccountId == userId, cancellationToken);

        if (session is null || session.RevokedAtUtc is not null || session.ExpiresAtUtc <= now)
        {
            return ServiceResult<CurrentUserResponse>.Failure("session_not_found", "The active session could not be found.", StatusCodes.Status401Unauthorized);
        }

        return ServiceResult<CurrentUserResponse>.Success(MapCurrentUser(session.User, session));
    }

    public async Task LogoutCurrentSessionAsync(Guid sessionId, CancellationToken cancellationToken)
    {
        var session = await dbContext.UserSessions.SingleOrDefaultAsync(candidate => candidate.Id == sessionId, cancellationToken);
        if (session is null || session.RevokedAtUtc is not null)
        {
            return;
        }

        session.RevokedAtUtc = timeProvider.GetUtcNow();
        session.LastSeenAtUtc = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<ServiceResult<MessageResponse>> ChangePasswordAsync(
        Guid userId,
        Guid sessionId,
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.UserAccounts.SingleOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return ServiceResult<MessageResponse>.Failure("user_not_found", "User account not found.", StatusCodes.Status404NotFound);
        }

        var verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return ServiceResult<MessageResponse>.Failure("invalid_current_password", "The current password is incorrect.", StatusCodes.Status400BadRequest);
        }

        var passwordError = ValidatePassword(request.NewPassword);
        if (passwordError is not null)
        {
            return ServiceResult<MessageResponse>.Failure("invalid_password", passwordError, StatusCodes.Status400BadRequest);
        }

        var now = timeProvider.GetUtcNow();
        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.UpdatedAtUtc = now;

        var session = await dbContext.UserSessions.SingleOrDefaultAsync(candidate => candidate.Id == sessionId, cancellationToken);
        if (session is not null)
        {
            session.LastSeenAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return ServiceResult<MessageResponse>.Success(new MessageResponse("Password updated."));
    }

    public async Task<ServiceResult<PasswordResetRequestResponse>> RequestPasswordResetAsync(
        RequestPasswordResetRequest request,
        bool includePreviewToken,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.EmailOrUserName))
        {
            return ServiceResult<PasswordResetRequestResponse>.Failure("invalid_identity", "Email or username is required.", StatusCodes.Status400BadRequest);
        }

        var normalized = Normalize(request.EmailOrUserName);
        var user = await dbContext.UserAccounts.SingleOrDefaultAsync(candidate =>
            candidate.NormalizedEmail == normalized || candidate.NormalizedUserName == normalized, cancellationToken);

        if (user is null)
        {
            return ServiceResult<PasswordResetRequestResponse>.Success(new PasswordResetRequestResponse(
                "If the account exists, a password reset flow has been prepared.",
                null,
                null));
        }

        var now = timeProvider.GetUtcNow();
        var rawToken = passwordResetTokenService.GenerateToken();
        var tokenRecord = new PasswordResetTokenRecord
        {
            UserAccountId = user.Id,
            TokenHash = passwordResetTokenService.HashToken(rawToken),
            RequestedAtUtc = now,
            ExpiresAtUtc = now.Add(options.PasswordResetTokenLifetime)
        };

        dbContext.PasswordResetTokens.Add(tokenRecord);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ServiceResult<PasswordResetRequestResponse>.Success(new PasswordResetRequestResponse(
            "If the account exists, a password reset flow has been prepared.",
            includePreviewToken ? rawToken : null,
            includePreviewToken ? tokenRecord.ExpiresAtUtc : null));
    }

    public async Task<ServiceResult<MessageResponse>> ConfirmPasswordResetAsync(
        ConfirmPasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        var passwordError = ValidatePassword(request.NewPassword);
        if (passwordError is not null)
        {
            return ServiceResult<MessageResponse>.Failure("invalid_password", passwordError, StatusCodes.Status400BadRequest);
        }

        var tokenHash = passwordResetTokenService.HashToken(request.Token.Trim());
        var tokenRecord = await dbContext.PasswordResetTokens
            .Include(candidate => candidate.User)
            .SingleOrDefaultAsync(candidate => candidate.TokenHash == tokenHash, cancellationToken);

        var now = timeProvider.GetUtcNow();
        if (tokenRecord is null || tokenRecord.UsedAtUtc is not null || tokenRecord.ExpiresAtUtc <= now)
        {
            return ServiceResult<MessageResponse>.Failure("invalid_reset_token", "The password reset token is invalid or expired.", StatusCodes.Status400BadRequest);
        }

        tokenRecord.User.PasswordHash = passwordHasher.HashPassword(tokenRecord.User, request.NewPassword);
        tokenRecord.User.UpdatedAtUtc = now;
        tokenRecord.UsedAtUtc = now;

        foreach (var session in await dbContext.UserSessions
                     .Where(candidate => candidate.UserAccountId == tokenRecord.UserAccountId && candidate.RevokedAtUtc == null)
                     .ToListAsync(cancellationToken))
        {
            session.RevokedAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return ServiceResult<MessageResponse>.Success(new MessageResponse("Password reset complete."));
    }

    public async Task<ServiceResult<DeleteAccountShellResponse>> StartDeleteAccountAsync(
        Guid userId,
        DeleteAccountRequest request,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.UserAccounts.SingleOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return ServiceResult<DeleteAccountShellResponse>.Failure("user_not_found", "User account not found.", StatusCodes.Status404NotFound);
        }

        var verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return ServiceResult<DeleteAccountShellResponse>.Failure("invalid_current_password", "The current password is incorrect.", StatusCodes.Status400BadRequest);
        }

        return ServiceResult<DeleteAccountShellResponse>.Success(new DeleteAccountShellResponse(
            "scaffolded",
            "The account deletion flow has been scaffolded, but destructive cleanup is deferred to a later branch."));
    }

    public static CurrentUserResponse MapCurrentUser(UserAccount user, UserSession session)
    {
        return new CurrentUserResponse(
            user.Id,
            user.Email,
            user.UserName,
            session.Id,
            session.RememberMe,
            session.ExpiresAtUtc);
    }

    private UserSession CreateSession(
        UserAccount user,
        bool rememberMe,
        SessionClientContext clientContext,
        DateTimeOffset now)
    {
        return new UserSession
        {
            User = user,
            UserAccountId = user.Id,
            CreatedAtUtc = now,
            LastSeenAtUtc = now,
            ExpiresAtUtc = now.Add(rememberMe ? options.PersistentSessionLifetime : options.SessionLifetime),
            RememberMe = rememberMe,
            UserAgent = Truncate(clientContext.UserAgent, 512),
            IpAddress = Truncate(clientContext.IpAddress, 64)
        };
    }

    private static string Normalize(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static string? ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password))
        {
            return "Password is required.";
        }

        if (password.Length < 8)
        {
            return "Password must be at least 8 characters long.";
        }

        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit))
        {
            return "Password must include at least one letter and one number.";
        }

        return null;
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= maxLength ? value : value[..maxLength];
    }
}
