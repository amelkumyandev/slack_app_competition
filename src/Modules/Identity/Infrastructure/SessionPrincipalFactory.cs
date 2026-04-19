using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using SlackApp.Modules.Identity.Domain;

namespace SlackApp.Modules.Identity.Infrastructure;

public static class SessionPrincipalFactory
{
    public static ClaimsPrincipal CreatePrincipal(UserAccount user, UserSession session)
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.UserName),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(SessionClaimTypes.SessionId, session.Id.ToString())
            ],
            CookieAuthenticationDefaults.AuthenticationScheme);

        return new ClaimsPrincipal(identity);
    }

    public static AuthenticationProperties CreateAuthenticationProperties(UserSession session)
    {
        return new AuthenticationProperties
        {
            AllowRefresh = true,
            ExpiresUtc = session.ExpiresAtUtc,
            IsPersistent = session.RememberMe
        };
    }

    public static bool TryGetIdentifiers(ClaimsPrincipal? principal, out Guid userId, out Guid sessionId)
    {
        userId = Guid.Empty;
        sessionId = Guid.Empty;

        if (principal?.Identity?.IsAuthenticated is not true)
        {
            return false;
        }

        var userIdValue = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var sessionIdValue = principal.FindFirstValue(SessionClaimTypes.SessionId);

        return Guid.TryParse(userIdValue, out userId) && Guid.TryParse(sessionIdValue, out sessionId);
    }
}
