"use client";

import Link from "next/link";
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  type CurrentPresenceResponse,
  type CurrentUserResponse,
  type PresenceHeartbeatAcceptedResponse,
  type PresenceHeartbeatRequest,
  type PresenceSnapshotResponse,
  type RealtimeContractResponse,
  type RealtimeEnvelope,
} from "@/lib/api/contracts";
import { ApiClientError, apiBaseUrl, apiRequest, signalrUrl } from "@/lib/api/client";

type WorkspaceStatus = "loading" | "ready" | "auth" | "error";
type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

type PresenceFeedItem = {
  id: string;
  title: string;
  detail: string;
  createdAtLabel: string;
};

const presenceEventType = "presence.state.changed";
const maxFeedItems = 8;

export function PresenceWorkspace() {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected");
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [currentPresence, setCurrentPresence] = useState<CurrentPresenceResponse | null>(null);
  const [realtimeContract, setRealtimeContract] = useState<RealtimeContractResponse | null>(null);
  const [lastHeartbeatAtLabel, setLastHeartbeatAtLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<PresenceFeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [manualHeartbeatPending, setManualHeartbeatPending] = useState(false);

  const connectionRef = useRef<HubConnection | null>(null);
  const heartbeatTimerIdRef = useRef<number | null>(null);
  const connectedAtRef = useRef<string>(new Date().toISOString());
  const lastInteractionAtRef = useRef<string>(new Date().toISOString());
  const tabIdRef = useRef<string>("");
  const currentPresenceRef = useRef<CurrentPresenceResponse | null>(null);
  const realtimeContractRef = useRef<RealtimeContractResponse | null>(null);
  const sendHeartbeatRef = useRef<(reason: string) => Promise<void>>(async () => {});

  const pushFeedItem = useCallback((title: string, detail: string) => {
    startTransition(() => {
      setFeedItems((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title,
          detail,
          createdAtLabel: formatDateTime(new Date().toISOString()),
        },
        ...current,
      ].slice(0, maxFeedItems));
    });
  }, []);

  const applyPresenceSnapshot = useCallback((response: CurrentPresenceResponse | null, snapshot: PresenceSnapshotResponse, source: string) => {
    const previousSnapshot = currentPresenceRef.current?.presence;
    const nextPresence = {
      presence: snapshot,
      heartbeatIntervalSeconds:
        response?.heartbeatIntervalSeconds ??
        currentPresenceRef.current?.heartbeatIntervalSeconds ??
        realtimeContractRef.current?.presence.heartbeatIntervalSeconds ??
        20,
      heartbeatTtlSeconds:
        response?.heartbeatTtlSeconds ??
        currentPresenceRef.current?.heartbeatTtlSeconds ??
        realtimeContractRef.current?.presence.heartbeatTtlSeconds ??
        75,
      afkThresholdSeconds:
        response?.afkThresholdSeconds ??
        currentPresenceRef.current?.afkThresholdSeconds ??
        realtimeContractRef.current?.presence.afkThresholdSeconds ??
        60,
      store:
        response?.store ??
        currentPresenceRef.current?.store ??
        realtimeContractRef.current?.presence.store ??
        "unknown",
    };

    setCurrentPresence(nextPresence);
    currentPresenceRef.current = nextPresence;

    const aggregateChanged =
      !previousSnapshot ||
      previousSnapshot.state !== snapshot.state ||
      previousSnapshot.liveTabCount !== snapshot.liveTabCount;

    if (aggregateChanged || source !== "Scheduled heartbeat") {
      pushFeedItem(
        `Presence is ${labelForPresenceState(snapshot.state)}`,
        `${source} updated the aggregate across ${snapshot.liveTabCount} live ${snapshot.liveTabCount === 1 ? "tab" : "tabs"}.`,
      );
    }
  }, [pushFeedItem]);

  const loadWorkspace = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setWorkspaceStatus("loading");
    } else {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const [me, presenceResponse, contract] = await Promise.all([
        apiRequest<CurrentUserResponse>("/api/auth/me"),
        apiRequest<CurrentPresenceResponse>("/api/presence/me"),
        apiRequest<RealtimeContractResponse>("/api/realtime/contract"),
      ]);

      setCurrentUser(me);
      setCurrentPresence(presenceResponse);
      setRealtimeContract(contract);
      currentPresenceRef.current = presenceResponse;
      realtimeContractRef.current = contract;
      setWorkspaceStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        setCurrentUser(null);
        setCurrentPresence(null);
        setRealtimeContract(null);
        currentPresenceRef.current = null;
        realtimeContractRef.current = null;
        setWorkspaceStatus("auth");
        return;
      }

      setWorkspaceStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't load the presence workspace."));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const stopHeartbeatLoop = useCallback(() => {
    if (heartbeatTimerIdRef.current !== null) {
      window.clearInterval(heartbeatTimerIdRef.current);
      heartbeatTimerIdRef.current = null;
    }
  }, []);

  const startHeartbeatLoop = useCallback((intervalSeconds: number) => {
    stopHeartbeatLoop();

    heartbeatTimerIdRef.current = window.setInterval(() => {
      void sendHeartbeatRef.current("scheduled");
    }, Math.max(1, intervalSeconds) * 1000);
  }, [stopHeartbeatLoop]);

  const sendHeartbeat = useCallback(async (reason: string) => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      return;
    }

    const request: PresenceHeartbeatRequest = {
      tabId: tabIdRef.current,
      lastInteractionAtUtc: lastInteractionAtRef.current,
      visibilityState: document.visibilityState === "hidden" ? "hidden" : "visible",
      connectedAtUtc: connectedAtRef.current,
    };

    if (reason === "manual") {
      setManualHeartbeatPending(true);
    }

    try {
      const response = await connection.invoke<PresenceHeartbeatAcceptedResponse>("Heartbeat", request);

      applyPresenceSnapshot(
        {
          presence: response.presence,
          heartbeatIntervalSeconds: response.heartbeatIntervalSeconds,
          heartbeatTtlSeconds: response.heartbeatTtlSeconds,
          afkThresholdSeconds: response.afkThresholdSeconds,
          store: currentPresenceRef.current?.store ?? realtimeContractRef.current?.presence.store ?? "unknown",
        },
        response.presence,
        reason === "scheduled" ? "Scheduled heartbeat" : "Client heartbeat",
      );

      setLastHeartbeatAtLabel(formatDateTime(new Date().toISOString()));
      startHeartbeatLoop(response.heartbeatIntervalSeconds);
      setRealtimeStatus("connected");
    } catch (error) {
      setRealtimeStatus("error");
      setErrorMessage(getErrorMessage(error, "The presence heartbeat could not be delivered."));
      pushFeedItem("Heartbeat failed", getErrorMessage(error, "The live connection rejected the heartbeat."));
    } finally {
      if (reason === "manual") {
        setManualHeartbeatPending(false);
      }
    }
  }, [applyPresenceSnapshot, pushFeedItem, startHeartbeatLoop]);

  const disconnectRealtime = useCallback(async () => {
    stopHeartbeatLoop();

    if (connectionRef.current) {
      const connection = connectionRef.current;
      connectionRef.current = null;
      await connection.stop();
    }
  }, [stopHeartbeatLoop]);

  const connectRealtime = useCallback(async () => {
    if (workspaceStatus !== "ready") {
      return;
    }

    await disconnectRealtime();
    setRealtimeStatus("connecting");

    const connection = new HubConnectionBuilder()
      .withUrl(signalrUrl, {
        withCredentials: true,
      })
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on("event.received", (event: RealtimeEnvelope) => {
      if (event.eventType !== presenceEventType) {
        return;
      }

      const snapshot = event.payload as PresenceSnapshotResponse;
      applyPresenceSnapshot(null, snapshot, "Realtime event");
    });

    connection.onreconnecting((error) => {
      setRealtimeStatus("reconnecting");
      pushFeedItem("Realtime reconnecting", getErrorMessage(error, "The browser is reconnecting the SignalR presence channel."));
    });

    connection.onreconnected(async () => {
      setRealtimeStatus("connected");
      connectedAtRef.current = new Date().toISOString();
      pushFeedItem("Realtime restored", "The SignalR presence channel reconnected and re-armed the heartbeat loop.");
      await sendHeartbeat("reconnected");
    });

    connection.onclose((error) => {
      setRealtimeStatus("disconnected");
      stopHeartbeatLoop();

      if (error) {
        pushFeedItem("Realtime disconnected", getErrorMessage(error, "The presence connection closed."));
      }
    });

    try {
      await connection.start();
      connectionRef.current = connection;
      connectedAtRef.current = new Date().toISOString();
      setRealtimeStatus("connected");
      pushFeedItem("Realtime connected", "This tab joined the authenticated user group and started presence heartbeats.");
      await sendHeartbeat("startup");
    } catch (error) {
      setRealtimeStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't open the realtime presence channel."));
      pushFeedItem("Realtime failed", getErrorMessage(error, "The workspace fell back to the last REST snapshot."));
    }
  }, [applyPresenceSnapshot, disconnectRealtime, pushFeedItem, sendHeartbeat, stopHeartbeatLoop, workspaceStatus]);

  useEffect(() => {
    currentPresenceRef.current = currentPresence;
  }, [currentPresence]);

  useEffect(() => {
    realtimeContractRef.current = realtimeContract;
  }, [realtimeContract]);

  useEffect(() => {
    sendHeartbeatRef.current = sendHeartbeat;
  }, [sendHeartbeat]);

  useEffect(() => {
    tabIdRef.current = getOrCreateTabId();
    lastInteractionAtRef.current = new Date().toISOString();

    void loadWorkspace(true);

    return () => {
      void disconnectRealtime();
    };
  }, [disconnectRealtime, loadWorkspace]);

  useEffect(() => {
    if (workspaceStatus !== "ready") {
      return;
    }

    void connectRealtime();
  }, [connectRealtime, workspaceStatus]);

  useEffect(() => {
    if (workspaceStatus !== "ready") {
      return;
    }

    let lastPointerMoveAt = 0;

    const markInteraction = () => {
      lastInteractionAtRef.current = new Date().toISOString();
    };

    const handlePointerMove = () => {
      const now = Date.now();
      if (now - lastPointerMoveAt < 4000) {
        return;
      }

      lastPointerMoveAt = now;
      markInteraction();
    };

    const handleFocus = () => {
      markInteraction();
      void sendHeartbeat("focus");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markInteraction();
        void sendHeartbeat("visibility restore");
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("click", markInteraction);
    window.addEventListener("touchstart", markInteraction);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("click", markInteraction);
      window.removeEventListener("touchstart", markInteraction);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sendHeartbeat, workspaceStatus]);

  const thisTab = currentPresence?.presence.tabs.find((tab) => tab.tabId === tabIdRef.current) ?? null;

  return (
    <main className="presence-page">
      <div className="presence-shell">
        <section className="presence-hero">
          <div>
            <span className="eyebrow">F08 Presence</span>
            <h1>Heartbeat-driven presence with multi-tab and hibernation tolerance.</h1>
            <p>
              This workspace sends per-tab heartbeats through SignalR, keeps a browser-local
              interaction clock, and surfaces the server aggregate as online, AFK, or offline
              without relying on explicit inactive messages.
            </p>
          </div>

          <div className="presence-actions">
            <button
              className="secondary-button"
              disabled={workspaceStatus === "loading" || refreshing}
              onClick={() => void loadWorkspace(false)}
              type="button"
            >
              {refreshing ? "Refreshing..." : "Refresh snapshot"}
            </button>
            <button
              className="primary-button"
              disabled={workspaceStatus !== "ready" || manualHeartbeatPending || realtimeStatus === "connecting"}
              onClick={() => void sendHeartbeat("manual")}
              type="button"
            >
              {manualHeartbeatPending ? "Sending..." : "Send heartbeat now"}
            </button>
            <Link className="ghost-link" href="/sessions">
              Open sessions
            </Link>
          </div>
        </section>

        <section className="status-strip">
          <div className="status-pill">
            <span className="status-label">Presence store</span>
            <strong>{currentPresence?.store ?? realtimeContract?.presence.store ?? "Loading..."}</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Realtime state</span>
            <strong>{labelForRealtimeState(realtimeStatus)}</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Aggregate state</span>
            <strong>{currentPresence ? labelForPresenceState(currentPresence.presence.state) : "Loading..."}</strong>
          </div>
        </section>

        {errorMessage ? <div className="feedback-banner error-banner">{errorMessage}</div> : null}

        {workspaceStatus === "loading" ? (
          <section className="presence-grid">
            <article className="presence-panel panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </article>
            <article className="presence-panel panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </article>
          </section>
        ) : null}

        {workspaceStatus === "auth" ? (
          <section className="presence-grid">
            <article className="presence-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Access required</span>
                  <h2>Sign in before this tab can publish heartbeats</h2>
                </div>
              </div>

              <p className="panel-copy">
                The presence workspace reuses the cookie-backed auth flow from the earlier session
                slice. Once you have an active browser session, come back here and this tab will
                immediately join the user group and start publishing heartbeats.
              </p>

              <div className="presence-empty-actions">
                <Link className="primary-link" href="/sessions">
                  Go to sessions sign-in
                </Link>
                <Link className="ghost-link" href="/">
                  Back to overview
                </Link>
              </div>
            </article>

            <article className="presence-panel side-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">What this branch proves</span>
                  <h2>Server-side inference instead of explicit inactive events</h2>
                </div>
              </div>

              <ul className="fact-list">
                <li>Each browser tab has its own persistent tab identifier.</li>
                <li>SignalR heartbeats carry last interaction time and visibility state.</li>
                <li>AFK and offline are inferred from freshness and expiry, even when a tab hibernates.</li>
              </ul>
            </article>
          </section>
        ) : null}

        {workspaceStatus === "ready" && currentPresence ? (
          <section className="presence-grid">
            <article className="presence-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Current aggregate</span>
                  <h2>{currentUser?.userName}</h2>
                </div>
                <span className={`chip chip-${currentPresence.presence.state}`}>
                  {labelForPresenceState(currentPresence.presence.state)}
                </span>
              </div>

              <div className="presence-summary">
                <div>
                  <span>Tab ID</span>
                  <strong>{tabIdRef.current}</strong>
                </div>
                <div>
                  <span>Live tabs</span>
                  <strong>{currentPresence.presence.liveTabCount}</strong>
                </div>
                <div>
                  <span>Heartbeat cadence</span>
                  <strong>Every {currentPresence.heartbeatIntervalSeconds}s</strong>
                </div>
                <div>
                  <span>AFK threshold</span>
                  <strong>{currentPresence.afkThresholdSeconds}s of inactivity</strong>
                </div>
                <div>
                  <span>Heartbeat TTL</span>
                  <strong>{currentPresence.heartbeatTtlSeconds}s</strong>
                </div>
                <div>
                  <span>Last heartbeat sent</span>
                  <strong>{lastHeartbeatAtLabel ?? "Waiting for first heartbeat"}</strong>
                </div>
              </div>

              <dl className="presence-details">
                <div>
                  <dt>API base</dt>
                  <dd>{apiBaseUrl}</dd>
                </div>
                <div>
                  <dt>SignalR hub</dt>
                  <dd>{signalrUrl}</dd>
                </div>
                <div>
                  <dt>Most recent interaction</dt>
                  <dd>{formatNullableDateTime(currentPresence.presence.lastInteractionAtUtc)}</dd>
                </div>
                <div>
                  <dt>Most recent server heartbeat</dt>
                  <dd>{formatNullableDateTime(currentPresence.presence.lastHeartbeatAtUtc)}</dd>
                </div>
              </dl>

              {thisTab ? (
                <div className="presence-callout">
                  <strong>This tab is currently marked {labelForPresenceState(currentPresence.presence.state)}.</strong>
                  <p>
                    Visibility is <strong>{labelForVisibility(thisTab.visibilityState)}</strong>. If the browser hibernates this tab,
                    the aggregate will decay through AFK and then offline when the heartbeat TTL expires.
                  </p>
                </div>
              ) : null}
            </article>

            <article className="presence-panel side-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Live tabs</span>
                  <h2>Tab inventory feeding the aggregate</h2>
                </div>
                <span className="counter-pill">{currentPresence.presence.tabs.length} active</span>
              </div>

              {currentPresence.presence.tabs.length === 0 ? (
                <div className="empty-state">
                  <strong>No live tabs are tracked right now.</strong>
                  <p>The server will report offline until a tab reconnects and publishes a fresh heartbeat.</p>
                </div>
              ) : (
                <div className="presence-tab-list">
                  {currentPresence.presence.tabs.map((tab) => (
                    <article className="presence-tab-card" key={tab.tabId}>
                      <div className="session-title-row">
                        <strong>{tab.tabId === tabIdRef.current ? "This browser tab" : "Sibling browser tab"}</strong>
                        <div className="session-badges">
                          {tab.tabId === tabIdRef.current ? <span className="chip chip-accent">This tab</span> : null}
                          <span className="chip chip-muted">{labelForVisibility(tab.visibilityState)}</span>
                        </div>
                      </div>

                      <dl className="presence-details">
                        <div>
                          <dt>Connected</dt>
                          <dd>{formatDateTime(tab.connectedAtUtc)}</dd>
                        </div>
                        <div>
                          <dt>Last interaction</dt>
                          <dd>{formatDateTime(tab.lastInteractionAtUtc)}</dd>
                        </div>
                        <div>
                          <dt>Last heartbeat</dt>
                          <dd>{formatDateTime(tab.lastHeartbeatAtUtc)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="presence-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Live feed</span>
                  <h2>Heartbeat and reconnect events for this browser</h2>
                </div>
              </div>

              {feedItems.length === 0 ? (
                <div className="empty-state">
                  <strong>No presence events yet.</strong>
                  <p>As soon as this tab connects and starts heartbeating, the latest transitions will appear here.</p>
                </div>
              ) : (
                <div className="presence-feed">
                  {feedItems.map((item) => (
                    <article className="presence-feed-item" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <span>{item.createdAtLabel}</span>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="presence-panel side-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Contract notes</span>
                  <h2>Why the aggregate stays trustworthy</h2>
                </div>
              </div>

              <ul className="fact-list">
                <li>The client updates a local interaction clock instead of sending every DOM event.</li>
                <li>Focus and visibility restore trigger immediate heartbeats for faster recovery.</li>
                <li>Server sweeps turn expired tabs into offline without relying on a clean disconnect.</li>
              </ul>
            </article>
          </section>
        ) : null}

        {workspaceStatus === "error" ? (
          <section className="presence-grid">
            <article className="presence-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Recoverable error</span>
                  <h2>The presence workspace needs a retry</h2>
                </div>
              </div>

              <p className="panel-copy">
                This screen keeps failure and reconnect states visible because presence only feels
                trustworthy when the UI tells you exactly what the client and server are doing.
              </p>

              <button className="primary-button" onClick={() => void loadWorkspace(true)} type="button">
                Retry loading presence
              </button>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function getOrCreateTabId() {
  const storageKey = "slack-app-competition-presence-tab-id";
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const nextTabId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem(storageKey, nextTabId);
  return nextTabId;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNullableDateTime(value: string | null) {
  return value ? formatDateTime(value) : "Not available yet";
}

function labelForRealtimeState(state: RealtimeStatus) {
  if (state === "connecting") {
    return "Connecting";
  }

  if (state === "connected") {
    return "Connected";
  }

  if (state === "reconnecting") {
    return "Reconnecting";
  }

  if (state === "error") {
    return "Needs retry";
  }

  return "Disconnected";
}

function labelForPresenceState(state: PresenceSnapshotResponse["state"]) {
  if (state === "online") {
    return "Online";
  }

  if (state === "afk") {
    return "AFK";
  }

  return "Offline";
}

function labelForVisibility(visibilityState: string) {
  if (visibilityState === "visible") {
    return "Visible";
  }

  if (visibilityState === "hidden") {
    return "Hidden";
  }

  if (visibilityState === "prerender") {
    return "Prerender";
  }

  return "Unknown";
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
