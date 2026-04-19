namespace SlackApp.Modules.Rooms.Contracts;

public sealed record CreateRoomRequest(string Name, string? Description, bool IsPrivate);

public sealed record InviteToRoomRequest(string TargetUserName);

public sealed record UpdateRoomAdminRequest(string TargetUserName);

public sealed record RemoveRoomMemberRequest(string TargetUserName, string? Reason = null);

public sealed record RemoveRoomBanRequest(string TargetUserName);
