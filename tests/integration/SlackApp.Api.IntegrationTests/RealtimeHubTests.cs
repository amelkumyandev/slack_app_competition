using System.Net;
using System.Net.Http.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using SlackApp.Modules.Contacts.Contracts;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Presence.Contracts;
using SlackApp.Modules.Rooms.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class RealtimeHubTests
{
    [Fact]
    public async Task Authenticated_Connection_Receives_ConnectionReady_Metadata()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = CreateHttpClient(factory);

        var authCookie = await RegisterAsync(client, "hub-owner@example.com", "hub-owner");
        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.NotNull(currentUser);

        await using var realtimeClient = await ConnectAsync(factory, authCookie);

        Assert.Equal(currentUser!.Id, realtimeClient.Ready.UserId);
        Assert.Equal($"user:{currentUser.Id:D}", realtimeClient.Ready.UserGroup);
        Assert.Equal("room:", realtimeClient.Ready.SupportedConversationPrefix);
        Assert.Equal("rest-gap-repair", realtimeClient.Ready.SyncMode);
    }

    [Fact]
    public async Task Room_Members_Can_Subscribe_To_Conversation_But_Outsiders_Cannot()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateHttpClient(factory);
        using var outsiderClient = CreateHttpClient(factory);

        var ownerCookie = await RegisterAsync(ownerClient, "sub-owner@example.com", "sub-owner");
        var outsiderCookie = await RegisterAsync(outsiderClient, "sub-outsider@example.com", "sub-outsider");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Realtime Room", "Subscription tests", false));

        await using var ownerRealtime = await ConnectAsync(factory, ownerCookie);
        await using var outsiderRealtime = await ConnectAsync(factory, outsiderCookie);

        var subscribed = await ownerRealtime.Connection.InvokeAsync<ConversationSubscriptionResponse>(
            RealtimeHubMethods.SubscribeConversation,
            RealtimeGroups.RoomConversation(room.Id));

        Assert.Equal("subscribed", subscribed.Status);
        Assert.Equal($"conversation:room:{room.Id:D}", subscribed.GroupName);

        var exception = await Assert.ThrowsAsync<HubException>(() =>
            outsiderRealtime.Connection.InvokeAsync<ConversationSubscriptionResponse>(
                RealtimeHubMethods.SubscribeConversation,
                RealtimeGroups.RoomConversation(room.Id)));

        Assert.Contains("Only room members can subscribe", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task User_Targeted_Events_Route_To_The_Target_User_Group()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateHttpClient(factory);
        using var bobClient = CreateHttpClient(factory);
        using var charlieClient = CreateHttpClient(factory);

        await RegisterAsync(aliceClient, "alice-realtime@example.com", "alice-realtime");
        var bobCookie = await RegisterAsync(bobClient, "bob-realtime@example.com", "bob-realtime");
        var charlieCookie = await RegisterAsync(charlieClient, "charlie-realtime@example.com", "charlie-realtime");

        await using var bobRealtime = await ConnectAsync(factory, bobCookie);
        await using var charlieRealtime = await ConnectAsync(factory, charlieCookie);

        var friendRequestResponse = await aliceClient.PostAsJsonAsync("/api/contacts/friend-requests", new CreateFriendRequestRequest("bob-realtime"));
        Assert.Equal(HttpStatusCode.Created, friendRequestResponse.StatusCode);

        var bobEvent = await bobRealtime.ReadEventAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("contact.friend-request.created", bobEvent.EventType);
        Assert.Equal("user", bobEvent.Scope);

        var charlieReceived = await charlieRealtime.TryReadEventAsync(TimeSpan.FromSeconds(1));
        Assert.Null(charlieReceived);
    }

    [Fact]
    public async Task Conversation_Events_Route_To_Subscribed_Room_Members()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateHttpClient(factory);
        using var joinerClient = CreateHttpClient(factory);
        using var outsiderClient = CreateHttpClient(factory);

        var ownerCookie = await RegisterAsync(ownerClient, "conversation-owner@example.com", "conversation-owner");
        await RegisterAsync(joinerClient, "conversation-joiner@example.com", "conversation-joiner");
        var outsiderCookie = await RegisterAsync(outsiderClient, "conversation-outsider@example.com", "conversation-outsider");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("SignalR Commons", "Realtime conversation tests", false));

        await using var ownerRealtime = await ConnectAsync(factory, ownerCookie);
        await using var outsiderRealtime = await ConnectAsync(factory, outsiderCookie);

        await ownerRealtime.Connection.InvokeAsync<ConversationSubscriptionResponse>(
            RealtimeHubMethods.SubscribeConversation,
            RealtimeGroups.RoomConversation(room.Id));

        var joinResponse = await joinerClient.PostAsync($"/api/rooms/{room.Id}/join", content: null);
        Assert.Equal(HttpStatusCode.OK, joinResponse.StatusCode);

        var roomEvent = await ownerRealtime.ReadEventAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("room.member.joined", roomEvent.EventType);
        Assert.Equal("conversation", roomEvent.Scope);
        Assert.Equal($"conversation:room:{room.Id:D}", roomEvent.Target);

        var outsiderReceived = await outsiderRealtime.TryReadEventAsync(TimeSpan.FromSeconds(1));
        Assert.Null(outsiderReceived);
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

    private static async Task<RoomListItemResponse> CreateRoomAsync(HttpClient client, CreateRoomRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/rooms", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RoomListItemResponse>();
        Assert.NotNull(payload);
        return payload!;
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
        var ready = await readyCompletionSource.Task.WaitAsync(TimeSpan.FromSeconds(5));
        return new RealtimeConnectionClient(connection, ready, eventChannel);
    }

    private sealed class RealtimeConnectionClient(HubConnection connection, ConnectionReadyResponse ready, Channel<RealtimeEnvelope> eventChannel) : IAsyncDisposable
    {
        public HubConnection Connection { get; } = connection;

        public ConnectionReadyResponse Ready { get; } = ready;

        public async Task<RealtimeEnvelope> ReadEventAsync(TimeSpan timeout)
        {
            return await eventChannel.Reader.ReadAsync().AsTask().WaitAsync(timeout);
        }

        public async Task<RealtimeEnvelope?> TryReadEventAsync(TimeSpan timeout)
        {
            using var cancellationTokenSource = new CancellationTokenSource(timeout);

            try
            {
                return await eventChannel.Reader.ReadAsync(cancellationTokenSource.Token);
            }
            catch (OperationCanceledException)
            {
                return null;
            }
        }

        public async ValueTask DisposeAsync()
        {
            await Connection.DisposeAsync();
        }
    }
}
