"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  type AuthResponse,
  type CurrentUserResponse,
  type MessageResponse,
  type SessionRevocationResponse,
  type UserSessionResponse,
  type UserSessionsResponse,
} from "@/lib/api/contracts";
import { ApiClientError, apiBaseUrl, apiRequest } from "@/lib/api/client";

type WorkspaceStatus = "loading" | "ready" | "auth" | "error";
type AuthMode = "login" | "register";

const defaultLoginDraft = {
  emailOrUserName: "",
  password: "",
  rememberMe: true,
};

const defaultRegisterDraft = {
  email: "",
  userName: "",
  password: "",
  rememberMe: true,
};

export function SessionsWorkspace() {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [sessions, setSessions] = useState<UserSessionResponse[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginDraft, setLoginDraft] = useState(defaultLoginDraft);
  const [registerDraft, setRegisterDraft] = useState(defaultRegisterDraft);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace(true);
  }, []);

  async function loadWorkspace(showLoading: boolean) {
    if (showLoading) {
      setWorkspaceStatus("loading");
    } else {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const me = await apiRequest<CurrentUserResponse>("/api/auth/me");
      const sessionPayload = await apiRequest<UserSessionsResponse>("/api/sessions");

      setCurrentUser(me);
      setSessions(sessionPayload.sessions);
      setWorkspaceStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        setCurrentUser(null);
        setSessions([]);
        setWorkspaceStatus("auth");
        return;
      }

      setWorkspaceStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't load the session inventory right now."));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      if (authMode === "login") {
        await apiRequest<AuthResponse>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(loginDraft),
        });

        setLoginDraft((current) => ({
          ...current,
          password: "",
        }));
        setNotice("Signed in. Session inventory is now up to date.");
      } else {
        await apiRequest<AuthResponse>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(registerDraft),
        });

        setRegisterDraft((current) => ({
          ...current,
          password: "",
        }));
        setNotice("Account created. This browser is now the current session.");
      }

      await loadWorkspace(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Authentication did not complete."));
      setWorkspaceStatus("auth");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      const response = await apiRequest<MessageResponse>("/api/auth/logout", {
        method: "POST",
      });

      setNotice(response.message);
      setCurrentUser(null);
      setSessions([]);
      setWorkspaceStatus("auth");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Sign-out could not be completed."));
    } finally {
      setSigningOut(false);
    }
  }

  async function handleRevoke(session: UserSessionResponse) {
    if (
      !window.confirm(
        `Revoke access for ${describeSession(session)}? The browser will be signed out on its next request.`,
      )
    ) {
      return;
    }

    setRevokeTargetId(session.id);
    setNotice(null);
    setErrorMessage(null);

    try {
      const response = await apiRequest<SessionRevocationResponse>(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });

      setNotice(response.message);
      await loadWorkspace(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That session could not be revoked."));
    } finally {
      setRevokeTargetId(null);
    }
  }

  const currentSession = sessions.find((session) => session.isCurrent) ?? null;
  const otherSessions = sessions.filter((session) => !session.isCurrent);

  return (
    <main className="sessions-page">
      <div className="sessions-shell">
        <section className="sessions-hero">
          <div>
            <span className="eyebrow">F04 Session Management</span>
            <h1>Review active browsers and revoke access selectively.</h1>
            <p>
              This screen is the first user-facing slice that exercises the persisted{" "}
              <code>user_sessions</code> model. It stays intentionally focused while the broader
              Slack-like shell lands in later branches.
            </p>
          </div>

          <div className="sessions-actions">
            <button
              className="secondary-button"
              onClick={() => void loadWorkspace(false)}
              disabled={workspaceStatus === "loading" || refreshing || authSubmitting || signingOut}
              type="button"
            >
              {refreshing ? "Refreshing..." : "Refresh sessions"}
            </button>
            <Link className="ghost-link" href="/">
              Back to overview
            </Link>
          </div>
        </section>

        <section className="status-strip">
          <div className="status-pill">
            <span className="status-label">API base URL</span>
            <strong>{apiBaseUrl}</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Session mode</span>
            <strong>Cookie-backed with selective revoke</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Current state</span>
            <strong>{labelForWorkspaceStatus(workspaceStatus)}</strong>
          </div>
        </section>

        {notice ? <div className="feedback-banner success-banner">{notice}</div> : null}
        {errorMessage ? <div className="feedback-banner error-banner">{errorMessage}</div> : null}

        {workspaceStatus === "loading" ? (
          <section className="sessions-grid">
            <article className="session-panel panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </article>
            <article className="session-panel panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </article>
          </section>
        ) : null}

        {workspaceStatus === "auth" ? (
          <section className="sessions-grid">
            <article className="session-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Access required</span>
                  <h2>Sign in to inspect your stored sessions</h2>
                </div>
              </div>
              <p className="panel-copy">
                Dedicated auth screens land in a later branch, but this workspace lets us exercise
                session persistence right now. You can sign in with an existing account or create a
                fresh one here.
              </p>

              <div className="toggle-row" role="tablist" aria-label="Authentication mode">
                <button
                  className={authMode === "login" ? "toggle-button active" : "toggle-button"}
                  onClick={() => setAuthMode("login")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className={authMode === "register" ? "toggle-button active" : "toggle-button"}
                  onClick={() => setAuthMode("register")}
                  type="button"
                >
                  Create account
                </button>
              </div>

              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {authMode === "login" ? (
                  <>
                    <label className="field">
                      <span>Email or username</span>
                      <input
                        autoComplete="username"
                        onChange={(event) =>
                          setLoginDraft((current) => ({
                            ...current,
                            emailOrUserName: event.target.value,
                          }))
                        }
                        required
                        type="text"
                        value={loginDraft.emailOrUserName}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        autoComplete="current-password"
                        onChange={(event) =>
                          setLoginDraft((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        required
                        type="password"
                        value={loginDraft.password}
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        checked={loginDraft.rememberMe}
                        onChange={(event) =>
                          setLoginDraft((current) => ({
                            ...current,
                            rememberMe: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>Keep this browser signed in</span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>Email</span>
                      <input
                        autoComplete="email"
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        required
                        type="email"
                        value={registerDraft.email}
                      />
                    </label>
                    <label className="field">
                      <span>Username</span>
                      <input
                        autoComplete="username"
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            userName: event.target.value,
                          }))
                        }
                        required
                        type="text"
                        value={registerDraft.userName}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        autoComplete="new-password"
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        required
                        type="password"
                        value={registerDraft.password}
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        checked={registerDraft.rememberMe}
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            rememberMe: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>Create a persistent session for this browser</span>
                    </label>
                  </>
                )}

                <button className="primary-button" disabled={authSubmitting} type="submit">
                  {authSubmitting
                    ? authMode === "login"
                      ? "Signing in..."
                      : "Creating account..."
                    : authMode === "login"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
            </article>

            <article className="session-panel side-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Feature notes</span>
                  <h2>What this branch is proving</h2>
                </div>
              </div>

              <ul className="fact-list">
                <li>Each browser session is stored in PostgreSQL and surfaced through REST.</li>
                <li>Current-session logout stays separate from selective session revocation.</li>
                <li>Revoked sessions are rejected by cookie validation on the next request.</li>
              </ul>
            </article>
          </section>
        ) : null}

        {workspaceStatus === "ready" ? (
          <section className="sessions-grid">
            <article className="session-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Current account</span>
                  <h2>{currentUser?.userName}</h2>
                </div>
                <button
                  className="secondary-button"
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                  type="button"
                >
                  {signingOut ? "Signing out..." : "Sign out current session"}
                </button>
              </div>

              <div className="account-summary">
                <div>
                  <span>Email</span>
                  <strong>{currentUser?.email}</strong>
                </div>
                <div>
                  <span>Persistent login</span>
                  <strong>{currentUser?.rememberMe ? "Enabled" : "Session-only"}</strong>
                </div>
                <div>
                  <span>Session expires</span>
                  <strong>{currentUser ? formatDateTime(currentUser.sessionExpiresAtUtc) : "n/a"}</strong>
                </div>
              </div>

              {currentSession ? <SessionCard session={currentSession} onRevoke={handleRevoke} revokeTargetId={revokeTargetId} /> : null}
            </article>

            <article className="session-panel side-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Stored sessions</span>
                  <h2>Other browsers and historical access</h2>
                </div>
                <span className="counter-pill">{sessions.length} total</span>
              </div>

              {otherSessions.length === 0 ? (
                <div className="empty-state">
                  <strong>No additional sessions yet.</strong>
                  <p>
                    This account currently only has the browser you are using now. Sign in from
                    another browser or profile to exercise selective revoke.
                  </p>
                </div>
              ) : (
                <div className="session-list">
                  {otherSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onRevoke={handleRevoke}
                      revokeTargetId={revokeTargetId}
                    />
                  ))}
                </div>
              )}
            </article>
          </section>
        ) : null}

        {workspaceStatus === "error" ? (
          <section className="sessions-grid">
            <article className="session-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Recoverable error</span>
                  <h2>We hit a problem loading the session workspace</h2>
                </div>
              </div>
              <p className="panel-copy">
                The feature branch keeps this screen explicit about failure states. You can retry
                without a page reload, and later branches will use the same pattern for realtime
                reconnects and sync repair.
              </p>
              <button className="primary-button" onClick={() => void loadWorkspace(true)} type="button">
                Retry loading sessions
              </button>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}

type SessionCardProps = {
  session: UserSessionResponse;
  revokeTargetId: string | null;
  onRevoke: (session: UserSessionResponse) => Promise<void>;
};

function SessionCard({ session, revokeTargetId, onRevoke }: SessionCardProps) {
  const summary = describeSession(session);
  const revoking = revokeTargetId === session.id;

  return (
    <article className="session-card">
      <div className="session-card-header">
        <div>
          <div className="session-title-row">
            <strong>{summary}</strong>
            <div className="session-badges">
              {session.isCurrent ? <span className="chip chip-accent">Current session</span> : null}
              <span className={`chip chip-${session.state}`}>{labelForSessionState(session.state)}</span>
              {session.rememberMe ? <span className="chip chip-muted">Persistent</span> : null}
            </div>
          </div>
          <p className="session-meta">{session.userAgent ?? "No user agent was captured for this session."}</p>
        </div>

        <button
          className="danger-button"
          disabled={!session.canRevoke || revoking}
          onClick={() => void onRevoke(session)}
          type="button"
        >
          {revoking ? "Revoking..." : session.canRevoke ? "Revoke" : session.isCurrent ? "Use sign out" : "Read-only"}
        </button>
      </div>

      <dl className="session-details">
        <div>
          <dt>IP address</dt>
          <dd>{session.ipAddress ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(session.createdAtUtc)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{formatDateTime(session.lastSeenAtUtc)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{formatDateTime(session.expiresAtUtc)}</dd>
        </div>
        <div>
          <dt>Revoked</dt>
          <dd>{session.revokedAtUtc ? formatDateTime(session.revokedAtUtc) : "Not revoked"}</dd>
        </div>
      </dl>
    </article>
  );
}

function describeSession(session: UserSessionResponse) {
  const browser = detectBrowser(session.userAgent);
  const operatingSystem = detectOperatingSystem(session.userAgent);

  return operatingSystem ? `${browser} on ${operatingSystem}` : browser;
}

function detectBrowser(userAgent: string | null) {
  if (!userAgent) {
    return "Unknown browser";
  }

  const normalized = userAgent.toLowerCase();

  if (normalized.includes("edg/")) {
    return "Microsoft Edge";
  }

  if (normalized.includes("firefox/")) {
    return "Firefox";
  }

  if (normalized.includes("chrome/") && !normalized.includes("edg/")) {
    return "Chrome";
  }

  if (normalized.includes("safari/") && !normalized.includes("chrome/")) {
    return "Safari";
  }

  return "Browser session";
}

function detectOperatingSystem(userAgent: string | null) {
  if (!userAgent) {
    return "";
  }

  const normalized = userAgent.toLowerCase();

  if (normalized.includes("windows")) {
    return "Windows";
  }

  if (normalized.includes("mac os x")) {
    return "macOS";
  }

  if (normalized.includes("android")) {
    return "Android";
  }

  if (normalized.includes("iphone") || normalized.includes("ipad")) {
    return "iOS";
  }

  if (normalized.includes("linux")) {
    return "Linux";
  }

  return "";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.detail || fallback;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function labelForSessionState(state: UserSessionResponse["state"]) {
  if (state === "revoked") {
    return "Revoked";
  }

  if (state === "expired") {
    return "Expired";
  }

  return "Active";
}

function labelForWorkspaceStatus(status: WorkspaceStatus) {
  if (status === "loading") {
    return "Loading session inventory";
  }

  if (status === "auth") {
    return "Waiting for sign-in";
  }

  if (status === "error") {
    return "Needs retry";
  }

  return "Ready";
}
