export type CurrentUserResponse = {
  id: string;
  email: string;
  userName: string;
  sessionId: string;
  rememberMe: boolean;
  sessionExpiresAtUtc: string;
};

export type AuthResponse = {
  user: CurrentUserResponse;
};

export type MessageResponse = {
  message: string;
};

export type UserSessionResponse = {
  id: string;
  isCurrent: boolean;
  canRevoke: boolean;
  state: "active" | "revoked" | "expired";
  rememberMe: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAtUtc: string;
  lastSeenAtUtc: string;
  expiresAtUtc: string;
  revokedAtUtc: string | null;
};

export type UserSessionsResponse = {
  sessions: UserSessionResponse[];
};

export type SessionRevocationResponse = {
  message: string;
  sessionId: string;
};

export type PresenceTabResponse = {
  tabId: string;
  visibilityState: string;
  connectedAtUtc: string;
  lastInteractionAtUtc: string;
  lastHeartbeatAtUtc: string;
};

export type PresenceSnapshotResponse = {
  userId: string;
  state: "online" | "afk" | "offline";
  liveTabCount: number;
  lastInteractionAtUtc: string | null;
  lastHeartbeatAtUtc: string | null;
  serverTimeUtc: string;
  tabs: PresenceTabResponse[];
};

export type CurrentPresenceResponse = {
  presence: PresenceSnapshotResponse;
  heartbeatIntervalSeconds: number;
  heartbeatTtlSeconds: number;
  afkThresholdSeconds: number;
  store: string;
};

export type PresenceHeartbeatRequest = {
  tabId: string;
  lastInteractionAtUtc: string;
  visibilityState: string;
  connectedAtUtc: string;
};

export type PresenceHeartbeatAcceptedResponse = {
  tabId: string;
  heartbeatIntervalSeconds: number;
  heartbeatTtlSeconds: number;
  afkThresholdSeconds: number;
  presence: PresenceSnapshotResponse;
};

export type RealtimeEnvelope = {
  eventType: string;
  scope: string;
  target: string;
  conversationId?: string | null;
  watermark?: number | null;
  serverTimeUtc: string;
  payload: unknown;
};

export type RealtimeContractResponse = {
  hubPath: string;
  supportedConversationPrefix: string;
  userGroupPattern: string;
  conversationGroupPattern: string;
  clientEvents: string[];
  hubMethods: string[];
  syncMode: string;
  presence: {
    store: string;
    heartbeatIntervalSeconds: number;
    heartbeatTtlSeconds: number;
    afkThresholdSeconds: number;
  };
};

export type RoomListItemResponse = {
  id: string;
  conversationId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  memberCount: number;
  latestWatermark: number;
  lastReadWatermark: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAtUtc: string | null;
  isBanned: boolean;
};

export type RoomInvitationResponse = {
  id: string;
  roomId: string;
  roomName: string;
  invitedUserId: string;
  invitedUserName: string;
  invitedByUserId: string;
  invitedByUserName: string;
  status: string;
  createdAtUtc: string;
  respondedAtUtc: string | null;
};

export type RoomMemberResponse = {
  userId: string;
  userName: string;
  joinedAtUtc: string;
  isOwner: boolean;
  isAdmin: boolean;
};

export type RoomAdminResponse = {
  userId: string;
  userName: string;
  grantedAtUtc: string;
  isOwner: boolean;
};

export type RoomBanResponse = {
  userId: string;
  userName: string;
  bannedByUserId: string;
  bannedByUserName: string;
  reason: string | null;
  createdAtUtc: string;
};

export type RoomPermissionsResponse = {
  canJoin: boolean;
  canInvite: boolean;
  canManageAdmins: boolean;
  canRemoveMembers: boolean;
  canUnbanMembers: boolean;
  canLeave: boolean;
  isBanned: boolean;
};

export type RoomDirectoryResponse = {
  myRooms: RoomListItemResponse[];
  publicCatalog: RoomListItemResponse[];
  pendingInvitations: RoomInvitationResponse[];
};

export type RoomDetailsResponse = {
  room: RoomListItemResponse;
  members: RoomMemberResponse[];
  admins: RoomAdminResponse[];
  pendingInvitations: RoomInvitationResponse[];
  bans: RoomBanResponse[];
  permissions: RoomPermissionsResponse;
};

export type InviteToRoomRequest = {
  targetUserName: string;
};

export type UpdateRoomAdminRequest = {
  targetUserName: string;
};

export type RemoveRoomMemberRequest = {
  targetUserName: string;
  reason?: string | null;
};

export type RemoveRoomBanRequest = {
  targetUserName: string;
};

export type FriendshipContactResponse = {
  userId: string;
  userName: string;
  createdAtUtc: string;
};

export type FriendRequestContactResponse = {
  id: string;
  requesterUserId: string;
  requesterUserName: string;
  addresseeUserId: string;
  addresseeUserName: string;
  status: string;
  sourceRoomId: string | null;
  requestedAtUtc: string;
  respondedAtUtc: string | null;
};

export type UserBanContactResponse = {
  userId: string;
  userName: string;
  reason: string | null;
  createdAtUtc: string;
};

export type ContactSummaryResponse = {
  friends: FriendshipContactResponse[];
  incomingFriendRequests: FriendRequestContactResponse[];
  outgoingFriendRequests: FriendRequestContactResponse[];
  bansIssued: UserBanContactResponse[];
  bansReceived: UserBanContactResponse[];
};

export type ReplyPreviewResponse = {
  messageId: string;
  authorUserId: string;
  authorUserName: string;
  text: string | null;
  isDeleted: boolean;
};

export type MessageAttachmentResponse = {
  id: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  uploadedByUserId: string;
  createdAtUtc: string;
  downloadPath: string;
};

export type ChatMessageResponse = {
  messageId: string;
  conversationId: string;
  createdWatermark: number;
  latestWatermark: number;
  authorUserId: string;
  authorUserName: string;
  text: string | null;
  replyToMessageId: string | null;
  replyPreview: ReplyPreviewResponse | null;
  createdAtUtc: string;
  editedAtUtc: string | null;
  deletedAtUtc: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  canEdit: boolean;
  canDelete: boolean;
  attachments: MessageAttachmentResponse[];
};

export type ConversationTimelineResponse = {
  conversationId: string;
  latestWatermark: number;
  pageSize: number;
  nextCursor: number | null;
  messages: ChatMessageResponse[];
};

export type ConversationEventResponse = {
  id: string;
  conversationId: string;
  watermark: number;
  eventType: string;
  actorUserId: string | null;
  messageId: string | null;
  replyToMessageId: string | null;
  textContent: string | null;
  payload: unknown;
  createdAtUtc: string;
};

export type ConversationSyncResponse = {
  conversationId: string;
  afterWatermark: number;
  latestWatermark: number;
  requiresFullRefresh: boolean;
  missingMessages: ConversationEventResponse[];
};

export type UpdateConversationReadStateRequest = {
  watermark: number | null;
};

export type ConversationReadStateResponse = {
  conversationId: string;
  lastReadWatermark: number;
  unreadCount: number;
};

export type DirectConversationSummaryResponse = {
  conversationId: string;
  targetUserId: string;
  targetUserName: string;
  accessMode: "read_only" | "read_write" | "none";
  latestWatermark: number;
  lastReadWatermark: number;
  unreadCount: number;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageAtUtc: string | null;
};

export type DirectConversationListResponse = {
  conversations: DirectConversationSummaryResponse[];
};
