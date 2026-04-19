using System.Collections.Concurrent;

namespace SlackApp.Modules.Presence.Services;

internal sealed class InMemoryPresenceStore(TimeProvider timeProvider) : IPresenceStore
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, InMemoryPresenceEntry>> userTabs = new();

    public Task UpsertTabAsync(
        Guid userId,
        PresenceTabRecord tabRecord,
        TimeSpan ttl,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var tabs = userTabs.GetOrAdd(userId, static _ => new ConcurrentDictionary<string, InMemoryPresenceEntry>(StringComparer.Ordinal));
        tabs[tabRecord.TabId] = new InMemoryPresenceEntry(tabRecord, timeProvider.GetUtcNow() + ttl);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<PresenceTabRecord>> GetLiveTabsAsync(Guid userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!userTabs.TryGetValue(userId, out var tabs))
        {
            return Task.FromResult<IReadOnlyList<PresenceTabRecord>>([]);
        }

        var now = timeProvider.GetUtcNow();
        foreach (var entry in tabs.ToArray())
        {
            if (entry.Value.ExpiresAtUtc <= now)
            {
                tabs.TryRemove(entry.Key, out _);
            }
        }

        if (tabs.IsEmpty)
        {
            userTabs.TryRemove(userId, out _);
            return Task.FromResult<IReadOnlyList<PresenceTabRecord>>([]);
        }

        var liveTabs = tabs.Values
            .Select(entry => entry.Record)
            .OrderByDescending(record => record.LastHeartbeatAtUtc)
            .ThenBy(record => record.TabId, StringComparer.Ordinal)
            .ToArray();

        return Task.FromResult<IReadOnlyList<PresenceTabRecord>>(liveTabs);
    }

    public Task<IReadOnlyList<Guid>> GetTrackedUserIdsAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyList<Guid>>(userTabs.Keys.ToArray());
    }

    private sealed record InMemoryPresenceEntry(PresenceTabRecord Record, DateTimeOffset ExpiresAtUtc);
}
