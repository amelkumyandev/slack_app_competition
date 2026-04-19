namespace SlackApp.Modules.Presence.Services;

public interface IRealtimeNotifier
{
    Task NotifyUsersAsync(string eventType, object payload, IEnumerable<Guid> userIds, CancellationToken cancellationToken = default);

    Task NotifyConversationAsync(string eventType, string conversationKey, object payload, CancellationToken cancellationToken = default);
}
