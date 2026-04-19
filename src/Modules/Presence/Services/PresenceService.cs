using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SlackApp.Modules.Presence.Contracts;

namespace SlackApp.Modules.Presence.Services;

public sealed class PresenceService(
    IPresenceStore presenceStore,
    IRealtimeNotifier realtimeNotifier,
    TimeProvider timeProvider,
    IOptions<PresenceOptions> optionsAccessor,
    ILogger<PresenceService> logger)
{
    private readonly PresenceOptions options = optionsAccessor.Value;
    private readonly ConcurrentDictionary<Guid, PresenceStateFingerprint> lastPublishedStates = new();

    public async Task<CurrentPresenceResponse> GetCurrentPresenceAsync(Guid userId, CancellationToken cancellationToken)
    {
        var snapshot = await GetSnapshotAsync(userId, cancellationToken);
        return new CurrentPresenceResponse(
            snapshot,
            options.HeartbeatIntervalSeconds,
            options.HeartbeatTtlSeconds,
            options.AfkThresholdSeconds,
            options.Store);
    }

    public async Task<PresenceHeartbeatAcceptedResponse> RecordHeartbeatAsync(
        Guid userId,
        PresenceHeartbeatRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = timeProvider.GetUtcNow();
        var tabRecord = BuildTabRecord(request, now);

        await presenceStore.UpsertTabAsync(userId, tabRecord, options.HeartbeatTtl, cancellationToken);

        var snapshot = await GetSnapshotAsync(userId, cancellationToken);
        await PublishIfChangedAsync(snapshot, cancellationToken);

        logger.LogDebug(
            "Recorded presence heartbeat for user {UserId} tab {TabId} with state {State}",
            userId,
            tabRecord.TabId,
            snapshot.State);

        return new PresenceHeartbeatAcceptedResponse(
            tabRecord.TabId,
            options.HeartbeatIntervalSeconds,
            options.HeartbeatTtlSeconds,
            options.AfkThresholdSeconds,
            snapshot);
    }

    public async Task SweepAsync(CancellationToken cancellationToken)
    {
        var trackedUserIds = await presenceStore.GetTrackedUserIdsAsync(cancellationToken);

        foreach (var userId in trackedUserIds)
        {
            var snapshot = await GetSnapshotAsync(userId, cancellationToken);
            await PublishIfChangedAsync(snapshot, cancellationToken);
        }
    }

    private async Task<PresenceSnapshotResponse> GetSnapshotAsync(Guid userId, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var liveTabs = await presenceStore.GetLiveTabsAsync(userId, cancellationToken);
        return BuildSnapshot(userId, liveTabs, now);
    }

    private PresenceSnapshotResponse BuildSnapshot(
        Guid userId,
        IReadOnlyList<PresenceTabRecord> liveTabs,
        DateTimeOffset now)
    {
        var orderedTabs = liveTabs
            .OrderByDescending(record => record.LastHeartbeatAtUtc)
            .ThenBy(record => record.TabId, StringComparer.Ordinal)
            .ToArray();

        var mostRecentInteractionAtUtc = orderedTabs
            .OrderByDescending(record => record.LastInteractionAtUtc)
            .Select(record => (DateTimeOffset?)record.LastInteractionAtUtc)
            .FirstOrDefault();

        var mostRecentHeartbeatAtUtc = orderedTabs
            .Select(record => (DateTimeOffset?)record.LastHeartbeatAtUtc)
            .FirstOrDefault();

        var state = ResolveState(orderedTabs, now);
        var tabResponses = orderedTabs
            .Select(record => new PresenceTabResponse(
                record.TabId,
                record.VisibilityState,
                record.ConnectedAtUtc,
                record.LastInteractionAtUtc,
                record.LastHeartbeatAtUtc))
            .ToArray();

        return new PresenceSnapshotResponse(
            userId,
            state,
            tabResponses.Length,
            mostRecentInteractionAtUtc,
            mostRecentHeartbeatAtUtc,
            now,
            tabResponses);
    }

    private string ResolveState(IReadOnlyList<PresenceTabRecord> liveTabs, DateTimeOffset now)
    {
        if (liveTabs.Count == 0)
        {
            return "offline";
        }

        var activityCutoff = now - TimeSpan.FromSeconds(Math.Max(1, options.AfkThresholdSeconds));
        return liveTabs.Any(record => record.LastInteractionAtUtc >= activityCutoff)
            ? "online"
            : "afk";
    }

    private PresenceTabRecord BuildTabRecord(PresenceHeartbeatRequest request, DateTimeOffset now)
    {
        var tabId = NormalizeTabId(request.TabId);
        var connectedAtUtc = request.ConnectedAtUtc == default
            ? now
            : request.ConnectedAtUtc > now
                ? now
                : request.ConnectedAtUtc;
        var lastInteractionAtUtc = request.LastInteractionAtUtc == default
            ? now
            : request.LastInteractionAtUtc > now
                ? now
                : request.LastInteractionAtUtc;

        if (lastInteractionAtUtc < connectedAtUtc)
        {
            lastInteractionAtUtc = connectedAtUtc;
        }

        return new PresenceTabRecord(
            tabId,
            NormalizeVisibilityState(request.VisibilityState),
            connectedAtUtc,
            lastInteractionAtUtc,
            now);
    }

    private async Task PublishIfChangedAsync(PresenceSnapshotResponse snapshot, CancellationToken cancellationToken)
    {
        var nextFingerprint = new PresenceStateFingerprint(snapshot.State, snapshot.LiveTabCount);
        if (snapshot.LiveTabCount == 0 && !lastPublishedStates.TryGetValue(snapshot.UserId, out _))
        {
            return;
        }

        if (lastPublishedStates.TryGetValue(snapshot.UserId, out var currentFingerprint) &&
            currentFingerprint == nextFingerprint)
        {
            return;
        }

        lastPublishedStates[snapshot.UserId] = nextFingerprint;

        await realtimeNotifier.NotifyUsersAsync(
            "presence.state.changed",
            snapshot,
            [snapshot.UserId],
            cancellationToken);

        logger.LogInformation(
            "Published presence state {State} with {LiveTabCount} live tabs for user {UserId}",
            snapshot.State,
            snapshot.LiveTabCount,
            snapshot.UserId);
    }

    private static string NormalizeTabId(string tabId)
    {
        var normalized = string.IsNullOrWhiteSpace(tabId)
            ? Guid.NewGuid().ToString("N")
            : tabId.Trim();

        return normalized.Length > 128
            ? normalized[..128]
            : normalized;
    }

    private static string NormalizeVisibilityState(string visibilityState)
    {
        if (string.IsNullOrWhiteSpace(visibilityState))
        {
            return "unknown";
        }

        var normalized = visibilityState.Trim().ToLowerInvariant();
        return normalized switch
        {
            "visible" => "visible",
            "hidden" => "hidden",
            "prerender" => "prerender",
            _ => "unknown"
        };
    }
}
