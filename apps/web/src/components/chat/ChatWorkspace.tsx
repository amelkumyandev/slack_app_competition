"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Add as AddIcon,
  AttachFile as AttachFileIcon,
  Autorenew as AutorenewIcon,
  Bolt as BoltIcon,
  ChatBubbleOutlineOutlined as ChatBubbleOutlineIcon,
  CheckCircleOutlined as CheckCircleOutlinedIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  EditOutlined as EditOutlinedIcon,
  EmojiEmotionsOutlined as EmojiEmotionsOutlinedIcon,
  GroupOutlined as GroupOutlinedIcon,
  LockOutlined as LockOutlinedIcon,
  MarkUnreadChatAlt as MarkUnreadChatAltIcon,
  Person as PersonOutlineIcon,
  PersonAdd as PersonAddIcon,
  PersonOff as PersonOffIcon,
  Refresh as RefreshIcon,
  Reply as ReplyIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Tag as TagIcon,
  WarningAmber as WarningAmberIcon,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  type ChatMessageResponse,
  type ContactSummaryResponse,
  type ConversationReadStateResponse,
  type ConversationSyncResponse,
  type ConversationTimelineResponse,
  type CreateFriendRequestRequest,
  type CreateUserBanRequest,
  type CurrentPresenceResponse,
  type CurrentUserResponse,
  type DirectConversationListResponse,
  type DirectConversationSummaryResponse,
  type FriendRequestContactResponse,
  type MessageAttachmentResponse,
  type MessageResponse,
  type PresenceHeartbeatAcceptedResponse,
  type RealtimeContractResponse,
  type RealtimeEnvelope,
  type RemoveFriendRequest,
  type RemoveUserBanRequest,
  type RoomDetailsResponse,
  type RoomDirectoryResponse,
  type RoomInvitationResponse,
  type RoomListItemResponse,
} from "@/lib/api/contracts";
import { ApiClientError, apiBaseUrl, apiRequest, signalrUrl } from "@/lib/api/client";
import { RoomManagementModal } from "@/components/chat/RoomManagementModal";
import {
  type SelectedConversation,
  pickDefaultConversationId,
  resolveConversationSelection,
  shouldRefreshNavigationForEvent,
  sortDirectConversations,
  sortRooms,
} from "@/features/chat/shell-state";

