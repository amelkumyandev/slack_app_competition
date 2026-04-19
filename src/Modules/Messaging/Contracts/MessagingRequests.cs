namespace SlackApp.Modules.Messaging.Contracts;

public sealed record OpenDirectConversationRequest(string TargetUserName);

public sealed record PostMessageRequest(string Text, Guid? ReplyToMessageId = null);

public sealed record EditMessageRequest(string Text);
