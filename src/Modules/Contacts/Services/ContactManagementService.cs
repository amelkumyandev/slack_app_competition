using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Contacts.Contracts;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Presence.Services;

namespace SlackApp.Modules.Contacts.Services;

public sealed class ContactManagementService(
    IdentityDbContext dbContext,
    TimeProvider timeProvider,
    IRealtimeNotifier realtimeNotifier)
{
    public async Task<ContactServiceResult<ContactSummaryResponse>> GetSummaryAsync(Guid userId, CancellationToken cancellationToken)
    {
        var friendships = await dbContext.Friendships
            .Where(candidate => candidate.FirstUserId == userId || candidate.SecondUserId == userId)
            .ToListAsync(cancellationToken);

        var incomingRequests = await dbContext.FriendRequests
            .Where(candidate => candidate.AddresseeUserId == userId && candidate.Status == FriendRequestStatus.Pending)
            .ToListAsync(cancellationToken);

        var outgoingRequests = await dbContext.FriendRequests
            .Where(candidate => candidate.RequesterUserId == userId && candidate.Status == FriendRequestStatus.Pending)
            .ToListAsync(cancellationToken);

        var bansIssued = await dbContext.UserBans
            .Where(candidate => candidate.SourceUserId == userId)
            .ToListAsync(cancellationToken);

        var bansReceived = await dbContext.UserBans
            .Where(candidate => candidate.TargetUserId == userId)
            .ToListAsync(cancellationToken);

        friendships = friendships.OrderByDescending(candidate => candidate.CreatedAtUtc).ToList();
        incomingRequests = incomingRequests.OrderByDescending(candidate => candidate.RequestedAtUtc).ToList();
        outgoingRequests = outgoingRequests.OrderByDescending(candidate => candidate.RequestedAtUtc).ToList();
        bansIssued = bansIssued.OrderByDescending(candidate => candidate.CreatedAtUtc).ToList();
        bansReceived = bansReceived.OrderByDescending(candidate => candidate.CreatedAtUtc).ToList();

        var relatedUserIds = friendships
            .Select(candidate => candidate.FirstUserId == userId ? candidate.SecondUserId : candidate.FirstUserId)
            .Concat(incomingRequests.Select(candidate => candidate.RequesterUserId))
            .Concat(outgoingRequests.Select(candidate => candidate.AddresseeUserId))
            .Concat(bansIssued.Select(candidate => candidate.TargetUserId))
            .Concat(bansReceived.Select(candidate => candidate.SourceUserId))
            .Distinct()
            .ToArray();

        var userLookup = await LoadUserLookupAsync(relatedUserIds, cancellationToken);

        var summary = new ContactSummaryResponse(
            friendships.Select(candidate => MapFriendship(candidate, userId, userLookup)).ToArray(),
            incomingRequests.Select(candidate => MapFriendRequest(candidate, userLookup)).ToArray(),
            outgoingRequests.Select(candidate => MapFriendRequest(candidate, userLookup)).ToArray(),
            bansIssued.Select(candidate => MapBan(candidate, candidate.TargetUserId, userLookup)).ToArray(),
            bansReceived.Select(candidate => MapBan(candidate, candidate.SourceUserId, userLookup)).ToArray());

        return ContactServiceResult<ContactSummaryResponse>.Success(summary);
    }

    public async Task<ContactServiceResult<MessageResponse>> SendFriendRequestAsync(
        Guid requesterUserId,
        CreateFriendRequestRequest request,
        CancellationToken cancellationToken)
    {
        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == requesterUserId)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "cannot_friend_self",
                "You cannot send a friend request to yourself.",
                StatusCodes.Status400BadRequest);
        }

        if (await HasAnyBanBetweenUsersAsync(requesterUserId, targetUser.Value.Id, cancellationToken))
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "friend_request_blocked_by_ban",
                "Friend requests are blocked because one of these users has an active ban.",
                StatusCodes.Status409Conflict);
        }

        var (firstUserId, secondUserId) = NormalizePair(requesterUserId, targetUser.Value.Id);
        var friendshipExists = await dbContext.Friendships.AnyAsync(
            candidate => candidate.FirstUserId == firstUserId && candidate.SecondUserId == secondUserId,
            cancellationToken);

        if (friendshipExists)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "already_friends",
                "That user is already in your friends list.",
                StatusCodes.Status409Conflict);
        }

        var sameDirectionPendingExists = await dbContext.FriendRequests.AnyAsync(candidate =>
            candidate.RequesterUserId == requesterUserId &&
            candidate.AddresseeUserId == targetUser.Value.Id &&
            candidate.Status == FriendRequestStatus.Pending, cancellationToken);

        if (sameDirectionPendingExists)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "friend_request_already_pending",
                "A pending friend request already exists for that user.",
                StatusCodes.Status409Conflict);
        }

        var oppositeDirectionPendingExists = await dbContext.FriendRequests.AnyAsync(candidate =>
            candidate.RequesterUserId == targetUser.Value.Id &&
            candidate.AddresseeUserId == requesterUserId &&
            candidate.Status == FriendRequestStatus.Pending, cancellationToken);

        if (oppositeDirectionPendingExists)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "incoming_friend_request_pending",
                "That user has already sent you a pending friend request.",
                StatusCodes.Status409Conflict);
        }

        var now = timeProvider.GetUtcNow();
        var friendRequest = new FriendRequest
        {
            RequesterUserId = requesterUserId,
            AddresseeUserId = targetUser.Value.Id,
            SourceRoomId = request.SourceRoomId,
            RequestedAtUtc = now,
            Status = FriendRequestStatus.Pending
        };
        dbContext.FriendRequests.Add(friendRequest);

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "contact.friend-request.created",
            new
            {
                friendRequestId = friendRequest.Id,
                requesterUserId,
                addresseeUserId = targetUser.Value.Id,
                sourceRoomId = request.SourceRoomId
            },
            [requesterUserId, targetUser.Value.Id],
            cancellationToken);

        return ContactServiceResult<MessageResponse>.Success(new MessageResponse("Friend request sent."));
    }

    public async Task<ContactServiceResult<MessageResponse>> AcceptFriendRequestAsync(
        Guid currentUserId,
        Guid friendRequestId,
        CancellationToken cancellationToken)
    {
        var friendRequest = await dbContext.FriendRequests.SingleOrDefaultAsync(candidate =>
            candidate.Id == friendRequestId &&
            candidate.AddresseeUserId == currentUserId &&
            candidate.Status == FriendRequestStatus.Pending, cancellationToken);

        if (friendRequest is null)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "friend_request_not_found",
                "That pending friend request could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (await HasAnyBanBetweenUsersAsync(friendRequest.RequesterUserId, friendRequest.AddresseeUserId, cancellationToken))
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "friend_request_blocked_by_ban",
                "This friend request can no longer be accepted because one of the users has an active ban.",
                StatusCodes.Status409Conflict);
        }

        var now = timeProvider.GetUtcNow();
        var (firstUserId, secondUserId) = NormalizePair(friendRequest.RequesterUserId, friendRequest.AddresseeUserId);

        var friendship = await dbContext.Friendships.SingleOrDefaultAsync(candidate =>
            candidate.FirstUserId == firstUserId && candidate.SecondUserId == secondUserId, cancellationToken);

        if (friendship is null)
        {
            dbContext.Friendships.Add(new Friendship
            {
                FirstUserId = firstUserId,
                SecondUserId = secondUserId,
                CreatedAtUtc = now
            });
        }

        friendRequest.Status = FriendRequestStatus.Accepted;
        friendRequest.RespondedAtUtc = now;

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "contact.friend-request.accepted",
            new
            {
                friendRequestId,
                requesterUserId = friendRequest.RequesterUserId,
                addresseeUserId = friendRequest.AddresseeUserId
            },
            [friendRequest.RequesterUserId, friendRequest.AddresseeUserId],
            cancellationToken);

        return ContactServiceResult<MessageResponse>.Success(new MessageResponse("Friend request accepted."));
    }

    public async Task<ContactServiceResult<MessageResponse>> DeclineFriendRequestAsync(
        Guid currentUserId,
        Guid friendRequestId,
        CancellationToken cancellationToken)
    {
        var friendRequest = await dbContext.FriendRequests.SingleOrDefaultAsync(candidate =>
            candidate.Id == friendRequestId &&
            candidate.AddresseeUserId == currentUserId &&
            candidate.Status == FriendRequestStatus.Pending, cancellationToken);

        if (friendRequest is null)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "friend_request_not_found",
                "That pending friend request could not be found.",
                StatusCodes.Status404NotFound);
        }

        friendRequest.Status = FriendRequestStatus.Declined;
        friendRequest.RespondedAtUtc = timeProvider.GetUtcNow();

        await dbContext.SaveChangesAsync(cancellationToken);

        return ContactServiceResult<MessageResponse>.Success(new MessageResponse("Friend request declined."));
    }

    public async Task<ContactServiceResult<MessageResponse>> RemoveFriendAsync(
        Guid currentUserId,
        RemoveFriendRequest request,
        CancellationToken cancellationToken)
    {
        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        var (firstUserId, secondUserId) = NormalizePair(currentUserId, targetUser.Value!.Id);
        var friendship = await dbContext.Friendships.SingleOrDefaultAsync(candidate =>
            candidate.FirstUserId == firstUserId && candidate.SecondUserId == secondUserId, cancellationToken);

        if (friendship is null)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "friendship_not_found",
                "That user is not currently in your friends list.",
                StatusCodes.Status404NotFound);
        }

        dbContext.Friendships.Remove(friendship);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ContactServiceResult<MessageResponse>.Success(new MessageResponse("Friend removed."));
    }

    public async Task<ContactServiceResult<MessageResponse>> BanUserAsync(
        Guid currentUserId,
        CreateUserBanRequest request,
        CancellationToken cancellationToken)
    {
        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == currentUserId)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "cannot_ban_self",
                "You cannot ban yourself.",
                StatusCodes.Status400BadRequest);
        }

        var now = timeProvider.GetUtcNow();
        var ban = await dbContext.UserBans.SingleOrDefaultAsync(candidate =>
            candidate.SourceUserId == currentUserId && candidate.TargetUserId == targetUser.Value.Id, cancellationToken);

        if (ban is null)
        {
            dbContext.UserBans.Add(new UserBan
            {
                SourceUserId = currentUserId,
                TargetUserId = targetUser.Value.Id,
                Reason = Truncate(request.Reason, 512),
                CreatedAtUtc = now
            });
        }
        else
        {
            ban.Reason = Truncate(request.Reason, 512) ?? ban.Reason;
        }

        var (firstUserId, secondUserId) = NormalizePair(currentUserId, targetUser.Value.Id);
        var friendship = await dbContext.Friendships.SingleOrDefaultAsync(candidate =>
            candidate.FirstUserId == firstUserId && candidate.SecondUserId == secondUserId, cancellationToken);

        if (friendship is not null)
        {
            dbContext.Friendships.Remove(friendship);
        }

        var pendingRequests = await dbContext.FriendRequests
            .Where(candidate =>
                candidate.Status == FriendRequestStatus.Pending &&
                ((candidate.RequesterUserId == currentUserId && candidate.AddresseeUserId == targetUser.Value.Id) ||
                 (candidate.RequesterUserId == targetUser.Value.Id && candidate.AddresseeUserId == currentUserId)))
            .ToListAsync(cancellationToken);

        foreach (var pendingRequest in pendingRequests)
        {
            pendingRequest.Status = FriendRequestStatus.Cancelled;
            pendingRequest.RespondedAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "contact.user-ban.created",
            new
            {
                sourceUserId = currentUserId,
                targetUserId = targetUser.Value.Id,
                reason = Truncate(request.Reason, 512)
            },
            [currentUserId, targetUser.Value.Id],
            cancellationToken);

        return ContactServiceResult<MessageResponse>.Success(new MessageResponse("User ban saved and PM access is now frozen."));
    }

    public async Task<ContactServiceResult<MessageResponse>> UnbanUserAsync(
        Guid currentUserId,
        RemoveUserBanRequest request,
        CancellationToken cancellationToken)
    {
        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        var ban = await dbContext.UserBans.SingleOrDefaultAsync(candidate =>
            candidate.SourceUserId == currentUserId && candidate.TargetUserId == targetUser.Value!.Id, cancellationToken);

        if (ban is null)
        {
            return ContactServiceResult<MessageResponse>.Failure(
                "ban_not_found",
                "No outgoing ban exists for that user.",
                StatusCodes.Status404NotFound);
        }

        dbContext.UserBans.Remove(ban);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ContactServiceResult<MessageResponse>.Success(new MessageResponse("User ban removed."));
    }

    public async Task<ContactServiceResult<PmPolicyResponse>> GetPmPolicyAsync(
        Guid currentUserId,
        string targetUserName,
        CancellationToken cancellationToken)
    {
        var targetUser = await ResolveTargetUserAsync(targetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return ContactServiceResult<PmPolicyResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == currentUserId)
        {
            return ContactServiceResult<PmPolicyResponse>.Success(new PmPolicyResponse(
                targetUser.Value.Id,
                targetUser.Value.UserName,
                false,
                "blocked_self",
                "not_available",
                "Direct messages are only supported between distinct users."));
        }

        if (await HasAnyBanBetweenUsersAsync(currentUserId, targetUser.Value.Id, cancellationToken))
        {
            return ContactServiceResult<PmPolicyResponse>.Success(new PmPolicyResponse(
                targetUser.Value.Id,
                targetUser.Value.UserName,
                false,
                "blocked_banned",
                "read_only_if_history_exists",
                "Direct messages are frozen because one of these users has banned the other."));
        }

        var (firstUserId, secondUserId) = NormalizePair(currentUserId, targetUser.Value.Id);
        var friendshipExists = await dbContext.Friendships.AnyAsync(candidate =>
            candidate.FirstUserId == firstUserId && candidate.SecondUserId == secondUserId, cancellationToken);

        if (friendshipExists)
        {
            return ContactServiceResult<PmPolicyResponse>.Success(new PmPolicyResponse(
                targetUser.Value.Id,
                targetUser.Value.UserName,
                true,
                "allowed",
                "normal",
                "Direct messages are allowed because friendship is confirmed."));
        }

        return ContactServiceResult<PmPolicyResponse>.Success(new PmPolicyResponse(
            targetUser.Value.Id,
            targetUser.Value.UserName,
            false,
            "blocked_not_friends",
            "not_available",
            "Direct messages require a confirmed friendship."));
    }

    private async Task<ContactServiceResult<UserLookup>> ResolveTargetUserAsync(string targetUserName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(targetUserName))
        {
            return ContactServiceResult<UserLookup>.Failure(
                "invalid_target_username",
                "A target username is required.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedTargetUserName = Normalize(targetUserName);
        var targetUser = await dbContext.UserAccounts
            .Where(candidate => candidate.NormalizedUserName == normalizedTargetUserName)
            .Select(candidate => new UserLookup(candidate.Id, candidate.UserName, candidate.NormalizedUserName))
            .SingleOrDefaultAsync(cancellationToken);

        if (targetUser is null)
        {
            return ContactServiceResult<UserLookup>.Failure(
                "target_user_not_found",
                "No user account was found for that username.",
                StatusCodes.Status404NotFound);
        }

        return ContactServiceResult<UserLookup>.Success(targetUser);
    }

    private async Task<Dictionary<Guid, UserLookup>> LoadUserLookupAsync(IEnumerable<Guid> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, UserLookup>();
        }

        return await dbContext.UserAccounts
            .Where(candidate => ids.Contains(candidate.Id))
            .Select(candidate => new UserLookup(candidate.Id, candidate.UserName, candidate.NormalizedUserName))
            .ToDictionaryAsync(candidate => candidate.Id, cancellationToken);
    }

    private async Task<bool> HasAnyBanBetweenUsersAsync(Guid firstUserId, Guid secondUserId, CancellationToken cancellationToken)
    {
        return await dbContext.UserBans.AnyAsync(candidate =>
            (candidate.SourceUserId == firstUserId && candidate.TargetUserId == secondUserId) ||
            (candidate.SourceUserId == secondUserId && candidate.TargetUserId == firstUserId), cancellationToken);
    }

    private static FriendshipContactResponse MapFriendship(
        Friendship friendship,
        Guid currentUserId,
        IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        var otherUserId = friendship.FirstUserId == currentUserId ? friendship.SecondUserId : friendship.FirstUserId;
        return new FriendshipContactResponse(otherUserId, ResolveUserName(otherUserId, userLookup), friendship.CreatedAtUtc);
    }

    private static FriendRequestContactResponse MapFriendRequest(
        FriendRequest friendRequest,
        IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        return new FriendRequestContactResponse(
            friendRequest.Id,
            friendRequest.RequesterUserId,
            ResolveUserName(friendRequest.RequesterUserId, userLookup),
            friendRequest.AddresseeUserId,
            ResolveUserName(friendRequest.AddresseeUserId, userLookup),
            MapStatus(friendRequest.Status),
            friendRequest.SourceRoomId,
            friendRequest.RequestedAtUtc,
            friendRequest.RespondedAtUtc);
    }

    private static UserBanContactResponse MapBan(
        UserBan userBan,
        Guid otherUserId,
        IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        return new UserBanContactResponse(otherUserId, ResolveUserName(otherUserId, userLookup), userBan.Reason, userBan.CreatedAtUtc);
    }

    private static string ResolveUserName(Guid userId, IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        return userLookup.TryGetValue(userId, out var user) ? user.UserName : "Unknown user";
    }

    private static (Guid FirstUserId, Guid SecondUserId) NormalizePair(Guid firstUserId, Guid secondUserId)
    {
        return firstUserId.CompareTo(secondUserId) <= 0
            ? (firstUserId, secondUserId)
            : (secondUserId, firstUserId);
    }

    private static string Normalize(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static string MapStatus(FriendRequestStatus status)
    {
        return status switch
        {
            FriendRequestStatus.Accepted => "accepted",
            FriendRequestStatus.Declined => "declined",
            FriendRequestStatus.Cancelled => "cancelled",
            _ => "pending"
        };
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private sealed record UserLookup(Guid Id, string UserName, string NormalizedUserName);
}