type WorkspaceStatus = "loading" | "ready" | "auth" | "error";
type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
type PresenceState = "online" | "afk" | "offline";

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
const generatedTabId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function ChatWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected");
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [currentPresence, setCurrentPresence] = useState<CurrentPresenceResponse | null>(null);
  const [roomDirectory, setRoomDirectory] = useState<RoomDirectoryResponse | null>(null);
  const [contactSummary, setContactSummary] = useState<ContactSummaryResponse | null>(null);
  const [directList, setDirectList] = useState<DirectConversationSummaryResponse[]>([]);
  const [realtimeContract, setRealtimeContract] = useState<RealtimeContractResponse | null>(null);
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
  const [roomManagerOpen, setRoomManagerOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [createRoomDraft, setCreateRoomDraft] = useState({ name: "", description: "", isPrivate: false });
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState("");
  const [invitingUser, setInvitingUser] = useState(false);
  const [friendRequestOpen, setFriendRequestOpen] = useState(false);
  const [friendRequestDraft, setFriendRequestDraft] = useState("");
  const [friendRequestSubmitting, setFriendRequestSubmitting] = useState(false);
  const [inboxActionId, setInboxActionId] = useState<string | null>(null);
  const [contactActionId, setContactActionId] = useState<string | null>(null);
  const [activeRoomDetails, setActiveRoomDetails] = useState<RoomDetailsResponse | null>(null);
  const [activeRoomDetailsLoading, setActiveRoomDetailsLoading] = useState(false);

  const connectionRef = useRef<HubConnection | null>(null);
  const selectedConversationRef = useRef<SelectedConversation | null>(null);
  const subscribedConversationIdRef = useRef<string | null>(null);
  const latestWatermarkRef = useRef(0);
  const timelineRequestTokenRef = useRef(0);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const loadOlderPendingRef = useRef(false);
  const tabIdRef = useRef(generatedTabId);
  const connectedAtRef = useRef(new Date().toISOString());
  const lastInteractionAtRef = useRef(new Date().toISOString());

  const requestedConversationId = searchParams.get("conversation");
  const deferredSidebarSearch = useDeferredValue(sidebarSearch.trim().toLowerCase());
  const defaultConversationId = useMemo(
    () => pickDefaultConversationId(roomDirectory, directList),
    [directList, roomDirectory],
  );
  const selectedConversation = useMemo(
    () => resolveConversationSelection(roomDirectory, directList, requestedConversationId ?? defaultConversationId),
    [defaultConversationId, directList, requestedConversationId, roomDirectory],
  );
  const selectedConversationId = selectedConversation?.conversationId ?? null;

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    latestWatermarkRef.current = timeline.latestWatermark;
  }, [timeline.latestWatermark]);

  useEffect(() => {
    if (workspaceStatus !== "ready") {
      return;
    }

    if (requestedConversationId && !selectedConversation) {
      replaceConversationQuery(defaultConversationId ?? null);
      return;
    }

    if (!requestedConversationId && defaultConversationId) {
      replaceConversationQuery(defaultConversationId);
    }
    // The URL query is the durable selection source. When it is missing or invalid,
    // we repair it with the best available conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultConversationId, requestedConversationId, selectedConversation, workspaceStatus]);

  const refreshActiveRoomDetails = useStableEvent(async () => {
    const currentSelection = selectedConversationRef.current;
    if (currentSelection?.kind !== "room") {
      setActiveRoomDetails(null);
      setActiveRoomDetailsLoading(false);
      return;
    }

    setActiveRoomDetailsLoading(true);

    try {
      const details = await apiRequest<RoomDetailsResponse>(`/api/rooms/${currentSelection.roomId}`);
      if (selectedConversationRef.current?.kind === "room" && selectedConversationRef.current.roomId === currentSelection.roomId) {
        setActiveRoomDetails(details);
      }
    } catch {
      if (selectedConversationRef.current?.kind === "room" && selectedConversationRef.current.roomId === currentSelection.roomId) {
        setActiveRoomDetails(null);
      }
    } finally {
      if (selectedConversationRef.current?.kind === "room" && selectedConversationRef.current.roomId === currentSelection.roomId) {
        setActiveRoomDetailsLoading(false);
      }
    }
  });

  async function fetchNavigationData() {
    const [rooms, contacts, directs] = await Promise.all([
      apiRequest<RoomDirectoryResponse>("/api/rooms"),
      apiRequest<ContactSummaryResponse>("/api/contacts"),
      apiRequest<DirectConversationListResponse>("/api/conversations/direct"),
    ]);

    return {
      rooms,
      contacts,
      directs,
    };
  }

  async function refreshNavigationData() {
    const navigation = await fetchNavigationData();
    setRoomDirectory(navigation.rooms);
    setContactSummary(navigation.contacts);
    setDirectList(navigation.directs.conversations);
    return navigation;
  }

  const refreshCurrentPresence = useStableEvent(async () => {
    try {
      const response = await apiRequest<CurrentPresenceResponse>("/api/presence/me");
      setCurrentPresence(response);
    } catch {
      // Presence is supplemental. The chat workspace stays usable if this call fails.
    }
  });

  const sendPresenceHeartbeat = useStableEvent(async () => {
    if (workspaceStatus !== "ready") {
      return;
    }

    const payload = {
      tabId: tabIdRef.current,
      lastInteractionAtUtc: lastInteractionAtRef.current,
      visibilityState: typeof document === "undefined" ? "visible" : document.visibilityState,
      connectedAtUtc: connectedAtRef.current,
    };

    try {
      const connection = connectionRef.current;
      const accepted =
        connection && connection.state === HubConnectionState.Connected
          ? await connection.invoke<PresenceHeartbeatAcceptedResponse>("Heartbeat", payload)
          : await apiRequest<PresenceHeartbeatAcceptedResponse>("/api/presence/heartbeat", {
              method: "POST",
              body: JSON.stringify(payload),
            });

      setCurrentPresence((current) =>
        current
          ? {
              ...current,
              presence: accepted.presence,
              heartbeatIntervalSeconds: accepted.heartbeatIntervalSeconds,
              heartbeatTtlSeconds: accepted.heartbeatTtlSeconds,
              afkThresholdSeconds: accepted.afkThresholdSeconds,
            }
          : null,
      );
    } catch {
      // Presence refresh should not interrupt core chat flows.
    }
  });

  const handleRealtimeEvent = useStableEvent((event: RealtimeEnvelope) => {
    const selected = selectedConversationRef.current;

    if (selected && event.scope === "conversation" && event.conversationId === selected.conversationId && event.watermark) {
      if (event.watermark > latestWatermarkRef.current + 1) {
        void syncSelectedConversation("gap");
        return;
      }

      if (event.watermark > latestWatermarkRef.current) {
        void syncSelectedConversation("live");
      }

      return;
    }

    if (shouldRefreshNavigationForEvent(event, selected?.conversationId ?? null)) {
      void refreshNavigationData()
        .then(() => refreshActiveRoomDetails())
        .catch(() => undefined);
    }
  });

  useEffect(() => {
    void loadWorkspace(true);

    return () => {
      void disconnectRealtime();
    };
    // Initial workspace bootstrapping happens once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (workspaceStatus !== "ready") {
      return;
    }

    void refreshCurrentPresence();
    void sendPresenceHeartbeat();

    const updateLastInteraction = () => {
      lastInteractionAtRef.current = new Date().toISOString();
    };

    const handleVisible = () => {
      lastInteractionAtRef.current = new Date().toISOString();
      void sendPresenceHeartbeat();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleVisible();
      }
    };

    const heartbeatIntervalMs = Math.max(
      10,
      realtimeContract?.presence.heartbeatIntervalSeconds ?? currentPresence?.heartbeatIntervalSeconds ?? 20,
    ) * 1000;

    const intervalId = window.setInterval(() => {
      void sendPresenceHeartbeat();
    }, heartbeatIntervalMs);

    window.addEventListener("pointerdown", updateLastInteraction, { passive: true });
    window.addEventListener("keydown", updateLastInteraction);
    window.addEventListener("touchstart", updateLastInteraction, { passive: true });
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pointerdown", updateLastInteraction);
      window.removeEventListener("keydown", updateLastInteraction);
      window.removeEventListener("touchstart", updateLastInteraction);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    currentPresence?.heartbeatIntervalSeconds,
    realtimeContract?.presence.heartbeatIntervalSeconds,
    refreshCurrentPresence,
    sendPresenceHeartbeat,
    workspaceStatus,
  ]);

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
        handleRealtimeEvent(event);
      });

      connection.onreconnecting((error) => {
        setRealtimeStatus("reconnecting");
        setFeedbackMessage(getErrorMessage(error, "Trying to reconnect to live updates."));
      });

      connection.onreconnected(async () => {
        setRealtimeStatus("connected");

        const activeConversation = selectedConversationRef.current;
        if (activeConversation) {
          await syncConversationSubscription(activeConversation.conversationId);
          await syncSelectedConversation("reconnected");
        }

        await sendPresenceHeartbeat();
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
        await sendPresenceHeartbeat();

        const activeConversation = selectedConversationRef.current;
        if (activeConversation) {
          await syncConversationSubscription(activeConversation.conversationId);
        }
      } catch (error) {
        if (!disposed) {
          setRealtimeStatus("error");
          setErrorMessage(getErrorMessage(error, "We couldn't connect live updates right now."));
        }
      }
    };

    void startConnection();

    return () => {
      disposed = true;
      void stopConnection();
    };
    // Realtime connection bootstrapping intentionally tracks workspace readiness.
    // The effect event handlers keep the live callbacks fresh without re-opening the hub on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRealtimeEvent, sendPresenceHeartbeat, workspaceStatus]);

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
      setActiveRoomDetails(null);
      setActiveRoomDetailsLoading(false);
      void clearConversationSubscription();
      return;
    }

    setReplyTarget(null);
    setEditTarget(null);
    setSelectedFile(null);
    setFileInputKey((current) => current + 1);
    shouldScrollToBottomRef.current = true;
    void loadTimeline(selectedConversationId, { replace: true, markRead: true });
    void syncConversationSubscription(selectedConversationId);
    void refreshActiveRoomDetails();
    // Selection changes intentionally drive timeline loading and room-details refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshActiveRoomDetails, selectedConversationId]);

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
      const [me, navigation, contract] = await Promise.all([
        apiRequest<CurrentUserResponse>("/api/auth/me"),
        fetchNavigationData(),
        apiRequest<RealtimeContractResponse>("/api/realtime/contract"),
      ]);

      setCurrentUser(me);
      setRoomDirectory(navigation.rooms);
      setContactSummary(navigation.contacts);
      setDirectList(navigation.directs.conversations);
      setRealtimeContract(contract);
      setWorkspaceStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        setWorkspaceStatus("auth");
        setCurrentUser(null);
        setRoomDirectory(null);
        setContactSummary(null);
        setDirectList([]);
        replaceConversationQuery(null);
        return;
      }

      setWorkspaceStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't load your chat workspace."));
    } finally {
      setRefreshing(false);
    }
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
    const requestToken = ++timelineRequestTokenRef.current;
    const container = timelineContainerRef.current;
    const prependAnchor = !options.replace && container
      ? { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop }
      : null;

    setTimeline((current) => ({
      conversationId,
      messages: current.messages,
      nextCursor: options.replace ? null : current.nextCursor,
      latestWatermark: current.latestWatermark,
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

      if (requestToken !== timelineRequestTokenRef.current || selectedConversationRef.current?.conversationId !== conversationId) {
        return;
      }

      setTimeline((current) => {
        const nextMessages = options.replace ? response.messages : mergeOlderMessages(response.messages, current.messages);

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

      if (!options.replace && prependAnchor) {
        window.requestAnimationFrame(() => {
          const currentContainer = timelineContainerRef.current;
          if (!currentContainer) {
            return;
          }

          currentContainer.scrollTop =
            currentContainer.scrollHeight - prependAnchor.scrollHeight + prependAnchor.scrollTop;
        });
      }

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
      if (requestToken !== timelineRequestTokenRef.current || selectedConversationRef.current?.conversationId !== conversationId) {
        return;
      }

      setTimeline((current) => ({
        ...current,
        loading: false,
        loadingOlder: false,
        syncing: false,
        error: getErrorMessage(error, "We couldn't load this conversation."),
      }));
    }
  }

  async function loadOlderMessages() {
    if (!selectedConversation || !timeline.nextCursor || timeline.loadingOlder || timeline.loading) {
      return;
    }

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

      if (selectedConversationRef.current?.conversationId !== activeConversation.conversationId) {
        return;
      }

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
        setFeedbackMessage("We repaired a missed update and reloaded the latest messages.");
      }
    } catch (error) {
      setTimeline((current) => ({
        ...current,
        syncing: false,
        error: getErrorMessage(error, "We couldn't resync this conversation."),
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

  async function clearConversationSubscription() {
    const connection = connectionRef.current;
    const currentConversationId = subscribedConversationIdRef.current;

    if (!connection || connection.state !== HubConnectionState.Connected || !currentConversationId) {
      subscribedConversationIdRef.current = null;
      return;
    }

    await connection.invoke("UnsubscribeConversation", `conversation:${currentConversationId}`);
    subscribedConversationIdRef.current = null;
  }

  function replaceConversationQuery(conversationId: string | null) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (conversationId) {
      nextParams.set("conversation", conversationId);
    } else {
      nextParams.delete("conversation");
    }

    const nextQuery = nextParams.toString();
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextHref, { scroll: false });
  }

  function selectConversation(conversationId: string | null) {
    startTransition(() => {
      replaceConversationQuery(conversationId);
    });
  }

  async function handleJoinRoom(room: RoomListItemResponse) {
    setJoiningRoomId(room.id);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const response = await apiRequest<MessageResponse>(`/api/rooms/${room.id}/join`, {
        method: "POST",
      });

      await refreshNavigationData();
      setFeedbackMessage(response.message);
      selectConversation(room.conversationId);
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
      selectConversation(directConversation.conversationId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That direct message could not be opened."));
    } finally {
      setOpeningDirectUserName(null);
    }
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || selectedConversation.accessMode === "read_only") {
      return;
    }

    setMessageSubmitting(true);
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
      }

      setDraftText("");
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      setReplyTarget(null);
      setEditTarget(null);
      shouldScrollToBottomRef.current = true;
      await loadTimeline(selectedConversation.conversationId, { replace: true, markRead: true });
      await refreshNavigationData();
      await refreshActiveRoomDetails();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That message could not be saved."));
    } finally {
      setMessageSubmitting(false);
    }
  }

  async function handleDeleteMessage(message: ChatMessageResponse) {
    if (!selectedConversation) {
      return;
    }

    if (!window.confirm("Delete this message?")) {
      return;
    }

    setErrorMessage(null);

    try {
      await apiRequest<ChatMessageResponse>(
        `/api/conversations/${selectedConversation.conversationId}/messages/${message.messageId}`,
        {
          method: "DELETE",
        },
      );

      await loadTimeline(selectedConversation.conversationId, { replace: true, markRead: true });
      await refreshNavigationData();
      await refreshActiveRoomDetails();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That message could not be deleted."));
    }
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = createRoomDraft.name.trim();
    if (!trimmedName) {
      return;
    }

    setCreatingRoom(true);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const created = await apiRequest<RoomListItemResponse>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          description: createRoomDraft.description.trim() || null,
          isPrivate: createRoomDraft.isPrivate,
        }),
      });

      setCreateRoomOpen(false);
      setCreateRoomDraft({ name: "", description: "", isPrivate: false });
      await refreshNavigationData();
      setFeedbackMessage(`Created #${created.name}.`);
      selectConversation(created.conversationId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That room could not be created."));
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation || selectedConversation.kind !== "room") {
      return;
    }

    const targetUserName = inviteDraft.trim();
    if (!targetUserName) {
      return;
    }

    setInvitingUser(true);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest<MessageResponse>(
        `/api/rooms/${selectedConversation.roomId}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ targetUserName }),
        },
      );

      setFeedbackMessage(`Invited ${targetUserName}.`);
      setInviteOpen(false);
      setInviteDraft("");
      await refreshNavigationData();
      await refreshActiveRoomDetails();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That invitation could not be sent."));
    } finally {
      setInvitingUser(false);
    }
  }

  async function handleSendFriendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetUserName = friendRequestDraft.trim();
    if (!targetUserName) {
      return;
    }

    setFriendRequestSubmitting(true);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const payload: CreateFriendRequestRequest = {
        targetUserName,
      };

      await apiRequest<MessageResponse>("/api/contacts/friend-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFriendRequestOpen(false);
      setFriendRequestDraft("");
      setFeedbackMessage(`Friend request sent to ${targetUserName}.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That friend request could not be sent."));
    } finally {
      setFriendRequestSubmitting(false);
    }
  }

  async function handleAcceptRoomInvitation(invitation: RoomInvitationResponse) {
    const actionId = `accept-room-${invitation.id}`;
    setInboxActionId(actionId);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest<MessageResponse>(`/api/rooms/invitations/${invitation.id}/accept`, {
        method: "POST",
      });

      const navigation = await refreshNavigationData();
      const acceptedRoom = navigation.rooms.myRooms.find((room) => room.id === invitation.roomId);
      setFeedbackMessage(`Joined #${invitation.roomName}.`);
      selectConversation(acceptedRoom?.conversationId ?? null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That invitation could not be accepted."));
    } finally {
      setInboxActionId(null);
    }
  }

  async function handleDeclineRoomInvitation(invitation: RoomInvitationResponse) {
    const actionId = `decline-room-${invitation.id}`;
    setInboxActionId(actionId);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest<MessageResponse>(`/api/rooms/invitations/${invitation.id}/decline`, {
        method: "POST",
      });

      setFeedbackMessage(`Declined the invitation to #${invitation.roomName}.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That invitation could not be declined."));
    } finally {
      setInboxActionId(null);
    }
  }

  async function handleAcceptFriendRequest(friendRequest: FriendRequestContactResponse) {
    const actionId = `accept-friend-${friendRequest.id}`;
    setInboxActionId(actionId);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest<MessageResponse>(`/api/contacts/friend-requests/${friendRequest.id}/accept`, {
        method: "POST",
      });

      setFeedbackMessage(`You and ${friendRequest.requesterUserName} are now connected.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That friend request could not be accepted."));
    } finally {
      setInboxActionId(null);
    }
  }

  async function handleDeclineFriendRequest(friendRequest: FriendRequestContactResponse) {
    const actionId = `decline-friend-${friendRequest.id}`;
    setInboxActionId(actionId);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest<MessageResponse>(`/api/contacts/friend-requests/${friendRequest.id}/decline`, {
        method: "POST",
      });

      setFeedbackMessage(`Declined ${friendRequest.requesterUserName}'s request.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That friend request could not be declined."));
    } finally {
      setInboxActionId(null);
    }
  }

  async function handleRemoveFriend(targetUserName: string) {
    if (!window.confirm(`Remove ${targetUserName} from your contacts? Direct messaging will stop until you reconnect again.`)) {
      return;
    }

    setContactActionId(`remove-friend-${targetUserName}`);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const payload: RemoveFriendRequest = {
        targetUserName,
      };

      await apiRequest<MessageResponse>("/api/contacts/friends/remove", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFeedbackMessage(`${targetUserName} was removed from your contacts.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That contact could not be removed."));
    } finally {
      setContactActionId(null);
    }
  }

  async function handleBanUser(targetUserName: string) {
    if (!window.confirm(`Block ${targetUserName}? Existing direct history stays visible but new messages will be frozen.`)) {
      return;
    }

    setContactActionId(`ban-${targetUserName}`);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const payload: CreateUserBanRequest = {
        targetUserName,
      };

      await apiRequest<MessageResponse>("/api/contacts/bans", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFeedbackMessage(`${targetUserName} is now blocked.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That user could not be blocked."));
    } finally {
      setContactActionId(null);
    }
  }

  async function handleUnbanUser(targetUserName: string) {
    setContactActionId(`unban-${targetUserName}`);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const payload: RemoveUserBanRequest = {
        targetUserName,
      };

      await apiRequest<MessageResponse>("/api/contacts/bans/remove", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFeedbackMessage(`${targetUserName} is no longer blocked.`);
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That user could not be unblocked."));
    } finally {
      setContactActionId(null);
    }
  }

  async function handleDownloadAttachment(attachment: MessageAttachmentResponse) {
    setDownloadTargetId(attachment.id);
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
      setErrorMessage(getErrorMessage(error, "That attachment could not be downloaded."));
    } finally {
      setDownloadTargetId(null);
    }
  }

  const totalConversationUnread =
    (roomDirectory?.myRooms.reduce((count, room) => count + room.unreadCount, 0) ?? 0) +
    directList.reduce((count, conversation) => count + conversation.unreadCount, 0);
  const totalInboxItems =
    (roomDirectory?.pendingInvitations.length ?? 0) +
    (contactSummary?.incomingFriendRequests.length ?? 0);
  const pendingRoomInvitations = useMemo(
    () =>
      (roomDirectory?.pendingInvitations ?? []).filter(
        (invitation) =>
          !deferredSidebarSearch ||
          invitation.roomName.toLowerCase().includes(deferredSidebarSearch) ||
          invitation.invitedByUserName.toLowerCase().includes(deferredSidebarSearch),
      ),
    [deferredSidebarSearch, roomDirectory?.pendingInvitations],
  );
  const incomingFriendRequests = useMemo(
    () =>
      (contactSummary?.incomingFriendRequests ?? []).filter(
        (request) =>
          !deferredSidebarSearch ||
          request.requesterUserName.toLowerCase().includes(deferredSidebarSearch) ||
          request.addresseeUserName.toLowerCase().includes(deferredSidebarSearch),
      ),
    [contactSummary?.incomingFriendRequests, deferredSidebarSearch],
  );
  const publicRooms = useMemo(
    () => sortRooms((roomDirectory?.myRooms ?? []).filter((room) => !room.isPrivate && matchesRoom(room, deferredSidebarSearch))),
    [deferredSidebarSearch, roomDirectory?.myRooms],
  );
  const privateRooms = useMemo(
    () => sortRooms((roomDirectory?.myRooms ?? []).filter((room) => room.isPrivate && matchesRoom(room, deferredSidebarSearch))),
    [deferredSidebarSearch, roomDirectory?.myRooms],
  );
  const filteredDirects = useMemo(
    () =>
      sortDirectConversations(
        directList.filter(
          (conversation) =>
            !deferredSidebarSearch ||
            conversation.targetUserName.toLowerCase().includes(deferredSidebarSearch) ||
            (conversation.lastMessagePreview ?? "").toLowerCase().includes(deferredSidebarSearch),
        ),
      ),
    [deferredSidebarSearch, directList],
  );
  const filteredFriends = useMemo(
    () =>
      (contactSummary?.friends ?? [])
        .filter((friend) => !deferredSidebarSearch || friend.userName.toLowerCase().includes(deferredSidebarSearch))
        .sort((left, right) => left.userName.localeCompare(right.userName, undefined, { sensitivity: "base" })),
    [contactSummary?.friends, deferredSidebarSearch],
  );
  const friendsWithoutDirect = useMemo(
    () => filteredFriends.filter((friend) => !directList.some((conversation) => conversation.targetUserId === friend.userId)),
    [directList, filteredFriends],
  );
  const filteredPublicCatalog = useMemo(
    () =>
      sortRooms((roomDirectory?.publicCatalog ?? []).filter((room) => matchesRoom(room, deferredSidebarSearch))),
    [deferredSidebarSearch, roomDirectory?.publicCatalog],
  );
  const activeRoom = selectedConversation?.kind === "room" ? selectedConversation.room : null;
  const selectedDirectFriend =
    selectedConversation?.kind === "direct"
      ? contactSummary?.friends.find((friend) => friend.userId === selectedConversation.targetUserId) ?? null
      : null;
  const selectedDirectBanIssued =
    selectedConversation?.kind === "direct"
      ? contactSummary?.bansIssued.find((ban) => ban.userId === selectedConversation.targetUserId) ?? null
      : null;
  const selectedDirectBanReceived =
    selectedConversation?.kind === "direct"
      ? contactSummary?.bansReceived.find((ban) => ban.userId === selectedConversation.targetUserId) ?? null
      : null;
  const selectedConversationLabel = selectedConversation
    ? selectedConversation.kind === "room"
      ? `# ${selectedConversation.title}`
      : selectedConversation.title
    : "No conversation selected";
  const currentPresenceState = toPresenceState(currentPresence?.presence.state);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, px: { xs: 1, md: 2 }, py: { xs: 1, md: 2 } }}>
      {feedbackMessage ? (
        <Alert severity="success" onClose={() => setFeedbackMessage(null)} sx={{ mb: 1.5 }}>
          {feedbackMessage}
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ mb: 1.5 }}>
          {errorMessage}
        </Alert>
      ) : null}

      {workspaceStatus === "loading" ? (
        <StatePanel
          action={<CircularProgress size={22} />}
          subtitle="Loading"
          title="Opening your chat workspace"
          detail="Bringing in conversations, contacts, and the latest message history."
        />
      ) : null}

      {workspaceStatus === "auth" ? (
        <StatePanel
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Button component={Link} href="/auth/sign-in" variant="contained">
                Go to sign in
              </Button>
              <Button component={Link} href="/auth/register" variant="outlined">
                Create account
              </Button>
            </Stack>
          }
          subtitle="Access required"
          title="Sign in to open your chats"
        />
      ) : null}

      {workspaceStatus === "error" ? (
        <StatePanel
          action={
            <Button onClick={() => void loadWorkspace(true)} variant="contained">
              Retry
            </Button>
          }
          subtitle="Something went wrong"
          title="The workspace needs another try"
        />
      ) : null}

      {workspaceStatus === "ready" ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: sidebarCollapsed ? "72px minmax(0, 1fr)" : "minmax(280px, 320px) minmax(0, 1fr)",
              xl: sidebarCollapsed
                ? "72px minmax(0, 1fr) minmax(300px, 340px)"
                : "minmax(280px, 320px) minmax(0, 1fr) minmax(300px, 340px)",
            },
            gap: 1.5,
            flex: 1,
            minHeight: 0,
            alignItems: "stretch",
          }}
        >
          <Card
            sx={{
              minHeight: { md: "calc(100vh - 124px)" },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {sidebarCollapsed ? (
              <Stack spacing={1.5} sx={{ p: 1, alignItems: "center" }}>
                <Tooltip title="Expand sidebar">
                  <IconButton onClick={() => setSidebarCollapsed(false)} size="small">
                    <ChevronRightIcon />
                  </IconButton>
                </Tooltip>
                <Badge badgeContent={totalConversationUnread} color="secondary" max={99}>
                  <ChatBubbleOutlineIcon />
                </Badge>
                <Badge badgeContent={totalInboxItems} color="warning" max={99}>
                  <CheckCircleOutlinedIcon fontSize="small" />
                </Badge>
                <Tooltip title="New room">
                  <IconButton color="primary" onClick={() => setCreateRoomOpen(true)} size="small">
                    <AddIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Add contact">
                  <IconButton onClick={() => setFriendRequestOpen(true)} size="small">
                    <PersonAddIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 1.5 }}>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
                      <Avatar sx={{ width: 38, height: 38, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light" }}>
                        {(currentUser?.userName ?? "?").slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="h3" sx={{ fontSize: "1.05rem" }}>
                          {currentUser?.userName ?? "Workspace"}
                        </Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 0.5, flexWrap: "wrap" }}>
                          <Chip
                            label={toPresenceLabel(currentPresenceState)}
                            size="small"
                            color={presenceColor(currentPresenceState)}
                            variant={currentPresenceState === "offline" ? "outlined" : "filled"}
                          />
                          {totalConversationUnread > 0 ? (
                            <Chip label={`${totalConversationUnread} unread`} size="small" variant="outlined" />
                          ) : null}
                        </Stack>
                      </Box>
                    </Stack>

                    <Tooltip title="Collapse sidebar">
                      <IconButton onClick={() => setSidebarCollapsed(true)} size="small">
                        <ChevronLeftIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>

                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search rooms, people, and requests"
                    value={sidebarSearch}
                    onChange={(event) => setSidebarSearch(event.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>

                <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 1.5, py: 1.5 }}>
                  <Stack spacing={2}>
                    <SidebarSection title="Inbox" count={totalInboxItems}>
                      {pendingRoomInvitations.length === 0 && incomingFriendRequests.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No pending invitations or contact requests.
                        </Typography>
                      ) : (
                        <Stack spacing={0.75}>
                          {pendingRoomInvitations.map((invitation) => (
                            <InboxActionCard
                              key={invitation.id}
                              description={`Invited by ${invitation.invitedByUserName}`}
                              label={`# ${invitation.roomName}`}
                              primaryAction={
                                <Button
                                  disabled={inboxActionId === `accept-room-${invitation.id}`}
                                  onClick={() => void handleAcceptRoomInvitation(invitation)}
                                  size="small"
                                  variant="contained"
                                >
                                  {inboxActionId === `accept-room-${invitation.id}` ? "Joining..." : "Accept"}
                                </Button>
                              }
                              secondaryAction={
                                <Button
                                  disabled={inboxActionId === `decline-room-${invitation.id}`}
                                  onClick={() => void handleDeclineRoomInvitation(invitation)}
                                  size="small"
                                  variant="text"
                                >
                                  {inboxActionId === `decline-room-${invitation.id}` ? "Declining..." : "Decline"}
                                </Button>
                              }
                            />
                          ))}
                          {incomingFriendRequests.map((request) => (
                            <InboxActionCard
                              key={request.id}
                              description="Wants to start direct messages"
                              label={request.requesterUserName}
                              primaryAction={
                                <Button
                                  disabled={inboxActionId === `accept-friend-${request.id}`}
                                  onClick={() => void handleAcceptFriendRequest(request)}
                                  size="small"
                                  variant="contained"
                                >
                                  {inboxActionId === `accept-friend-${request.id}` ? "Accepting..." : "Accept"}
                                </Button>
                              }
                              secondaryAction={
                                <Button
                                  disabled={inboxActionId === `decline-friend-${request.id}`}
                                  onClick={() => void handleDeclineFriendRequest(request)}
                                  size="small"
                                  variant="text"
                                >
                                  {inboxActionId === `decline-friend-${request.id}` ? "Declining..." : "Decline"}
                                </Button>
                              }
                            />
                          ))}
                        </Stack>
                      )}
                    </SidebarSection>

                    <SidebarSection title="Rooms" count={publicRooms.length}>
                      {publicRooms.length > 0 ? (
                        <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
                          {publicRooms.map((room) => (
                            <ConversationRow
                              key={room.id}
                              active={selectedConversationId === room.conversationId}
                              detail={room.lastMessagePreview ?? `${room.memberCount} members`}
                              label={`# ${room.name}`}
                              onClick={() => selectConversation(room.conversationId)}
                              unreadCount={room.unreadCount}
                            />
                          ))}
                        </List>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          No public rooms yet.
                        </Typography>
                      )}
                    </SidebarSection>

                    <SidebarSection title="Private rooms" count={privateRooms.length}>
                      {privateRooms.length > 0 ? (
                        <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
                          {privateRooms.map((room) => (
                            <ConversationRow
                              key={room.id}
                              active={selectedConversationId === room.conversationId}
                              detail={room.lastMessagePreview ?? `${room.memberCount} members`}
                              icon={<LockOutlinedIcon fontSize="small" />}
                              label={`# ${room.name}`}
                              onClick={() => selectConversation(room.conversationId)}
                              unreadCount={room.unreadCount}
                            />
                          ))}
                        </List>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          No private rooms yet.
                        </Typography>
                      )}
                    </SidebarSection>

                    <SidebarSection title="Direct messages" count={filteredDirects.length}>
                      {filteredDirects.length > 0 ? (
                        <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
                          {filteredDirects.map((conversation) => (
                            <ConversationRow
                              key={conversation.conversationId}
                              active={selectedConversationId === conversation.conversationId}
                              detail={
                                conversation.accessMode === "read_only"
                                  ? "Read-only history"
                                  : conversation.lastMessagePreview ?? "Ready to chat"
                              }
                              label={conversation.targetUserName}
                              onClick={() => selectConversation(conversation.conversationId)}
                              unreadCount={conversation.unreadCount}
                              avatarTone="direct"
                            />
                          ))}
                        </List>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          No direct messages yet.
                        </Typography>
                      )}
                    </SidebarSection>

                    <SidebarSection title="People" count={friendsWithoutDirect.length}>
                      {friendsWithoutDirect.length > 0 ? (
                        <Stack spacing={0.5}>
                          {friendsWithoutDirect.map((friend) => (
                            <ListItemButton
                              key={friend.userId}
                              onClick={() => void handleOpenDirect(friend.userName)}
                              disabled={openingDirectUserName === friend.userName}
                              sx={{ px: 1.25, py: 0.75 }}
                            >
                              <Stack direction="row" spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
                                <Avatar sx={{ width: 30, height: 30, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light", fontSize: "0.8rem" }}>
                                  {friend.userName.slice(0, 1).toUpperCase()}
                                </Avatar>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                    {friend.userName}
                                  </Typography>
                                  <Typography color="text.secondary" variant="caption" noWrap>
                                    {openingDirectUserName === friend.userName ? "Opening..." : "Start a direct message"}
                                  </Typography>
                                </Box>
                              </Stack>
                            </ListItemButton>
                          ))}
                        </Stack>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          Everyone here already has an active direct thread.
                        </Typography>
                      )}
                    </SidebarSection>

                    <SidebarSection title="Discover rooms" count={filteredPublicCatalog.length}>
                      {filteredPublicCatalog.length > 0 ? (
                        <Stack spacing={0.75}>
                          {filteredPublicCatalog.filter((room) => !room.isMember).slice(0, 6).map((room) => (
                            <Paper key={room.id} variant="outlined" sx={{ p: 1.25, borderRadius: 2.5 }}>
                              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                    # {room.name}
                                  </Typography>
                                  <Typography color="text.secondary" variant="caption" sx={{ display: "block" }}>
                                    {room.memberCount} members
                                  </Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={room.isBanned || joiningRoomId === room.id}
                                  onClick={() => void handleJoinRoom(room)}
                                >
                                  {joiningRoomId === room.id ? "Joining..." : room.isBanned ? "Unavailable" : "Join"}
                                </Button>
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          No additional rooms match your search.
                        </Typography>
                      )}
                    </SidebarSection>
                  </Stack>
                </Box>

                <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Stack direction="row" spacing={1}>
                    <Button fullWidth onClick={() => setCreateRoomOpen(true)} startIcon={<AddIcon />} variant="contained">
                      New room
                    </Button>
                    <Button fullWidth onClick={() => setFriendRequestOpen(true)} startIcon={<PersonAddIcon />} variant="outlined">
                      Add contact
                    </Button>
                  </Stack>
                </Box>
              </Box>
            )}
          </Card>

          <Card sx={{ display: "flex", flexDirection: "column", minHeight: { md: "calc(100vh - 124px)" }, overflow: "hidden" }}>
            <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, borderBottom: "1px solid", borderColor: "divider" }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography color="text.secondary" variant="caption" sx={{ display: "block", mb: 0.5 }}>
                    {selectedConversation ? (selectedConversation.kind === "room" ? "Room" : "Direct message") : "Workspace"}
                  </Typography>

                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                    {selectedConversation?.kind === "room" ? (
                      selectedConversation.room.isPrivate ? (
                        <LockOutlinedIcon fontSize="small" sx={{ color: "secondary.light" }} />
                      ) : (
                        <TagIcon fontSize="small" sx={{ color: "secondary.light" }} />
                      )
                    ) : selectedConversation ? (
                      <PersonOutlineIcon fontSize="small" sx={{ color: "primary.light" }} />
                    ) : null}

                    <Typography variant="h2" sx={{ fontSize: { xs: "1.05rem", md: "1.25rem" }, minWidth: 0 }}>
                      <Box
                        component="span"
                        sx={{
                          display: "inline-block",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          verticalAlign: "bottom",
                        }}
                      >
                        {selectedConversation ? selectedConversationLabel : "Start a conversation"}
                      </Box>
                    </Typography>

                    {selectedConversation?.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
                      <Chip color="warning" label="Read only" size="small" />
                    ) : null}
                  </Stack>

                  <Typography
                    color="text.secondary"
                    variant="body2"
                    sx={{
                      mt: 0.5,
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                    }}
                  >
                    {selectedConversation
                      ? selectedConversation.kind === "room"
                        ? selectedConversation.room.description ?? `${selectedConversation.room.memberCount} members`
                        : selectedConversation.subtitle
                      : "Choose a room, open a direct message, or work through the requests in your inbox."}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {selectedConversation?.kind === "room" && activeRoomDetails?.permissions.canInvite ? (
                    <Button onClick={() => setInviteOpen(true)} size="small" startIcon={<PersonAddIcon />} variant="outlined">
                      Invite
                    </Button>
                  ) : null}
                  {selectedConversation?.kind === "room" ? (
                    <Button onClick={() => setRoomManagerOpen(true)} size="small" startIcon={<SettingsIcon />} variant="outlined">
                      Manage
                    </Button>
                  ) : null}
                  <Chip
                    icon={timeline.syncing ? <AutorenewIcon /> : <BoltIcon />}
                    color={timeline.syncing ? "warning" : realtimeStatus === "connected" ? "success" : "default"}
                    label={timeline.syncing ? "Syncing..." : realtimeStatus === "connected" ? "Live" : labelForRealtimeState(realtimeStatus)}
                    size="small"
                    variant="outlined"
                  />
                  <Tooltip title="Refresh workspace">
                    <span>
                      <IconButton onClick={() => void loadWorkspace(false)} disabled={refreshing} size="small">
                        {refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
            </Box>

            {selectedConversation?.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
              <Alert severity="warning" sx={{ mx: 2, mt: 1.5 }}>
                This direct conversation is frozen. You can still review the history, but new messages are blocked.
              </Alert>
            ) : null}
            {realtimeStatus === "reconnecting" ? (
              <Alert severity="warning" sx={{ mx: 2, mt: 1.5 }}>
                Reconnecting live updates...
              </Alert>
            ) : null}
            {timeline.syncing ? (
              <Alert severity="info" sx={{ mx: 2, mt: 1.5 }}>
                Syncing the latest messages...
              </Alert>
            ) : null}
            {timeline.error ? (
              <Alert severity="error" sx={{ mx: 2, mt: 1.5 }}>
                {timeline.error}
              </Alert>
            ) : null}

            {!selectedConversation ? (
              <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 2, md: 4 } }}>
                <Paper
                  variant="outlined"
                  sx={{
                    width: "100%",
                    maxWidth: 780,
                    borderRadius: 4,
                    p: { xs: 3, md: 4 },
                    bgcolor: alpha("#fff", 0.04),
                    borderColor: alpha("#fff", 0.08),
                  }}
                >
                  <Stack spacing={3}>
                    <Box>
                      <Typography color="text.secondary" variant="overline">
                        Chat home
                      </Typography>
                      <Typography variant="h1" sx={{ mt: 0.5, fontSize: { xs: "1.7rem", md: "2.05rem" } }}>
                        Start with a room or contact
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 560 }}>
                        Create a room, accept an invite, or send a new contact request to unlock direct messages.
                      </Typography>
                    </Box>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                      <Button onClick={() => setCreateRoomOpen(true)} startIcon={<AddIcon />} variant="contained">
                        Create room
                      </Button>
                      <Button onClick={() => setFriendRequestOpen(true)} startIcon={<PersonAddIcon />} variant="outlined">
                        Add contact
                      </Button>
                    </Stack>

                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
                      <QuickMetricCard
                        label="Pending invites"
                        value={pendingRoomInvitations.length}
                        detail="Room invitations waiting for a response."
                      />
                      <QuickMetricCard
                        label="Contact requests"
                        value={incomingFriendRequests.length}
                        detail="People who want to start direct messages."
                      />
                    </Stack>
                  </Stack>
                </Paper>
              </Box>
            ) : (
              <>
                <Box
                  onScroll={(event) => {
                    const element = event.currentTarget;

                    if (element.scrollTop < 120 && timeline.nextCursor && !timeline.loadingOlder && !loadOlderPendingRef.current) {
                      loadOlderPendingRef.current = true;
                      void loadOlderMessages().finally(() => {
                        loadOlderPendingRef.current = false;
                      });
                    }
                  }}
                  ref={timelineContainerRef}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    px: { xs: 2, md: 2.5 },
                    py: 1.5,
                  }}
                >
                  {timeline.loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                      <CircularProgress size={28} />
                    </Box>
                  ) : timeline.messages.length === 0 ? (
                    <EmptySurface
                      icon={<MarkUnreadChatAltIcon fontSize="large" />}
                      title="No messages yet"
                      description="Be the first person to send a message in this conversation."
                      compact
                    />
                  ) : (
                    <>
                      {timeline.loadingOlder ? (
                        <Stack direction="row" spacing={1} sx={{ py: 1.5, alignItems: "center", justifyContent: "center" }}>
                          <CircularProgress size={16} />
                          <Typography color="text.secondary" variant="body2">
                            Loading older messages...
                          </Typography>
                        </Stack>
                      ) : !timeline.nextCursor ? (
                        <OlderMessagesDivider label="Beginning of conversation" />
                      ) : (
                        <OlderMessagesDivider label="Scroll up for older messages" />
                      )}

                      <Stack spacing={0.5}>
                        {timeline.messages.map((message, index) => {
                          const showDateDivider = shouldShowDateDivider(timeline.messages, index);

                          return (
                            <Box
                              key={message.messageId}
                              sx={{
                                contentVisibility: "auto",
                                containIntrinsicSize: "220px",
                              }}
                            >
                              {showDateDivider ? <DateDivider label={formatDateDivider(message.createdAtUtc)} /> : null}

                              <MessageRow
                                downloadTargetId={downloadTargetId}
                                message={message}
                                onDelete={() => void handleDeleteMessage(message)}
                                onDownload={(attachment) => void handleDownloadAttachment(attachment)}
                                onEdit={() => {
                                  setReplyTarget(null);
                                  setEditTarget(message);
                                  setSelectedFile(null);
                                  setFileInputKey((current) => current + 1);
                                  setDraftText(message.text ?? "");
                                }}
                                onReply={() => {
                                  setEditTarget(null);
                                  setReplyTarget(message);
                                }}
                                onReplyJump={() => {
                                  if (message.replyPreview) {
                                    scrollMessageIntoView(message.replyPreview.messageId);
                                  }
                                }}
                              />
                            </Box>
                          );
                        })}
                      </Stack>
                    </>
                  )}
                </Box>

                <Box sx={{ px: { xs: 2, md: 2.5 }, pb: { xs: 2, md: 2.5 }, pt: 0 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 3,
                      bgcolor: alpha("#fff", 0.045),
                      borderColor: alpha("#fff", 0.08),
                    }}
                  >
                    <Stack spacing={1}>
                      {replyTarget ? (
                        <Paper
                          variant="outlined"
                          sx={{
                            px: 1.5,
                            py: 0.9,
                            borderRadius: 2,
                            bgcolor: alpha("#5cc8ff", 0.06),
                            borderColor: alpha("#5cc8ff", 0.14),
                          }}
                        >
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="text.secondary">
                                Replying to {replyTarget.authorUserName}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  display: "-webkit-box",
                                  WebkitBoxOrient: "vertical",
                                  WebkitLineClamp: 2,
                                  overflow: "hidden",
                                }}
                              >
                                {replyTarget.text ?? "Attachment"}
                              </Typography>
                            </Box>
                            <IconButton aria-label="Cancel reply" onClick={() => setReplyTarget(null)} size="small">
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Paper>
                      ) : null}

                      {editTarget ? (
                        <InlineComposerState
                          label="Editing your message"
                          onClear={() => {
                            setEditTarget(null);
                            setDraftText("");
                          }}
                        />
                      ) : null}

                      {selectedFile ? (
                        <InlineComposerState
                          label={`${selectedFile.name} (${formatBytes(selectedFile.size)})`}
                          onClear={() => {
                            setSelectedFile(null);
                            setFileInputKey((current) => current + 1);
                          }}
                        />
                      ) : null}

                      <Box component="form" onSubmit={handleSubmitMessage} ref={composerFormRef}>
                        <TextField
                          multiline
                          minRows={3}
                          maxRows={6}
                          fullWidth
                          disabled={selectedConversation.accessMode === "read_only" || messageSubmitting}
                          onChange={(event) => setDraftText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              composerFormRef.current?.requestSubmit();
                            }
                          }}
                          placeholder={
                            selectedConversation.accessMode === "read_only"
                              ? "This conversation is read-only."
                              : `Message ${selectedConversationLabel}`
                          }
                          value={draftText}
                          variant="outlined"
                          slotProps={{ input: { sx: { py: 1 } } }}
                        />

                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 1.25, flexWrap: "wrap" }} useFlexGap>
                          <Tooltip title="Emoji reactions are not available yet">
                            <span>
                              <IconButton aria-label="Add emoji" disabled size="small">
                                <EmojiEmotionsOutlinedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>

                          <Tooltip title={editTarget ? "File attachments are disabled while editing" : "Attach file"}>
                            <span>
                              <IconButton
                                aria-label="Attach file"
                                component="label"
                                disabled={selectedConversation.accessMode === "read_only" || messageSubmitting || !!editTarget}
                                size="small"
                              >
                                <AttachFileIcon fontSize="small" />
                                <input
                                  accept="image/*,.pdf,.txt,.md,.zip,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                  hidden
                                  disabled={selectedConversation.accessMode === "read_only" || messageSubmitting || !!editTarget}
                                  key={fileInputKey}
                                  onChange={(event) => {
                                    const nextFile = event.target.files?.[0] ?? null;
                                    setSelectedFile(nextFile);
                                  }}
                                  type="file"
                                />
                              </IconButton>
                            </span>
                          </Tooltip>

                          <Box sx={{ flex: 1 }} />
                          <Typography color="text.secondary" variant="caption" sx={{ mr: 0.5 }}>
                            {selectedConversation.accessMode === "read_only"
                              ? "Messaging unavailable"
                              : realtimeStatus === "reconnecting"
                                ? "We'll send again once live updates reconnect"
                                : selectedFile
                                  ? "Attachment ready"
                                  : "Enter to send, Shift+Enter for a new line"}
                          </Typography>
                          <Button
                            disabled={
                              selectedConversation.accessMode === "read_only" ||
                              messageSubmitting ||
                              (!selectedFile && !draftText.trim())
                            }
                            endIcon={messageSubmitting ? <CircularProgress color="inherit" size={14} /> : <SendIcon fontSize="small" />}
                            onClick={() => composerFormRef.current?.requestSubmit()}
                            type="button"
                            variant="contained"
                            size="medium"
                          >
                            {messageSubmitting ? "Sending..." : editTarget ? "Save" : "Send"}
                          </Button>
                        </Stack>
                      </Box>
                    </Stack>
                  </Paper>
                </Box>
              </>
            )}
          </Card>

          <Card
            sx={{
              gridColumn: { xs: "1", md: "1 / -1", xl: "auto" },
              minHeight: { xl: "calc(100vh - 124px)" },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {activeRoom ? (
              <>
                <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="overline" color="text.secondary">
                    Room details
                  </Typography>
                  <Typography variant="h3" sx={{ mt: 0.5 }}>
                    # {activeRoom.name}
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                    <Chip
                      label={activeRoom.isPrivate ? "Private" : "Public"}
                      size="small"
                      color={activeRoom.isPrivate ? "secondary" : "default"}
                      variant="outlined"
                    />
                    <Chip
                      label={activeRoom.isOwner ? "Owner" : activeRoom.isAdmin ? "Admin" : "Member"}
                      size="small"
                      variant="outlined"
                    />
                    <Chip label={`${activeRoom.memberCount} members`} size="small" variant="outlined" />
                  </Stack>
                  {activeRoom.description ? (
                    <Typography color="text.secondary" variant="body2" sx={{ mt: 1.25 }}>
                      {activeRoom.description}
                    </Typography>
                  ) : null}
                </Box>

                <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
                  {activeRoomDetailsLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                      <CircularProgress size={22} />
                    </Box>
                  ) : activeRoomDetails ? (
                    <Stack spacing={2}>
                      {activeRoomDetails.admins.length > 0 ? (
                        <Box>
                          <Typography variant="overline" color="text.secondary">
                            Owner & admins
                          </Typography>
                          <Stack direction="row" spacing={0.5} useFlexGap sx={{ mt: 0.75, flexWrap: "wrap" }}>
                            {activeRoomDetails.admins.map((admin) => (
                              <Chip
                                key={admin.userId}
                                avatar={
                                  <Avatar sx={{ bgcolor: alpha(admin.isOwner ? "#f08ab7" : "#66c8ff", 0.2), fontSize: "0.75rem" }}>
                                    {admin.userName.slice(0, 1).toUpperCase()}
                                  </Avatar>
                                }
                                label={admin.userName}
                                size="small"
                                variant="outlined"
                                color={admin.isOwner ? "secondary" : "default"}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : null}

                      <Box>
                        <Typography variant="overline" color="text.secondary">
                          Members ({activeRoomDetails.members.length})
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                          {activeRoomDetails.members.map((member) => (
                            <Stack
                              key={member.userId}
                              direction="row"
                              spacing={1.25}
                              sx={{
                                alignItems: "center",
                                px: 1,
                                py: 0.85,
                                borderRadius: 1.5,
                                bgcolor: alpha("#fff", 0.02),
                              }}
                            >
                              <Avatar sx={{ width: 30, height: 30, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light", fontSize: "0.8rem" }}>
                                {member.userName.slice(0, 1).toUpperCase()}
                              </Avatar>
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                  {member.userName}
                                </Typography>
                                <Typography color="text.secondary" variant="caption" noWrap>
                                  {member.isOwner ? "Owner" : member.isAdmin ? "Admin" : "Member"}
                                </Typography>
                              </Box>
                            </Stack>
                          ))}
                        </Stack>
                      </Box>

                      {activeRoomDetails.pendingInvitations.length > 0 ? (
                        <Box>
                          <Typography variant="overline" color="text.secondary">
                            Pending invites
                          </Typography>
                          <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                            {activeRoomDetails.pendingInvitations.map((invitation) => (
                              <InboxActionCard
                                key={invitation.id}
                                label={invitation.invitedUserName}
                                description={`Invited by ${invitation.invitedByUserName}`}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : null}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary" variant="body2">
                      Room details are unavailable right now.
                    </Typography>
                  )}
                </Box>

                <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
                  <Stack spacing={1}>
                    {activeRoomDetails?.permissions.canInvite ? (
                      <Button fullWidth onClick={() => setInviteOpen(true)} startIcon={<PersonAddIcon />} variant="outlined">
                        Invite user
                      </Button>
                    ) : null}
                    <Button fullWidth onClick={() => setRoomManagerOpen(true)} startIcon={<SettingsIcon />} variant="contained">
                      Manage room
                    </Button>
                  </Stack>
                </Box>
              </>
            ) : selectedConversation?.kind === "direct" ? (
              <Box sx={{ p: 2.5 }}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Contact details
                    </Typography>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 0.75 }}>
                      <Avatar sx={{ width: 42, height: 42, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light" }}>
                        {selectedConversation.title.slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h3">{selectedConversation.title}</Typography>
                        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.25 }}>
                          {selectedConversation.accessMode === "read_only"
                            ? "History is still visible, but messaging is frozen."
                            : "Direct messages are available."}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Chip
                      label={selectedConversation.accessMode === "read_only" ? "Read only" : "Messaging open"}
                      size="small"
                      color={selectedConversation.accessMode === "read_only" ? "warning" : "success"}
                      variant={selectedConversation.accessMode === "read_only" ? "outlined" : "filled"}
                    />
                    {selectedDirectFriend ? <Chip label="Friend" size="small" variant="outlined" /> : null}
                    {selectedDirectBanIssued ? <Chip label="Blocked by you" size="small" color="error" variant="outlined" /> : null}
                    {selectedDirectBanReceived ? <Chip label="Blocked by them" size="small" color="error" variant="outlined" /> : null}
                  </Stack>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Stack spacing={1.25}>
                      <DetailMetric
                        label="Last activity"
                        value={
                          selectedConversation.direct.lastMessageAtUtc
                            ? formatDateTime(selectedConversation.direct.lastMessageAtUtc)
                            : "No messages yet"
                        }
                      />
                      <DetailMetric label="Unread" value={selectedConversation.direct.unreadCount} />
                      {selectedDirectFriend ? (
                        <DetailMetric label="Connected since" value={formatDateTime(selectedDirectFriend.createdAtUtc)} />
                      ) : null}
                    </Stack>
                  </Paper>

                  <Stack spacing={1}>
                    {selectedDirectFriend ? (
                      <Button
                        disabled={contactActionId === `remove-friend-${selectedConversation.title}`}
                        onClick={() => void handleRemoveFriend(selectedConversation.title)}
                        startIcon={<PersonOffIcon />}
                        variant="outlined"
                      >
                        {contactActionId === `remove-friend-${selectedConversation.title}` ? "Updating..." : "Remove friend"}
                      </Button>
                    ) : null}

                    {selectedDirectBanIssued ? (
                      <Button
                        disabled={contactActionId === `unban-${selectedConversation.title}`}
                        onClick={() => void handleUnbanUser(selectedConversation.title)}
                        variant="outlined"
                      >
                        {contactActionId === `unban-${selectedConversation.title}` ? "Updating..." : "Unblock"}
                      </Button>
                    ) : (
                      <Button
                        color="error"
                        disabled={contactActionId === `ban-${selectedConversation.title}`}
                        onClick={() => void handleBanUser(selectedConversation.title)}
                        variant="outlined"
                      >
                        {contactActionId === `ban-${selectedConversation.title}` ? "Blocking..." : "Block user"}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            ) : (
              <Box sx={{ p: 2.5 }}>
                <EmptySurface
                  compact
                  icon={<GroupOutlinedIcon />}
                  title="Keep the side panel focused"
                  description="Room details or direct-message context will appear here when you open a conversation."
                />
              </Box>
            )}
          </Card>
        </Box>
      ) : null}

      <Dialog open={createRoomOpen} onClose={() => setCreateRoomOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create a new room</DialogTitle>
        <Box component="form" onSubmit={handleCreateRoom}>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <TextField
                autoFocus
                fullWidth
                label="Room name"
                onChange={(event) => setCreateRoomDraft((current) => ({ ...current, name: event.target.value }))}
                required
                value={createRoomDraft.name}
              />
              <TextField
                fullWidth
                label="Description (optional)"
                multiline
                minRows={3}
                onChange={(event) => setCreateRoomDraft((current) => ({ ...current, description: event.target.value }))}
                value={createRoomDraft.description}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={createRoomDraft.isPrivate}
                    onChange={(event) => setCreateRoomDraft((current) => ({ ...current, isPrivate: event.target.checked }))}
                  />
                }
                label={createRoomDraft.isPrivate ? "Private (invite only)" : "Public (anyone can join)"}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setCreateRoomOpen(false)}>Cancel</Button>
            <Button disabled={creatingRoom || !createRoomDraft.name.trim()} type="submit" variant="contained">
              {creatingRoom ? "Creating..." : "Create room"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Invite a user</DialogTitle>
        <Box component="form" onSubmit={handleInviteUser}>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Username"
              onChange={(event) => setInviteDraft(event.target.value)}
              required
              value={inviteDraft}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button disabled={invitingUser || !inviteDraft.trim()} type="submit" variant="contained">
              {invitingUser ? "Sending..." : "Send invite"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={friendRequestOpen} onClose={() => setFriendRequestOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add a contact</DialogTitle>
        <Box component="form" onSubmit={handleSendFriendRequest}>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Username"
              onChange={(event) => setFriendRequestDraft(event.target.value)}
              required
              value={friendRequestDraft}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setFriendRequestOpen(false)}>Cancel</Button>
            <Button disabled={friendRequestSubmitting || !friendRequestDraft.trim()} type="submit" variant="contained">
              {friendRequestSubmitting ? "Sending..." : "Send request"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {activeRoom ? (
        <RoomManagementModal
          currentUserName={currentUser?.userName ?? null}
          isOpen={roomManagerOpen}
          onClose={() => setRoomManagerOpen(false)}
          onWorkspaceRefresh={async () => {
            await refreshNavigationData();
            await refreshActiveRoomDetails();
          }}
          room={activeRoom}
        />
      ) : null}
    </Box>
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

type StatePanelProps = {
  title: string;
  subtitle: string;
  detail?: string;
  action?: ReactNode;
};

function StatePanel({ title, subtitle, detail, action }: StatePanelProps) {
  return (
    <Card sx={{ maxWidth: 920, mx: "auto" }}>
      <CardContent sx={{ p: 4 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {subtitle}
            </Typography>
            <Typography variant="h2" sx={{ mt: 0.5 }}>
              {title}
            </Typography>
            {detail ? (
              <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                {detail}
              </Typography>
            ) : null}
          </Box>
          {action}
        </Stack>
      </CardContent>
    </Card>
  );
}

type EmptySurfaceProps = {
  title: string;
  description: string;
  icon: ReactNode;
  compact?: boolean;
};

function EmptySurface({ title, description, icon, compact = false }: EmptySurfaceProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: compact ? 2.5 : 3,
        borderRadius: 3,
        borderStyle: "dashed",
        borderColor: alpha("#fff", 0.14),
        bgcolor: alpha("#fff", 0.02),
      }}
    >
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ color: "text.secondary", display: "inline-flex" }}>{icon}</Box>
        <Typography variant="h3">{title}</Typography>
        <Typography color="text.secondary" variant="body2">
          {description}
        </Typography>
      </Stack>
    </Paper>
  );
}

type SidebarSectionProps = {
  title: string;
  count?: number;
  children: ReactNode;
};

function SidebarSection({ title, count, children }: SidebarSectionProps) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 0.5, mb: 0.75 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.2 }}>
          {title}
        </Typography>
        {typeof count === "number" ? (
          <Typography variant="caption" color="text.disabled">
            {count}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Box>
  );
}

type ConversationRowProps = {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  unreadCount: number;
  icon?: ReactNode;
  avatarTone?: "room" | "direct";
};

function ConversationRow({
  label,
  detail,
  active,
  onClick,
  unreadCount,
  icon,
  avatarTone = "room",
}: ConversationRowProps) {
  return (
    <ListItemButton selected={active} onClick={onClick} sx={{ borderRadius: 2, py: 0.75 }}>
      <Stack direction="row" spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
        <Badge badgeContent={unreadCount > 0 ? unreadCount : 0} color="secondary" invisible={unreadCount <= 0}>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: avatarTone === "direct" ? alpha("#66c8ff", 0.12) : alpha("#f08ab7", 0.12),
              color: avatarTone === "direct" ? "primary.light" : "secondary.light",
              fontSize: "0.85rem",
            }}
          >
            {icon ?? label.replace(/^#\s*/, "").slice(0, 1).toUpperCase()}
          </Avatar>
        </Badge>

        <ListItemText
          sx={{ my: 0, minWidth: 0 }}
          primary={
            <Typography variant="body2" sx={{ fontWeight: 600, letterSpacing: 0 }} noWrap>
              {label}
            </Typography>
          }
          secondary={
            <Typography
              color={active ? alpha("#fff", 0.76) : "text.secondary"}
              variant="caption"
              sx={{
                display: "-webkit-box",
                mt: 0.15,
                overflow: "hidden",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
              }}
            >
              {detail}
            </Typography>
          }
        />
      </Stack>
    </ListItemButton>
  );
}

function InboxActionCard({
  label,
  description,
  primaryAction,
  secondaryAction,
}: {
  label: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2.5 }}>
      <Stack spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {label}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            {description}
          </Typography>
        </Box>
        {primaryAction || secondaryAction ? (
          <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-start", flexWrap: "wrap" }} useFlexGap>
            {primaryAction}
            {secondaryAction}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}

function QuickMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Paper variant="outlined" sx={{ flex: 1, p: 2, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h3" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        {detail}
      </Typography>
    </Paper>
  );
}

function OlderMessagesDivider({ label }: { label: string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1, alignItems: "center" }}>
      <Divider sx={{ flex: 1, borderColor: alpha("#fff", 0.06) }} />
      <Typography variant="caption" color="text.disabled" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </Typography>
      <Divider sx={{ flex: 1, borderColor: alpha("#fff", 0.06) }} />
    </Stack>
  );
}

type InlineComposerStateProps = {
  label: string;
  onClear: () => void;
};

function InlineComposerState({ label, onClear }: InlineComposerStateProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 2,
        bgcolor: alpha("#5cc8ff", 0.06),
        borderColor: alpha("#5cc8ff", 0.14),
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2">{label}</Typography>
        <Button onClick={onClear} size="small" variant="text">
          Clear
        </Button>
      </Stack>
    </Paper>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.5, alignItems: "center" }}>
      <Divider sx={{ flex: 1 }} />
      <Chip label={label} size="small" variant="outlined" />
      <Divider sx={{ flex: 1 }} />
    </Stack>
  );
}

function DetailMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        py: 1,
        px: 1.25,
        borderRadius: 2,
        bgcolor: alpha("#fff", 0.03),
        justifyContent: "space-between",
      }}
    >
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

type MessageRowProps = {
  message: ChatMessageResponse;
  downloadTargetId: string | null;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReplyJump: () => void;
  onDownload: (attachment: MessageAttachmentResponse) => void;
};

function MessageRow({
  message,
  downloadTargetId,
  onReply,
  onEdit,
  onDelete,
  onReplyJump,
  onDownload,
}: MessageRowProps) {
  return (
    <Paper
      data-message-id={message.messageId}
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 3,
        borderColor: alpha("#fff", 0.06),
        bgcolor: message.isDeleted ? alpha("#fff", 0.02) : "transparent",
        transition: "background-color 160ms ease, border-color 160ms ease",
        "&:hover": {
          bgcolor: alpha("#fff", 0.025),
          borderColor: alpha("#fff", 0.1),
        },
        "&:hover .message-actions": {
          opacity: 1,
          transform: "translateY(0)",
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: alpha("#f08ab7", 0.16), color: "secondary.light", mt: 0.25 }}>
          {message.authorUserName.slice(0, 1).toUpperCase()}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
              <Typography variant="subtitle1">{message.authorUserName}</Typography>
              <Typography color="text.secondary" variant="caption">
                {formatDateTime(message.createdAtUtc)}
              </Typography>
              {message.isEdited ? <Chip size="small" label="Edited" variant="outlined" /> : null}
              {message.isDeleted ? <Chip size="small" label="Deleted" color="warning" variant="outlined" /> : null}
            </Stack>

            <Stack
              className="message-actions"
              direction="row"
              spacing={0.25}
              sx={{ opacity: { xs: 1, md: 0 }, transform: "translateY(2px)", transition: "all 160ms ease" }}
            >
              {!message.isDeleted ? (
                <Tooltip title="Reply">
                  <IconButton aria-label="Reply to message" onClick={onReply} size="small">
                    <ReplyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              {message.canEdit ? (
                <Tooltip title="Edit">
                  <IconButton aria-label="Edit message" onClick={onEdit} size="small">
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              {message.canDelete ? (
                <Tooltip title="Delete">
                  <IconButton aria-label="Delete message" color="error" onClick={onDelete} size="small">
                    <WarningAmberIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Stack>
          </Stack>

          {message.replyPreview ? (
            <Paper
              component="button"
              onClick={onReplyJump}
              sx={{
                width: "100%",
                mt: 1,
                px: 1.25,
                py: 1,
                borderRadius: 2,
                border: "1px solid rgba(102,200,255,0.14)",
                bgcolor: alpha("#66c8ff", 0.06),
                textAlign: "left",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Replying to {message.replyPreview.authorUserName}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.4,
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {message.replyPreview.isDeleted ? "Original message deleted" : message.replyPreview.text}
              </Typography>
            </Paper>
          ) : null}

          <Typography sx={{ mt: 1.1, whiteSpace: "pre-wrap", lineHeight: 1.65, wordBreak: "break-word" }} variant="body1">
            {message.isDeleted ? "Message deleted." : message.text}
          </Typography>

          {!message.isDeleted && message.attachments.length > 0 ? (
            <Stack spacing={1} sx={{ mt: 1.25 }}>
              {message.attachments.map((attachment) => (
                <Paper
                  key={attachment.id}
                  variant="outlined"
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: alpha("#fff", 0.03),
                    borderColor: alpha("#fff", 0.08),
                  }}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ textTransform: "none", letterSpacing: 0, wordBreak: "break-word" }}>
                        {attachment.originalFileName}
                      </Typography>
                      <Typography color="text.secondary" variant="caption">
                    {formatBytes(attachment.byteSize)} - {attachment.contentType}
                      </Typography>
                    </Box>
                    <Button
                      disabled={downloadTargetId === attachment.id}
                      onClick={() => onDownload(attachment)}
                      size="small"
                      startIcon={downloadTargetId === attachment.id ? <CircularProgress color="inherit" size={14} /> : <DownloadIcon fontSize="small" />}
                      variant="outlined"
                    >
                      {downloadTargetId === attachment.id ? "Downloading..." : "Download"}
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
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

function matchesRoom(room: RoomListItemResponse, filter: string) {
  if (!filter) {
    return true;
  }

  return (
    room.name.toLowerCase().includes(filter) ||
    (room.description ?? "").toLowerCase().includes(filter) ||
    (room.lastMessagePreview ?? "").toLowerCase().includes(filter)
  );
}

function shouldShowDateDivider(messages: ChatMessageResponse[], index: number) {
  if (index === 0) {
    return true;
  }

  const previous = messages[index - 1];
  const current = messages[index];

  return new Date(previous.createdAtUtc).toDateString() !== new Date(current.createdAtUtc).toDateString();
}

function formatDateDivider(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function labelForRealtimeState(state: RealtimeStatus) {
  if (state === "connecting") {
    return "Connecting";
  }

  if (state === "connected") {
    return "Live";
  }

  if (state === "reconnecting") {
    return "Reconnecting";
  }

  if (state === "error") {
    return "Retrying";
  }

  return "Offline";
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

function toPresenceState(value?: string | null): PresenceState {
  if (value === "online") {
    return "online";
  }

  if (value === "afk") {
    return "afk";
  }

  return "offline";
}

function presenceColor(state: PresenceState) {
  if (state === "online") {
    return "success";
  }

  if (state === "afk") {
    return "warning";
  }

  return "default";
}

function toPresenceLabel(state: PresenceState) {
  if (state === "online") {
    return "Online";
  }

  if (state === "afk") {
    return "Away";
  }

  return "Offline";
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

function useStableEvent<TArgs extends unknown[], TResult>(handler: (...args: TArgs) => TResult) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  return useCallback((...args: TArgs) => handlerRef.current(...args), []);
}
