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
