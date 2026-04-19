using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Identity.Infrastructure;
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

        return app;
    }

    private static IResult ToResult<T>(this ConversationQueryResult<T> result)
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
