import type {
  DirectConversationSummaryResponse,
  RealtimeEnvelope,
  RoomDirectoryResponse,
  RoomListItemResponse,
} from "../../lib/api/contracts";

export type SelectedConversation =
  | {
      kind: "room";
      conversationId: string;
      roomId: string;
      title: string;
      subtitle: string;
      accessMode: "read_write";
      room: RoomListItemResponse;
    }
  | {
      kind: "direct";
      conversationId: string;
      targetUserId: string;
      title: string;
      subtitle: string;
      accessMode: "read_write" | "read_only";
      direct: DirectConversationSummaryResponse;
    };

export function resolveConversationSelection(
  roomDirectory: RoomDirectoryResponse | null,
  directConversations: DirectConversationSummaryResponse[],
  conversationId: string | null,
) {
  if (!roomDirectory || !conversationId) {
    return null;
  }

  const matchingRoom =
    roomDirectory.myRooms.find((room) => room.conversationId === conversationId) ??
    roomDirectory.publicCatalog.find((room) => room.conversationId === conversationId && room.isMember);

  if (matchingRoom) {
    return toRoomSelection(matchingRoom);
  }

  const matchingDirect = directConversations.find((conversation) => conversation.conversationId === conversationId);
  if (matchingDirect) {
    return toDirectSelection(matchingDirect);
  }

  return null;
}

export function pickDefaultConversationId(
  roomDirectory: RoomDirectoryResponse | null,
  directConversations: DirectConversationSummaryResponse[],
) {
  if (!roomDirectory) {
    return null;
  }

  const unreadDirect = sortDirectConversations(directConversations.filter((conversation) => conversation.unreadCount > 0))[0];
  if (unreadDirect) {
    return unreadDirect.conversationId;
  }

  const unreadRoom = sortRooms(roomDirectory.myRooms.filter((room) => room.unreadCount > 0))[0];
  if (unreadRoom) {
    return unreadRoom.conversationId;
  }

  const nextDirect = sortDirectConversations(directConversations)[0];
  if (nextDirect) {
    return nextDirect.conversationId;
  }

  const nextRoom = sortRooms(roomDirectory.myRooms)[0];
  return nextRoom?.conversationId ?? null;
}

export function shouldRefreshNavigationForEvent(event: RealtimeEnvelope, selectedConversationId: string | null) {
  if (event.scope === "user") {
    return true;
  }

  return event.scope === "conversation" && Boolean(event.conversationId) && event.conversationId !== selectedConversationId;
}

export function sortRooms(rooms: RoomListItemResponse[]) {
  return [...rooms].sort((left, right) => {
    if (right.unreadCount !== left.unreadCount) {
      return right.unreadCount - left.unreadCount;
    }

    const rightActivity = Date.parse(right.lastMessageAtUtc ?? "") || 0;
    const leftActivity = Date.parse(left.lastMessageAtUtc ?? "") || 0;
    if (rightActivity !== leftActivity) {
      return rightActivity - leftActivity;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function sortDirectConversations(directConversations: DirectConversationSummaryResponse[]) {
  return [...directConversations].sort((left, right) => {
    if (right.unreadCount !== left.unreadCount) {
      return right.unreadCount - left.unreadCount;
    }

    const rightActivity = Date.parse(right.lastMessageAtUtc ?? "") || 0;
    const leftActivity = Date.parse(left.lastMessageAtUtc ?? "") || 0;
    if (rightActivity !== leftActivity) {
      return rightActivity - leftActivity;
    }

    return left.targetUserName.localeCompare(right.targetUserName, undefined, { sensitivity: "base" });
  });
}

export function toRoomSelection(room: RoomListItemResponse): SelectedConversation {
  return {
    kind: "room",
    conversationId: room.conversationId,
    roomId: room.id,
    title: room.name,
    subtitle:
      room.lastMessagePreview ??
      room.description ??
      `${room.memberCount} members in this ${room.isPrivate ? "private" : "public"} room.`,
    accessMode: "read_write",
    room,
  };
}

export function toDirectSelection(direct: DirectConversationSummaryResponse): SelectedConversation {
  const accessMode = direct.accessMode === "read_only" ? "read_only" : "read_write";

  return {
    kind: "direct",
    conversationId: direct.conversationId,
    targetUserId: direct.targetUserId,
    title: direct.targetUserName,
    subtitle:
      accessMode === "read_only"
        ? "History is visible, but new direct messages are frozen by policy."
        : direct.lastMessagePreview ?? "Direct messaging is available because friendship is confirmed.",
    accessMode,
    direct,
  };
}
