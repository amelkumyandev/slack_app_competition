using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SlackApp.Modules.Presence.Contracts;
using SlackApp.Modules.Presence.Hubs;

namespace SlackApp.Modules.Presence.Services;

public sealed class RealtimeNotifier(
    IHubContext<RealtimeHub> hubContext,
    TimeProvider timeProvider,
    ILogger<RealtimeNotifier> logger) : IRealtimeNotifier
{
    public async Task NotifyUsersAsync(
        string eventType,
        object payload,
        IEnumerable<Guid> userIds,
        CancellationToken cancellationToken = default)
    {
        var distinctUserIds = userIds.Distinct().ToArray();
        if (distinctUserIds.Length == 0)
        {
            return;
        }

        foreach (var userId in distinctUserIds)
        {
            var target = RealtimeGroups.User(userId);
            var envelope = BuildEnvelope(eventType, "user", target, payload, null, null);
            await hubContext.Clients.Group(target).SendAsync(RealtimeClientMethods.EventReceived, envelope, cancellationToken);
        }

        logger.LogInformation("Published realtime user event {EventType} to {Count} user groups", eventType, distinctUserIds.Length);
    }

    public async Task NotifyConversationAsync(
        string eventType,
        string conversationKey,
        object payload,
        CancellationToken cancellationToken = default)
    {
        var groupName = RealtimeGroups.Conversation(conversationKey);
        var envelope = BuildEnvelope(eventType, "conversation", groupName, payload, null, null);
        await hubContext.Clients.Group(groupName).SendAsync(RealtimeClientMethods.EventReceived, envelope, cancellationToken);

        logger.LogInformation("Published realtime conversation event {EventType} to {GroupName}", eventType, groupName);
    }

    public async Task NotifyConversationAsync(
        string eventType,
        Guid conversationId,
        long watermark,
        object payload,
        CancellationToken cancellationToken = default)
    {
        var groupName = RealtimeGroups.ConversationId(conversationId);
        var envelope = BuildEnvelope(eventType, "conversation", groupName, payload, conversationId, watermark);
        await hubContext.Clients.Group(groupName).SendAsync(RealtimeClientMethods.EventReceived, envelope, cancellationToken);

        logger.LogInformation(
            "Published realtime conversation event {EventType} to {GroupName} at watermark {Watermark}",
            eventType,
            groupName,
            watermark);
    }

    private RealtimeEnvelope BuildEnvelope(
        string eventType,
        string scope,
        string target,
        object payload,
        Guid? conversationId,
        long? watermark)
    {
        return new RealtimeEnvelope(
            eventType,
            scope,
            target,
            conversationId,
            watermark,
            timeProvider.GetUtcNow(),
            JsonSerializer.SerializeToElement(payload));
    }
}
