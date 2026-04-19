using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Contacts.Contracts;
using SlackApp.Modules.Identity.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class ContactsEndpointsTests
{
    [Fact]
    public async Task Friend_Request_By_Username_Can_Be_Accepted_And_Enables_Pm()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "alice@example.com", "alice");
        await RegisterAsync(bobClient, "bob@example.com", "bob");

        var pendingRequestId = await SendFriendRequestAndGetIncomingIdAsync(aliceClient, "bob", bobClient);

        var acceptResponse = await bobClient.PostAsync($"/api/contacts/friend-requests/{pendingRequestId}/accept", content: null);
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);

        var aliceSummary = await GetContactSummaryAsync(aliceClient);
        var aliceFriend = Assert.Single(aliceSummary.Friends);
        Assert.Equal("bob", aliceFriend.UserName);

        var bobPmPolicy = await GetPmPolicyAsync(bobClient, "alice");
        Assert.True(bobPmPolicy.CanStartConversation);
        Assert.Equal("allowed", bobPmPolicy.State);
        Assert.Equal("normal", bobPmPolicy.ExistingConversationAccess);
    }

    [Fact]
    public async Task Decline_Friend_Request_Keeps_Pm_Blocked()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "decline-alice@example.com", "decline-alice");
        await RegisterAsync(bobClient, "decline-bob@example.com", "decline-bob");

        var pendingRequestId = await SendFriendRequestAndGetIncomingIdAsync(aliceClient, "decline-bob", bobClient);

        var declineResponse = await bobClient.PostAsync($"/api/contacts/friend-requests/{pendingRequestId}/decline", content: null);
        Assert.Equal(HttpStatusCode.OK, declineResponse.StatusCode);

        var aliceSummary = await GetContactSummaryAsync(aliceClient);
        Assert.Empty(aliceSummary.Friends);
        Assert.Empty(aliceSummary.OutgoingFriendRequests);

        var bobPmPolicy = await GetPmPolicyAsync(bobClient, "decline-alice");
        Assert.False(bobPmPolicy.CanStartConversation);
        Assert.Equal("blocked_not_friends", bobPmPolicy.State);
        Assert.Equal("not_available", bobPmPolicy.ExistingConversationAccess);
    }

    [Fact]
    public async Task Remove_Friend_Blocks_Pm_Again()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "remove-alice@example.com", "remove-alice");
        await RegisterAsync(bobClient, "remove-bob@example.com", "remove-bob");

        await MakeFriendsAsync(aliceClient, "remove-bob", bobClient);

        var removeResponse = await aliceClient.PostAsJsonAsync("/api/contacts/friends/remove", new RemoveFriendRequest("remove-bob"));
        Assert.Equal(HttpStatusCode.OK, removeResponse.StatusCode);

        var aliceSummary = await GetContactSummaryAsync(aliceClient);
        Assert.Empty(aliceSummary.Friends);

        var bobPmPolicy = await GetPmPolicyAsync(bobClient, "remove-alice");
        Assert.False(bobPmPolicy.CanStartConversation);
        Assert.Equal("blocked_not_friends", bobPmPolicy.State);
    }

    [Fact]
    public async Task User_Ban_Removes_Friendship_And_Freezes_Pm()
    {
        await using var factory = new TestWebApplicationFactory();
        using var aliceClient = CreateClient(factory);
        using var bobClient = CreateClient(factory);

        await RegisterAsync(aliceClient, "ban-alice@example.com", "ban-alice");
        await RegisterAsync(bobClient, "ban-bob@example.com", "ban-bob");

        await MakeFriendsAsync(aliceClient, "ban-bob", bobClient);

        var banResponse = await aliceClient.PostAsJsonAsync("/api/contacts/bans", new CreateUserBanRequest("ban-bob", "harassment"));
        Assert.Equal(HttpStatusCode.OK, banResponse.StatusCode);

        var aliceSummary = await GetContactSummaryAsync(aliceClient);
        Assert.Empty(aliceSummary.Friends);
        var issuedBan = Assert.Single(aliceSummary.BansIssued);
        Assert.Equal("ban-bob", issuedBan.UserName);
        Assert.Equal("harassment", issuedBan.Reason);

        var alicePmPolicy = await GetPmPolicyAsync(aliceClient, "ban-bob");
        Assert.False(alicePmPolicy.CanStartConversation);
        Assert.Equal("blocked_banned", alicePmPolicy.State);
        Assert.Equal("read_only_if_history_exists", alicePmPolicy.ExistingConversationAccess);

        var bobPmPolicy = await GetPmPolicyAsync(bobClient, "ban-alice");
        Assert.False(bobPmPolicy.CanStartConversation);
        Assert.Equal("blocked_banned", bobPmPolicy.State);

        var blockedRequestResponse = await bobClient.PostAsJsonAsync("/api/contacts/friend-requests", new CreateFriendRequestRequest("ban-alice"));
        Assert.Equal(HttpStatusCode.Conflict, blockedRequestResponse.StatusCode);
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

    private static async Task<Guid> SendFriendRequestAndGetIncomingIdAsync(HttpClient requesterClient, string targetUserName, HttpClient recipientClient)
    {
        var sendResponse = await requesterClient.PostAsJsonAsync("/api/contacts/friend-requests", new CreateFriendRequestRequest(targetUserName));
        Assert.Equal(HttpStatusCode.Created, sendResponse.StatusCode);

        var recipientSummary = await GetContactSummaryAsync(recipientClient);
        var incomingRequest = Assert.Single(recipientSummary.IncomingFriendRequests);
        return incomingRequest.Id;
    }

    private static async Task MakeFriendsAsync(HttpClient requesterClient, string targetUserName, HttpClient recipientClient)
    {
        var incomingRequestId = await SendFriendRequestAndGetIncomingIdAsync(requesterClient, targetUserName, recipientClient);
        var acceptResponse = await recipientClient.PostAsync($"/api/contacts/friend-requests/{incomingRequestId}/accept", content: null);
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);
    }

    private static async Task<ContactSummaryResponse> GetContactSummaryAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/contacts");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<ContactSummaryResponse>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static async Task<PmPolicyResponse> GetPmPolicyAsync(HttpClient client, string targetUserName)
    {
        var response = await client.GetAsync($"/api/contacts/pm-policy/{targetUserName}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<PmPolicyResponse>();
        Assert.NotNull(payload);
        return payload!;
    }
}
