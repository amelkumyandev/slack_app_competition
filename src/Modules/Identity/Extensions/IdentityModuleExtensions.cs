using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Identity.Services;

namespace SlackApp.Modules.Identity.Extensions;

public static class IdentityModuleExtensions
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddIdentityModuleServices(configuration);
        return services;
    }

    public static async Task InitializeIdentityModuleAsync(this IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await dbContext.Database.EnsureCreatedAsync();
    }

    public static IEndpointRouteBuilder MapIdentityModule(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapGet("/me", async (
            ClaimsPrincipal principal,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out var sessionId))
            {
                return Results.Unauthorized();
            }

            var result = await authService.GetCurrentUserAsync(userId, sessionId, cancellationToken);
            return result.ToResult();
        }).RequireAuthorization();

        group.MapPost("/register", async (
            RegisterRequest request,
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            var result = await authService.RegisterAsync(request, BuildClientContext(httpContext), cancellationToken);

            if (!result.Succeeded)
            {
                return result.ToResult();
            }

            await httpContext.SignInAsync(
                SessionPrincipalFactory.CreatePrincipal(result.Value!.User, result.Value.Session),
                SessionPrincipalFactory.CreateAuthenticationProperties(result.Value.Session));

            return Results.Created("/api/auth/me", new AuthResponse(AuthService.MapCurrentUser(result.Value.User, result.Value.Session)));
        }).AllowAnonymous();

        group.MapPost("/login", async (
            LoginRequest request,
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            var result = await authService.LoginAsync(request, BuildClientContext(httpContext), cancellationToken);

            if (!result.Succeeded)
            {
                return result.ToResult();
            }

            await httpContext.SignInAsync(
                SessionPrincipalFactory.CreatePrincipal(result.Value!.User, result.Value.Session),
                SessionPrincipalFactory.CreateAuthenticationProperties(result.Value.Session));

            return Results.Ok(new AuthResponse(AuthService.MapCurrentUser(result.Value.User, result.Value.Session)));
        }).AllowAnonymous();

        group.MapPost("/logout", async (
            ClaimsPrincipal principal,
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out _, out var sessionId))
            {
                return Results.Unauthorized();
            }

            await authService.LogoutCurrentSessionAsync(sessionId, cancellationToken);
            await httpContext.SignOutAsync();

            return Results.Ok(new MessageResponse("Signed out of the current session."));
        }).RequireAuthorization();

        group.MapPost("/change-password", async (
            ClaimsPrincipal principal,
            ChangePasswordRequest request,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out var sessionId))
            {
                return Results.Unauthorized();
            }

            var result = await authService.ChangePasswordAsync(userId, sessionId, request, cancellationToken);
            return result.ToResult();
        }).RequireAuthorization();

        group.MapPost("/password-reset/request", async (
            RequestPasswordResetRequest request,
            AuthService authService,
            IWebHostEnvironment environment,
            CancellationToken cancellationToken) =>
        {
            var result = await authService.RequestPasswordResetAsync(request, environment.IsDevelopment(), cancellationToken);
            return result.ToResult(statusCode: StatusCodes.Status202Accepted);
        }).AllowAnonymous();

        group.MapPost("/password-reset/confirm", async (
            ConfirmPasswordResetRequest request,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            var result = await authService.ConfirmPasswordResetAsync(request, cancellationToken);
            return result.ToResult();
        }).AllowAnonymous();

        group.MapPost("/delete-account", async (
            ClaimsPrincipal principal,
            DeleteAccountRequest request,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await authService.StartDeleteAccountAsync(userId, request, cancellationToken);
            return result.ToResult(statusCode: StatusCodes.Status202Accepted);
        }).RequireAuthorization();

        return app;
    }

    private static SessionClientContext BuildClientContext(HttpContext httpContext)
    {
        return new SessionClientContext(
            httpContext.Request.Headers.UserAgent.ToString(),
            httpContext.Connection.RemoteIpAddress?.ToString());
    }

    private static IResult ToResult<T>(this ServiceResult<T> result, int? statusCode = null)
    {
        if (result.Succeeded)
        {
            if (result.Value is null)
            {
                return Results.StatusCode(statusCode ?? StatusCodes.Status204NoContent);
            }

            if (statusCode is { } explicitStatus)
            {
                return Results.Json(result.Value, statusCode: explicitStatus);
            }

            return Results.Ok(result.Value);
        }

        return Results.Problem(
            statusCode: result.Error!.StatusCode,
            title: result.Error.Code,
            detail: result.Error.Message);
    }
}
