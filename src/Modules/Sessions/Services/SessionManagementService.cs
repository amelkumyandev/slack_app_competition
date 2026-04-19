using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Sessions.Contracts;

namespace SlackApp.Modules.Sessions.Services;

public sealed class SessionManagementService(IdentityDbContext dbContext, TimeProvider timeProvider)
{
    public async Task<SessionServiceResult<UserSessionsResponse>> ListAsync(
        Guid userId,
        Guid currentSessionId,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var sessions = await dbContext.UserSessions
            .Where(candidate => candidate.UserAccountId == userId)
            .ToListAsync(cancellationToken);

        var currentSession = sessions.SingleOrDefault(candidate => candidate.Id == currentSessionId);
        if (currentSession is null || currentSession.RevokedAtUtc is not null || currentSession.ExpiresAtUtc <= now)
        {
            return SessionServiceResult<UserSessionsResponse>.Failure(
                "session_not_found",
                "The active session could not be found.",
                StatusCodes.Status401Unauthorized);
        }

        var response = sessions
            .OrderByDescending(candidate => candidate.Id == currentSessionId)
            .ThenBy(candidate => candidate.RevokedAtUtc is not null)
            .ThenBy(candidate => candidate.ExpiresAtUtc <= now)
            .ThenByDescending(candidate => candidate.LastSeenAtUtc)
            .ThenByDescending(candidate => candidate.CreatedAtUtc)
            .Select(candidate => MapSession(candidate, currentSessionId, now))
            .ToArray();

        return SessionServiceResult<UserSessionsResponse>.Success(new UserSessionsResponse(response));
    }

    public async Task<SessionServiceResult<SessionRevocationResponse>> RevokeAsync(
        Guid userId,
        Guid currentSessionId,
        Guid targetSessionId,
        CancellationToken cancellationToken)
    {
        var session = await dbContext.UserSessions.SingleOrDefaultAsync(
            candidate => candidate.Id == targetSessionId && candidate.UserAccountId == userId,
            cancellationToken);

        if (session is null)
        {
            return SessionServiceResult<SessionRevocationResponse>.Failure(
                "session_not_found",
                "That session was not found for the current account.",
                StatusCodes.Status404NotFound);
        }

        if (session.Id == currentSessionId)
        {
            return SessionServiceResult<SessionRevocationResponse>.Failure(
                "cannot_revoke_current_session",
                "Use the current-session logout flow to sign out of this browser.",
                StatusCodes.Status400BadRequest);
        }

        if (session.RevokedAtUtc is null)
        {
            session.RevokedAtUtc = timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return SessionServiceResult<SessionRevocationResponse>.Success(
            new SessionRevocationResponse("Session access revoked.", session.Id));
    }

    private static UserSessionResponse MapSession(UserSession session, Guid currentSessionId, DateTimeOffset now)
    {
        var isCurrent = session.Id == currentSessionId;
        var isRevoked = session.RevokedAtUtc is not null;
        var isExpired = session.ExpiresAtUtc <= now;

        return new UserSessionResponse(
            session.Id,
            isCurrent,
            !isCurrent && !isRevoked && !isExpired,
            isRevoked ? "revoked" : isExpired ? "expired" : "active",
            session.RememberMe,
            session.UserAgent,
            session.IpAddress,
            session.CreatedAtUtc,
            session.LastSeenAtUtc,
            session.ExpiresAtUtc,
            session.RevokedAtUtc);
    }
}
