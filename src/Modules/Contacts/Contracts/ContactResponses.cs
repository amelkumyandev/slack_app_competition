namespace SlackApp.Modules.Contacts.Contracts;

public sealed record FriendshipContactResponse(Guid UserId, string UserName, DateTimeOffset CreatedAtUtc);

public sealed record FriendRequestContactResponse(
    Guid Id,
    Guid RequesterUserId,
    string RequesterUserName,
    Guid AddresseeUserId,
    string AddresseeUserName,
    string Status,
    Guid? SourceRoomId,
    DateTimeOffset RequestedAtUtc,
    DateTimeOffset? RespondedAtUtc);

public sealed record UserBanContactResponse(Guid UserId, string UserName, string? Reason, DateTimeOffset CreatedAtUtc);

public sealed record ContactSummaryResponse(
    IReadOnlyList<FriendshipContactResponse> Friends,
    IReadOnlyList<FriendRequestContactResponse> IncomingFriendRequests,
    IReadOnlyList<FriendRequestContactResponse> OutgoingFriendRequests,
    IReadOnlyList<UserBanContactResponse> BansIssued,
    IReadOnlyList<UserBanContactResponse> BansReceived);

public sealed record PmPolicyResponse(
    Guid TargetUserId,
    string TargetUserName,
    bool CanStartConversation,
    string State,
    string ExistingConversationAccess,
    string Reason);
