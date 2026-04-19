using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Presence.Contracts;
using SlackApp.Modules.Presence.Hubs;
using SlackApp.Modules.Presence.Services;

namespace SlackApp.Modules.Presence.Extensions;

public static class PresenceModuleExtensions
{
    public static IServiceCollection AddPresenceModule(this IServiceCollection services)
    {
        services.AddSignalR();
        services.AddScoped<ConversationAccessService>();
        services.AddSingleton<IRealtimeNotifier, RealtimeNotifier>();
        return services;
    }

    public static IEndpointRouteBuilder MapPresenceModule(this IEndpointRouteBuilder app)
    {
        app.MapHub<RealtimeHub>("/hubs/realtime");

        app.MapGet("/api/realtime/contract", () => Results.Ok(new
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
                RealtimeHubMethods.Ping
            },
            syncMode = "rest-gap-repair"
        }))
        .WithTags("Realtime")
        .Produces(StatusCodes.Status200OK);

        return app;
    }
}
