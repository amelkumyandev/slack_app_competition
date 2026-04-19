namespace SlackApp.Modules.Presence.Services;

public interface IPresenceStore
{
    Task UpsertTabAsync(
        Guid userId,
        PresenceTabRecord tabRecord,
        TimeSpan ttl,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<PresenceTabRecord>> GetLiveTabsAsync(Guid userId, CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> GetTrackedUserIdsAsync(CancellationToken cancellationToken);
}
