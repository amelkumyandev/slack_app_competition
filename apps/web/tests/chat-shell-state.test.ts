import assert from "node:assert/strict";
import type { RealtimeEnvelope, RoomDirectoryResponse } from "../src/lib/api/contracts.ts";
import {
  pickDefaultConversationId,
  resolveConversationSelection,
  shouldRefreshNavigationForEvent,
  sortDirectConversations,
  sortRooms,
} from "../src/features/chat/shell-state.ts";

const roomDirectory: RoomDirectoryResponse = {
  myRooms: [
    {
      id: "room-alpha",
      conversationId: "conversation-room-alpha",
      name: "Alpha",
      description: "Daily standup",
      isPrivate: false,
      isOwner: false,
      isAdmin: false,
      isMember: true,
      memberCount: 9,
      latestWatermark: 14,
      lastReadWatermark: 10,
      unreadCount: 4,
      lastMessagePreview: "Standup notes",
      lastMessageAtUtc: "2026-04-20T08:00:00.000Z",
      isBanned: false,
    },
    {
      id: "room-beta",
      conversationId: "conversation-room-beta",
      name: "Beta",
      description: null,
      isPrivate: true,
      isOwner: true,
      isAdmin: true,
      isMember: true,
      memberCount: 3,
      latestWatermark: 4,
      lastReadWatermark: 4,
      unreadCount: 0,
      lastMessagePreview: "Ready for launch",
      lastMessageAtUtc: "2026-04-19T12:00:00.000Z",
      isBanned: false,
    },
  ],
  publicCatalog: [],
  pendingInvitations: [],
};

const directs = [
  {
    conversationId: "conversation-direct-zeta",
    targetUserId: "user-zeta",
    targetUserName: "zeta",
    accessMode: "read_write" as const,
    latestWatermark: 8,
    lastReadWatermark: 8,
    unreadCount: 0,
    messageCount: 5,
    lastMessagePreview: "See you tomorrow",
    lastMessageAtUtc: "2026-04-18T10:00:00.000Z",
  },
  {
    conversationId: "conversation-direct-echo",
    targetUserId: "user-echo",
    targetUserName: "echo",
    accessMode: "read_only" as const,
    latestWatermark: 12,
    lastReadWatermark: 10,
    unreadCount: 2,
    messageCount: 7,
    lastMessagePreview: "Policy lock",
    lastMessageAtUtc: "2026-04-20T09:00:00.000Z",
  },
];

function run() {
  assert.equal(pickDefaultConversationId(roomDirectory, directs), "conversation-direct-echo");

  const selection = resolveConversationSelection(roomDirectory, directs, "conversation-room-alpha");
  assert.ok(selection);
  assert.equal(selection.kind, "room");
  assert.equal(selection.room.name, "Alpha");
  assert.equal(selection.subtitle, "Standup notes");

  assert.deepEqual(
    sortRooms(roomDirectory.myRooms).map((room) => room.id),
    ["room-alpha", "room-beta"],
  );

  assert.deepEqual(
    sortDirectConversations(directs).map((conversation) => conversation.conversationId),
    ["conversation-direct-echo", "conversation-direct-zeta"],
  );

  const userEvent: RealtimeEnvelope = {
    eventType: "contact.friend-request.created",
    scope: "user",
    target: "user:123",
    serverTimeUtc: "2026-04-20T09:05:00.000Z",
    payload: {},
  };

  const otherConversationEvent: RealtimeEnvelope = {
    eventType: "room.member.joined",
    scope: "conversation",
    target: "conversation:conversation-room-alpha",
    conversationId: "conversation-room-alpha",
    watermark: 15,
    serverTimeUtc: "2026-04-20T09:05:00.000Z",
    payload: {},
  };

  const activeConversationEvent: RealtimeEnvelope = {
    ...otherConversationEvent,
    conversationId: "conversation-direct-echo",
    target: "conversation:conversation-direct-echo",
  };

  assert.equal(shouldRefreshNavigationForEvent(userEvent, "conversation-direct-echo"), true);
  assert.equal(shouldRefreshNavigationForEvent(otherConversationEvent, "conversation-direct-echo"), true);
  assert.equal(shouldRefreshNavigationForEvent(activeConversationEvent, "conversation-direct-echo"), false);

  console.log("chat-shell-state tests passed");
}

run();
