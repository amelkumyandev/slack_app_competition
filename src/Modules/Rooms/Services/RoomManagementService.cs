using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Contracts;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Messaging.Services;
using SlackApp.Modules.Presence.Contracts;
using SlackApp.Modules.Presence.Services;
using SlackApp.Modules.Rooms.Contracts;

namespace SlackApp.Modules.Rooms.Services;

public sealed partial class RoomManagementService(
    IdentityDbContext dbContext,
    TimeProvider timeProvider,
    ConversationService conversationService,
    IRealtimeNotifier realtimeNotifier)
{
    public async Task<RoomServiceResult<RoomDirectoryResponse>> GetDirectoryAsync(
        Guid userId,
        string? search,
        CancellationToken cancellationToken)
    {
        var normalizedSearch = NormalizeSearch(search);
        var rooms = await dbContext.Rooms.ToListAsync(cancellationToken);
        var roomMembers = await dbContext.RoomMembers.ToListAsync(cancellationToken);
        var roomAdmins = await dbContext.RoomAdmins.Where(candidate => candidate.UserId == userId).ToListAsync(cancellationToken);
        var pendingInvitations = await dbContext.RoomInvitations
            .Where(candidate => candidate.InvitedUserId == userId && candidate.Status == RoomInvitationStatus.Pending)
            .ToListAsync(cancellationToken);
        var roomBans = await dbContext.RoomBans.Where(candidate => candidate.UserId == userId).ToListAsync(cancellationToken);

        var memberCountLookup = roomMembers
            .GroupBy(candidate => candidate.RoomId)
            .ToDictionary(group => group.Key, group => group.Count());

        var memberRoomIds = roomMembers
            .Where(candidate => candidate.UserId == userId)
            .Select(candidate => candidate.RoomId)
            .ToHashSet();

        var adminRoomIds = roomAdmins
            .Select(candidate => candidate.RoomId)
            .ToHashSet();

        var bannedRoomIds = roomBans
            .Select(candidate => candidate.RoomId)
            .ToHashSet();

        var myRooms = rooms
            .Where(candidate => candidate.OwnerUserId == userId || memberRoomIds.Contains(candidate.Id))
            .OrderBy(candidate => candidate.Name, StringComparer.OrdinalIgnoreCase)
            .Select(candidate => MapRoom(candidate, userId, memberCountLookup, memberRoomIds, adminRoomIds, bannedRoomIds))
            .ToArray();

        var publicCatalog = rooms
            .Where(candidate => candidate.Visibility == RoomVisibility.Public)
            .Where(candidate => normalizedSearch is null || MatchesSearch(candidate, normalizedSearch))
            .OrderBy(candidate => candidate.Name, StringComparer.OrdinalIgnoreCase)
            .Select(candidate => MapRoom(candidate, userId, memberCountLookup, memberRoomIds, adminRoomIds, bannedRoomIds))
            .ToArray();

        var pendingInvitationRoomIds = pendingInvitations.Select(candidate => candidate.RoomId).Distinct().ToArray();
        var invitationRoomLookup = rooms
            .Where(candidate => pendingInvitationRoomIds.Contains(candidate.Id))
            .ToDictionary(candidate => candidate.Id);

        var relatedUserIds = pendingInvitations
            .Select(candidate => candidate.InvitedByUserId)
            .Concat(pendingInvitations.Select(candidate => candidate.InvitedUserId))
            .Distinct()
            .ToArray();

        var userLookup = await LoadUserLookupAsync(relatedUserIds, cancellationToken);

        var invitationResponses = pendingInvitations
            .OrderByDescending(candidate => candidate.CreatedAtUtc)
            .Select(candidate => MapInvitation(candidate, invitationRoomLookup, userLookup))
            .ToArray();

        return RoomServiceResult<RoomDirectoryResponse>.Success(new RoomDirectoryResponse(
            myRooms,
            publicCatalog,
            invitationResponses));
    }

    public async Task<RoomServiceResult<RoomDetailsResponse>> GetRoomDetailsAsync(
        Guid userId,
        Guid roomId,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<RoomDetailsResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        var currentUserIsMember = aggregate.IsMember(userId);
        var currentUserHasPendingInvitation = aggregate.PendingInvitations.Any(candidate =>
            candidate.InvitedUserId == userId && candidate.Status == RoomInvitationStatus.Pending);

        if (aggregate.Room.Visibility == RoomVisibility.Private && !currentUserIsMember && !currentUserHasPendingInvitation)
        {
            return RoomServiceResult<RoomDetailsResponse>.Failure(
                "room_access_denied",
                "You do not currently have access to that private room.",
                StatusCodes.Status403Forbidden);
        }

        var allUserIds = aggregate.Members.Select(candidate => candidate.UserId)
            .Concat(aggregate.Admins.Select(candidate => candidate.UserId))
            .Concat(aggregate.Admins.Select(candidate => candidate.GrantedByUserId))
            .Concat(aggregate.PendingInvitations.Select(candidate => candidate.InvitedUserId))
            .Concat(aggregate.PendingInvitations.Select(candidate => candidate.InvitedByUserId))
            .Concat(aggregate.Bans.Select(candidate => candidate.UserId))
            .Concat(aggregate.Bans.Select(candidate => candidate.BannedByUserId))
            .Append(aggregate.Room.OwnerUserId)
            .Distinct()
            .ToArray();

        var userLookup = await LoadUserLookupAsync(allUserIds, cancellationToken);
        var memberCountLookup = new Dictionary<Guid, int> { [aggregate.Room.Id] = aggregate.Members.Count };
        var memberRoomIds = aggregate.Members.Select(candidate => candidate.RoomId).Where(candidate => candidate == aggregate.Room.Id).ToHashSet();
        var currentUserRoomIds = aggregate.Members.Where(candidate => candidate.UserId == userId).Select(candidate => candidate.RoomId).ToHashSet();
        if (aggregate.Room.OwnerUserId == userId)
        {
            currentUserRoomIds.Add(aggregate.Room.Id);
        }

        var currentUserAdminRoomIds = aggregate.Admins.Where(candidate => candidate.UserId == userId).Select(candidate => candidate.RoomId).ToHashSet();
        var bannedRoomIds = aggregate.Bans.Where(candidate => candidate.UserId == userId).Select(candidate => candidate.RoomId).ToHashSet();

        var roomResponse = MapRoom(
            aggregate.Room,
            userId,
            memberCountLookup,
            currentUserRoomIds,
            currentUserAdminRoomIds,
            bannedRoomIds);

        var permissions = new RoomPermissionsResponse(
            CanJoin: aggregate.Room.Visibility == RoomVisibility.Public && !aggregate.IsMember(userId) && !aggregate.IsBanned(userId),
            CanInvite: aggregate.IsAdmin(userId) && aggregate.Room.Visibility == RoomVisibility.Private,
            CanManageAdmins: aggregate.Room.OwnerUserId == userId,
            CanRemoveMembers: aggregate.IsAdmin(userId),
            CanUnbanMembers: aggregate.IsAdmin(userId),
            CanLeave: aggregate.IsMember(userId) && aggregate.Room.OwnerUserId != userId,
            IsBanned: aggregate.IsBanned(userId));

        var memberResponses = aggregate.Members
            .OrderByDescending(candidate => aggregate.Room.OwnerUserId == candidate.UserId)
            .ThenByDescending(candidate => aggregate.Admins.Any(admin => admin.UserId == candidate.UserId))
            .ThenBy(candidate => ResolveUserName(candidate.UserId, userLookup), StringComparer.OrdinalIgnoreCase)
            .Select(candidate => new RoomMemberResponse(
                candidate.UserId,
                ResolveUserName(candidate.UserId, userLookup),
                candidate.JoinedAtUtc,
                aggregate.Room.OwnerUserId == candidate.UserId,
                aggregate.IsAdmin(candidate.UserId)))
            .ToArray();

        var adminResponses = aggregate.Admins
            .OrderBy(candidate => ResolveUserName(candidate.UserId, userLookup), StringComparer.OrdinalIgnoreCase)
            .Select(candidate => new RoomAdminResponse(
                candidate.UserId,
                ResolveUserName(candidate.UserId, userLookup),
                candidate.GrantedAtUtc,
                false))
            .Prepend(new RoomAdminResponse(
                aggregate.Room.OwnerUserId,
                ResolveUserName(aggregate.Room.OwnerUserId, userLookup),
                aggregate.Room.CreatedAtUtc,
                true))
            .ToArray();

        var invitationResponses = aggregate.IsAdmin(userId)
            ? aggregate.PendingInvitations
                .Where(candidate => candidate.Status == RoomInvitationStatus.Pending)
                .OrderByDescending(candidate => candidate.CreatedAtUtc)
                .Select(candidate => MapInvitation(candidate, new Dictionary<Guid, Room> { [aggregate.Room.Id] = aggregate.Room }, userLookup))
                .ToArray()
            : aggregate.PendingInvitations
                .Where(candidate => candidate.InvitedUserId == userId && candidate.Status == RoomInvitationStatus.Pending)
                .OrderByDescending(candidate => candidate.CreatedAtUtc)
                .Select(candidate => MapInvitation(candidate, new Dictionary<Guid, Room> { [aggregate.Room.Id] = aggregate.Room }, userLookup))
                .ToArray();

        var banResponses = aggregate.IsAdmin(userId)
            ? aggregate.Bans
                .OrderByDescending(candidate => candidate.CreatedAtUtc)
                .Select(candidate => new RoomBanResponse(
                    candidate.UserId,
                    ResolveUserName(candidate.UserId, userLookup),
                    candidate.BannedByUserId,
                    ResolveUserName(candidate.BannedByUserId, userLookup),
                    candidate.Reason,
                    candidate.CreatedAtUtc))
                .ToArray()
            : Array.Empty<RoomBanResponse>();

        return RoomServiceResult<RoomDetailsResponse>.Success(new RoomDetailsResponse(
            roomResponse,
            memberResponses,
            adminResponses,
            invitationResponses,
            banResponses,
            permissions));
    }

    public async Task<RoomServiceResult<RoomListItemResponse>> CreateRoomAsync(
        Guid ownerUserId,
        CreateRoomRequest request,
        CancellationToken cancellationToken)
    {
        var roomNameError = ValidateRoomName(request.Name);
        if (roomNameError is not null)
        {
            return RoomServiceResult<RoomListItemResponse>.Failure(
                "invalid_room_name",
                roomNameError,
                StatusCodes.Status400BadRequest);
        }

        var normalizedName = Normalize(request.Name);
        var duplicateExists = await dbContext.Rooms.AnyAsync(candidate => candidate.NormalizedName == normalizedName, cancellationToken);
        if (duplicateExists)
        {
            return RoomServiceResult<RoomListItemResponse>.Failure(
                "room_name_in_use",
                "A room with that name already exists.",
                StatusCodes.Status409Conflict);
        }

        var now = timeProvider.GetUtcNow();
        var room = new Room
        {
            Name = request.Name.Trim(),
            NormalizedName = normalizedName,
            Description = Truncate(request.Description, 512),
            Visibility = request.IsPrivate ? RoomVisibility.Private : RoomVisibility.Public,
            OwnerUserId = ownerUserId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        var conversation = new Conversation
        {
            Kind = "room",
            RoomId = room.Id,
            CurrentWatermark = 0,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        room.ConversationId = conversation.Id;

        dbContext.Conversations.Add(conversation);
        dbContext.Rooms.Add(room);
        dbContext.RoomMembers.Add(new RoomMember
        {
            RoomId = room.Id,
            UserId = ownerUserId,
            JoinedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationService.AppendRoomActivityAsync(
            room.ConversationId,
            room.Id,
            "room.created",
            ownerUserId,
            new
            {
                roomId = room.Id,
                conversationId = room.ConversationId,
                roomName = room.Name,
                isPrivate = room.Visibility == RoomVisibility.Private
            },
            cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "room.created",
            new
            {
                roomId = room.Id,
                conversationId = room.ConversationId,
                roomName = room.Name,
                isPrivate = room.Visibility == RoomVisibility.Private
            },
            [ownerUserId],
            cancellationToken);

        return RoomServiceResult<RoomListItemResponse>.Success(new RoomListItemResponse(
            room.Id,
            room.ConversationId,
            room.Name,
            room.Description,
            room.Visibility == RoomVisibility.Private,
            true,
            true,
            true,
            1,
            false));
    }

    public async Task<RoomServiceResult<MessageResponse>> JoinPublicRoomAsync(
        Guid userId,
        Guid roomId,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (aggregate.Room.Visibility == RoomVisibility.Private)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "private_room_requires_invitation",
                "Private rooms require an invitation before you can join.",
                StatusCodes.Status403Forbidden);
        }

        if (aggregate.IsBanned(userId))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_ban_active",
                "You are currently banned from that room.",
                StatusCodes.Status409Conflict);
        }

        if (aggregate.IsMember(userId))
        {
            return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Already joined."));
        }

        dbContext.RoomMembers.Add(new RoomMember
        {
            RoomId = roomId,
            UserId = userId,
            JoinedAtUtc = timeProvider.GetUtcNow()
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationService.AppendRoomActivityAsync(
            aggregate.Room.ConversationId,
            roomId,
            "room.member.joined",
            userId,
            new
            {
                roomId,
                conversationId = aggregate.Room.ConversationId,
                userId
            },
            cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Joined room."));
    }

    public async Task<RoomServiceResult<MessageResponse>> LeaveRoomAsync(
        Guid userId,
        Guid roomId,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (aggregate.Room.OwnerUserId == userId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "owner_cannot_leave_room",
                "The room owner cannot leave their own room. Delete the room in a later moderation flow instead.",
                StatusCodes.Status400BadRequest);
        }

        var membership = aggregate.Members.SingleOrDefault(candidate => candidate.UserId == userId);
        if (membership is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_membership_not_found",
                "You are not currently a member of that room.",
                StatusCodes.Status404NotFound);
        }

        dbContext.RoomMembers.Remove(membership);

        var adminRecord = aggregate.Admins.SingleOrDefault(candidate => candidate.UserId == userId);
        if (adminRecord is not null)
        {
            dbContext.RoomAdmins.Remove(adminRecord);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Left room."));
    }

    public async Task<RoomServiceResult<MessageResponse>> InviteUserAsync(
        Guid actorUserId,
        Guid roomId,
        InviteToRoomRequest request,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (!aggregate.IsAdmin(actorUserId))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_admin_required",
                "Only room admins can invite users.",
                StatusCodes.Status403Forbidden);
        }

        if (aggregate.Room.Visibility != RoomVisibility.Private)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_invites_private_only",
                "Only private rooms require invitations.",
                StatusCodes.Status400BadRequest);
        }

        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (aggregate.IsBanned(targetUser.Value!.Id))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_ban_active",
                "That user is currently banned from the room.",
                StatusCodes.Status409Conflict);
        }

        if (aggregate.IsMember(targetUser.Value.Id))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_member_exists",
                "That user is already a member of the room.",
                StatusCodes.Status409Conflict);
        }

        var pendingInvitationExists = aggregate.PendingInvitations.Any(candidate =>
            candidate.InvitedUserId == targetUser.Value.Id && candidate.Status == RoomInvitationStatus.Pending);

        if (pendingInvitationExists)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_invitation_pending",
                "A pending room invitation already exists for that user.",
                StatusCodes.Status409Conflict);
        }

        dbContext.RoomInvitations.Add(new RoomInvitation
        {
            RoomId = roomId,
            InvitedUserId = targetUser.Value.Id,
            InvitedByUserId = actorUserId,
            CreatedAtUtc = timeProvider.GetUtcNow(),
            Status = RoomInvitationStatus.Pending
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationService.AppendRoomActivityAsync(
            aggregate.Room.ConversationId,
            roomId,
            "room.invitation.created",
            actorUserId,
            new
            {
                roomId,
                conversationId = aggregate.Room.ConversationId,
                invitedUserId = targetUser.Value.Id,
                invitedByUserId = actorUserId
            },
            cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "room.invitation.created",
            new
            {
                roomId,
                conversationId = aggregate.Room.ConversationId,
                invitedUserId = targetUser.Value.Id,
                invitedByUserId = actorUserId
            },
            [targetUser.Value.Id, actorUserId],
            cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Invitation sent."));
    }

    public async Task<RoomServiceResult<MessageResponse>> AcceptInvitationAsync(
        Guid userId,
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        var invitation = await dbContext.RoomInvitations.SingleOrDefaultAsync(candidate =>
            candidate.Id == invitationId &&
            candidate.InvitedUserId == userId &&
            candidate.Status == RoomInvitationStatus.Pending, cancellationToken);

        if (invitation is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_invitation_not_found",
                "That pending invitation could not be found.",
                StatusCodes.Status404NotFound);
        }

        var aggregate = await LoadRoomAggregateAsync(invitation.RoomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (aggregate.IsBanned(userId))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_ban_active",
                "You are currently banned from that room.",
                StatusCodes.Status409Conflict);
        }

        if (!aggregate.IsMember(userId))
        {
            dbContext.RoomMembers.Add(new RoomMember
            {
                RoomId = invitation.RoomId,
                UserId = userId,
                JoinedAtUtc = timeProvider.GetUtcNow()
            });
        }

        invitation.Status = RoomInvitationStatus.Accepted;
        invitation.RespondedAtUtc = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationService.AppendRoomActivityAsync(
            aggregate.Room.ConversationId,
            invitation.RoomId,
            "room.member.joined",
            userId,
            new
            {
                roomId = invitation.RoomId,
                conversationId = aggregate.Room.ConversationId,
                userId
            },
            cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "room.invitation.accepted",
            new
            {
                roomId = invitation.RoomId,
                conversationId = aggregate.Room.ConversationId,
                invitedUserId = userId,
                invitedByUserId = invitation.InvitedByUserId
            },
            [userId, invitation.InvitedByUserId],
            cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Invitation accepted."));
    }

    public async Task<RoomServiceResult<MessageResponse>> DeclineInvitationAsync(
        Guid userId,
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        var invitation = await dbContext.RoomInvitations.SingleOrDefaultAsync(candidate =>
            candidate.Id == invitationId &&
            candidate.InvitedUserId == userId &&
            candidate.Status == RoomInvitationStatus.Pending, cancellationToken);

        if (invitation is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_invitation_not_found",
                "That pending invitation could not be found.",
                StatusCodes.Status404NotFound);
        }

        invitation.Status = RoomInvitationStatus.Declined;
        invitation.RespondedAtUtc = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Invitation declined."));
    }

    public async Task<RoomServiceResult<MessageResponse>> GrantAdminAsync(
        Guid actorUserId,
        Guid roomId,
        UpdateRoomAdminRequest request,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (aggregate.Room.OwnerUserId != actorUserId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_owner_required",
                "Only the room owner can manage room admins.",
                StatusCodes.Status403Forbidden);
        }

        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == aggregate.Room.OwnerUserId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_owner_already_admin",
                "The room owner is always an admin.",
                StatusCodes.Status400BadRequest);
        }

        if (!aggregate.IsMember(targetUser.Value.Id))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_membership_not_found",
                "That user must join the room before becoming an admin.",
                StatusCodes.Status404NotFound);
        }

        if (aggregate.Admins.Any(candidate => candidate.UserId == targetUser.Value.Id))
        {
            return RoomServiceResult<MessageResponse>.Success(new MessageResponse("User is already a room admin."));
        }

        dbContext.RoomAdmins.Add(new RoomAdmin
        {
            RoomId = roomId,
            UserId = targetUser.Value.Id,
            GrantedByUserId = actorUserId,
            GrantedAtUtc = timeProvider.GetUtcNow()
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationService.AppendRoomActivityAsync(
            aggregate.Room.ConversationId,
            roomId,
            "room.admin.granted",
            actorUserId,
            new
            {
                roomId,
                conversationId = aggregate.Room.ConversationId,
                userId = targetUser.Value.Id,
                grantedByUserId = actorUserId
            },
            cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Room admin granted."));
    }

    public async Task<RoomServiceResult<MessageResponse>> RevokeAdminAsync(
        Guid actorUserId,
        Guid roomId,
        UpdateRoomAdminRequest request,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (aggregate.Room.OwnerUserId != actorUserId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_owner_required",
                "Only the room owner can manage room admins.",
                StatusCodes.Status403Forbidden);
        }

        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == aggregate.Room.OwnerUserId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_owner_always_admin",
                "The room owner cannot be removed from the admin list.",
                StatusCodes.Status400BadRequest);
        }

        var adminRecord = aggregate.Admins.SingleOrDefault(candidate => candidate.UserId == targetUser.Value.Id);
        if (adminRecord is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_admin_not_found",
                "That user is not currently a room admin.",
                StatusCodes.Status404NotFound);
        }

        dbContext.RoomAdmins.Remove(adminRecord);
        await dbContext.SaveChangesAsync(cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Room admin removed."));
    }

    public async Task<RoomServiceResult<MessageResponse>> RemoveMemberAsync(
        Guid actorUserId,
        Guid roomId,
        RemoveRoomMemberRequest request,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (!aggregate.IsAdmin(actorUserId))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_admin_required",
                "Only room admins can remove members.",
                StatusCodes.Status403Forbidden);
        }

        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        if (targetUser.Value!.Id == aggregate.Room.OwnerUserId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_owner_cannot_be_removed",
                "The room owner cannot be removed from the room.",
                StatusCodes.Status400BadRequest);
        }

        var membership = aggregate.Members.SingleOrDefault(candidate => candidate.UserId == targetUser.Value.Id);
        if (membership is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_membership_not_found",
                "That user is not currently a room member.",
                StatusCodes.Status404NotFound);
        }

        var targetIsAdmin = aggregate.Admins.Any(candidate => candidate.UserId == targetUser.Value.Id);
        if (targetIsAdmin && actorUserId != aggregate.Room.OwnerUserId)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_owner_required",
                "Only the room owner can remove another room admin.",
                StatusCodes.Status403Forbidden);
        }

        dbContext.RoomMembers.Remove(membership);

        var adminRecord = aggregate.Admins.SingleOrDefault(candidate => candidate.UserId == targetUser.Value.Id);
        if (adminRecord is not null)
        {
            dbContext.RoomAdmins.Remove(adminRecord);
        }

        var existingBan = aggregate.Bans.SingleOrDefault(candidate => candidate.UserId == targetUser.Value.Id);
        if (existingBan is null)
        {
            dbContext.RoomBans.Add(new RoomBan
            {
                RoomId = roomId,
                UserId = targetUser.Value.Id,
                BannedByUserId = actorUserId,
                Reason = Truncate(request.Reason, 512),
                CreatedAtUtc = timeProvider.GetUtcNow()
            });
        }
        else
        {
            existingBan.BannedByUserId = actorUserId;
            existingBan.Reason = Truncate(request.Reason, 512) ?? existingBan.Reason;
            existingBan.CreatedAtUtc = timeProvider.GetUtcNow();
        }

        foreach (var pendingInvitation in aggregate.PendingInvitations
                     .Where(candidate => candidate.InvitedUserId == targetUser.Value.Id && candidate.Status == RoomInvitationStatus.Pending))
        {
            pendingInvitation.Status = RoomInvitationStatus.Revoked;
            pendingInvitation.RespondedAtUtc = timeProvider.GetUtcNow();
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationService.AppendRoomActivityAsync(
            aggregate.Room.ConversationId,
            roomId,
            "room.member.removed",
            actorUserId,
            new
            {
                roomId,
                conversationId = aggregate.Room.ConversationId,
                userId = targetUser.Value.Id,
                removedByUserId = actorUserId
            },
            cancellationToken);
        await realtimeNotifier.NotifyUsersAsync(
            "room.member.removed",
            new
            {
                roomId,
                conversationId = aggregate.Room.ConversationId,
                userId = targetUser.Value.Id,
                removedByUserId = actorUserId
            },
            [targetUser.Value.Id],
            cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Member removed and room ban applied."));
    }

    public async Task<RoomServiceResult<MessageResponse>> UnbanMemberAsync(
        Guid actorUserId,
        Guid roomId,
        RemoveRoomBanRequest request,
        CancellationToken cancellationToken)
    {
        var aggregate = await LoadRoomAggregateAsync(roomId, cancellationToken);
        if (aggregate is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_not_found",
                "That room could not be found.",
                StatusCodes.Status404NotFound);
        }

        if (!aggregate.IsAdmin(actorUserId))
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_admin_required",
                "Only room admins can remove room bans.",
                StatusCodes.Status403Forbidden);
        }

        var targetUser = await ResolveTargetUserAsync(request.TargetUserName, cancellationToken);
        if (!targetUser.Succeeded)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                targetUser.Error!.Code,
                targetUser.Error.Message,
                targetUser.Error.StatusCode);
        }

        var ban = aggregate.Bans.SingleOrDefault(candidate => candidate.UserId == targetUser.Value!.Id);
        if (ban is null)
        {
            return RoomServiceResult<MessageResponse>.Failure(
                "room_ban_not_found",
                "That user is not currently banned from the room.",
                StatusCodes.Status404NotFound);
        }

        dbContext.RoomBans.Remove(ban);
        await dbContext.SaveChangesAsync(cancellationToken);

        return RoomServiceResult<MessageResponse>.Success(new MessageResponse("Room ban removed."));
    }

    private async Task<RoomAggregate?> LoadRoomAggregateAsync(Guid roomId, CancellationToken cancellationToken)
    {
        var room = await dbContext.Rooms.SingleOrDefaultAsync(candidate => candidate.Id == roomId, cancellationToken);
        if (room is null)
        {
            return null;
        }

        var members = await dbContext.RoomMembers.Where(candidate => candidate.RoomId == roomId).ToListAsync(cancellationToken);
        var admins = await dbContext.RoomAdmins.Where(candidate => candidate.RoomId == roomId).ToListAsync(cancellationToken);
        var pendingInvitations = await dbContext.RoomInvitations.Where(candidate => candidate.RoomId == roomId).ToListAsync(cancellationToken);
        var bans = await dbContext.RoomBans.Where(candidate => candidate.RoomId == roomId).ToListAsync(cancellationToken);

        return new RoomAggregate(room, members, admins, pendingInvitations, bans);
    }

    private async Task<RoomServiceResult<UserLookup>> ResolveTargetUserAsync(string targetUserName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(targetUserName))
        {
            return RoomServiceResult<UserLookup>.Failure(
                "invalid_target_username",
                "A target username is required.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedTargetUserName = Normalize(targetUserName);
        var targetUser = await dbContext.UserAccounts
            .Where(candidate => candidate.NormalizedUserName == normalizedTargetUserName)
            .Select(candidate => new UserLookup(candidate.Id, candidate.UserName))
            .SingleOrDefaultAsync(cancellationToken);

        if (targetUser is null)
        {
            return RoomServiceResult<UserLookup>.Failure(
                "target_user_not_found",
                "No user account was found for that username.",
                StatusCodes.Status404NotFound);
        }

        return RoomServiceResult<UserLookup>.Success(targetUser);
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
            .Select(candidate => new UserLookup(candidate.Id, candidate.UserName))
            .ToDictionaryAsync(candidate => candidate.Id, cancellationToken);
    }

    private static RoomListItemResponse MapRoom(
        Room room,
        Guid currentUserId,
        IReadOnlyDictionary<Guid, int> memberCountLookup,
        IReadOnlySet<Guid> currentUserRoomIds,
        IReadOnlySet<Guid> currentUserAdminRoomIds,
        IReadOnlySet<Guid> bannedRoomIds)
    {
        var isOwner = room.OwnerUserId == currentUserId;
        var isMember = isOwner || currentUserRoomIds.Contains(room.Id);
        var isAdmin = isOwner || currentUserAdminRoomIds.Contains(room.Id);

        return new RoomListItemResponse(
            room.Id,
            room.ConversationId,
            room.Name,
            room.Description,
            room.Visibility == RoomVisibility.Private,
            isOwner,
            isAdmin,
            isMember,
            memberCountLookup.TryGetValue(room.Id, out var memberCount) ? memberCount : 0,
            bannedRoomIds.Contains(room.Id));
    }

    private static RoomInvitationResponse MapInvitation(
        RoomInvitation invitation,
        IReadOnlyDictionary<Guid, Room> roomLookup,
        IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        var room = roomLookup[invitation.RoomId];

        return new RoomInvitationResponse(
            invitation.Id,
            invitation.RoomId,
            room.Name,
            invitation.InvitedUserId,
            ResolveUserName(invitation.InvitedUserId, userLookup),
            invitation.InvitedByUserId,
            ResolveUserName(invitation.InvitedByUserId, userLookup),
            MapInvitationStatus(invitation.Status),
            invitation.CreatedAtUtc,
            invitation.RespondedAtUtc);
    }

    private static string Normalize(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static string? NormalizeSearch(string? search)
    {
        return string.IsNullOrWhiteSpace(search) ? null : Normalize(search);
    }

    private static bool MatchesSearch(Room room, string normalizedSearch)
    {
        return room.NormalizedName.Contains(normalizedSearch, StringComparison.Ordinal) ||
               Normalize(room.Description ?? string.Empty).Contains(normalizedSearch, StringComparison.Ordinal);
    }

    private static string ResolveUserName(Guid userId, IReadOnlyDictionary<Guid, UserLookup> userLookup)
    {
        return userLookup.TryGetValue(userId, out var user) ? user.UserName : "Unknown user";
    }

    private static string? ValidateRoomName(string roomName)
    {
        if (string.IsNullOrWhiteSpace(roomName))
        {
            return "Room name is required.";
        }

        var trimmed = roomName.Trim();
        if (trimmed.Length < 3 || trimmed.Length > 64)
        {
            return "Room name must be between 3 and 64 characters long.";
        }

        if (!RoomNamePattern().IsMatch(trimmed))
        {
            return "Room name may only contain letters, numbers, spaces, hyphens, and underscores.";
        }

        return null;
    }

    private static string MapInvitationStatus(RoomInvitationStatus status)
    {
        return status switch
        {
            RoomInvitationStatus.Accepted => "accepted",
            RoomInvitationStatus.Declined => "declined",
            RoomInvitationStatus.Revoked => "revoked",
            _ => "pending"
        };
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= maxLength ? value.Trim() : value.Trim()[..maxLength];
    }

    [GeneratedRegex("^[A-Za-z0-9 _-]+$", RegexOptions.Compiled)]
    private static partial Regex RoomNamePattern();

    private sealed record UserLookup(Guid Id, string UserName);

    private sealed class RoomAggregate(
        Room room,
        List<RoomMember> members,
        List<RoomAdmin> admins,
        List<RoomInvitation> pendingInvitations,
        List<RoomBan> bans)
    {
        public Room Room { get; } = room;

        public List<RoomMember> Members { get; } = members;

        public List<RoomAdmin> Admins { get; } = admins;

        public List<RoomInvitation> PendingInvitations { get; } = pendingInvitations;

        public List<RoomBan> Bans { get; } = bans;

        public bool IsMember(Guid userId)
        {
            return Room.OwnerUserId == userId || Members.Any(candidate => candidate.UserId == userId);
        }

        public bool IsAdmin(Guid userId)
        {
            return Room.OwnerUserId == userId || Admins.Any(candidate => candidate.UserId == userId);
        }

        public bool IsBanned(Guid userId)
        {
            return Bans.Any(candidate => candidate.UserId == userId);
        }
    }
}
