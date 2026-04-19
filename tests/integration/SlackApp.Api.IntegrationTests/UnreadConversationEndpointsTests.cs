using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Contacts.Contracts;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Rooms.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class UnreadConversationEndpointsTests
{
    [Fact]
    public async Task Room_Directory_Tracks_Unread_Count_And_Mark_Read_Clears_It()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var memberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "unread-room-owner@example.com", "unread-room-owner");
        await RegisterAsync(memberClient, "unread-room-member@example.com", "unread-room-member");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Unread Room", "Room unread tracking", false));
        Assert.Equal(HttpStatusCode.OK, (await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        await PostMessageAsync(ownerClient, room.ConversationId, new PostMessageRequest("First unread"));
        await PostMessageAsync(ownerClient, room.ConversationId, new PostMessageRequest("Second unread"));

        var directoryResponse = await memberClient.GetAsync("/api/rooms");
        Assert.Equal(HttpStatusCode.OK, directoryResponse.StatusCode);

        var directory = await directoryResponse.Content.ReadFromJsonAsync<RoomDirectoryResponse>();
        Assert.NotNull(directory);
        var memberRoom = Assert.Single(directory!.MyRooms);
        Assert.Equal(2, memberRoom.UnreadCount);
        Assert.Equal("Second unread", memberRoom.LastMessagePreview);

        var markReadResponse = await memberClient.PostAsJsonAsync(
            $"/api/conversations/{room.ConversationId}/read-state",
            new UpdateConversationReadStateRequest(memberRoom.LatestWatermark));
        Assert.Equal(HttpStatusCode.OK, markReadResponse.StatusCode);

        var readState = await markReadResponse.Content.ReadFromJsonAsync<ConversationReadStateResponse>();
        Assert.NotNull(readState);
        Assert.Equal(memberRoom.LatestWatermark, readState!.LastReadWatermark);
        Assert.Equal(0, readState.UnreadCount);

        var refreshedDirectory = await memberClient.GetFromJsonAsync<RoomDirectoryResponse>("/api/rooms");
        Assert.NotNull(refreshedDirectory);
        var refreshedRoom = Assert.Single(refreshedDirectory!.MyRooms);
        Assert.Equal(0, refreshedRoom.UnreadCount);
    }

    [Fact]
    public async Task Direct_List_Tracks_Unread_Count_And_Mark_Read_Clears_It()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "unread-direct-alice@example.com", "unread-direct-alice");
        await RegisterAsync(bobClient, "unread-direct-bob@example.com", "unread-direct-bob");
        await MakeFriendsAsync(aliceClient, "unread-direct-bob", bobClient);

        var conversation = await OpenDirectConversationAsync(aliceClient, "unread-direct-bob");
        await PostMessageAsync(aliceClient, conversation.ConversationId, new PostMessageRequest("Unread hello"));
        await PostMessageAsync(aliceClient, conversation.ConversationId, new PostMessageRequest("Unread follow-up"));

        var directListResponse = await bobClient.GetAsync("/api/conversations/direct");
        Assert.Equal(HttpStatusCode.OK, directListResponse.StatusCode);

        var directList = await directListResponse.Content.ReadFromJsonAsync<DirectConversationListResponse>();
        Assert.NotNull(directList);
        var summary = Assert.Single(directList!.Conversations);
        Assert.Equal(2, summary.UnreadCount);
        Assert.Equal("Unread follow-up", summary.LastMessagePreview);

        var markReadResponse = await bobClient.PostAsJsonAsync(
            $"/api/conversations/{conversation.ConversationId}/read-state",
            new UpdateConversationReadStateRequest(summary.LatestWatermark));
        Assert.Equal(HttpStatusCode.OK, markReadResponse.StatusCode);

        var readState = await markReadResponse.Content.ReadFromJsonAsync<ConversationReadStateResponse>();
        Assert.NotNull(readState);
        Assert.Equal(summary.LatestWatermark, readState!.LastReadWatermark);
        Assert.Equal(0, readState.UnreadCount);

        var refreshedDirectList = await bobClient.GetFromJsonAsync<DirectConversationListResponse>("/api/conversations/direct");
        Assert.NotNull(refreshedDirectList);
        var refreshedSummary = Assert.Single(refreshedDirectList!.Conversations);
        Assert.Equal(0, refreshedSummary.UnreadCount);
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

    private static async Task MakeFriendsAsync(HttpClient requesterClient, string targetUserName, HttpClient recipientClient)
    {
        var sendResponse = await requesterClient.PostAsJsonAsync("/api/contacts/friend-requests", new CreateFriendRequestRequest(targetUserName));
        Assert.Equal(HttpStatusCode.Created, sendResponse.StatusCode);

        var summaryResponse = await recipientClient.GetAsync("/api/contacts");
        Assert.Equal(HttpStatusCode.OK, summaryResponse.StatusCode);

        var summary = await summaryResponse.Content.ReadFromJsonAsync<ContactSummaryResponse>();
        Assert.NotNull(summary);
        var incomingRequest = Assert.Single(summary!.IncomingFriendRequests);

        var acceptResponse = await recipientClient.PostAsync($"/api/contacts/friend-requests/{incomingRequest.Id}/accept", content: null);
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);
    }

    private static async Task<DirectConversationSummaryResponse> OpenDirectConversationAsync(HttpClient client, string targetUserName)
    {
        var response = await client.PostAsJsonAsync("/api/conversations/direct", new OpenDirectConversationRequest(targetUserName));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<DirectConversationSummaryResponse>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static async Task<ChatMessageResponse> PostMessageAsync(HttpClient client, Guid conversationId, PostMessageRequest request)
    {
        var response = await client.PostAsJsonAsync($"/api/conversations/{conversationId}/messages", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<ChatMessageResponse>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static async Task<RoomListItemResponse> CreateRoomAsync(HttpClient client, CreateRoomRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/rooms", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RoomListItemResponse>();
        Assert.NotNull(payload);
        return payload!;
    }
}
