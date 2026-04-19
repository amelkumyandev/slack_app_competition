using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Rooms.Contracts;
using SlackApp.Modules.Rooms.Services;

namespace SlackApp.Modules.Rooms.Extensions;

public static class RoomsModuleExtensions
{
    public static IServiceCollection AddRoomsModule(this IServiceCollection services)
    {
        services.AddScoped<RoomManagementService>();
        return services;
    }

    public static IEndpointRouteBuilder MapRoomsModule(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/rooms")
            .WithTags("Rooms")
            .RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            string? search,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.GetDirectoryAsync(userId, search, cancellationToken);
            return result.ToResult();
        });

        group.MapGet("/{roomId:guid}", async (
            Guid roomId,
            ClaimsPrincipal principal,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.GetRoomDetailsAsync(userId, roomId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/", async (
            ClaimsPrincipal principal,
            CreateRoomRequest request,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.CreateRoomAsync(userId, request, cancellationToken);
            return result.ToResult(statusCode: StatusCodes.Status201Created);
        });

        group.MapPost("/{roomId:guid}/join", async (
            Guid roomId,
            ClaimsPrincipal principal,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.JoinPublicRoomAsync(userId, roomId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/{roomId:guid}/leave", async (
            Guid roomId,
            ClaimsPrincipal principal,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.LeaveRoomAsync(userId, roomId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/{roomId:guid}/invitations", async (
            Guid roomId,
            ClaimsPrincipal principal,
            InviteToRoomRequest request,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.InviteUserAsync(userId, roomId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/invitations/{invitationId:guid}/accept", async (
            Guid invitationId,
            ClaimsPrincipal principal,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.AcceptInvitationAsync(userId, invitationId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/invitations/{invitationId:guid}/decline", async (
            Guid invitationId,
            ClaimsPrincipal principal,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.DeclineInvitationAsync(userId, invitationId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/{roomId:guid}/admins", async (
            Guid roomId,
            ClaimsPrincipal principal,
            UpdateRoomAdminRequest request,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.GrantAdminAsync(userId, roomId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/{roomId:guid}/admins/remove", async (
            Guid roomId,
            ClaimsPrincipal principal,
            UpdateRoomAdminRequest request,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.RevokeAdminAsync(userId, roomId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/{roomId:guid}/members/remove", async (
            Guid roomId,
            ClaimsPrincipal principal,
            RemoveRoomMemberRequest request,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.RemoveMemberAsync(userId, roomId, request, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/{roomId:guid}/bans/remove", async (
            Guid roomId,
            ClaimsPrincipal principal,
            RemoveRoomBanRequest request,
            RoomManagementService roomManagementService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await roomManagementService.UnbanMemberAsync(userId, roomId, request, cancellationToken);
            return result.ToResult();
        });

        return app;
    }

    private static IResult ToResult<T>(this RoomServiceResult<T> result, int? statusCode = null)
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
