using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Sessions.Services;

namespace SlackApp.Modules.Sessions.Extensions;

public static class SessionsModuleExtensions
{
    public static IServiceCollection AddSessionsModule(this IServiceCollection services)
    {
        services.AddScoped<SessionManagementService>();
        return services;
    }

    public static IEndpointRouteBuilder MapSessionsModule(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/sessions")
            .WithTags("Sessions")
            .RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            SessionManagementService sessionManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out var currentSessionId))
            {
                return Results.Unauthorized();
            }

            var result = await sessionManagementService.ListAsync(userId, currentSessionId, cancellationToken);
            return result.ToResult();
        });

        group.MapDelete("/{sessionId:guid}", async (
            Guid sessionId,
            ClaimsPrincipal principal,
            SessionManagementService sessionManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out var currentSessionId))
            {
                return Results.Unauthorized();
            }

            var result = await sessionManagementService.RevokeAsync(userId, currentSessionId, sessionId, cancellationToken);
            return result.ToResult();
        });

        return app;
    }

    private static IResult ToResult<T>(this SessionServiceResult<T> result)
    {
        if (result.Succeeded)
        {
            return Results.Ok(result.Value);
        }

        return Results.Problem(
            statusCode: result.Error!.StatusCode,
            title: result.Error.Code,
            detail: result.Error.Message);
    }
}
