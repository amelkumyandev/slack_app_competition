"use client";

import Link from "next/link";
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  type ChatMessageResponse,
  type ContactSummaryResponse,
  type ConversationReadStateResponse,
  type ConversationSyncResponse,
  type ConversationTimelineResponse,
  type CurrentUserResponse,
  type DirectConversationListResponse,
  type DirectConversationSummaryResponse,
  type MessageAttachmentResponse,
  type MessageResponse,
  type RealtimeContractResponse,
  type RealtimeEnvelope,
  type RoomDirectoryResponse,
  type RoomListItemResponse,
} from "@/lib/api/contracts";
import { ApiClientError, apiBaseUrl, apiRequest, signalrUrl } from "@/lib/api/client";

type WorkspaceStatus = "loading" | "ready" | "auth" | "error";
type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

type SelectedConversation =
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

type TimelineState = {
  conversationId: string | null;
  messages: ChatMessageResponse[];
  nextCursor: number | null;
  latestWatermark: number;
  loading: boolean;
  loadingOlder: boolean;
  syncing: boolean;
  error: string | null;
};

const historyPageSize = 40;
const estimatedMessageHeight = 148;
const overscanCount = 5;

export function ChatWorkspace() {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected");
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [roomDirectory, setRoomDirectory] = useState<RoomDirectoryResponse | null>(null);
  const [contactSummary, setContactSummary] = useState<ContactSummaryResponse | null>(null);
  const [directList, setDirectList] = useState<DirectConversationSummaryResponse[]>([]);
  const [realtimeContract, setRealtimeContract] = useState<RealtimeContractResponse | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<SelectedConversation | null>(null);
  const [timeline, setTimeline] = useState<TimelineState>({
    conversationId: null,
    messages: [],
    nextCursor: null,
    latestWatermark: 0,
    loading: true,
    loadingOlder: false,
    syncing: false,
    error: null,
  });
  const [draftText, setDraftText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [replyTarget, setReplyTarget] = useState<ChatMessageResponse | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessageResponse | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [messageSubmitting, setMessageSubmitting] = useState(false);
  const [downloadTargetId, setDownloadTargetId] = useState<string | null>(null);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [openingDirectUserName, setOpeningDirectUserName] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollViewportHeight, setScrollViewportHeight] = useState(720);

  const connectionRef = useRef<HubConnection | null>(null);
  const selectedConversationRef = useRef<SelectedConversation | null>(null);
  const subscribedConversationIdRef = useRef<string | null>(null);
  const latestWatermarkRef = useRef(0);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const loadOlderPendingRef = useRef(false);
  const selectedConversationId = selectedConversation?.conversationId ?? null;

  const totalHeight = timeline.messages.length * estimatedMessageHeight;
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / estimatedMessageHeight) - overscanCount);
    const visibleCount = Math.ceil(scrollViewportHeight / estimatedMessageHeight) + overscanCount * 2;
    const endIndex = Math.min(timeline.messages.length, startIndex + visibleCount);

    return {
      startIndex,
      endIndex,
      topPadding: startIndex * estimatedMessageHeight,
      bottomPadding: Math.max(0, totalHeight - endIndex * estimatedMessageHeight),
      items: timeline.messages.slice(startIndex, endIndex),
    };
  }, [scrollTop, scrollViewportHeight, timeline.messages, totalHeight]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    latestWatermarkRef.current = timeline.latestWatermark;
  }, [timeline.latestWatermark]);

  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) {
      return;
    }

    const updateViewportHeight = () => {
      setScrollViewportHeight(container.clientHeight || 720);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, [selectedConversation?.conversationId]);

  useEffect(() => {
    void loadWorkspace(true);

    return () => {
      void disconnectRealtime();
    };
  }, []);

  useEffect(() => {
    if (workspaceStatus !== "ready") {
      return;
    }

    let disposed = false;

    const stopConnection = async () => {
      if (connectionRef.current) {
        const connection = connectionRef.current;
        connectionRef.current = null;
        subscribedConversationIdRef.current = null;
        await connection.stop();
      }
    };

    const startConnection = async () => {
      await stopConnection();
      setRealtimeStatus("connecting");

      const connection = new HubConnectionBuilder()
        .withUrl(signalrUrl, {
          withCredentials: true,
        })
        .withAutomaticReconnect([0, 1000, 3000, 5000])
        .configureLogging(LogLevel.Warning)
        .build();

      connection.on("event.received", (event: RealtimeEnvelope) => {
        const selected = selectedConversationRef.current;
        if (!selected || event.conversationId !== selected.conversationId || !event.watermark) {
          if (event.scope === "conversation" && event.conversationId) {
            void refreshNavigationData();
          }
          return;
        }

        if (event.watermark > latestWatermarkRef.current + 1) {
          void syncSelectedConversation("gap");
          return;
        }

        if (event.watermark <= latestWatermarkRef.current) {
          return;
        }

        void syncSelectedConversation("live");
      });

      connection.onreconnecting((error) => {
        setRealtimeStatus("reconnecting");
        setFeedbackMessage(getErrorMessage(error, "Realtime is reconnecting. History sync will repair any missed events."));
      });

      connection.onreconnected(async () => {
        setRealtimeStatus("connected");

        const activeConversation = selectedConversationRef.current;
        if (activeConversation) {
          await syncConversationSubscription(activeConversation.conversationId);
          await syncSelectedConversation("reconnected");
        }
      });

      connection.onclose((error) => {
        if (!disposed) {
          setRealtimeStatus(error ? "error" : "disconnected");
        }

        subscribedConversationIdRef.current = null;
      });

      try {
        await connection.start();
        if (disposed) {
          await connection.stop();
          return;
        }

        connectionRef.current = connection;
        setRealtimeStatus("connected");

        const activeConversation = selectedConversationRef.current;
        if (activeConversation) {
          await syncConversationSubscription(activeConversation.conversationId);
        }
      } catch (error) {
        if (!disposed) {
          setRealtimeStatus("error");
          setErrorMessage(getErrorMessage(error, "We couldn't open the realtime messaging channel."));
        }
      }
    };

    void startConnection();

    return () => {
      disposed = true;
      void stopConnection();
    };
    // The realtime lifecycle intentionally keys off the workspace readiness gate.
    // Selection changes are handled by the subscription effect and the selectedConversation ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceStatus]);

  useEffect(() => {
    if (!selectedConversationId) {
      setTimeline({
        conversationId: null,
        messages: [],
        nextCursor: null,
        latestWatermark: 0,
        loading: false,
        loadingOlder: false,
        syncing: false,
        error: null,
      });
      return;
    }

    setReplyTarget(null);
    setEditTarget(null);
    setSelectedFile(null);
    setFileInputKey((current) => current + 1);
    shouldScrollToBottomRef.current = true;
    void loadTimeline(selectedConversationId, { replace: true, markRead: true });
    void syncConversationSubscription(selectedConversationId);
    // This effect intentionally keys off the selected conversation id.
    // Summary and unread updates may replace the selection object without switching conversations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      return;
    }

    const container = timelineContainerRef.current;
    if (!container) {
      return;
    }

    window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      shouldScrollToBottomRef.current = false;
    });
  }, [timeline.messages.length]);

  async function loadWorkspace(showLoading: boolean) {
    if (showLoading) {
      setWorkspaceStatus("loading");
    } else {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const [me, rooms, contacts, directs, contract] = await Promise.all([
        apiRequest<CurrentUserResponse>("/api/auth/me"),
        apiRequest<RoomDirectoryResponse>("/api/rooms"),
        apiRequest<ContactSummaryResponse>("/api/contacts"),
        apiRequest<DirectConversationListResponse>("/api/conversations/direct"),
        apiRequest<RealtimeContractResponse>("/api/realtime/contract"),
      ]);

      setCurrentUser(me);
      setRoomDirectory(rooms);
      setContactSummary(contacts);
      setDirectList(directs.conversations);
      setRealtimeContract(contract);
      setWorkspaceStatus("ready");

      startTransition(() => {
        setSelectedConversation((current) => chooseNextSelection(current, rooms, directs.conversations));
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        setWorkspaceStatus("auth");
        setCurrentUser(null);
        setRoomDirectory(null);
        setContactSummary(null);
        setDirectList([]);
        setSelectedConversation(null);
        return;
      }

      setWorkspaceStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't load the messaging workspace."));
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshNavigationData() {
    if (workspaceStatus !== "ready") {
      return;
    }

    const [rooms, contacts, directs] = await Promise.all([
      apiRequest<RoomDirectoryResponse>("/api/rooms"),
      apiRequest<ContactSummaryResponse>("/api/contacts"),
      apiRequest<DirectConversationListResponse>("/api/conversations/direct"),
    ]);

    setRoomDirectory(rooms);
    setContactSummary(contacts);
    setDirectList(directs.conversations);
    setSelectedConversation((current) => chooseNextSelection(current, rooms, directs.conversations));
  }

  function applyReadState(conversationId: string, readState: ConversationReadStateResponse) {
    setRoomDirectory((current) =>
      current
        ? {
            ...current,
            myRooms: current.myRooms.map((room) =>
              room.conversationId === conversationId
                ? { ...room, lastReadWatermark: readState.lastReadWatermark, unreadCount: readState.unreadCount }
                : room,
            ),
            publicCatalog: current.publicCatalog.map((room) =>
              room.conversationId === conversationId
                ? { ...room, lastReadWatermark: readState.lastReadWatermark, unreadCount: readState.unreadCount }
                : room,
            ),
          }
        : current,
    );

    setDirectList((current) =>
      current.map((conversation) =>
        conversation.conversationId === conversationId
          ? {
              ...conversation,
              lastReadWatermark: readState.lastReadWatermark,
              unreadCount: readState.unreadCount,
            }
          : conversation,
      ),
    );
  }

  function applyConversationSummary(
    conversationId: string,
    latestWatermark: number,
    lastMessagePreview: string | null,
    lastMessageAtUtc: string | null,
  ) {
    setRoomDirectory((current) =>
      current
        ? {
            ...current,
            myRooms: current.myRooms.map((room) =>
              room.conversationId === conversationId
                ? { ...room, latestWatermark, lastMessagePreview, lastMessageAtUtc }
                : room,
            ),
            publicCatalog: current.publicCatalog.map((room) =>
              room.conversationId === conversationId
                ? { ...room, latestWatermark, lastMessagePreview, lastMessageAtUtc }
                : room,
            ),
          }
        : current,
    );

    setDirectList((current) =>
      current.map((conversation) =>
        conversation.conversationId === conversationId
          ? { ...conversation, latestWatermark, lastMessagePreview, lastMessageAtUtc }
          : conversation,
      ),
    );
  }

  async function markConversationRead(conversationId: string, latestWatermark: number) {
    const readState = await apiRequest<ConversationReadStateResponse>(`/api/conversations/${conversationId}/read-state`, {
      method: "POST",
      body: JSON.stringify({
        watermark: latestWatermark,
      }),
    });

    applyReadState(conversationId, readState);
  }

  async function loadTimeline(
    conversationId: string,
    options: { replace: boolean; beforeWatermark?: number | null; markRead?: boolean } = { replace: true },
  ) {
    setTimeline((current) => ({
      conversationId,
      messages: options.replace ? current.messages : current.messages,
      nextCursor: options.replace ? null : current.nextCursor,
      latestWatermark: options.replace ? current.latestWatermark : current.latestWatermark,
      loading: options.replace,
      loadingOlder: !options.replace,
      syncing: false,
      error: null,
    }));

    try {
      const query = new URLSearchParams({
        pageSize: String(historyPageSize),
      });

      if (options.beforeWatermark) {
        query.set("beforeWatermark", String(options.beforeWatermark));
      }

      const response = await apiRequest<ConversationTimelineResponse>(`/api/conversations/${conversationId}/messages?${query.toString()}`);

      setTimeline((current) => {
        const nextMessages = options.replace
          ? response.messages
          : mergeOlderMessages(response.messages, current.messages);

        return {
          conversationId: response.conversationId,
          messages: nextMessages,
          nextCursor: response.nextCursor,
          latestWatermark: response.latestWatermark,
          loading: false,
          loadingOlder: false,
          syncing: false,
          error: null,
        };
      });

      latestWatermarkRef.current = response.latestWatermark;
      if (options.replace) {
        const latestMessage = response.messages.at(-1) ?? null;
        applyConversationSummary(
          response.conversationId,
          response.latestWatermark,
          previewForMessage(latestMessage),
          latestMessage?.createdAtUtc ?? null,
        );
      }

      if (options.replace && options.markRead) {
        await markConversationRead(response.conversationId, response.latestWatermark);
      }
    } catch (error) {
      setTimeline((current) => ({
        ...current,
        loading: false,
        loadingOlder: false,
        syncing: false,
        error: getErrorMessage(error, "We couldn't load the message history."),
      }));
    }
  }

  async function loadOlderMessages() {
    if (!selectedConversation || !timeline.nextCursor || timeline.loadingOlder || timeline.loading) {
      return;
    }

    loadOlderPendingRef.current = true;
    await loadTimeline(selectedConversation.conversationId, {
      replace: false,
      beforeWatermark: timeline.nextCursor,
    });
  }

  async function syncSelectedConversation(reason: "live" | "gap" | "reconnected") {
    const activeConversation = selectedConversationRef.current;
    if (!activeConversation) {
      return;
    }

    setTimeline((current) => ({
      ...current,
      syncing: true,
      error: null,
    }));

    try {
      const syncResponse = await apiRequest<ConversationSyncResponse>(
        `/api/conversations/${activeConversation.conversationId}/sync?afterWatermark=${latestWatermarkRef.current}`,
      );

      if (syncResponse.requiresFullRefresh || syncResponse.missingMessages.length > 0) {
        await loadTimeline(activeConversation.conversationId, { replace: true, markRead: true });
      } else {
        setTimeline((current) => ({
          ...current,
          syncing: false,
          latestWatermark: syncResponse.latestWatermark,
        }));
        latestWatermarkRef.current = syncResponse.latestWatermark;
      }

      if (reason === "gap") {
        setFeedbackMessage("A realtime watermark gap was detected, and the timeline resynced from durable history.");
      }
    } catch (error) {
      setTimeline((current) => ({
        ...current,
        syncing: false,
        error: getErrorMessage(error, "The conversation could not be resynchronized."),
      }));
    }
  }

  async function disconnectRealtime() {
    if (connectionRef.current) {
      const connection = connectionRef.current;
      connectionRef.current = null;
      subscribedConversationIdRef.current = null;
      await connection.stop();
    }
  }

  async function syncConversationSubscription(conversationId: string) {
    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      return;
    }

    const nextConversationKey = `conversation:${conversationId}`;
    const currentConversationId = subscribedConversationIdRef.current;

    if (currentConversationId === conversationId) {
      return;
    }

    if (currentConversationId) {
      await connection.invoke("UnsubscribeConversation", `conversation:${currentConversationId}`);
    }

    await connection.invoke("SubscribeConversation", nextConversationKey);
    subscribedConversationIdRef.current = conversationId;
  }

  async function handleJoinRoom(room: RoomListItemResponse) {
    setJoiningRoomId(room.id);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const response = await apiRequest<MessageResponse>(`/api/rooms/${room.id}/join`, {
        method: "POST",
      });

      setFeedbackMessage(response.message);
      await loadWorkspace(false);
      startTransition(() => {
        setSelectedConversation(toRoomSelection(room));
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "We couldn't join that room."));
    } finally {
      setJoiningRoomId(null);
    }
  }

  async function handleOpenDirect(targetUserName: string) {
    setOpeningDirectUserName(targetUserName);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const directConversation = await apiRequest<DirectConversationSummaryResponse>("/api/conversations/direct", {
        method: "POST",
        body: JSON.stringify({
          targetUserName,
        }),
      });

      await refreshNavigationData();
      setSelectedConversation(toDirectSelection(directConversation));
      setFeedbackMessage(`Opened a direct conversation with ${targetUserName}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The direct conversation could not be opened."));
    } finally {
      setOpeningDirectUserName(null);
    }
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation) {
      return;
    }

    setMessageSubmitting(true);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      if (editTarget) {
        await apiRequest<ChatMessageResponse>(
          `/api/conversations/${selectedConversation.conversationId}/messages/${editTarget.messageId}/edit`,
          {
            method: "POST",
            body: JSON.stringify({
              text: draftText,
            }),
          },
        );

        setFeedbackMessage("Message updated.");
      } else if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);

        if (draftText.trim()) {
          formData.append("comment", draftText);
        }

        await apiRequest<ChatMessageResponse>(`/api/conversations/${selectedConversation.conversationId}/attachments`, {
          method: "POST",
          body: formData,
        });

        setFeedbackMessage("Attachment uploaded.");
      } else {
        await apiRequest<ChatMessageResponse>(`/api/conversations/${selectedConversation.conversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            text: draftText,
            replyToMessageId: replyTarget?.messageId ?? null,
          }),
        });

        setFeedbackMessage("Message sent.");
      }

      setDraftText("");
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      setReplyTarget(null);
      setEditTarget(null);
      shouldScrollToBottomRef.current = true;
      await loadTimeline(selectedConversation.conversationId, { replace: true, markRead: true });
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The message could not be saved."));
    } finally {
      setMessageSubmitting(false);
    }
  }

  async function handleDeleteMessage(message: ChatMessageResponse) {
    if (!selectedConversation) {
      return;
    }

    if (!window.confirm("Delete this message? Durable history will record the deletion watermark.")) {
      return;
    }

    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest<ChatMessageResponse>(
        `/api/conversations/${selectedConversation.conversationId}/messages/${message.messageId}`,
        {
          method: "DELETE",
        },
      );

      setFeedbackMessage("Message deleted.");
      await loadTimeline(selectedConversation.conversationId, { replace: true, markRead: true });
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The message could not be deleted."));
    }
  }

  async function handleDownloadAttachment(attachment: MessageAttachmentResponse) {
    setDownloadTargetId(attachment.id);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}${attachment.downloadPath}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("The attachment download could not be completed.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.originalFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The attachment download could not be completed."));
    } finally {
      setDownloadTargetId(null);
    }
  }

  const totalUnreadFriendly = (roomDirectory?.pendingInvitations.length ?? 0) + (contactSummary?.incomingFriendRequests.length ?? 0);
  const totalConversationUnread =
    (roomDirectory?.myRooms.reduce((count, room) => count + room.unreadCount, 0) ?? 0) +
    directList.reduce((count, conversation) => count + conversation.unreadCount, 0);
  const selectedConversationLabel = selectedConversation
    ? selectedConversation.kind === "room"
      ? `# ${selectedConversation.title}`
      : selectedConversation.title
    : "No conversation selected";

  return (
    <main className="chat-page">
      <div className="chat-shell">
        <section className="chat-hero">
          <div>
            <span className="eyebrow">F12 Unread Navigation</span>
            <h1>Unread-aware chat navigation with durable read watermarks and live conversation summaries.</h1>
            <p>
              This workspace sits directly on top of the conversation watermark foundation. REST
              handles durable history, read-state updates, and pagination, SignalR carries live
              conversation events, and the client keeps room and direct summaries fresh while
              clearing unread counts as conversations are opened.
            </p>
          </div>

          <div className="chat-hero-actions">
            <button
              className="secondary-button"
              disabled={workspaceStatus === "loading" || refreshing}
              onClick={() => void loadWorkspace(false)}
              type="button"
            >
              {refreshing ? "Refreshing..." : "Refresh workspace"}
            </button>
            <Link className="ghost-link" href="/presence">
              Presence workspace
            </Link>
            <Link className="ghost-link" href="/sessions">
              Sessions workspace
            </Link>
          </div>
        </section>

        <section className="status-strip">
          <div className="status-pill">
            <span className="status-label">Signed in as</span>
            <strong>{currentUser?.userName ?? "Loading..."}</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Realtime</span>
            <strong>{labelForRealtimeState(realtimeStatus)}</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Unread items</span>
            <strong>{totalConversationUnread}</strong>
          </div>
          <div className="status-pill">
            <span className="status-label">Sync posture</span>
            <strong>{timeline.syncing ? "Repairing timeline" : "REST + SignalR"}</strong>
          </div>
        </section>

        {feedbackMessage ? <div className="feedback-banner success-banner">{feedbackMessage}</div> : null}
        {errorMessage ? <div className="feedback-banner error-banner">{errorMessage}</div> : null}

        {workspaceStatus === "loading" ? (
          <section className="chat-layout">
            <article className="chat-sidebar panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </article>
            <article className="chat-main panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </article>
            <article className="chat-detail panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
            </article>
          </section>
        ) : null}

        {workspaceStatus === "auth" ? (
          <section className="chat-layout">
            <article className="chat-main">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Access required</span>
                  <h2>Sign in before opening the chat workspace</h2>
                </div>
              </div>

              <p className="panel-copy">
                The messaging slice reuses the earlier cookie-backed account and session work. Once
                this browser has an authenticated session, the chat shell can fetch durable history
                and join the right SignalR conversation group.
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

            <article className="chat-detail">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">What this branch proves</span>
                  <h2>Message durability and sync integrity</h2>
                </div>
              </div>

              <ul className="fact-list">
                <li>Room and direct messages persist to PostgreSQL before the UI reacts.</li>
                <li>Replies, edits, and deletes are surfaced through conversation watermarks.</li>
                <li>Realtime reconnects and missed events always fall back to REST sync repair.</li>
              </ul>
            </article>
          </section>
        ) : null}

        {workspaceStatus === "ready" ? (
          <section className="chat-layout">
            <aside className="chat-sidebar">
              <div className="chat-sidebar-card">
                <span className="panel-kicker">Workspace</span>
                <h2>{currentUser?.userName}</h2>
                <p className="panel-copy">
                  Invitations plus incoming friend requests: <strong>{totalUnreadFriendly}</strong>
                  {" · "}
                  Conversation unread total: <strong>{totalConversationUnread}</strong>
                </p>
              </div>

              <div className="chat-sidebar-card">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">My rooms</span>
                    <h2>Rooms you can post in</h2>
                  </div>
                  <span className="counter-pill">{roomDirectory?.myRooms.length ?? 0}</span>
                </div>

                {roomDirectory?.myRooms.length ? (
                  <div className="nav-list">
                    {roomDirectory.myRooms.map((room) => {
                      const active = selectedConversation?.conversationId === room.conversationId;
                      return (
                        <button
                          className={active ? "nav-card active" : "nav-card"}
                          key={room.id}
                          onClick={() => setSelectedConversation(toRoomSelection(room))}
                          type="button"
                        >
                          <div className="nav-card-header">
                            <strong># {room.name}</strong>
                            {room.unreadCount > 0 ? <span className="nav-unread-pill">{room.unreadCount}</span> : null}
                          </div>
                          <span>{room.lastMessagePreview ?? `${room.memberCount} members`}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No room memberships yet.</strong>
                    <p>Join a public room from the catalog below or use the earlier room-management flows.</p>
                  </div>
                )}
              </div>

              <div className="chat-sidebar-card">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">Direct messages</span>
                    <h2>Friends and active PM history</h2>
                  </div>
                  <span className="counter-pill">{directList.length}</span>
                </div>

                {directList.length ? (
                  <div className="nav-list">
                    {directList.map((conversation) => {
                      const active = selectedConversation?.conversationId === conversation.conversationId;
                      return (
                        <button
                          className={active ? "nav-card active" : "nav-card"}
                          key={conversation.conversationId}
                          onClick={() => setSelectedConversation(toDirectSelection(conversation))}
                          type="button"
                        >
                          <div className="nav-card-header">
                            <strong>{conversation.targetUserName}</strong>
                            {conversation.unreadCount > 0 ? <span className="nav-unread-pill">{conversation.unreadCount}</span> : null}
                          </div>
                          <span>
                            {conversation.accessMode === "read_only" ? "Read-only history" : conversation.lastMessagePreview ?? "Ready to chat"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No direct history yet.</strong>
                    <p>Start a DM from the confirmed friends list when the PM policy allows it.</p>
                  </div>
                )}

                {contactSummary?.friends.length ? (
                  <div className="friend-start-grid">
                    {contactSummary.friends.map((friend) => (
                      <button
                        className="ghost-link friend-start-button"
                        disabled={openingDirectUserName === friend.userName}
                        key={friend.userId}
                        onClick={() => void handleOpenDirect(friend.userName)}
                        type="button"
                      >
                        {openingDirectUserName === friend.userName ? `Opening ${friend.userName}...` : `Message ${friend.userName}`}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="chat-sidebar-card">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">Public catalog</span>
                    <h2>Quick join</h2>
                  </div>
                </div>

                {roomDirectory?.publicCatalog.length ? (
                  <div className="nav-list">
                    {roomDirectory.publicCatalog.slice(0, 5).map((room) => (
                      <div className="catalog-card" key={room.id}>
                        <div>
                          <strong># {room.name}</strong>
                          <span>{room.description ?? "No description yet."}</span>
                        </div>
                        <button
                          className="secondary-button"
                          disabled={room.isMember || room.isBanned || joiningRoomId === room.id}
                          onClick={() => void handleJoinRoom(room)}
                          type="button"
                        >
                          {room.isMember ? "Joined" : room.isBanned ? "Banned" : joiningRoomId === room.id ? "Joining..." : "Join"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No public rooms are visible.</strong>
                    <p>As room creation grows later, the searchable catalog will populate here.</p>
                  </div>
                )}
              </div>
            </aside>

            <section className="chat-main">
              <header className="chat-main-header">
                <div>
                  <span className="panel-kicker">Selected conversation</span>
                  <h2>{selectedConversationLabel}</h2>
                  <p className="panel-copy">
                    {selectedConversation?.subtitle ??
                      "Select a room or direct conversation to load paged history and join its realtime stream."}
                  </p>
                </div>
                <div className="chat-main-header-meta">
                  <span className="counter-pill">
                    {timeline.messages.length} loaded / {timeline.latestWatermark} latest watermark
                  </span>
                  <span className={`chip ${timeline.syncing ? "chip-afk" : "chip-online"}`}>
                    {timeline.syncing ? "Syncing" : realtimeStatus === "connected" ? "Live" : "REST only"}
                  </span>
                </div>
              </header>

              {!selectedConversation ? (
                <div className="chat-empty-state">
                  <strong>No conversation selected yet.</strong>
                  <p>
                    The sidebar stays focused on rooms, active direct history, and confirmed friends
                    so this branch can prove the messaging backbone before the full Slack-like shell
                    lands.
                  </p>
                </div>
              ) : (
                <>
                  {selectedConversation.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
                    <div className="feedback-banner error-banner">
                      This direct conversation is frozen in read-only mode because a user-to-user ban is active. Existing
                      history remains visible, but new messages are blocked by policy.
                    </div>
                  ) : null}

                  {timeline.error ? <div className="feedback-banner error-banner">{timeline.error}</div> : null}

                  <div
                    className="chat-timeline"
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      setScrollTop(element.scrollTop);

                      if (element.scrollTop < 120 && timeline.nextCursor && !timeline.loadingOlder && !loadOlderPendingRef.current) {
                        loadOlderPendingRef.current = true;
                        void loadOlderMessages().finally(() => {
                          loadOlderPendingRef.current = false;
                        });
                      }
                    }}
                    ref={timelineContainerRef}
                  >
                    {timeline.loading ? (
                      <div className="panel-skeleton">
                        <div className="skeleton-line skeleton-title" />
                        <div className="skeleton-line" />
                        <div className="skeleton-line" />
                      </div>
                    ) : timeline.messages.length === 0 ? (
                      <div className="chat-empty-state">
                        <strong>No messages yet.</strong>
                        <p>
                          This conversation is ready for the first durable message. Multiline text, replies,
                          edits, and deletes all flow through the same watermark stream.
                        </p>
                      </div>
                    ) : (
                      <div className="virtualized-stack" style={{ height: totalHeight || "auto" }}>
                        {visibleRange.topPadding > 0 ? <div style={{ height: visibleRange.topPadding }} /> : null}

                        {visibleRange.items.map((message) => (
                          <article className={message.isDeleted ? "chat-message deleted" : "chat-message"} key={message.messageId}>
                            <div className="chat-message-header">
                              <div className="chat-message-author">
                                <strong>{message.authorUserName}</strong>
                                <span>{formatDateTime(message.createdAtUtc)}</span>
                              </div>
                              <div className="chat-message-flags">
                                {message.isEdited ? <span className="chip chip-muted">Edited</span> : null}
                                {message.isDeleted ? <span className="chip chip-revoked">Deleted</span> : null}
                              </div>
                            </div>

                            {message.replyPreview ? (
                              <button
                                className="reply-preview"
                                onClick={() => scrollMessageIntoView(message.replyPreview!.messageId)}
                                type="button"
                              >
                                <strong>Replying to {message.replyPreview.authorUserName}</strong>
                                <span>{message.replyPreview.isDeleted ? "Original message deleted" : message.replyPreview.text}</span>
                              </button>
                            ) : null}

                            <div className="chat-message-body" data-message-id={message.messageId}>
                              {message.isDeleted ? "Message deleted." : message.text}
                            </div>

                            {!message.isDeleted && message.attachments.length > 0 ? (
                              <div className="attachment-list">
                                {message.attachments.map((attachment) => (
                                  <div className="attachment-card" key={attachment.id}>
                                    <div>
                                      <strong>{attachment.originalFileName}</strong>
                                      <span>
                                        {formatBytes(attachment.byteSize)} · {attachment.contentType}
                                      </span>
                                    </div>
                                    <button
                                      className="secondary-button attachment-action"
                                      disabled={downloadTargetId === attachment.id}
                                      onClick={() => void handleDownloadAttachment(attachment)}
                                      type="button"
                                    >
                                      {downloadTargetId === attachment.id ? "Downloading..." : "Download"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <div className="chat-message-actions">
                              {!message.isDeleted ? (
                                <button
                                  className="ghost-link inline-action"
                                  onClick={() => {
                                    setEditTarget(null);
                                    setReplyTarget(message);
                                    setDraftText((current) => current);
                                  }}
                                  type="button"
                                >
                                  Reply
                                </button>
                              ) : null}
                              {message.canEdit ? (
                                <button
                                  className="ghost-link inline-action"
                                  onClick={() => {
                                    setReplyTarget(null);
                                    setEditTarget(message);
                                    setSelectedFile(null);
                                    setFileInputKey((current) => current + 1);
                                    setDraftText(message.text ?? "");
                                  }}
                                  type="button"
                                >
                                  Edit
                                </button>
                              ) : null}
                              {message.canDelete ? (
                                <button
                                  className="ghost-link inline-action danger-link"
                                  onClick={() => void handleDeleteMessage(message)}
                                  type="button"
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </article>
                        ))}

                        {visibleRange.bottomPadding > 0 ? <div style={{ height: visibleRange.bottomPadding }} /> : null}
                      </div>
                    )}
                  </div>

                  <footer className="chat-composer">
                    {replyTarget ? (
                      <div className="composer-banner">
                        <span>
                          Replying to <strong>{replyTarget.authorUserName}</strong>
                        </span>
                        <button className="ghost-link inline-action" onClick={() => setReplyTarget(null)} type="button">
                          Clear reply
                        </button>
                      </div>
                    ) : null}

                    {editTarget ? (
                      <div className="composer-banner">
                        <span>
                          Editing your message from <strong>{formatDateTime(editTarget.createdAtUtc)}</strong>
                        </span>
                        <button
                          className="ghost-link inline-action"
                          onClick={() => {
                            setEditTarget(null);
                            setDraftText("");
                          }}
                          type="button"
                        >
                          Cancel edit
                        </button>
                      </div>
                    ) : null}

                    {selectedFile ? (
                      <div className="composer-banner">
                        <span>
                          Uploading <strong>{selectedFile.name}</strong> ({formatBytes(selectedFile.size)})
                        </span>
                        <button
                          className="ghost-link inline-action"
                          onClick={() => {
                            setSelectedFile(null);
                            setFileInputKey((current) => current + 1);
                          }}
                          type="button"
                        >
                          Clear file
                        </button>
                      </div>
                    ) : null}

                    <form className="chat-composer-form" onSubmit={handleSubmitMessage}>
                      <textarea
                        disabled={!selectedConversation || selectedConversation.accessMode === "read_only" || messageSubmitting}
                        onChange={(event) => setDraftText(event.target.value)}
                        placeholder={
                          selectedConversation?.accessMode === "read_only"
                            ? "This conversation is read-only because a ban froze direct messaging."
                            : selectedFile
                              ? "Add an optional attachment comment."
                              : "Write a message. Shift+Enter or line breaks are preserved."
                        }
                        rows={4}
                        value={draftText}
                      />
                      <div className="attachment-picker-row">
                        <label className={editTarget ? "secondary-button disabled-file-picker" : "secondary-button file-picker"}>
                          <input
                            accept="image/*,.pdf,.txt,.md,.zip,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                            disabled={!selectedConversation || selectedConversation.accessMode === "read_only" || messageSubmitting || !!editTarget}
                            key={fileInputKey}
                            onChange={(event) => {
                              const nextFile = event.target.files?.[0] ?? null;
                              setSelectedFile(nextFile);
                            }}
                            type="file"
                          />
                          {selectedFile ? "Replace file" : "Attach file"}
                        </label>
                        <span className="panel-copy">
                          Files are stored on the local uploads volume and re-checked against room or direct-message access on every download.
                        </span>
                      </div>
                      <div className="chat-composer-actions">
                        <span className="panel-copy">
                          Timeline rendering is windowed so the DOM stays bounded even when history scales far past the visible slice.
                        </span>
                        <button
                          className="primary-button"
                          disabled={
                            !selectedConversation ||
                            selectedConversation.accessMode === "read_only" ||
                            messageSubmitting ||
                            (!selectedFile && !draftText.trim())
                          }
                          type="submit"
                        >
                          {messageSubmitting ? "Saving..." : editTarget ? "Save edit" : selectedFile ? "Upload file" : "Send message"}
                        </button>
                      </div>
                    </form>
                  </footer>
                </>
              )}
            </section>

            <aside className="chat-detail">
              <div className="chat-sidebar-card">
                <span className="panel-kicker">Conversation details</span>
                <h2>{selectedConversation?.title ?? "Waiting for selection"}</h2>
                <p className="panel-copy">
                  {selectedConversation?.subtitle ??
                    "Room membership and direct-message policy still live on the backend; this panel just surfaces the current slice of that state."}
                </p>
              </div>

              <div className="chat-sidebar-card">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">Policy lens</span>
                    <h2>What the server is enforcing</h2>
                  </div>
                </div>

                <ul className="fact-list">
                  <li>Room members can post, and room admins can delete messages they did not author.</li>
                  <li>Direct messages require friendship and become read-only if a ban is later introduced.</li>
                  <li>SignalR events carry watermarks so the client can spot gaps and call sync repair.</li>
                </ul>
              </div>

              <div className="chat-sidebar-card">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">Pending social state</span>
                    <h2>Invites and requests</h2>
                  </div>
                </div>

                <div className="detail-metric">
                  <span>Room invitations</span>
                  <strong>{roomDirectory?.pendingInvitations.length ?? 0}</strong>
                </div>
                <div className="detail-metric">
                  <span>Incoming friend requests</span>
                  <strong>{contactSummary?.incomingFriendRequests.length ?? 0}</strong>
                </div>
                <div className="detail-metric">
                  <span>Outgoing bans</span>
                  <strong>{contactSummary?.bansIssued.length ?? 0}</strong>
                </div>
              </div>

              <div className="chat-sidebar-card">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">Realtime contract</span>
                    <h2>Current transport notes</h2>
                  </div>
                </div>

                <ul className="fact-list">
                  <li>Hub path: {realtimeContract?.hubPath ?? "/hubs/realtime"}</li>
                  <li>Conversation groups: {realtimeContract?.conversationGroupPattern ?? "conversation:{conversationId}"}</li>
                  <li>Sync mode: {realtimeContract?.syncMode ?? "rest-gap-repair"}</li>
                </ul>
              </div>
            </aside>
          </section>
        ) : null}

        {workspaceStatus === "error" ? (
          <section className="chat-layout">
            <article className="chat-main">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Recoverable error</span>
                  <h2>The chat workspace needs a retry</h2>
                </div>
              </div>
              <p className="panel-copy">
                This branch keeps reconnect, empty, and error states visible because trust in chat
                history depends on the UI being explicit when live sync is degraded.
              </p>
              <button className="primary-button" onClick={() => void loadWorkspace(true)} type="button">
                Retry loading chat
              </button>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );

  function scrollMessageIntoView(messageId: string) {
    const container = timelineContainerRef.current;
    if (!container) {
      return;
    }

    const target = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    target?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}

function chooseNextSelection(
  current: SelectedConversation | null,
  roomDirectory: RoomDirectoryResponse,
  directConversations: DirectConversationSummaryResponse[],
) {
  if (current?.kind === "room") {
    const matchingRoom = roomDirectory.myRooms.find((room) => room.conversationId === current.conversationId);
    if (matchingRoom) {
      return toRoomSelection(matchingRoom);
    }
  }

  if (current?.kind === "direct") {
    const matchingDirect = directConversations.find((conversation) => conversation.conversationId === current.conversationId);
    if (matchingDirect) {
      return toDirectSelection(matchingDirect);
    }
  }

  if (roomDirectory.myRooms.length > 0) {
    return toRoomSelection(roomDirectory.myRooms[0]);
  }

  if (directConversations.length > 0) {
    return toDirectSelection(directConversations[0]);
  }

  return null;
}

function toRoomSelection(room: RoomListItemResponse): SelectedConversation {
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

function toDirectSelection(direct: DirectConversationSummaryResponse): SelectedConversation {
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

function mergeOlderMessages(older: ChatMessageResponse[], newer: ChatMessageResponse[]) {
  const lookup = new Map<string, ChatMessageResponse>();

  for (const message of [...older, ...newer]) {
    lookup.set(message.messageId, message);
  }

  return Array.from(lookup.values()).sort((left, right) => left.createdWatermark - right.createdWatermark);
}

function previewForMessage(message: ChatMessageResponse | null) {
  if (!message) {
    return null;
  }

  if (message.isDeleted) {
    return "Message deleted";
  }

  if (message.text?.trim()) {
    return message.text;
  }

  return message.attachments.length > 0 ? `Attachment: ${message.attachments[0].originalFileName}` : null;
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
