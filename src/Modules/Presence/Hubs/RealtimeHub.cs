using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Presence.Contracts;
using SlackApp.Modules.Presence.Services;

namespace SlackApp.Modules.Presence.Hubs;

[Authorize]
public sealed class RealtimeHub(
    ConversationAccessService conversationAccessService,
    TimeProvider timeProvider,
    ILogger<RealtimeHub> logger) : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (!SessionPrincipalFactory.TryGetIdentifiers(Context.User, out var userId, out _))
        {
            Context.Abort();
            return;
        }

        var userGroup = RealtimeGroups.User(userId);
        await Groups.AddToGroupAsync(Context.ConnectionId, userGroup, Context.ConnectionAborted);

        logger.LogInformation("Realtime connection opened for user {UserId} on connection {ConnectionId}", userId, Context.ConnectionId);

        await Clients.Caller.SendAsync(
            RealtimeClientMethods.ConnectionReady,
            new ConnectionReadyResponse(
                Context.ConnectionId,
                userId,
                userGroup,
                "room:",
                "rest-gap-repair",
                timeProvider.GetUtcNow()),
            Context.ConnectionAborted);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (SessionPrincipalFactory.TryGetIdentifiers(Context.User, out var userId, out _))
        {
            logger.LogInformation("Realtime connection closed for user {UserId} on connection {ConnectionId}", userId, Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<ConversationSubscriptionResponse> SubscribeConversation(string conversationKey)
    {
        if (!SessionPrincipalFactory.TryGetIdentifiers(Context.User, out var userId, out _))
        {
            throw new HubException("Authentication is required for realtime subscriptions.");
        }

        var accessDecision = await conversationAccessService.AuthorizeSubscriptionAsync(userId, conversationKey, Context.ConnectionAborted);
        if (!accessDecision.Allowed)
        {
            throw new HubException(accessDecision.Message);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, accessDecision.GroupName, Context.ConnectionAborted);

        var response = new ConversationSubscriptionResponse(
            accessDecision.NormalizedConversationKey,
            accessDecision.GroupName,
            "subscribed",
            timeProvider.GetUtcNow());

        logger.LogInformation(
            "Connection {ConnectionId} subscribed user {UserId} to {ConversationKey}",
            Context.ConnectionId,
            userId,
            accessDecision.NormalizedConversationKey);

        await Clients.Caller.SendAsync(RealtimeClientMethods.SubscriptionUpdated, response, Context.ConnectionAborted);
        return response;
    }

    public async Task<ConversationSubscriptionResponse> UnsubscribeConversation(string conversationKey)
    {
        if (!conversationAccessService.TryBuildConversationGroup(conversationKey, out var normalizedConversationKey, out var groupName))
        {
            throw new HubException("Only room conversation keys are supported right now.");
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName, Context.ConnectionAborted);

        var response = new ConversationSubscriptionResponse(
            normalizedConversationKey,
            groupName,
            "unsubscribed",
            timeProvider.GetUtcNow());

        logger.LogInformation(
            "Connection {ConnectionId} unsubscribed from {ConversationKey}",
            Context.ConnectionId,
            normalizedConversationKey);

        await Clients.Caller.SendAsync(RealtimeClientMethods.SubscriptionUpdated, response, Context.ConnectionAborted);
        return response;
    }

    public ServerHeartbeatResponse Ping()
    {
        return new ServerHeartbeatResponse(timeProvider.GetUtcNow());
    }
}
