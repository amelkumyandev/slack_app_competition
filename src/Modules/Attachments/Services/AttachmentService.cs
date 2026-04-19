using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Messaging.Contracts;
using SlackApp.Modules.Messaging.Services;
using SlackApp.Modules.Presence.Services;

namespace SlackApp.Modules.Attachments.Services;

public sealed class AttachmentService(
    IdentityDbContext dbContext,
    ConversationService conversationService,
    IRealtimeNotifier realtimeNotifier,
    TimeProvider timeProvider,
    IConfiguration configuration) : IAttachmentAssetManager
{
    private const long DefaultMaxUploadBytes = 10 * 1024 * 1024;
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public async Task<ConversationQueryResult<ChatMessageResponse>> UploadAsync(
        Guid userId,
        Guid conversationId,
        IFormFile? file,
        string? comment,
        CancellationToken cancellationToken)
    {
        if (file is null)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "attachment_file_required",
                "A file upload is required.",
                StatusCodes.Status400BadRequest);
        }

        if (file.Length <= 0)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "attachment_file_empty",
                "The uploaded file was empty.",
                StatusCodes.Status400BadRequest);
        }

        var maxUploadBytes = configuration.GetValue<long?>("Storage:MaxUploadBytes") ?? DefaultMaxUploadBytes;
        if (file.Length > maxUploadBytes)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                "attachment_file_too_large",
                $"Files larger than {maxUploadBytes} bytes are not allowed.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedComment = NormalizeComment(comment);
        var access = await conversationService.GetAccessAsync(userId, conversationId, requireWrite: true, cancellationToken);
        if (!access.Succeeded)
        {
            return ConversationQueryResult<ChatMessageResponse>.Failure(
                access.Error!.Code,
                access.Error.Message,
                access.Error.StatusCode);
        }

        var conversation = await dbContext.Conversations.SingleAsync(candidate => candidate.Id == conversationId, cancellationToken);
        var attachmentId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var now = timeProvider.GetUtcNow();
        var safeOriginalFileName = SanitizeFileName(file.FileName);
        var storedFileName = $"{attachmentId:N}{Path.GetExtension(safeOriginalFileName)}";
        var relativePath = Path.Combine("conversations", conversationId.ToString("D"), storedFileName).Replace('\\', '/');
        var fullPath = Path.Combine(GetUploadsRoot(), relativePath.Replace('/', Path.DirectorySeparatorChar));

        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using var fileStream = File.Create(fullPath);
        await file.CopyToAsync(fileStream, cancellationToken);

        try
        {
            conversation.CurrentWatermark += 1;
            conversation.UpdatedAtUtc = now;

            var message = new ConversationMessage
            {
                ConversationId = conversationId,
                MessageId = messageId,
                Watermark = conversation.CurrentWatermark,
                EventType = "message.created",
                ActorUserId = userId,
                TextContent = normalizedComment,
                PayloadJson = JsonSerializer.Serialize(new
                {
                    messageId,
                    text = normalizedComment,
                    attachmentIds = new[] { attachmentId },
                    originalFileName = safeOriginalFileName
                }, SerializerOptions),
                CreatedAtUtc = now
            };

            var attachment = new MessageAttachment
            {
                Id = attachmentId,
                ConversationId = conversationId,
                MessageId = messageId,
                UploadedByUserId = userId,
                OriginalFileName = safeOriginalFileName,
                StoredFileName = storedFileName,
                RelativePath = relativePath,
                ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                ByteSize = file.Length,
                CreatedAtUtc = now
            };

            dbContext.ConversationMessages.Add(message);
            dbContext.MessageAttachments.Add(attachment);
            await dbContext.SaveChangesAsync(cancellationToken);

            var response = await conversationService.GetMessageAsync(userId, conversationId, messageId, cancellationToken);
            if (!response.Succeeded)
            {
                return ConversationQueryResult<ChatMessageResponse>.Failure(
                    response.Error!.Code,
                    response.Error.Message,
                    response.Error.StatusCode);
            }

            await realtimeNotifier.NotifyConversationAsync(
                "message.created",
                conversationId,
                message.Watermark,
                response.Value!,
                cancellationToken);

            return ConversationQueryResult<ChatMessageResponse>.Success(response.Value!);
        }
        catch
        {
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }

            throw;
        }
    }

    public async Task<AttachmentDownloadResult> GetDownloadAsync(
        Guid userId,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        var attachment = await dbContext.MessageAttachments.SingleOrDefaultAsync(candidate => candidate.Id == attachmentId, cancellationToken);
        if (attachment is null)
        {
            return AttachmentDownloadResult.Failure(
                "attachment_not_found",
                "That attachment could not be found.",
                StatusCodes.Status404NotFound);
        }

        var access = await conversationService.GetAccessAsync(userId, attachment.ConversationId, requireWrite: false, cancellationToken);
        if (!access.Succeeded)
        {
            return AttachmentDownloadResult.Failure(
                access.Error!.Code,
                access.Error.Message,
                access.Error.StatusCode);
        }

        var fullPath = Path.Combine(GetUploadsRoot(), attachment.RelativePath.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(fullPath))
        {
            return AttachmentDownloadResult.Failure(
                "attachment_not_found",
                "The file for that attachment is no longer available.",
                StatusCodes.Status404NotFound);
        }

        return AttachmentDownloadResult.Success(
            fullPath,
            attachment.OriginalFileName,
            attachment.ContentType);
    }

    public Task DeleteConversationAssetsAsync(Guid conversationId, CancellationToken cancellationToken)
    {
        var conversationDirectory = Path.Combine(GetUploadsRoot(), "conversations", conversationId.ToString("D"));
        if (Directory.Exists(conversationDirectory))
        {
            Directory.Delete(conversationDirectory, recursive: true);
        }

        return Task.CompletedTask;
    }

    private string GetUploadsRoot()
    {
        var configuredRoot = configuration["Storage:UploadsRoot"];
        if (string.IsNullOrWhiteSpace(configuredRoot))
        {
            configuredRoot = Path.Combine(AppContext.BaseDirectory, "uploads");
        }

        return Path.GetFullPath(configuredRoot);
    }

    private static string? NormalizeComment(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        return normalized.Length <= 1000 ? normalized : normalized[..1000];
    }

    private static string SanitizeFileName(string? originalFileName)
    {
        var candidate = string.IsNullOrWhiteSpace(originalFileName)
            ? "upload.bin"
            : Path.GetFileName(originalFileName.Trim());

        var invalidCharacters = Path.GetInvalidFileNameChars();
        var sanitized = new string(candidate.Select(character => invalidCharacters.Contains(character) ? '-' : character).ToArray());
        return string.IsNullOrWhiteSpace(sanitized) ? "upload.bin" : sanitized;
    }
}

public sealed class AttachmentDownloadResult
{
    private AttachmentDownloadResult(string? fullPath, string? originalFileName, string? contentType, AttachmentDownloadError? error)
    {
        FullPath = fullPath;
        OriginalFileName = originalFileName;
        ContentType = contentType;
        Error = error;
    }

    public bool Succeeded => Error is null;

    public string? FullPath { get; }

    public string? OriginalFileName { get; }

    public string? ContentType { get; }

    public AttachmentDownloadError? Error { get; }

    public static AttachmentDownloadResult Success(string fullPath, string originalFileName, string contentType)
    {
        return new AttachmentDownloadResult(fullPath, originalFileName, contentType, null);
    }

    public static AttachmentDownloadResult Failure(string code, string message, int statusCode)
    {
        return new AttachmentDownloadResult(null, null, null, new AttachmentDownloadError(code, message, statusCode));
    }
}

public sealed record AttachmentDownloadError(string Code, string Message, int StatusCode);
