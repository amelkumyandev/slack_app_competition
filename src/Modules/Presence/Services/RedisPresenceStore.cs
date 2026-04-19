using System.Text.Json;
using StackExchange.Redis;

namespace SlackApp.Modules.Presence.Services;

internal sealed class RedisPresenceStore(IConnectionMultiplexer connectionMultiplexer) : IPresenceStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private const string ActiveUsersKey = "presence:active-users";

    public async Task UpsertTabAsync(
        Guid userId,
        PresenceTabRecord tabRecord,
        TimeSpan ttl,
        CancellationToken cancellationToken)
    {
        var database = connectionMultiplexer.GetDatabase();
        var tabKey = BuildTabKey(userId, tabRecord.TabId);
        var userTabsKey = BuildUserTabsKey(userId);
        var payload = JsonSerializer.Serialize(tabRecord, SerializerOptions);

        await database.StringSetAsync(tabKey, payload, ttl).WaitAsync(cancellationToken);
        await database.SetAddAsync(userTabsKey, tabKey).WaitAsync(cancellationToken);
        await database.SetAddAsync(ActiveUsersKey, userId.ToString("D")).WaitAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PresenceTabRecord>> GetLiveTabsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var database = connectionMultiplexer.GetDatabase();
        var userTabsKey = BuildUserTabsKey(userId);
        var tabKeys = await database.SetMembersAsync(userTabsKey).WaitAsync(cancellationToken);
        if (tabKeys.Length == 0)
        {
            await CleanupEmptyUserAsync(database, userId, userTabsKey, cancellationToken);
            return [];
        }

        var redisKeys = tabKeys
            .Select(value => (RedisKey)value.ToString())
            .ToArray();
        var payloads = await database.StringGetAsync(redisKeys).WaitAsync(cancellationToken);
        var liveTabs = new List<PresenceTabRecord>(payloads.Length);
        var staleKeys = new List<RedisValue>();

        for (var index = 0; index < payloads.Length; index++)
        {
            if (payloads[index].IsNullOrEmpty)
            {
                staleKeys.Add(tabKeys[index]);
                continue;
            }

            var tabRecord = JsonSerializer.Deserialize<PresenceTabRecord>(payloads[index].ToString(), SerializerOptions);
            if (tabRecord is null)
            {
                staleKeys.Add(tabKeys[index]);
                continue;
            }

            liveTabs.Add(tabRecord);
        }

        if (staleKeys.Count > 0)
        {
            await database.SetRemoveAsync(userTabsKey, [.. staleKeys]).WaitAsync(cancellationToken);
        }

        if (liveTabs.Count == 0)
        {
            await CleanupEmptyUserAsync(database, userId, userTabsKey, cancellationToken);
            return [];
        }

        return liveTabs
            .OrderByDescending(record => record.LastHeartbeatAtUtc)
            .ThenBy(record => record.TabId, StringComparer.Ordinal)
            .ToArray();
    }

    public async Task<IReadOnlyList<Guid>> GetTrackedUserIdsAsync(CancellationToken cancellationToken)
    {
        var database = connectionMultiplexer.GetDatabase();
        var members = await database.SetMembersAsync(ActiveUsersKey).WaitAsync(cancellationToken);
        var userIds = new List<Guid>(members.Length);

        foreach (var member in members)
        {
            if (Guid.TryParse(member.ToString(), out var userId))
            {
                userIds.Add(userId);
            }
        }

        return userIds;
    }

    private static string BuildUserTabsKey(Guid userId)
    {
        return $"presence:user:{userId:D}:tabs";
    }

    private static string BuildTabKey(Guid userId, string tabId)
    {
        return $"presence:user:{userId:D}:tab:{tabId}";
    }

    private static async Task CleanupEmptyUserAsync(
        IDatabase database,
        Guid userId,
        RedisKey userTabsKey,
        CancellationToken cancellationToken)
    {
        await database.KeyDeleteAsync(userTabsKey).WaitAsync(cancellationToken);
        await database.SetRemoveAsync(ActiveUsersKey, userId.ToString("D")).WaitAsync(cancellationToken);
    }
}
