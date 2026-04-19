namespace SlackApp.Modules.Contacts.Contracts;

public sealed record CreateFriendRequestRequest(string TargetUserName, Guid? SourceRoomId = null);

public sealed record RemoveFriendRequest(string TargetUserName);

public sealed record CreateUserBanRequest(string TargetUserName, string? Reason = null);

public sealed record RemoveUserBanRequest(string TargetUserName);
