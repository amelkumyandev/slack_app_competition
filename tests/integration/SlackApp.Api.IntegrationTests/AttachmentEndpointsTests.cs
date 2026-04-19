using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Rooms.Contracts;
using Xunit;

namespace SlackApp.Api.IntegrationTests;

public sealed class AttachmentEndpointsTests
{
    [Fact]
    public async Task Attachment_Upload_Persists_Metadata_And_Secure_Download_Succeeds()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var memberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "attachment-owner@example.com", "attachment-owner");
        await RegisterAsync(memberClient, "attachment-member@example.com", "attachment-member");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Attachments Club", "Attachment room", false));
        Assert.Equal(HttpStatusCode.OK, (await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        var uploadedMessage = await UploadAttachmentAsync(
            ownerClient,
            room.ConversationId,
            "brief.txt",
            "text/plain",
            Encoding.UTF8.GetBytes("hello attachment"),
            "Attachment note");

        Assert.Equal("Attachment note", uploadedMessage.Text);
        var attachment = Assert.Single(uploadedMessage.Attachments);
        Assert.Equal("brief.txt", attachment.OriginalFileName);
        Assert.Equal("text/plain", attachment.ContentType);

        var historyResponse = await ownerClient.GetAsync($"/api/conversations/{room.ConversationId}/messages?pageSize=20");
        Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);

        var history = await historyResponse.Content.ReadFromJsonAsync<ConversationTimelineResponse>();
        Assert.NotNull(history);
        var message = Assert.Single(history!.Messages);
        Assert.Single(message.Attachments);

        var downloadResponse = await memberClient.GetAsync(attachment.DownloadPath);
        Assert.Equal(HttpStatusCode.OK, downloadResponse.StatusCode);
        Assert.Equal("text/plain", downloadResponse.Content.Headers.ContentType?.MediaType);
        Assert.Contains("brief.txt", downloadResponse.Content.Headers.ContentDisposition?.FileNameStar ?? downloadResponse.Content.Headers.ContentDisposition?.FileName);
        Assert.Equal("hello attachment", await downloadResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Member_Loses_Attachment_Access_After_Removal_From_Room()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);
        using var memberClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "loss-owner@example.com", "loss-owner");
        await RegisterAsync(memberClient, "loss-member@example.com", "loss-member");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Loss Control", "Attachment access rules", false));
        Assert.Equal(HttpStatusCode.OK, (await memberClient.PostAsync($"/api/rooms/{room.Id}/join", content: null)).StatusCode);

        var uploadedMessage = await UploadAttachmentAsync(
            ownerClient,
            room.ConversationId,
            "policy.pdf",
            "application/pdf",
            Encoding.UTF8.GetBytes("room file"),
            null);

        var attachment = Assert.Single(uploadedMessage.Attachments);
        Assert.Equal(HttpStatusCode.OK, (await memberClient.GetAsync(attachment.DownloadPath)).StatusCode);

        var removalResponse = await ownerClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/members/remove",
            new RemoveRoomMemberRequest("loss-member", "access revoked"));
        Assert.Equal(HttpStatusCode.OK, removalResponse.StatusCode);

        var blockedDownload = await memberClient.GetAsync(attachment.DownloadPath);
        Assert.Equal(HttpStatusCode.Forbidden, blockedDownload.StatusCode);
    }

    [Fact]
    public async Task Room_Delete_Removes_Attachment_Files_And_Downloads_Fail_Afterward()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "delete-room-owner@example.com", "delete-room-owner");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Deletion Room", "Cleanup test", false));
        var uploadedMessage = await UploadAttachmentAsync(
            ownerClient,
            room.ConversationId,
            "cleanup.txt",
            "text/plain",
            Encoding.UTF8.GetBytes("cleanup"),
            "Delete this room");

        var attachment = Assert.Single(uploadedMessage.Attachments);
        var expectedConversationDirectory = Path.Combine(factory.UploadsRootPath, "conversations", room.ConversationId.ToString("D"));
        Assert.True(Directory.Exists(expectedConversationDirectory));

        var deleteResponse = await ownerClient.DeleteAsync($"/api/rooms/{room.Id}");
        Assert.Equal(HttpStatusCode.OK, deleteResponse.StatusCode);

        Assert.False(Directory.Exists(expectedConversationDirectory));

        var missingDownload = await ownerClient.GetAsync(attachment.DownloadPath);
        Assert.Equal(HttpStatusCode.NotFound, missingDownload.StatusCode);
    }

    [Fact]
    public async Task Oversized_Attachment_Is_Rejected()
    {
        await using var factory = new TestWebApplicationFactory();
        using var ownerClient = CreateClient(factory);

        await RegisterAsync(ownerClient, "oversized-owner@example.com", "oversized-owner");

        var room = await CreateRoomAsync(ownerClient, new CreateRoomRequest("Size Limits", "Max upload size", false));
        var payload = Enumerable.Repeat((byte)65, 70000).ToArray();

        using var content = BuildUploadContent("too-large.bin", "application/octet-stream", payload, null);
        var response = await ownerClient.PostAsync($"/api/conversations/{room.ConversationId}/attachments", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
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

    private static async Task<ChatMessageResponse> UploadAttachmentAsync(
        HttpClient client,
        Guid conversationId,
        string fileName,
        string contentType,
        byte[] bytes,
        string? comment)
    {
        using var content = BuildUploadContent(fileName, contentType, bytes, comment);
        var response = await client.PostAsync($"/api/conversations/{conversationId}/attachments", content);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<ChatMessageResponse>();
        Assert.NotNull(payload);
        return payload!;
    }

    private static MultipartFormDataContent BuildUploadContent(string fileName, string contentType, byte[] bytes, string? comment)
    {
        var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(fileContent, "file", fileName);

        if (!string.IsNullOrWhiteSpace(comment))
        {
            content.Add(new StringContent(comment), "comment");
        }

        return content;
    }
}
