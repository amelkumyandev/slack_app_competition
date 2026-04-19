using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Sessions.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class SessionManagementEndpointsTests
{
    [Fact]
    public async Task Sessions_List_Shows_Current_And_Other_Sessions()
    {
        await using var factory = new TestWebApplicationFactory();
        using var currentClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        using var otherClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var registerResponse = await currentClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "sessions@example.com",
            "session-user",
            "Password123",
            false));
        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        var loginResponse = await otherClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(
            "session-user",
            "Password123",
            true));
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var currentUser = await otherClient.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.NotNull(currentUser);

        var sessionsResponse = await otherClient.GetAsync("/api/sessions");
        Assert.Equal(HttpStatusCode.OK, sessionsResponse.StatusCode);

        var payload = await sessionsResponse.Content.ReadFromJsonAsync<UserSessionsResponse>();
        Assert.NotNull(payload);
        Assert.Equal(2, payload!.Sessions.Count);

        var currentSession = Assert.Single(payload.Sessions, candidate => candidate.IsCurrent);
        Assert.Equal(currentUser!.SessionId, currentSession.Id);
        Assert.True(currentSession.State == "active");

        var otherSession = Assert.Single(payload.Sessions, candidate => !candidate.IsCurrent);
        Assert.True(otherSession.CanRevoke);
    }

    [Fact]
    public async Task Revoke_Selected_Session_Invalidates_Only_Target_Session()
    {
        await using var factory = new TestWebApplicationFactory();
        using var currentClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        using var otherClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var registerResponse = await currentClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "revoke@example.com",
            "revoke-user",
            "Password123",
            false));
        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        var loginResponse = await otherClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(
            "revoke-user",
            "Password123",
            true));
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var otherCurrentUser = await otherClient.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.NotNull(otherCurrentUser);

        var revokeResponse = await currentClient.DeleteAsync($"/api/sessions/{otherCurrentUser!.SessionId}");
        Assert.Equal(HttpStatusCode.OK, revokeResponse.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await currentClient.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await otherClient.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Revoke_Current_Session_Requires_Logout_Flow()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "current@example.com",
            "current-user",
            "Password123",
            false));
        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.NotNull(currentUser);

        var revokeResponse = await client.DeleteAsync($"/api/sessions/{currentUser!.SessionId}");
        Assert.Equal(HttpStatusCode.BadRequest, revokeResponse.StatusCode);
    }
}
