using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Presence.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class PresenceHeartbeatTests
{
    [Fact]
    public async Task Heartbeat_Updates_Current_Presence_Snapshot_And_Contract_Metadata()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = CreateHttpClient(factory);

        var authCookie = await RegisterAsync(client, "presence-contract@example.com", "presence-contract");
        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.NotNull(currentUser);

        await using var realtimeClient = await ConnectAsync(factory, authCookie);

        var now = DateTimeOffset.UtcNow;
        var heartbeat = await realtimeClient.Connection.InvokeAsync<PresenceHeartbeatAcceptedResponse>(
            RealtimeHubMethods.Heartbeat,
            new PresenceHeartbeatRequest("tab-alpha", now, "visible", now));

        Assert.Equal("tab-alpha", heartbeat.TabId);
        Assert.Equal("online", heartbeat.Presence.State);
        Assert.Equal(1, heartbeat.Presence.LiveTabCount);
        Assert.Equal(1, heartbeat.HeartbeatIntervalSeconds);
        Assert.Equal(3, heartbeat.HeartbeatTtlSeconds);
        Assert.Equal(1, heartbeat.AfkThresholdSeconds);

        var currentPresence = await client.GetFromJsonAsync<CurrentPresenceResponse>("/api/presence/me");
        Assert.NotNull(currentPresence);
        Assert.Equal(currentUser!.Id, currentPresence!.Presence.UserId);
        Assert.Equal("online", currentPresence.Presence.State);
        Assert.Single(currentPresence.Presence.Tabs);

        var realtimeContract = await client.GetFromJsonAsync<JsonElement>("/api/realtime/contract");
        Assert.True(realtimeContract.TryGetProperty("presence", out var presenceContract));
        Assert.Equal("InMemory", presenceContract.GetProperty("store").GetString());
        Assert.Equal(1, presenceContract.GetProperty("heartbeatIntervalSeconds").GetInt32());
        Assert.Equal(3, presenceContract.GetProperty("heartbeatTtlSeconds").GetInt32());
        Assert.Equal(1, presenceContract.GetProperty("afkThresholdSeconds").GetInt32());
    }

    [Fact]
    public async Task Multiple_Tabs_Aggregate_To_A_Single_Online_Presence()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = CreateHttpClient(factory);

        var authCookie = await RegisterAsync(client, "presence-multi@example.com", "presence-multi");

        await using var firstTab = await ConnectAsync(factory, authCookie);
        await using var secondTab = await ConnectAsync(factory, authCookie);

        var now = DateTimeOffset.UtcNow;

        await firstTab.Connection.InvokeAsync<PresenceHeartbeatAcceptedResponse>(
            RealtimeHubMethods.Heartbeat,
            new PresenceHeartbeatRequest("tab-alpha", now, "visible", now));

        await secondTab.Connection.InvokeAsync<PresenceHeartbeatAcceptedResponse>(
            RealtimeHubMethods.Heartbeat,
            new PresenceHeartbeatRequest("tab-beta", now, "hidden", now));

        var currentPresence = await client.GetFromJsonAsync<CurrentPresenceResponse>("/api/presence/me");
        Assert.NotNull(currentPresence);
        Assert.Equal("online", currentPresence!.Presence.State);
        Assert.Equal(2, currentPresence.Presence.LiveTabCount);
        Assert.Equal(
            ["tab-alpha", "tab-beta"],
            currentPresence.Presence.Tabs.Select(tab => tab.TabId).OrderBy(tabId => tabId).ToArray());
    }

    [Fact]
    public async Task Stale_Interaction_Resolves_To_Afk_And_Heartbeat_Expiry_Resolves_To_Offline()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = CreateHttpClient(factory);

        var authCookie = await RegisterAsync(client, "presence-afk@example.com", "presence-afk");
        await using var realtimeClient = await ConnectAsync(factory, authCookie);

        var staleInteractionAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5);
        var heartbeat = await realtimeClient.Connection.InvokeAsync<PresenceHeartbeatAcceptedResponse>(
            RealtimeHubMethods.Heartbeat,
            new PresenceHeartbeatRequest("tab-stale", staleInteractionAtUtc, "hidden", staleInteractionAtUtc));

        Assert.Equal("afk", heartbeat.Presence.State);
        Assert.Equal(1, heartbeat.Presence.LiveTabCount);

        await Task.Delay(TimeSpan.FromSeconds(4));

        var currentPresence = await client.GetFromJsonAsync<CurrentPresenceResponse>("/api/presence/me");
        Assert.NotNull(currentPresence);
        Assert.Equal("offline", currentPresence!.Presence.State);
        Assert.Equal(0, currentPresence.Presence.LiveTabCount);
        Assert.Empty(currentPresence.Presence.Tabs);
    }

    [Fact]
    public async Task Presence_State_Changes_Are_Published_To_The_User_Group()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = CreateHttpClient(factory);

        var authCookie = await RegisterAsync(client, "presence-events@example.com", "presence-events");
        await using var realtimeClient = await ConnectAsync(factory, authCookie);

        var currentInteractionAtUtc = DateTimeOffset.UtcNow;
        await realtimeClient.Connection.InvokeAsync<PresenceHeartbeatAcceptedResponse>(
            RealtimeHubMethods.Heartbeat,
            new PresenceHeartbeatRequest("tab-events", currentInteractionAtUtc, "visible", currentInteractionAtUtc));

        var onlineEvent = await realtimeClient.ReadEventAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("presence.state.changed", onlineEvent.EventType);

        var onlineSnapshot = DeserializePayload<PresenceSnapshotResponse>(onlineEvent);
        Assert.Equal("online", onlineSnapshot.State);
        Assert.Equal(1, onlineSnapshot.LiveTabCount);

        var staleInteractionAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5);
        await realtimeClient.Connection.InvokeAsync<PresenceHeartbeatAcceptedResponse>(
            RealtimeHubMethods.Heartbeat,
            new PresenceHeartbeatRequest("tab-events", staleInteractionAtUtc, "hidden", staleInteractionAtUtc));

        var afkEvent = await realtimeClient.ReadEventAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("presence.state.changed", afkEvent.EventType);

        var afkSnapshot = DeserializePayload<PresenceSnapshotResponse>(afkEvent);
        Assert.Equal("afk", afkSnapshot.State);
        Assert.Equal(1, afkSnapshot.LiveTabCount);
    }

    private static T DeserializePayload<T>(RealtimeEnvelope envelope)
    {
        var payload = envelope.Payload.Deserialize<T>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static HttpClient CreateHttpClient(TestWebApplicationFactory factory)
    {
        return factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
    }

    private static async Task<string> RegisterAsync(HttpClient client, string email, string userName)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            email,
            userName,
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var setCookieHeader = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        return setCookieHeader.Split(';', 2)[0];
    }

    private static async Task<RealtimeConnectionClient> ConnectAsync(TestWebApplicationFactory factory, string authCookie)
    {
        var eventChannel = Channel.CreateUnbounded<RealtimeEnvelope>();
        var readyCompletionSource = new TaskCompletionSource<ConnectionReadyResponse>(TaskCreationOptions.RunContinuationsAsynchronously);

        var connection = new HubConnectionBuilder()
            .WithUrl("http://localhost/hubs/realtime", options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Headers["Cookie"] = authCookie;
                options.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
            })
            .Build();

        connection.On<ConnectionReadyResponse>(RealtimeClientMethods.ConnectionReady, payload =>
        {
            readyCompletionSource.TrySetResult(payload);
        });

        connection.On<RealtimeEnvelope>(RealtimeClientMethods.EventReceived, payload =>
        {
            eventChannel.Writer.TryWrite(payload);
        });

        await connection.StartAsync();
        _ = await readyCompletionSource.Task.WaitAsync(TimeSpan.FromSeconds(5));
        return new RealtimeConnectionClient(connection, eventChannel);
    }

    private sealed class RealtimeConnectionClient(HubConnection connection, Channel<RealtimeEnvelope> eventChannel) : IAsyncDisposable
    {
        public HubConnection Connection { get; } = connection;

        public async Task<RealtimeEnvelope> ReadEventAsync(TimeSpan timeout)
        {
            return await eventChannel.Reader.ReadAsync().AsTask().WaitAsync(timeout);
        }

        public async ValueTask DisposeAsync()
        {
            await Connection.DisposeAsync();
        }
    }
}
