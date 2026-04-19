using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Messaging.Services;

namespace SlackApp.Modules.Messaging.Extensions;

public static class MessagingModuleExtensions
{
    public static IServiceCollection AddMessagingModule(this IServiceCollection services)
    {
        services.AddScoped<ConversationService>();
        return services;
    }

    public static IEndpointRouteBuilder MapMessagingModule(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/conversations")
            .WithTags("Messaging")
            .RequireAuthorization();

        group.MapGet("/{conversationId:guid}/messages", async (
            Guid conversationId,
            ClaimsPrincipal principal,
            long? beforeWatermark,
            int? pageSize,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.GetHistoryAsync(
                userId,
                conversationId,
                beforeWatermark,
                pageSize ?? 50,
                cancellationToken);

            return result.ToResult();
        });

        group.MapPost("/{conversationId:guid}/messages", async (
            Guid conversationId,
            ClaimsPrincipal principal,
            PostMessageRequest request,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.SendMessageAsync(
                userId,
                conversationId,
                request,
                cancellationToken);

            return result.ToResult(StatusCodes.Status201Created);
        });

        group.MapPost("/{conversationId:guid}/messages/{messageId:guid}/edit", async (
            Guid conversationId,
            Guid messageId,
            ClaimsPrincipal principal,
            EditMessageRequest request,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.EditMessageAsync(
                userId,
                conversationId,
                messageId,
                request,
                cancellationToken);

            return result.ToResult();
        });

        group.MapDelete("/{conversationId:guid}/messages/{messageId:guid}", async (
            Guid conversationId,
            Guid messageId,
            ClaimsPrincipal principal,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.DeleteMessageAsync(
                userId,
                conversationId,
                messageId,
                cancellationToken);

            return result.ToResult();
        });

        group.MapGet("/{conversationId:guid}/sync", async (
            Guid conversationId,
            ClaimsPrincipal principal,
            long afterWatermark,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.GetSyncAsync(
                userId,
                conversationId,
                afterWatermark,
                cancellationToken);

            return result.ToResult();
        });

        group.MapPost("/{conversationId:guid}/read-state", async (
            Guid conversationId,
            ClaimsPrincipal principal,
            UpdateConversationReadStateRequest request,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.MarkConversationReadAsync(
                userId,
                conversationId,
                request.Watermark,
                cancellationToken);

            return result.ToResult();
        });

        group.MapGet("/direct", async (
            ClaimsPrincipal principal,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.GetDirectConversationsAsync(userId, cancellationToken);
            return result.ToResult();
        });

        group.MapPost("/direct", async (
            ClaimsPrincipal principal,
            OpenDirectConversationRequest request,
            ConversationService conversationService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await conversationService.OpenDirectConversationAsync(userId, request, cancellationToken);
            return result.ToResult(StatusCodes.Status201Created);
        });

        return app;
    }

    private static IResult ToResult<T>(this ConversationQueryResult<T> result, int? successStatusCode = null)
    {
        if (result.Succeeded)
        {
            if (successStatusCode is { } explicitStatusCode)
            {
                return Results.Json(result.Value, statusCode: explicitStatusCode);
            }

            return Results.Ok(result.Value);
        }

        return Results.Problem(
            statusCode: result.Error!.StatusCode,
            title: result.Error.Code,
            detail: result.Error.Message);
    }
}
