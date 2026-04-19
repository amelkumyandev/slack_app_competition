using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Presence.Contracts;
using SlackApp.Modules.Presence.Hubs;
using SlackApp.Modules.Presence.Services;

namespace SlackApp.Modules.Presence.Extensions;

public static class PresenceModuleExtensions
{
    public static IServiceCollection AddPresenceModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSignalR();
        services.AddOptions<PresenceOptions>()
            .Bind(configuration.GetSection(PresenceOptions.SectionName));
        services.AddScoped<ConversationAccessService>();
        services.AddSingleton<IRealtimeNotifier, RealtimeNotifier>();
        services.AddSingleton<PresenceService>();
        services.AddHostedService<PresenceSweepService>();

        var configuredStore = configuration[$"{PresenceOptions.SectionName}:Store"];
        if (string.Equals(configuredStore, "Redis", StringComparison.OrdinalIgnoreCase))
        {
            var redisConnectionString = configuration.GetConnectionString("Redis");
            if (string.IsNullOrWhiteSpace(redisConnectionString))
            {
                throw new InvalidOperationException("Presence store is configured to use Redis, but ConnectionStrings:Redis is empty.");
            }

            services.AddSingleton<IConnectionMultiplexer>(_ =>
            {
                var redisOptions = ConfigurationOptions.Parse(redisConnectionString);
                redisOptions.AbortOnConnectFail = false;
                return ConnectionMultiplexer.Connect(redisOptions);
            });
            services.AddSingleton<IPresenceStore, RedisPresenceStore>();
        }
        else
        {
            services.AddSingleton<IPresenceStore, InMemoryPresenceStore>();
        }

        return services;
    }

    public static IEndpointRouteBuilder MapPresenceModule(this IEndpointRouteBuilder app)
    {
        app.MapHub<RealtimeHub>("/hubs/realtime");

        app.MapGet("/api/realtime/contract", (Microsoft.Extensions.Options.IOptions<PresenceOptions> optionsAccessor) => Results.Ok(new
        {
            hubPath = "/hubs/realtime",
            supportedConversationPrefix = "room:",
            userGroupPattern = "user:{userId}",
            conversationGroupPattern = "conversation:{conversationKey}",
            clientEvents = new[]
            {
                RealtimeClientMethods.ConnectionReady,
                RealtimeClientMethods.SubscriptionUpdated,
                RealtimeClientMethods.EventReceived
            },
            hubMethods = new[]
            {
                RealtimeHubMethods.SubscribeConversation,
                RealtimeHubMethods.UnsubscribeConversation,
                RealtimeHubMethods.Heartbeat,
                RealtimeHubMethods.Ping
            },
            syncMode = "rest-gap-repair",
            presence = new
            {
                store = optionsAccessor.Value.Store,
                heartbeatIntervalSeconds = optionsAccessor.Value.HeartbeatIntervalSeconds,
                heartbeatTtlSeconds = optionsAccessor.Value.HeartbeatTtlSeconds,
                afkThresholdSeconds = optionsAccessor.Value.AfkThresholdSeconds
            }
        }))
        .WithTags("Realtime")
        .Produces(StatusCodes.Status200OK);

        var presenceGroup = app.MapGroup("/api/presence")
            .RequireAuthorization()
            .WithTags("Presence");

        presenceGroup.MapGet("/me", async (
            HttpContext httpContext,
            PresenceService presenceService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(httpContext.User, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var response = await presenceService.GetCurrentPresenceAsync(userId, cancellationToken);
            return Results.Ok(response);
        })
        .Produces<CurrentPresenceResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        presenceGroup.MapPost("/heartbeat", async (
            HttpContext httpContext,
            PresenceHeartbeatRequest request,
            PresenceService presenceService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(httpContext.User, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var response = await presenceService.RecordHeartbeatAsync(userId, request, cancellationToken);
            return Results.Ok(response);
        })
        .Produces<PresenceHeartbeatAcceptedResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return app;
    }
}
