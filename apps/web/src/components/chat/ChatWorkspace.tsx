"use client";

import Link from "next/link";
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Add as AddIcon,
  AttachFile as AttachFileIcon,
  Autorenew as AutorenewIcon,
  Bolt as BoltIcon,
  ChatBubbleOutlineOutlined as ChatBubbleOutlineIcon,
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
  type CurrentUserResponse,
  type DirectConversationListResponse,
  type DirectConversationSummaryResponse,
  type MessageAttachmentResponse,
  type MessageResponse,
  type RealtimeContractResponse,
  type RealtimeEnvelope,
  type RoomDetailsResponse,
  type RoomDirectoryResponse,
  type RoomListItemResponse,
} from "@/lib/api/contracts";
import { ApiClientError, apiBaseUrl, apiRequest, signalrUrl } from "@/lib/api/client";
import { RoomManagementModal } from "@/components/chat/RoomManagementModal";

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
  const [roomManagerOpen, setRoomManagerOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [createRoomDraft, setCreateRoomDraft] = useState({ name: "", description: "", isPrivate: false });
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState("");
  const [invitingUser, setInvitingUser] = useState(false);
  const [activeRoomDetails, setActiveRoomDetails] = useState<RoomDetailsResponse | null>(null);
  const [activeRoomDetailsLoading, setActiveRoomDetailsLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollViewportHeight, setScrollViewportHeight] = useState(720);

  const connectionRef = useRef<HubConnection | null>(null);
  const selectedConversationRef = useRef<SelectedConversation | null>(null);
  const subscribedConversationIdRef = useRef<string | null>(null);
  const latestWatermarkRef = useRef(0);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
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
    if (selectedConversation?.kind !== "room") {
      setRoomManagerOpen(false);
    }
  }, [selectedConversation]);

  useEffect(() => {
    if (selectedConversation?.kind !== "room") {
      setActiveRoomDetails(null);
      setActiveRoomDetailsLoading(false);
      return;
    }

    let disposed = false;
    setActiveRoomDetailsLoading(true);

    void apiRequest<RoomDetailsResponse>(`/api/rooms/${selectedConversation.roomId}`)
      .then((details) => {
        if (!disposed) {
          setActiveRoomDetails(details);
        }
      })
      .catch(() => {
        if (!disposed) {
          setActiveRoomDetails(null);
        }
      })
      .finally(() => {
        if (!disposed) {
          setActiveRoomDetailsLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [selectedConversation]);

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

      setFeedbackMessage(`Room "${created.name}" created.`);
      setCreateRoomOpen(false);
      setCreateRoomDraft({ name: "", description: "", isPrivate: false });
      await refreshNavigationData();
      setSelectedConversation(toRoomSelection(created));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The room could not be created."));
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

      setFeedbackMessage(`Invitation sent to ${targetUserName}.`);
      setInviteOpen(false);
      setInviteDraft("");
      await refreshNavigationData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The invitation could not be sent."));
    } finally {
      setInvitingUser(false);
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
  const activeRoom = selectedConversation?.kind === "room" ? selectedConversation.room : null;
  const sidebarFilter = sidebarSearch.trim().toLowerCase();
  const publicRooms = useMemo(
    () => (roomDirectory?.myRooms ?? []).filter((room) => !room.isPrivate && matchesRoom(room, sidebarFilter)),
    [roomDirectory?.myRooms, sidebarFilter],
  );
  const privateRooms = useMemo(
    () => (roomDirectory?.myRooms ?? []).filter((room) => room.isPrivate && matchesRoom(room, sidebarFilter)),
    [roomDirectory?.myRooms, sidebarFilter],
  );
  const filteredDirects = useMemo(
    () =>
      directList.filter(
        (conversation) =>
          !sidebarFilter ||
          conversation.targetUserName.toLowerCase().includes(sidebarFilter) ||
          (conversation.lastMessagePreview ?? "").toLowerCase().includes(sidebarFilter),
      ),
    [directList, sidebarFilter],
  );
  const filteredFriends = useMemo(
    () =>
      (contactSummary?.friends ?? []).filter(
        (friend) => !sidebarFilter || friend.userName.toLowerCase().includes(sidebarFilter),
      ),
    [contactSummary?.friends, sidebarFilter],
  );
  const filteredPublicCatalog = useMemo(
    () => (roomDirectory?.publicCatalog ?? []).filter((room) => matchesRoom(room, sidebarFilter)),
    [roomDirectory?.publicCatalog, sidebarFilter],
  );
  const selectedConversationLabel = selectedConversation
    ? selectedConversation.kind === "room"
      ? `# ${selectedConversation.title}`
      : selectedConversation.title
    : "No conversation selected";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, px: { xs: 1, md: 2 }, py: { xs: 1, md: 2 } }}>
      {feedbackMessage ? (
        <Alert severity="success" variant="filled" onClose={() => setFeedbackMessage(null)} sx={{ mb: 1.5 }}>
          {feedbackMessage}
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert severity="error" variant="filled" onClose={() => setErrorMessage(null)} sx={{ mb: 1.5 }}>
          {errorMessage}
        </Alert>
      ) : null}

      {workspaceStatus === "loading" ? (
        <StatePanel
          action={<CircularProgress size={22} />}
          subtitle="Loading workspace"
          title="Preparing rooms, directs, and durable history"
        />
      ) : null}

      {workspaceStatus === "auth" ? (
        <StatePanel
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Button component={Link} href="/auth/sign-in" variant="contained">
                Go to sign in
              </Button>
              <Button component={Link} href="/" variant="outlined">
                Back to overview
              </Button>
            </Stack>
          }
          subtitle="Access required"
          title="Sign in before opening the chat workspace"
          detail="The chat UI uses cookie-backed auth. Once authenticated, durable history and live realtime conversations load automatically."
        />
      ) : null}

      {workspaceStatus === "error" ? (
        <StatePanel
          action={
            <Button onClick={() => void loadWorkspace(true)} variant="contained">
              Retry loading chat
            </Button>
          }
          subtitle="Recoverable error"
          title="The chat workspace needs a retry"
        />
      ) : null}

      {workspaceStatus === "ready" ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: sidebarCollapsed ? "56px minmax(0, 1fr) minmax(280px, 320px)" : "minmax(280px, 320px) minmax(0, 1fr) minmax(280px, 320px)",
            },
            gap: 1.5,
            flex: 1,
            minHeight: 0,
            alignItems: "stretch",
          }}
        >
          {/* LEFT SIDEBAR */}
          <Card
            sx={{
              minHeight: { md: "calc(100vh - 120px)" },
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
                <Tooltip title="Search">
                  <IconButton size="small">
                    <SearchIcon />
                  </IconButton>
                </Tooltip>
                <Badge badgeContent={totalConversationUnread} color="secondary" max={99}>
                  <Tooltip title="Conversations">
                    <ChatBubbleOutlineIcon fontSize="small" />
                  </Tooltip>
                </Badge>
                <Tooltip title="Create room">
                  <IconButton color="primary" onClick={() => setCreateRoomOpen(true)} size="small">
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
                      Workspace
                    </Typography>
                    <Tooltip title="Collapse sidebar">
                      <IconButton onClick={() => setSidebarCollapsed(true)} size="small">
                        <ChevronLeftIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search rooms and contacts"
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
                    <SidebarSection
                      id="public-rooms"
                      title="Public Rooms"
                      count={publicRooms.length}
                    >
                      {publicRooms.length > 0 ? (
                        <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
                          {publicRooms.map((room) => (
                            <ConversationRow
                              key={room.id}
                              active={selectedConversation?.conversationId === room.conversationId}
                              detail={room.lastMessagePreview ?? `${room.memberCount} members`}
                              label={`# ${room.name}`}
                              onClick={() => setSelectedConversation(toRoomSelection(room))}
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

                    <SidebarSection
                      id="private-rooms"
                      title="Private Rooms"
                      count={privateRooms.length}
                    >
                      {privateRooms.length > 0 ? (
                        <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
                          {privateRooms.map((room) => (
                            <ConversationRow
                              key={room.id}
                              active={selectedConversation?.conversationId === room.conversationId}
                              detail={room.lastMessagePreview ?? `${room.memberCount} members`}
                              icon={<LockOutlinedIcon fontSize="small" />}
                              label={`# ${room.name}`}
                              onClick={() => setSelectedConversation(toRoomSelection(room))}
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

                    <SidebarSection
                      id="contacts"
                      title="Contacts"
                      count={(contactSummary?.friends.length ?? 0)}
                    >
                      {filteredDirects.length > 0 ? (
                        <List disablePadding sx={{ display: "grid", gap: 0.5, mb: 1 }}>
                          {filteredDirects.map((conversation) => (
                            <ConversationRow
                              key={conversation.conversationId}
                              active={selectedConversation?.conversationId === conversation.conversationId}
                              detail={
                                conversation.accessMode === "read_only"
                                  ? "Read-only history"
                                  : conversation.lastMessagePreview ?? "Ready to chat"
                              }
                              label={conversation.targetUserName}
                              onClick={() => setSelectedConversation(toDirectSelection(conversation))}
                              unreadCount={conversation.unreadCount}
                              avatarTone="direct"
                              presence="offline"
                            />
                          ))}
                        </List>
                      ) : null}

                      {filteredFriends.length > 0 ? (
                        <Stack spacing={0.5}>
                          {filteredFriends.map((friend) => (
                            <ListItemButton
                              key={friend.userId}
                              onClick={() => void handleOpenDirect(friend.userName)}
                              disabled={openingDirectUserName === friend.userName}
                              sx={{ px: 1.25, py: 0.75 }}
                            >
                              <Stack direction="row" spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
                                <Box sx={{ position: "relative" }}>
                                  <Avatar sx={{ width: 30, height: 30, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light", fontSize: "0.8rem" }}>
                                    {friend.userName.slice(0, 1).toUpperCase()}
                                  </Avatar>
                                  <PresenceDot state="offline" />
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                    {friend.userName}
                                  </Typography>
                                  <Typography color="text.secondary" variant="caption" noWrap>
                                    {openingDirectUserName === friend.userName ? "Opening…" : "Send a direct message"}
                                  </Typography>
                                </Box>
                              </Stack>
                            </ListItemButton>
                          ))}
                        </Stack>
                      ) : null}

                      {filteredFriends.length === 0 && filteredDirects.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No contacts yet.
                        </Typography>
                      ) : null}
                    </SidebarSection>

                    {filteredPublicCatalog.length > 0 ? (
                      <SidebarSection
                        id="public-catalog"
                        title="Discover"
                        count={filteredPublicCatalog.length}
                      >
                        <Stack spacing={0.75}>
                          {filteredPublicCatalog.slice(0, 5).map((room) => (
                            <Paper
                              key={room.id}
                              variant="outlined"
                              sx={{ p: 1, borderRadius: 2 }}
                            >
                              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                                    # {room.name}
                                  </Typography>
                                  <Typography color="text.secondary" variant="caption" noWrap>
                                    {room.memberCount} members
                                  </Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={room.isMember || room.isBanned || joiningRoomId === room.id}
                                  onClick={() => void handleJoinRoom(room)}
                                >
                                  {room.isMember ? "Joined" : joiningRoomId === room.id ? "…" : "Join"}
                                </Button>
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      </SidebarSection>
                    ) : null}
                  </Stack>
                </Box>

                <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Button
                    fullWidth
                    onClick={() => setCreateRoomOpen(true)}
                    startIcon={<AddIcon />}
                    variant="contained"
                  >
                    Create room
                  </Button>
                </Box>
              </Box>
            )}
          </Card>

          {/* CENTER - Chat */}
          <Card sx={{ display: "flex", flexDirection: "column", minHeight: { md: "calc(100vh - 120px)" }, overflow: "hidden" }}>
            <Box
              sx={{
                px: { xs: 2, md: 2.5 },
                py: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
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
                    <Typography variant="h2" noWrap sx={{ fontSize: "1.25rem" }}>
                      {selectedConversationLabel}
                    </Typography>
                    {selectedConversation?.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
                      <Chip color="warning" label="Read only" size="small" />
                    ) : null}
                  </Stack>
                  {selectedConversation ? (
                    <Typography color="text.secondary" variant="body2" noWrap sx={{ mt: 0.25 }}>
                      {selectedConversation.kind === "room"
                        ? selectedConversation.room.description ?? `${selectedConversation.room.memberCount} members`
                        : selectedConversation.subtitle}
                    </Typography>
                  ) : null}
                </Box>

                <Stack direction="row" spacing={1}>
                  <Chip
                    icon={timeline.syncing ? <AutorenewIcon /> : <BoltIcon />}
                    color={timeline.syncing ? "warning" : realtimeStatus === "connected" ? "success" : "default"}
                    label={timeline.syncing ? "Syncing…" : realtimeStatus === "connected" ? "Live" : labelForRealtimeState(realtimeStatus)}
                    size="small"
                  />
                  <Tooltip title="Refresh workspace">
                    <span>
                      <IconButton
                        onClick={() => void loadWorkspace(false)}
                        disabled={refreshing}
                        size="small"
                      >
                        {refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
            </Box>

            {selectedConversation?.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
              <Alert severity="warning" sx={{ mx: 2, mt: 1.5 }}>
                This direct conversation is frozen in read-only mode. New messages are blocked by policy.
              </Alert>
            ) : null}
            {realtimeStatus === "reconnecting" ? (
              <Alert severity="warning" sx={{ mx: 2, mt: 1.5 }}>
                Reconnecting realtime channel…
              </Alert>
            ) : null}
            {timeline.error ? (
              <Alert severity="error" sx={{ mx: 2, mt: 1.5 }}>
                {timeline.error}
              </Alert>
            ) : null}

            {!selectedConversation ? (
              <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
                <EmptySurface
                  icon={<ChatBubbleOutlineIcon fontSize="large" />}
                  title="No conversation selected"
                  description="Pick a room or contact from the left sidebar to start chatting."
                />
              </Box>
            ) : (
              <>
                <Box
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
                      description="Be the first to send a message in this conversation."
                      compact
                    />
                  ) : (
                    <>
                      {timeline.loadingOlder ? (
                        <Stack direction="row" spacing={1} sx={{ py: 1.5, alignItems: "center", justifyContent: "center" }}>
                          <CircularProgress size={16} />
                          <Typography color="text.secondary" variant="body2">
                            Loading older messages…
                          </Typography>
                        </Stack>
                      ) : !timeline.nextCursor ? (
                        <OlderMessagesDivider label="Beginning of conversation" />
                      ) : (
                        <OlderMessagesDivider label="Scroll up for older messages" />
                      )}

                      <Box sx={{ position: "relative", height: totalHeight || "auto" }}>
                        {visibleRange.topPadding > 0 ? <Box sx={{ height: visibleRange.topPadding }} /> : null}

                        {visibleRange.items.map((message, index) => {
                          const absoluteIndex = visibleRange.startIndex + index;
                          const showDateDivider = shouldShowDateDivider(timeline.messages, absoluteIndex);

                          return (
                            <Box key={message.messageId}>
                              {showDateDivider ? (
                                <DateDivider label={formatDateDivider(message.createdAtUtc)} />
                              ) : null}

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

                        {visibleRange.bottomPadding > 0 ? <Box sx={{ height: visibleRange.bottomPadding }} /> : null}
                      </Box>
                    </>
                  )}
                </Box>

                {/* COMPOSER */}
                <Box sx={{ px: { xs: 2, md: 2.5 }, pb: { xs: 2, md: 2.5 }, pt: 0 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 3,
                      bgcolor: alpha("#0f1218", 0.72),
                      borderColor: alpha("#fff", 0.1),
                    }}
                  >
                    <Stack spacing={1}>
                      {replyTarget ? (
                        <Paper
                          variant="outlined"
                          sx={{
                            px: 1.5,
                            py: 0.75,
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
                              <Typography variant="body2" noWrap>
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
                          label={`Editing your message`}
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
                          minRows={2}
                          maxRows={6}
                          fullWidth
                          disabled={!selectedConversation || selectedConversation.accessMode === "read_only" || messageSubmitting}
                          onChange={(event) => setDraftText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              composerFormRef.current?.requestSubmit();
                            }
                          }}
                          placeholder={
                            selectedConversation?.accessMode === "read_only"
                              ? "This conversation is read-only."
                              : `Message ${selectedConversationLabel}`
                          }
                          value={draftText}
                          variant="standard"
                          slotProps={{
                            input: { disableUnderline: true, sx: { px: 1, py: 0.5 } },
                          }}
                        />

                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 1 }}>
                          <Tooltip title="Add emoji (coming soon)">
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
                                disabled={!selectedConversation || selectedConversation.accessMode === "read_only" || messageSubmitting || !!editTarget}
                                size="small"
                              >
                                <AttachFileIcon fontSize="small" />
                                <input
                                  accept="image/*,.pdf,.txt,.md,.zip,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                  hidden
                                  disabled={!selectedConversation || selectedConversation.accessMode === "read_only" || messageSubmitting || !!editTarget}
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
                          <Button
                            disabled={
                              !selectedConversation ||
                              selectedConversation.accessMode === "read_only" ||
                              messageSubmitting ||
                              (!selectedFile && !draftText.trim())
                            }
                            endIcon={messageSubmitting ? <CircularProgress color="inherit" size={14} /> : <SendIcon fontSize="small" />}
                            onClick={() => composerFormRef.current?.requestSubmit()}
                            type="button"
                            variant="contained"
                            size="small"
                          >
                            {messageSubmitting ? "Sending…" : editTarget ? "Save" : "Send"}
                          </Button>
                        </Stack>
                      </Box>
                    </Stack>
                  </Paper>
                </Box>
              </>
            )}
          </Card>

          {/* RIGHT SIDEBAR - Room info / Members */}
          <Card sx={{ minHeight: { md: "calc(100vh - 120px)" }, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {!activeRoom ? (
              <Box sx={{ p: 2.5 }}>
                <EmptySurface
                  compact
                  icon={<GroupOutlinedIcon />}
                  title="Select a room"
                  description="Room info, members, and moderation tools appear here when a room is open."
                />
              </Box>
            ) : (
              <>
                <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="overline" color="text.secondary">
                    Room info
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

                {activeRoomDetails && activeRoomDetails.admins.length > 0 ? (
                  <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Typography variant="overline" color="text.secondary">
                      Owner & Admins
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

                <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.25, justifyContent: "space-between" }}>
                    <Typography variant="overline" color="text.secondary">
                      Members ({activeRoomDetails?.members.length ?? activeRoom.memberCount})
                    </Typography>
                  </Stack>

                  {activeRoomDetailsLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : activeRoomDetails ? (
                    <Stack spacing={0.5}>
                      {activeRoomDetails.members.map((member) => (
                        <Stack
                          key={member.userId}
                          direction="row"
                          spacing={1.25}
                          sx={{
                            alignItems: "center",
                            px: 1,
                            py: 0.75,
                            borderRadius: 1.5,
                            "&:hover": { bgcolor: alpha("#fff", 0.03) },
                          }}
                        >
                          <Box sx={{ position: "relative" }}>
                            <Avatar sx={{ width: 30, height: 30, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light", fontSize: "0.8rem" }}>
                              {member.userName.slice(0, 1).toUpperCase()}
                            </Avatar>
                            <PresenceDot state="offline" />
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                              {member.userName}
                            </Typography>
                            <Typography color="text.secondary" variant="caption" noWrap>
                              {member.isOwner ? "Owner" : member.isAdmin ? "Admin" : "Member"}
                            </Typography>
                          </Box>
                        </Stack>
                      ))}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary" variant="body2">
                      Member list unavailable.
                    </Typography>
                  )}
                </Box>

                <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
                  <Stack spacing={1}>
                    {activeRoomDetails?.permissions.canInvite ? (
                      <Button
                        fullWidth
                        onClick={() => setInviteOpen(true)}
                        startIcon={<PersonAddIcon />}
                        variant="outlined"
                      >
                        Invite user
                      </Button>
                    ) : null}
                    <Button
                      fullWidth
                      onClick={() => setRoomManagerOpen(true)}
                      startIcon={<SettingsIcon />}
                      variant="contained"
                    >
                      Manage room
                    </Button>
                  </Stack>
                </Box>
              </>
            )}
          </Card>
        </Box>
      ) : null}

      {/* CREATE ROOM DIALOG */}
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
              {creatingRoom ? "Creating…" : "Create room"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* INVITE USER DIALOG */}
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
              {invitingUser ? "Sending…" : "Send invite"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {activeRoom ? (
        <RoomManagementModal
          currentUserName={currentUser?.userName ?? null}
          isOpen={roomManagerOpen}
          onClose={() => setRoomManagerOpen(false)}
          onWorkspaceRefresh={refreshNavigationData}
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

type PresenceState = "online" | "afk" | "offline";

type ConversationRowProps = {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  unreadCount: number;
  icon?: ReactNode;
  avatarTone?: "room" | "direct";
  presence?: PresenceState;
};

function ConversationRow({
  label,
  detail,
  active,
  onClick,
  unreadCount,
  icon,
  avatarTone = "room",
  presence,
}: ConversationRowProps) {
  return (
    <ListItemButton selected={active} onClick={onClick} sx={{ borderRadius: 2, py: 0.75 }}>
      <Stack direction="row" spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
        <Badge badgeContent={unreadCount > 0 ? unreadCount : 0} color="secondary" invisible={unreadCount <= 0}>
          <Box sx={{ position: "relative" }}>
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
            {presence ? <PresenceDot state={presence} /> : null}
          </Box>
        </Badge>

        <ListItemText
          sx={{ my: 0 }}
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
                display: "block",
                mt: 0.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
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

type SidebarSectionProps = {
  id?: string;
  title: string;
  count?: number;
  children: ReactNode;
};

function SidebarSection({ id, title, count, children }: SidebarSectionProps) {
  return (
    <Box id={id}>
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

const presenceColor: Record<PresenceState, string> = {
  online: "#3ecf8e",
  afk: "#f5b840",
  offline: "#6b7280",
};

function PresenceDot({ state }: { state: PresenceState }) {
  return (
    <Box
      sx={{
        position: "absolute",
        bottom: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: "50%",
        bgcolor: presenceColor[state],
        border: "2px solid",
        borderColor: "background.paper",
      }}
    />
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
        mb: 1,
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
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="subtitle1">{message.authorUserName}</Typography>
              <Typography color="text.secondary" variant="caption">
                {formatDateTime(message.createdAtUtc)}
              </Typography>
              {message.isEdited ? <Chip size="small" label="Edited" variant="outlined" /> : null}
              {message.isDeleted ? <Chip size="small" label="Deleted" color="warning" variant="outlined" /> : null}
            </Stack>

            <Stack className="message-actions" direction="row" spacing={0.25} sx={{ opacity: { xs: 1, md: 0 }, transform: "translateY(2px)", transition: "all 160ms ease" }}>
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
              <Typography variant="body2" sx={{ mt: 0.4 }}>
                {message.replyPreview.isDeleted ? "Original message deleted" : message.replyPreview.text}
              </Typography>
            </Paper>
          ) : null}

          <Typography sx={{ mt: 1.1, whiteSpace: "pre-wrap", lineHeight: 1.65 }} variant="body1">
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
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ textTransform: "none", letterSpacing: 0 }}>
                        {attachment.originalFileName}
                      </Typography>
                      <Typography color="text.secondary" variant="caption">
                        {formatBytes(attachment.byteSize)} · {attachment.contentType}
                      </Typography>
                    </Box>
                    <Button
                      disabled={downloadTargetId === attachment.id}
                      onClick={() => onDownload(attachment)}
                      size="small"
                      startIcon={downloadTargetId === attachment.id ? <CircularProgress color="inherit" size={14} /> : <DownloadIcon fontSize="small" />}
                      variant="outlined"
                    >
                      {downloadTargetId === attachment.id ? "Downloading…" : "Download"}
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
