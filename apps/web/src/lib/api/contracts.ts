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
