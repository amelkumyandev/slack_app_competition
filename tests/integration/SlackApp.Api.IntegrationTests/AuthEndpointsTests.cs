using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Identity.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class AuthEndpointsTests
{
    [Fact]
    public async Task Register_Rejects_Duplicate_Email_And_Username()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var firstResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "amel@example.com",
            "amel",
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);

        var duplicateEmailResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "amel@example.com",
            "amel-2",
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Conflict, duplicateEmailResponse.StatusCode);

        var duplicateUserNameResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "amel-2@example.com",
            "amel",
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Conflict, duplicateUserNameResponse.StatusCode);
    }

    [Fact]
    public async Task Logout_Revokes_Only_Current_Session()
    {
        await using var factory = new TestWebApplicationFactory();
        using var firstClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        using var secondClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var registerResponse = await firstClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "multi@example.com",
            "multi",
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        var loginResponse = await secondClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(
            "multi",
            "Password123",
            true));

        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await firstClient.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await secondClient.GetAsync("/api/auth/me")).StatusCode);

        var logoutResponse = await firstClient.PostAsync("/api/auth/logout", content: null);

        Assert.Equal(HttpStatusCode.OK, logoutResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await firstClient.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await secondClient.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Password_Reset_Scaffold_Returns_Preview_Token_And_Allows_New_Login()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        using var loginClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "reset@example.com",
            "reset-user",
            "Password123",
            false));

        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        var resetRequestResponse = await client.PostAsJsonAsync("/api/auth/password-reset/request", new RequestPasswordResetRequest("reset@example.com"));
        Assert.Equal(HttpStatusCode.Accepted, resetRequestResponse.StatusCode);

        var resetPayload = await resetRequestResponse.Content.ReadFromJsonAsync<PasswordResetRequestResponse>();
        Assert.NotNull(resetPayload);
        Assert.False(string.IsNullOrWhiteSpace(resetPayload!.PreviewToken));

        var confirmResponse = await client.PostAsJsonAsync("/api/auth/password-reset/confirm", new ConfirmPasswordResetRequest(
            resetPayload.PreviewToken!,
            "NewPassword123"));

        Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);

        var oldLoginResponse = await loginClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(
            "reset@example.com",
            "Password123",
            false));
        Assert.Equal(HttpStatusCode.Unauthorized, oldLoginResponse.StatusCode);

        var newLoginResponse = await loginClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(
            "reset@example.com",
            "NewPassword123",
            false));
        Assert.Equal(HttpStatusCode.OK, newLoginResponse.StatusCode);
    }
}
