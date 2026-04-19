"use client";

import Link from "next/link";
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AttachFile as AttachFileIcon,
  Autorenew as AutorenewIcon,
  Bolt as BoltIcon,
  ChatBubbleOutlineOutlined as ChatBubbleOutlineIcon,
  Circle as CircleIcon,
  Download as DownloadIcon,
  EditOutlined as EditOutlinedIcon,
  EmojiEmotionsOutlined as EmojiEmotionsOutlinedIcon,
  GroupOutlined as GroupOutlinedIcon,
  LockOutlined as LockOutlinedIcon,
  MarkUnreadChatAlt as MarkUnreadChatAltIcon,
  Person as PersonOutlineIcon,
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
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
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
    <Box sx={{ maxWidth: 1680, mx: "auto" }}>
      <Card
        sx={{
          mb: 2.5,
          background:
            "linear-gradient(140deg, rgba(21,24,32,0.98), rgba(57,32,74,0.96))",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2.5}
            sx={{ alignItems: { lg: "flex-start" }, justifyContent: "space-between" }}
          >
            <Box sx={{ maxWidth: 860 }}>
              <Chip
                label="Slack-inspired chat refactor"
                color="secondary"
                icon={<BoltIcon />}
                sx={{ mb: 1.5, bgcolor: "rgba(240,138,183,0.12)" }}
              />
              <Typography variant="h1" sx={{ mb: 1.5 }}>
                Dense conversation reading, stronger right-rail navigation, and safer admin flows.
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
                The backend stays untouched. REST still owns persistence and policy, SignalR still
                owns live hints, and the frontend now presents that behavior in a darker, more
                product-native shell closer to the UX spec.
              </Typography>
            </Box>

            <Stack spacing={1.25} sx={{ alignItems: { xs: "stretch", lg: "flex-end" } }}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { lg: "flex-end" } }}>
                <Chip label={`Signed in as ${currentUser?.userName ?? "…"}`} variant="outlined" />
                <Chip
                  color={realtimeStatus === "connected" ? "success" : timeline.syncing ? "warning" : "default"}
                  label={labelForRealtimeState(realtimeStatus)}
                />
                <Chip label={`${totalConversationUnread} unread`} variant="outlined" />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <Button
                  onClick={() => void loadWorkspace(false)}
                  startIcon={refreshing ? <CircularProgress color="inherit" size={16} /> : <RefreshIcon />}
                  variant="outlined"
                  disabled={workspaceStatus === "loading" || refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh workspace"}
                </Button>
                <Button component={Link} href="/presence" variant="text">
                  Presence workspace
                </Button>
                <Button component={Link} href="/sessions" variant="text">
                  Sessions workspace
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {feedbackMessage ? (
        <Alert severity="success" variant="filled" sx={{ mb: 2 }}>
          {feedbackMessage}
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert severity="error" variant="filled" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      ) : null}

      {workspaceStatus === "loading" ? (
        <StatePanel
          action={
            <CircularProgress size={22} />
          }
          subtitle="Loading workspace"
          title="Preparing rooms, directs, and durable history"
        />
      ) : null}

      {workspaceStatus === "auth" ? (
        <StatePanel
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Button component={Link} href="/auth" variant="contained">
                Go to auth
              </Button>
              <Button component={Link} href="/" variant="outlined">
                Back to overview
              </Button>
            </Stack>
          }
          subtitle="Access required"
          title="Sign in before opening the chat workspace"
          detail="The chat UI still uses the same cookie-backed auth and session flows. Once this browser is authenticated, it can load durable history and join the correct realtime conversation group."
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
          detail="Trust in history depends on explicit failure states, so the UI stays clear when live sync or initial loading degrades."
        />
      ) : null}

      {workspaceStatus === "ready" ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              xl: "minmax(0, 1.75fr) minmax(320px, 0.95fr) minmax(280px, 0.8fr)",
            },
            gap: 2,
            alignItems: "start",
          }}
        >
          <Card sx={{ minHeight: 780, display: "flex", flexDirection: "column", order: { xs: 1, xl: 1 } }}>
            <CardContent sx={{ p: 0, display: "flex", flexDirection: "column", minHeight: 780 }}>
              <Box
                sx={{
                  px: { xs: 2, md: 3 },
                  py: 2.25,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  background: alpha("#fff", 0.02),
                }}
              >
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="overline" color="text.secondary">
                      {selectedConversation?.kind === "room" ? "Room conversation" : selectedConversation ? "Direct conversation" : "Select a conversation"}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.75, minWidth: 0, alignItems: "center" }}>
                      {selectedConversation?.kind === "room" ? (
                        <TagIcon fontSize="small" sx={{ color: "secondary.light" }} />
                      ) : (
                        <PersonOutlineIcon fontSize="small" sx={{ color: "primary.light" }} />
                      )}
                      <Typography variant="h2" noWrap>
                        {selectedConversationLabel}
                      </Typography>
                      {selectedConversation?.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
                        <Chip color="warning" label="Read only" size="small" />
                      ) : null}
                    </Stack>
                    <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
                      {selectedConversation?.subtitle ??
                        "Select a room or direct conversation to load paged history and join its realtime stream."}
                    </Typography>
                  </Box>

                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                    <Chip
                      icon={timeline.syncing ? <AutorenewIcon /> : <BoltIcon />}
                      color={timeline.syncing ? "warning" : realtimeStatus === "connected" ? "success" : "default"}
                      label={timeline.syncing ? "Syncing missing messages…" : realtimeStatus === "connected" ? "Live" : "REST only"}
                    />
                    <Chip label={`${timeline.messages.length} loaded`} variant="outlined" />
                    <Chip label={`wm ${timeline.latestWatermark}`} variant="outlined" />
                  </Stack>
                </Stack>
              </Box>

              <Box sx={{ px: { xs: 2, md: 3 }, pt: 1.5 }}>
                {selectedConversation?.kind === "direct" && selectedConversation.accessMode === "read_only" ? (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    This direct conversation is frozen in read-only mode because a user-to-user ban
                    is active. Existing history remains visible, but new messages are blocked by
                    policy.
                  </Alert>
                ) : null}
                {realtimeStatus === "reconnecting" ? (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    Reconnecting… new live events may be delayed while the client re-establishes the
                    SignalR channel.
                  </Alert>
                ) : null}
                {timeline.syncing ? (
                  <Alert severity="info" sx={{ mb: 1.5 }}>
                    Syncing missing messages from durable history…
                  </Alert>
                ) : null}
                {timeline.error ? (
                  <Alert severity="error" sx={{ mb: 1.5 }}>
                    {timeline.error}
                  </Alert>
                ) : null}
              </Box>

              {!selectedConversation ? (
                <Box sx={{ flex: 1, px: { xs: 2, md: 3 }, pb: 2.5 }}>
                  <EmptySurface
                    icon={<ChatBubbleOutlineIcon fontSize="large" />}
                    title="No conversation selected yet"
                    description="Choose a room or direct chat from the right sidebar to load durable history, unread state, and live sync."
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
                      px: { xs: 2, md: 3 },
                      pb: 2.5,
                    }}
                  >
                    {timeline.loading ? (
                      <EmptySurface
                        icon={<CircularProgress size={28} />}
                        title="Loading history"
                        description="Pulling the latest visible window from durable conversation history."
                        compact
                      />
                    ) : timeline.messages.length === 0 ? (
                      <EmptySurface
                        icon={<MarkUnreadChatAltIcon fontSize="large" />}
                        title="No messages yet"
                        description="This conversation is ready for the first durable message. Replies, edits, deletes, and uploads all flow through the same watermark stream."
                        compact
                      />
                    ) : (
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
                    )}

                    {timeline.loadingOlder ? (
                      <Stack direction="row" spacing={1} sx={{ py: 1.5, alignItems: "center", justifyContent: "center" }}>
                        <CircularProgress size={16} />
                        <Typography color="text.secondary" variant="body2">
                          Loading older history…
                        </Typography>
                      </Stack>
                    ) : null}
                  </Box>

                  <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 3 } }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        bgcolor: alpha("#0f1218", 0.72),
                        borderColor: alpha("#fff", 0.1),
                      }}
                    >
                      <Stack spacing={1.5}>
                        {replyTarget ? (
                          <InlineComposerState
                            label={`Replying to ${replyTarget.authorUserName}`}
                            onClear={() => setReplyTarget(null)}
                          />
                        ) : null}

                        {editTarget ? (
                          <InlineComposerState
                            label={`Editing your message from ${formatDateTime(editTarget.createdAtUtc)}`}
                            onClear={() => {
                              setEditTarget(null);
                              setDraftText("");
                            }}
                          />
                        ) : null}

                        {selectedFile ? (
                          <InlineComposerState
                            label={`Uploading ${selectedFile.name} (${formatBytes(selectedFile.size)})`}
                            onClear={() => {
                              setSelectedFile(null);
                              setFileInputKey((current) => current + 1);
                            }}
                          />
                        ) : null}

                        <Box component="form" onSubmit={handleSubmitMessage} ref={composerFormRef}>
                          <Stack spacing={1.5}>
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
                                  ? "This conversation is read-only because a ban froze direct messaging."
                                  : selectedFile
                                    ? "Add an optional attachment comment."
                                    : "Message this conversation. Enter sends, Shift+Enter adds a new line."
                              }
                              value={draftText}
                            />

                            <Stack
                              direction={{ xs: "column", md: "row" }}
                              spacing={1.5}
                              sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
                            >
                              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                <Button
                                  component="label"
                                  startIcon={<AttachFileIcon />}
                                  variant="outlined"
                                  disabled={!selectedConversation || selectedConversation.accessMode === "read_only" || messageSubmitting || !!editTarget}
                                >
                                  {selectedFile ? "Replace file" : "Attach file"}
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
                                </Button>
                                <Tooltip title="Emoji reactions are intentionally parked for scope.">
                                  <span>
                                    <IconButton aria-label="Emoji actions are not available yet" disabled>
                                      <EmojiEmotionsOutlinedIcon />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Typography color="text.secondary" variant="body2">
                                  Files stay on the local uploads volume and every download is re-checked against current access.
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: { xs: "space-between", md: "flex-end" } }}>
                                <Typography color="text.secondary" variant="body2">
                                  Windowed history keeps the DOM bounded for large rooms.
                                </Typography>
                                <Button
                                  disabled={
                                    !selectedConversation ||
                                    selectedConversation.accessMode === "read_only" ||
                                    messageSubmitting ||
                                    (!selectedFile && !draftText.trim())
                                  }
                                  endIcon={messageSubmitting ? <CircularProgress color="inherit" size={16} /> : <SendIcon />}
                                  type="submit"
                                  variant="contained"
                                >
                                  {messageSubmitting ? "Saving…" : editTarget ? "Save edit" : selectedFile ? "Upload file" : "Send"}
                                </Button>
                              </Stack>
                            </Stack>
                          </Stack>
                        </Box>
                      </Stack>
                    </Paper>
                  </Box>
                </>
              )}
            </CardContent>
          </Card>

          <Stack spacing={2} sx={{ order: { xs: 2, xl: 2 } }}>
            <SidebarCard
              title={currentUser?.userName ?? "Workspace"}
              subtitle="Workspace pulse"
              action={<Chip label={`${totalUnreadFriendly} social alerts`} size="small" variant="outlined" />}
            >
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
              <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: "wrap" }}>
                <Chip label={`${totalConversationUnread} unread`} color="primary" size="small" />
                <Chip label={`${roomDirectory?.pendingInvitations.length ?? 0} invites`} size="small" variant="outlined" />
                <Chip label={`${contactSummary?.incomingFriendRequests.length ?? 0} requests`} size="small" variant="outlined" />
              </Stack>
            </SidebarCard>

            <SidebarCard title="Public rooms" subtitle="Rooms you can post in">
              {publicRooms.length > 0 ? (
                <List disablePadding sx={{ display: "grid", gap: 0.75 }}>
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
                <EmptySurface
                  compact
                  icon={<TagIcon />}
                  title="No public rooms"
                  description="Join a public room from the catalog below to populate this list."
                />
              )}
            </SidebarCard>

            <SidebarCard title="Private rooms" subtitle="Invite-only spaces">
              {privateRooms.length > 0 ? (
                <List disablePadding sx={{ display: "grid", gap: 0.75 }}>
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
                <EmptySurface
                  compact
                  icon={<LockOutlinedIcon />}
                  title="No private rooms"
                  description="Private memberships will surface here when invitations are accepted."
                />
              )}
            </SidebarCard>

            <SidebarCard title="Contacts and directs" subtitle="Direct history and fast starts">
              {filteredDirects.length > 0 ? (
                <List disablePadding sx={{ display: "grid", gap: 0.75, mb: 1.25 }}>
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
                    />
                  ))}
                </List>
              ) : null}

              {filteredFriends.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="overline" color="text.secondary">
                    Confirmed friends
                  </Typography>
                  {filteredFriends.map((friend) => (
                    <Button
                      key={friend.userId}
                      onClick={() => void handleOpenDirect(friend.userName)}
                      variant="text"
                      startIcon={<PersonOutlineIcon />}
                      sx={{ justifyContent: "flex-start", px: 1.5, py: 1.1 }}
                      disabled={openingDirectUserName === friend.userName}
                    >
                      {openingDirectUserName === friend.userName ? `Opening ${friend.userName}…` : `Message ${friend.userName}`}
                    </Button>
                  ))}
                </Stack>
              ) : (
                <EmptySurface
                  compact
                  icon={<PersonOutlineIcon />}
                  title="No direct history yet"
                  description="Confirmed friends appear here as quick-start actions when PM policy allows it."
                />
              )}
            </SidebarCard>

            <SidebarCard title="Public catalog" subtitle="Quick join">
              {filteredPublicCatalog.length > 0 ? (
                <Stack spacing={1}>
                  {filteredPublicCatalog.slice(0, 6).map((room) => (
                    <Paper
                      key={room.id}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderRadius: 2.25,
                        bgcolor: alpha("#fff", 0.03),
                        borderColor: alpha("#fff", 0.08),
                      }}
                    >
                      <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1"># {room.name}</Typography>
                          <Typography color="text.secondary" variant="body2">
                            {room.description ?? "No description yet."}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={room.isMember || room.isBanned || joiningRoomId === room.id}
                          onClick={() => void handleJoinRoom(room)}
                        >
                          {room.isMember ? "Joined" : room.isBanned ? "Banned" : joiningRoomId === room.id ? "Joining…" : "Join"}
                        </Button>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <EmptySurface
                  compact
                  icon={<GroupOutlinedIcon />}
                  title="No public rooms"
                  description="As room creation grows later, searchable catalog results will appear here."
                />
              )}
            </SidebarCard>
          </Stack>

          <Stack spacing={2} sx={{ order: { xs: 3, xl: 3 } }}>
            <SidebarCard
              title={selectedConversation?.title ?? "Waiting for selection"}
              subtitle="Context panel"
              action={
                activeRoom ? (
                  <Button
                    onClick={() => setRoomManagerOpen(true)}
                    size="small"
                    startIcon={<SettingsIcon />}
                    variant="outlined"
                  >
                    Manage room
                  </Button>
                ) : null
              }
            >
              <Typography color="text.secondary" variant="body2">
                {selectedConversation?.subtitle ??
                  "Room membership and direct-message policy still live on the backend; this panel surfaces the current slice of that state."}
              </Typography>

              {selectedConversation?.kind === "direct" ? (
                <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                  <ContextMetric label="Access mode" value={selectedConversation.accessMode === "read_only" ? "Read only" : "Read/write"} />
                  <ContextMetric label="Unread" value={selectedConversation.direct.unreadCount} />
                  <ContextMetric label="Messages" value={selectedConversation.direct.messageCount} />
                  <ContextMetric label="Latest watermark" value={selectedConversation.direct.latestWatermark} />
                </Stack>
              ) : null}

              {activeRoom ? (
                <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                  <ContextMetric label="Visibility" value={activeRoom.isPrivate ? "Private" : "Public"} />
                  <ContextMetric label="Members" value={activeRoom.memberCount} />
                  <ContextMetric label="Unread" value={activeRoom.unreadCount} />
                  <ContextMetric label="Your role" value={activeRoom.isOwner ? "Owner" : activeRoom.isAdmin ? "Admin" : "Member"} />
                </Stack>
              ) : null}
            </SidebarCard>

            <SidebarCard title="Room members" subtitle="Current room context">
              {!activeRoom ? (
                <EmptySurface
                  compact
                  icon={<GroupOutlinedIcon />}
                  title="Members appear on room views"
                  description="Open a room to inspect its current member list, admin roles, and moderation context."
                />
              ) : activeRoomDetailsLoading ? (
                <EmptySurface compact icon={<CircularProgress size={22} />} title="Loading room context" description="Fetching member and admin detail from the existing room endpoint." />
              ) : activeRoomDetails ? (
                <Stack spacing={1}>
                  {activeRoomDetails.members.slice(0, 8).map((member) => (
                    <Paper
                      key={member.userId}
                      variant="outlined"
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: alpha("#fff", 0.03),
                        borderColor: alpha("#fff", 0.08),
                      }}
                    >
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: alpha("#66c8ff", 0.16), color: "primary.light" }}>
                            {member.userName.slice(0, 1).toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ textTransform: "none", letterSpacing: 0 }}>
                              {member.userName}
                            </Typography>
                            <Typography color="text.secondary" variant="caption">
                              Joined {formatDateTime(member.joinedAtUtc)}
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={0.75}>
                          {member.isOwner ? <Chip size="small" label="Owner" color="secondary" /> : null}
                          {member.isAdmin ? <Chip size="small" label="Admin" variant="outlined" /> : null}
                          <Tooltip title="Presence is not currently included in the room member payload.">
                            <CircleIcon fontSize="small" sx={{ color: "text.disabled", alignSelf: "center" }} />
                          </Tooltip>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <EmptySurface
                  compact
                  icon={<WarningAmberIcon />}
                  title="Member context unavailable"
                  description="The room detail request did not return member data, so the panel is showing a safe fallback."
                />
              )}
            </SidebarCard>

            <SidebarCard title="Sync and policy" subtitle="Server-authoritative behavior">
              <Stack spacing={1.25}>
                <ContextMetric label="Invites" value={roomDirectory?.pendingInvitations.length ?? 0} />
                <ContextMetric label="Friend requests" value={contactSummary?.incomingFriendRequests.length ?? 0} />
                <ContextMetric label="Outgoing bans" value={contactSummary?.bansIssued.length ?? 0} />
                <Divider />
                <Typography color="text.secondary" variant="body2">
                  Hub path: {realtimeContract?.hubPath ?? "/hubs/realtime"}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  Groups: {realtimeContract?.conversationGroupPattern ?? "conversation:{conversationId}"}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  Sync mode: {realtimeContract?.syncMode ?? "rest-gap-repair"}
                </Typography>
              </Stack>
            </SidebarCard>
          </Stack>
        </Box>
      ) : null}

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

type SidebarCardProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  action?: ReactNode;
};

function SidebarCard({ title, subtitle, children, action }: SidebarCardProps) {
  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {subtitle}
              </Typography>
              <Typography variant="h3" sx={{ mt: 0.25 }}>
                {title}
              </Typography>
            </Box>
            {action}
          </Stack>
          {children}
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

type ConversationRowProps = {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  unreadCount: number;
  icon?: ReactNode;
  avatarTone?: "room" | "direct";
};

function ConversationRow({ label, detail, active, onClick, unreadCount, icon, avatarTone = "room" }: ConversationRowProps) {
  return (
    <ListItemButton selected={active} onClick={onClick}>
      <Stack direction="row" spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
        <Badge badgeContent={unreadCount > 0 ? unreadCount : 0} color="secondary" invisible={unreadCount <= 0}>
          <Avatar
            sx={{
              width: 34,
              height: 34,
              bgcolor: avatarTone === "direct" ? alpha("#66c8ff", 0.12) : alpha("#f08ab7", 0.12),
              color: avatarTone === "direct" ? "primary.light" : "secondary.light",
            }}
          >
            {icon ?? label.replace(/^#\s*/, "").slice(0, 1).toUpperCase()}
          </Avatar>
        </Badge>

        <ListItemText
          primary={
            <Typography variant="subtitle2" sx={{ textTransform: "none", letterSpacing: 0 }}>
              {label}
            </Typography>
          }
          secondary={
            <Typography
              color={active ? alpha("#fff", 0.76) : "text.secondary"}
              variant="caption"
              sx={{
                display: "block",
                mt: 0.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {detail}
            </Typography>
          }
        />

        <Tooltip title="Presence is not included in the current chat summary payload.">
          <CircleIcon fontSize="small" sx={{ color: "text.disabled" }} />
        </Tooltip>
      </Stack>
    </ListItemButton>
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

type ContextMetricProps = {
  label: string;
  value: ReactNode;
};

function ContextMetric({ label, value }: ContextMetricProps) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        p: 1.25,
        borderRadius: 2,
        bgcolor: alpha("#fff", 0.03),
        border: "1px solid rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography variant="subtitle2" sx={{ textTransform: "none", letterSpacing: 0 }}>
        {value}
      </Typography>
    </Stack>
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
