namespace SlackApp.Modules.Attachments.Services;

public interface IAttachmentAssetManager
{
    Task DeleteConversationAssetsAsync(Guid conversationId, CancellationToken cancellationToken);
}
