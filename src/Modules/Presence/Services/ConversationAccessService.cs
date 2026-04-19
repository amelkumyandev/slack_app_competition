using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Infrastructure;
using SlackApp.Modules.Presence.Contracts;

namespace SlackApp.Modules.Presence.Services;

public sealed class ConversationAccessService(IdentityDbContext dbContext)
{
    public bool TryBuildConversationGroup(string conversationKey, out string normalizedConversationKey, out string groupName)
    {
        normalizedConversationKey = string.Empty;
        groupName = string.Empty;

        if (string.IsNullOrWhiteSpace(conversationKey))
        {
            return false;
        }

        var trimmedKey = conversationKey.Trim();
        if (!trimmedKey.StartsWith("room:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var roomIdText = trimmedKey["room:".Length..];
        if (!Guid.TryParse(roomIdText, out var roomId))
        {
            return false;
        }

        normalizedConversationKey = RealtimeGroups.RoomConversation(roomId);
        groupName = RealtimeGroups.Conversation(normalizedConversationKey);
        return true;
    }

    public async Task<ConversationAccessDecision> AuthorizeSubscriptionAsync(
        Guid userId,
        string conversationKey,
        CancellationToken cancellationToken)
    {
        if (!TryBuildConversationGroup(conversationKey, out var normalizedConversationKey, out var groupName))
        {
            return new ConversationAccessDecision(false, "invalid_conversation_key", "Only room conversation keys are supported right now.", string.Empty, string.Empty);
        }

        var roomId = Guid.Parse(normalizedConversationKey["room:".Length..]);
        var room = await dbContext.Rooms.SingleOrDefaultAsync(candidate => candidate.Id == roomId, cancellationToken);
        if (room is null)
        {
            return new ConversationAccessDecision(false, "conversation_not_found", "That room conversation could not be found.", normalizedConversationKey, groupName);
        }

        if (room.OwnerUserId == userId)
        {
            return new ConversationAccessDecision(true, "allowed", "Subscription allowed.", normalizedConversationKey, groupName);
        }

        var isMember = await dbContext.RoomMembers.AnyAsync(candidate => candidate.RoomId == roomId && candidate.UserId == userId, cancellationToken);
        if (!isMember)
        {
            return new ConversationAccessDecision(false, "conversation_access_denied", "Only room members can subscribe to that conversation.", normalizedConversationKey, groupName);
        }

        return new ConversationAccessDecision(true, "allowed", "Subscription allowed.", normalizedConversationKey, groupName);
    }
}

public sealed record ConversationAccessDecision(
    bool Allowed,
    string Code,
    string Message,
    string NormalizedConversationKey,
    string GroupName);
