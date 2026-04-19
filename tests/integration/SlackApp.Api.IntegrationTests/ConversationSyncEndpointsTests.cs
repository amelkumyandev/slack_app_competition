using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Rooms.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class ConversationSyncEndpointsTests
{
    [Fact]
    public async Task Sync_Returns_Missed_Room_Events_In_Watermark_Order()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var joinerClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "sync-owner@example.com", "sync-owner");
        await RegisterAsync(joinerClient, "sync-joiner@example.com", "sync-joiner");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Sync Commons", "Watermark sync tests", false));
        Assert.Equal(HttpStatusCode.OK, (await joinerClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        var syncResponse = await ownerClient.GetAsync($"/api/conversations/{room.ConversationId}/sync?afterWatermark=0");
        Assert.Equal(HttpStatusCode.OK, syncResponse.StatusCode);

        var payload = await syncResponse.Content.ReadFromJsonAsync<ConversationSyncResponse>();
        Assert.NotNull(payload);
        Assert.Equal(room.ConversationId, payload!.ConversationId);
        Assert.Equal(payload.LatestWatermark, payload.MissingMessages.Last().Watermark);
        Assert.Equal([1L, 2L], payload.MissingMessages.Select(message => message.Watermark).ToArray());
        Assert.Equal(["room.created", "room.member.joined"], payload.MissingMessages.Select(message => message.EventType).ToArray());
    }

    [Fact]
    public async Task History_Paginates_By_Watermark_Window()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var guestClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "history-owner@example.com", "history-owner");
        await RegisterAsync(guestClient, "history-guest@example.com", "history-guest");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("History Vault", "History paging tests", true));
        Assert.Equal(HttpStatusCode.OK, (await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/invitations", new InviteToRoomRequest("history-guest"))).StatusCode);

        var guestDirectory = await GetDirectoryAsync(guestClient);
        var invitation = Assert.Single(guestDirectory.PendingInvitations);
        Assert.Equal(HttpStatusCode.OK, (await guestClient.PostAsync($"/api/rooms/invitations/{invitation.Id}/accept", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins", new UpdateRoomAdminRequest("history-guest"))).StatusCode);

        var latestPageResponse = await ownerClient.GetAsync($"/api/conversations/{room.ConversationId}/messages?pageSize=2");
        Assert.Equal(HttpStatusCode.OK, latestPageResponse.StatusCode);

        var latestPage = await latestPageResponse.Content.ReadFromJsonAsync<ConversationHistoryResponse>();
        Assert.NotNull(latestPage);
        Assert.Equal([3L, 4L], latestPage!.Messages.Select(message => message.Watermark).ToArray());
        Assert.Equal(["room.member.joined", "room.admin.granted"], latestPage.Messages.Select(message => message.EventType).ToArray());

        var earlierPageResponse = await ownerClient.GetAsync($"/api/conversations/{room.ConversationId}/messages?beforeWatermark=3&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, earlierPageResponse.StatusCode);

        var earlierPage = await earlierPageResponse.Content.ReadFromJsonAsync<ConversationHistoryResponse>();
        Assert.NotNull(earlierPage);
        Assert.Equal([1L, 2L], earlierPage!.Messages.Select(message => message.Watermark).ToArray());
        Assert.Equal(["room.created", "room.invitation.created"], earlierPage.Messages.Select(message => message.EventType).ToArray());
    }

    [Fact]
    public async Task Non_Members_Cannot_Read_Conversation_History()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var outsiderClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "history-protected-owner@example.com", "history-protected-owner");
        await RegisterAsync(outsiderClient, "history-outsider@example.com", "history-outsider");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Protected Logs", "Private history tests", true));

        var response = await outsiderClient.GetAsync($"/api/conversations/{room.ConversationId}/messages?pageSize=20");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static HttpClient CreateClient(TestWebApplicationFactory factory)
    {
        return factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
    }

    private static async Task RegisterAsync(HttpClient client, string email, string userName)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            email,
            userName,
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task<RoomListItemResponse> CreateRoomAsync(HttpClient client, CreateRoomRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/rooms", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RoomListItemResponse>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static async Task<RoomDirectoryResponse> GetDirectoryAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/rooms");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RoomDirectoryResponse>();
        Assert.NotNull(payload);
        return payload!;
    }
}
