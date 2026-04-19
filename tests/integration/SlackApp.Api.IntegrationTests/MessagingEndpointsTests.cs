using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Contacts.Contracts;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Rooms.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class MessagingEndpointsTests
{
    [Fact]
    public async Task Direct_Conversation_Persists_Multiline_Replies_And_Appears_In_Direct_List()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "dm-alice@example.com", "dm-alice");
        await RegisterAsync(bobClient, "dm-bob@example.com", "dm-bob");
        await MakeFriendsAsync(aliceClient, "dm-bob", bobClient);

        var conversation = await OpenDirectConversationAsync(aliceClient, "dm-bob");
        var firstMessage = await PostMessageAsync(aliceClient, conversation.ConversationId, new PostMessageRequest("Hey Bob,\nThis is a multiline hello."));
        await PostMessageAsync(bobClient, conversation.ConversationId, new PostMessageRequest("Replying in-thread.", firstMessage.MessageId));

        var historyResponse = await bobClient.GetAsync($"/api/conversations/{conversation.ConversationId}/messages?pageSize=20");
        Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);

        var history = await historyResponse.Content.ReadFromJsonAsync<ConversationTimelineResponse>();
        Assert.NotNull(history);
        Assert.Equal(2, history!.Messages.Count);
        Assert.NotNull(history.Messages[0].Text);
        Assert.Contains('\n', history.Messages[0].Text!);
        Assert.Equal(firstMessage.MessageId, history.Messages[1].ReplyToMessageId);
        Assert.NotNull(history.Messages[1].ReplyPreview);
        Assert.Equal("dm-alice", history.Messages[1].ReplyPreview!.AuthorUserName);

        var directListResponse = await aliceClient.GetAsync("/api/conversations/direct");
        Assert.Equal(HttpStatusCode.OK, directListResponse.StatusCode);

        var directList = await directListResponse.Content.ReadFromJsonAsync<DirectConversationListResponse>();
        Assert.NotNull(directList);
        var summary = Assert.Single(directList!.Conversations);
        Assert.Equal(conversation.ConversationId, summary.ConversationId);
        Assert.Equal("dm-bob", summary.TargetUserName);
        Assert.Equal("read_write", summary.AccessMode);
    }

    [Fact]
    public async Task Author_Can_Edit_And_Room_Admin_Can_Delete_Message()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var adminClient = CreateClient(factory);
        using var memberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "message-owner@example.com", "message-owner");
        await RegisterAsync(adminClient, "message-admin@example.com", "message-admin");
        await RegisterAsync(memberClient, "message-member@example.com", "message-member");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Moderation Desk", "Room moderation messaging tests", false));
        Assert.Equal(HttpStatusCode.OK, (await adminClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins", new UpdateRoomAdminRequest("message-admin"))).StatusCode);

        var createdMessage = await PostMessageAsync(memberClient, room.ConversationId, new PostMessageRequest("Original wording"));

        var editResponse = await memberClient.PostAsJsonAsync(
            $"/api/conversations/{room.ConversationId}/messages/{createdMessage.MessageId}/edit",
            new EditMessageRequest("Updated wording"));
        Assert.Equal(HttpStatusCode.OK, editResponse.StatusCode);

        var editedMessage = await editResponse.Content.ReadFromJsonAsync<ChatMessageResponse>();
        Assert.NotNull(editedMessage);
        Assert.Equal("Updated wording", editedMessage!.Text);
        Assert.True(editedMessage.IsEdited);
        Assert.True(editedMessage.CanDelete);

        var deleteResponse = await adminClient.DeleteAsync($"/api/conversations/{room.ConversationId}/messages/{createdMessage.MessageId}");
        Assert.Equal(HttpStatusCode.OK, deleteResponse.StatusCode);

        var deletedMessage = await deleteResponse.Content.ReadFromJsonAsync<ChatMessageResponse>();
        Assert.NotNull(deletedMessage);
        Assert.True(deletedMessage!.IsDeleted);
        Assert.Null(deletedMessage.Text);
        Assert.False(deletedMessage.CanEdit);

        var historyResponse = await ownerClient.GetAsync($"/api/conversations/{room.ConversationId}/messages?pageSize=20");
        Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);

        var history = await historyResponse.Content.ReadFromJsonAsync<ConversationTimelineResponse>();
        Assert.NotNull(history);
        var timelineMessage = Assert.Single(history!.Messages);
        Assert.True(timelineMessage.IsDeleted);
        Assert.True(timelineMessage.IsEdited);
    }

    [Fact]
    public async Task Banned_Direct_Conversation_Stays_Readable_But_Blocks_New_Messages()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "freeze-alice@example.com", "freeze-alice");
        await RegisterAsync(bobClient, "freeze-bob@example.com", "freeze-bob");
        await MakeFriendsAsync(aliceClient, "freeze-bob", bobClient);

        var conversation = await OpenDirectConversationAsync(aliceClient, "freeze-bob");
        await PostMessageAsync(aliceClient, conversation.ConversationId, new PostMessageRequest("Before the ban"));

        var banResponse = await aliceClient.PostAsJsonAsync("/api/contacts/bans", new CreateUserBanRequest("freeze-bob", "policy violation"));
        Assert.Equal(HttpStatusCode.OK, banResponse.StatusCode);

        var historyResponse = await bobClient.GetAsync($"/api/conversations/{conversation.ConversationId}/messages?pageSize=20");
        Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);

        var history = await historyResponse.Content.ReadFromJsonAsync<ConversationTimelineResponse>();
        Assert.NotNull(history);
        Assert.Single(history!.Messages);
        Assert.Equal("Before the ban", history.Messages[0].Text);

        var blockedSendResponse = await bobClient.PostAsJsonAsync(
            $"/api/conversations/{conversation.ConversationId}/messages",
            new PostMessageRequest("This should be blocked"));
        Assert.Equal(HttpStatusCode.Conflict, blockedSendResponse.StatusCode);

        var directListResponse = await bobClient.GetAsync("/api/conversations/direct");
        Assert.Equal(HttpStatusCode.OK, directListResponse.StatusCode);

        var directList = await directListResponse.Content.ReadFromJsonAsync<DirectConversationListResponse>();
        Assert.NotNull(directList);
        var summary = Assert.Single(directList!.Conversations);
        Assert.Equal("read_only", summary.AccessMode);
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
