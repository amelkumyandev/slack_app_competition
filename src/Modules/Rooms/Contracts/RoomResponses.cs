namespace SlackApp.Modules.Rooms.Contracts;

public sealed record RoomListItemResponse(
    Guid Id,
    string Name,
    string? Description,
    bool IsPrivate,
    bool IsOwner,
    bool IsAdmin,
    bool IsMember,
    int MemberCount,
    bool IsBanned);

public sealed record RoomInvitationResponse(
    Guid Id,
    Guid RoomId,
    string RoomName,
    Guid InvitedUserId,
    string InvitedUserName,
    Guid InvitedByUserId,
    string InvitedByUserName,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? RespondedAtUtc);

public sealed record RoomMemberResponse(
    Guid UserId,
    string UserName,
    DateTimeOffset JoinedAtUtc,
    bool IsOwner,
    bool IsAdmin);

public sealed record RoomAdminResponse(
    Guid UserId,
    string UserName,
    DateTimeOffset GrantedAtUtc,
    bool IsOwner);

public sealed record RoomBanResponse(
    Guid UserId,
    string UserName,
    Guid BannedByUserId,
    string BannedByUserName,
    string? Reason,
    DateTimeOffset CreatedAtUtc);

public sealed record RoomPermissionsResponse(
    bool CanJoin,
    bool CanInvite,
    bool CanManageAdmins,
    bool CanRemoveMembers,
    bool CanUnbanMembers,
    bool CanLeave,
    bool IsBanned);

public sealed record RoomDirectoryResponse(
    IReadOnlyList<RoomListItemResponse> MyRooms,
    IReadOnlyList<RoomListItemResponse> PublicCatalog,
    IReadOnlyList<RoomInvitationResponse> PendingInvitations);

public sealed record RoomDetailsResponse(
    RoomListItemResponse Room,
    IReadOnlyList<RoomMemberResponse> Members,
    IReadOnlyList<RoomAdminResponse> Admins,
    IReadOnlyList<RoomInvitationResponse> PendingInvitations,
    IReadOnlyList<RoomBanResponse> Bans,
    RoomPermissionsResponse Permissions);
