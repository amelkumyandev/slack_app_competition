using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Contacts.Contracts;
using SlackApp.Modules.Contacts.Services;
using SlackApp.Modules.Identity.Infrastructure;

namespace SlackApp.Modules.Contacts.Extensions;

public static class ContactsModuleExtensions
{
    public static IServiceCollection AddContactsModule(this IServiceCollection services)
    {
        services.AddScoped<ContactManagementService>();
        return services;
    }

    public static IEndpointRouteBuilder MapContactsModule(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/contacts")
            .WithTags("Contacts")
            .RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.GetSummaryAsync(userId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/friend-requests", async (
            ClaimsPrincipal principal,
            CreateFriendRequestRequest request,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.SendFriendRequestAsync(userId, request, cancellationToken);
            return result.ToResult(statusCode: StatusCodes.Status201Created);
        });

        group.MapPost("/friend-requests/{requestId:guid}/accept", async (
            Guid requestId,
            ClaimsPrincipal principal,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.AcceptFriendRequestAsync(userId, requestId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/friend-requests/{requestId:guid}/decline", async (
            Guid requestId,
            ClaimsPrincipal principal,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.DeclineFriendRequestAsync(userId, requestId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/friends/remove", async (
            ClaimsPrincipal principal,
            RemoveFriendRequest request,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.RemoveFriendAsync(userId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/bans", async (
            ClaimsPrincipal principal,
            CreateUserBanRequest request,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.BanUserAsync(userId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/bans/remove", async (
            ClaimsPrincipal principal,
            RemoveUserBanRequest request,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.UnbanUserAsync(userId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapGet("/pm-policy/{targetUserName}", async (
            string targetUserName,
            ClaimsPrincipal principal,
            ContactManagementService contactManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await contactManagementService.GetPmPolicyAsync(userId, targetUserName, cancellationToken);
            return result.ToResult();
        });

        return app;
    }

    private static IResult ToResult<T>(this ContactServiceResult<T> result, int? statusCode = null)
    {
        if (result.Succeeded)
        {
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
