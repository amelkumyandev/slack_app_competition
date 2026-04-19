using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Rooms.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class RoomsEndpointsTests
{
    [Fact]
    public async Task Public_Room_Search_And_Join_Work_With_Unique_Names()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var explorerClient = CreateClient(factory);
        using var duplicateClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "owner@example.com", "owner");
        await RegisterAsync(explorerClient, "explorer@example.com", "explorer");
        await RegisterAsync(duplicateClient, "duplicate@example.com", "duplicate");

        var createdRoom = await CreateRoomAsync(ownerClient, new CreateRoomRequest("General Plaza", "Public lobby", false));

        var duplicateResponse = await duplicateClient.PostAsJsonAsync("/api/rooms", new CreateRoomRequest("general plaza", "Duplicate", false));
        Assert.Equal(HttpStatusCode.Conflict, duplicateResponse.StatusCode);

        var directory = await GetDirectoryAsync(explorerClient, "General");
        var catalogRoom = Assert.Single(directory.PublicCatalog);
        Assert.Equal(createdRoom.Id, catalogRoom.Id);
        Assert.False(catalogRoom.IsPrivate);

        var joinResponse = await explorerClient.PostAsync($"/api/rooms/{createdRoom.Id}/join", content: null);
        Assert.Equal(HttpStatusCode.OK, joinResponse.StatusCode);

        var roomDetails = await GetRoomDetailsAsync(explorerClient, createdRoom.Id);
        Assert.True(roomDetails.Room.IsMember);
        Assert.Equal(2, roomDetails.Room.MemberCount);
    }

    [Fact]
    public async Task Private_Room_Requires_Invite_And_Invitation_Can_Be_Accepted()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var guestClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "private-owner@example.com", "private-owner");
        await RegisterAsync(guestClient, "private-guest@example.com", "private-guest");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Founders Vault", "Private room", true));

        var blockedJoinResponse = await guestClient.PostAsync($"/api/rooms/{room.Id}/join", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, blockedJoinResponse.StatusCode);

        var inviteResponse = await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/invitations", new InviteToRoomRequest("private-guest"));
        Assert.Equal(HttpStatusCode.OK, inviteResponse.StatusCode);

        var guestDirectory = await GetDirectoryAsync(guestClient);
        var invitation = Assert.Single(guestDirectory.PendingInvitations);
        Assert.Equal(room.Id, invitation.RoomId);

        var acceptResponse = await guestClient.PostAsync($"/api/rooms/invitations/{invitation.Id}/accept", content: null);
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);

        var roomDetails = await GetRoomDetailsAsync(guestClient, room.Id);
        Assert.True(roomDetails.Room.IsMember);
        Assert.Equal(2, roomDetails.Room.MemberCount);
    }

    [Fact]
    public async Task Owner_Cannot_Leave_And_Only_Owner_Manages_Admins()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var adminCandidateClient = CreateClient(factory);
        using var thirdMemberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "room-owner@example.com", "room-owner");
        await RegisterAsync(adminCandidateClient, "room-admin@example.com", "room-admin");
        await RegisterAsync(thirdMemberClient, "room-third@example.com", "room-third");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Moderation Hub", "Admin tests", false));

        Assert.Equal(HttpStatusCode.OK, (await adminCandidateClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await thirdMemberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        var grantAdminResponse = await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins", new UpdateRoomAdminRequest("room-admin"));
        Assert.Equal(HttpStatusCode.OK, grantAdminResponse.StatusCode);

        var blockedGrantResponse = await adminCandidateClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins", new UpdateRoomAdminRequest("room-third"));
        Assert.Equal(HttpStatusCode.Forbidden, blockedGrantResponse.StatusCode);

        var ownerLeaveResponse = await ownerClient.PostAsync($"/api/rooms/{room.Id}/leave", content: null);
        Assert.Equal(HttpStatusCode.BadRequest, ownerLeaveResponse.StatusCode);
    }

    [Fact]
    public async Task Remove_Member_Acts_As_Ban_And_Prevents_Rejoin_Until_Unbanned()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var memberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "ban-owner@example.com", "ban-owner");
        await RegisterAsync(memberClient, "ban-member@example.com", "ban-member");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Atrium", "Ban tests", false));

        Assert.Equal(HttpStatusCode.OK, (await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        var removeResponse = await ownerClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/members/remove",
            new RemoveRoomMemberRequest("ban-member", "spam"));
        Assert.Equal(HttpStatusCode.OK, removeResponse.StatusCode);

        var blockedRejoinResponse = await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null);
        Assert.Equal(HttpStatusCode.Conflict, blockedRejoinResponse.StatusCode);

        var ownerDetails = await GetRoomDetailsAsync(ownerClient, room.Id);
        var ban = Assert.Single(ownerDetails.Bans);
        Assert.Equal("ban-member", ban.UserName);
        Assert.Equal("spam", ban.Reason);

        var unbanResponse = await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/bans/remove", new RemoveRoomBanRequest("ban-member"));
        Assert.Equal(HttpStatusCode.OK, unbanResponse.StatusCode);

        var allowedRejoinResponse = await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null);
        Assert.Equal(HttpStatusCode.OK, allowedRejoinResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_Can_Remove_Non_Admin_Member_But_Not_Another_Admin()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var firstAdminClient = CreateClient(factory);
        using var secondAdminClient = CreateClient(factory);
        using var memberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "permissions-owner@example.com", "permissions-owner");
        await RegisterAsync(firstAdminClient, "first-admin@example.com", "first-admin");
        await RegisterAsync(secondAdminClient, "second-admin@example.com", "second-admin");
        await RegisterAsync(memberClient, "plain-member@example.com", "plain-member");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Ops Center", "Permission matrix", false));

        Assert.Equal(HttpStatusCode.OK, (await firstAdminClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await secondAdminClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins", new UpdateRoomAdminRequest("first-admin"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins", new UpdateRoomAdminRequest("second-admin"))).StatusCode);

        var removeMemberResponse = await firstAdminClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/members/remove",
            new RemoveRoomMemberRequest("plain-member", "rule violation"));
        Assert.Equal(HttpStatusCode.OK, removeMemberResponse.StatusCode);

        var blockedAdminRemoval = await firstAdminClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/members/remove",
            new RemoveRoomMemberRequest("second-admin", "power struggle"));
        Assert.Equal(HttpStatusCode.Forbidden, blockedAdminRemoval.StatusCode);
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

    private static async Task<RoomDirectoryResponse> GetDirectoryAsync(HttpClient client, string? search = null)
    {
        var url = string.IsNullOrWhiteSpace(search) ? "/api/rooms" : $"/api/rooms?search={Uri.EscapeDataString(search)}";
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RoomDirectoryResponse>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static async Task<RoomDetailsResponse> GetRoomDetailsAsync(HttpClient client, Guid roomId)
    {
        var response = await client.GetAsync($"/api/rooms/{roomId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RoomDetailsResponse>();
        Assert.NotNull(payload);
        return payload!;
    }
}
