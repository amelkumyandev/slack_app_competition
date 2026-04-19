using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace SlackApp.Modules.Identity.Infrastructure;

public sealed class IdentityCookieEvents(IdentityDbContext dbContext, TimeProvider timeProvider) : CookieAuthenticationEvents
{
    private static readonly TimeSpan SessionTouchInterval = TimeSpan.FromMinutes(1);

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }

    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    }

    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        if (!SessionPrincipalFactory.TryGetIdentifiers(context.Principal, out var userId, out var sessionId))
        {
            await RejectAsync(context);
            return;
        }

        var now = timeProvider.GetUtcNow();
        var session = await dbContext.UserSessions
            .Include(candidate => candidate.User)
            .SingleOrDefaultAsync(candidate => candidate.Id == sessionId, context.HttpContext.RequestAborted);

        if (session is null ||
            session.UserAccountId != userId ||
            session.RevokedAtUtc is not null ||
            session.ExpiresAtUtc <= now)
        {
            await RejectAsync(context);
            return;
        }

        if (now - session.LastSeenAtUtc > SessionTouchInterval)
        {
            session.LastSeenAtUtc = now;
            await dbContext.SaveChangesAsync(context.HttpContext.RequestAborted);
        }
    }

    private static async Task RejectAsync(CookieValidatePrincipalContext context)
    {
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync();
    }
}
