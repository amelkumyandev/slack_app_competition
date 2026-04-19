namespace SlackApp.Modules.Presence.Contracts;

public sealed record PresenceHeartbeatRequest(
    string TabId,
    DateTimeOffset LastInteractionAtUtc,
    string VisibilityState,
    DateTimeOffset ConnectedAtUtc);

public sealed record PresenceTabResponse(
    string TabId,
    string VisibilityState,
    DateTimeOffset ConnectedAtUtc,
    DateTimeOffset LastInteractionAtUtc,
    DateTimeOffset LastHeartbeatAtUtc);

public sealed record PresenceSnapshotResponse(
    Guid UserId,
    string State,
    int LiveTabCount,
    DateTimeOffset? LastInteractionAtUtc,
    DateTimeOffset? LastHeartbeatAtUtc,
    DateTimeOffset ServerTimeUtc,
    IReadOnlyList<PresenceTabResponse> Tabs);

public sealed record CurrentPresenceResponse(
    PresenceSnapshotResponse Presence,
    int HeartbeatIntervalSeconds,
    int HeartbeatTtlSeconds,
    int AfkThresholdSeconds,
    string Store);

public sealed record PresenceHeartbeatAcceptedResponse(
    string TabId,
    int HeartbeatIntervalSeconds,
    int HeartbeatTtlSeconds,
    int AfkThresholdSeconds,
    PresenceSnapshotResponse Presence);
