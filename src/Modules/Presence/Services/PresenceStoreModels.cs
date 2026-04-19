namespace SlackApp.Modules.Presence.Services;

public sealed record PresenceTabRecord(
    string TabId,
    string VisibilityState,
    DateTimeOffset ConnectedAtUtc,
    DateTimeOffset LastInteractionAtUtc,
    DateTimeOffset LastHeartbeatAtUtc);

internal sealed record PresenceStateFingerprint(string State, int LiveTabCount);
