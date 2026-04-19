namespace SlackApp.Modules.Presence.Services;

public sealed class PresenceOptions
{
    public const string SectionName = "Presence";

    public string Store { get; set; } = "InMemory";

    public int HeartbeatIntervalSeconds { get; set; } = 20;

    public int HeartbeatTtlSeconds { get; set; } = 75;

    public int AfkThresholdSeconds { get; set; } = 60;

    public int SweepIntervalSeconds { get; set; } = 15;

    public TimeSpan HeartbeatTtl => TimeSpan.FromSeconds(Math.Max(1, HeartbeatTtlSeconds));
}
