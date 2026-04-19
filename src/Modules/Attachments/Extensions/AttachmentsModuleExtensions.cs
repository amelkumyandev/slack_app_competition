using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SlackApp.Modules.Attachments.Services;
using SlackApp.Modules.Identity.Infrastructure;

namespace SlackApp.Modules.Attachments.Extensions;

public static class AttachmentsModuleExtensions
{
    public static IServiceCollection AddAttachmentsModule(this IServiceCollection services)
    {
        services.AddScoped<AttachmentService>();
        services.AddScoped<IAttachmentAssetManager, AttachmentService>();
        return services;
    }

    public static IEndpointRouteBuilder MapAttachmentsModule(this IEndpointRouteBuilder app)
    {
        var conversationGroup = app.MapGroup("/api/conversations")
            .WithTags("Attachments")
            .RequireAuthorization();

        conversationGroup.MapPost("/{conversationId:guid}/attachments", async (
            Guid conversationId,
            ClaimsPrincipal principal,
            [FromForm] IFormFile? file,
            [FromForm] string? comment,
            AttachmentService attachmentService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await attachmentService.UploadAsync(userId, conversationId, file, comment, cancellationToken);
            if (result.Succeeded)
            {
                return Results.Json(result.Value, statusCode: StatusCodes.Status201Created);
            }

            return Results.Problem(
                statusCode: result.Error!.StatusCode,
                title: result.Error.Code,
                detail: result.Error.Message);
        }).DisableAntiforgery();

        var attachmentGroup = app.MapGroup("/api/attachments")
            .WithTags("Attachments")
            .RequireAuthorization();

        attachmentGroup.MapGet("/{attachmentId:guid}/download", async (
            Guid attachmentId,
            ClaimsPrincipal principal,
            AttachmentService attachmentService,
            CancellationToken cancellationToken) =>
        {
            if (!SessionPrincipalFactory.TryGetIdentifiers(principal, out var userId, out _))
            {
                return Results.Unauthorized();
            }

            var result = await attachmentService.GetDownloadAsync(userId, attachmentId, cancellationToken);
            if (!result.Succeeded)
            {
                return Results.Problem(
                    statusCode: result.Error!.StatusCode,
                    title: result.Error.Code,
                    detail: result.Error.Message);
            }

            return Results.File(
                result.FullPath!,
                result.ContentType!,
                fileDownloadName: result.OriginalFileName!,
                enableRangeProcessing: true);
        });

        return app;
    }
}
