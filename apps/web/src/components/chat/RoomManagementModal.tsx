"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  InviteToRoomRequest,
  MessageResponse,
  RemoveRoomBanRequest,
  RemoveRoomMemberRequest,
  RoomAdminResponse,
  RoomBanResponse,
  RoomDetailsResponse,
  RoomListItemResponse,
  RoomMemberResponse,
  UpdateRoomAdminRequest,
} from "@/lib/api/contracts";
import {
  Close as CloseIcon,
  DeleteForever as DeleteForeverIcon,
  GppGood as GppGoodIcon,
  Group as GroupIcon,
  PersonOff as PersonOffIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Shield as ShieldIcon,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ApiClientError, apiRequest } from "@/lib/api/client";

type RoomManagementModalProps = {
  currentUserName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onWorkspaceRefresh: () => Promise<void>;
  room: RoomListItemResponse;
};

type RoomTab = "members" | "admins" | "bans" | "invitations" | "settings";

export function RoomManagementModal({
  currentUserName,
  isOpen,
  onClose,
  onWorkspaceRefresh,
  room,
}: RoomManagementModalProps) {
  const [activeTab, setActiveTab] = useState<RoomTab>("members");
  const [roomDetails, setRoomDetails] = useState<RoomDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [inviteDraft, setInviteDraft] = useState("");
  const [adminDraft, setAdminDraft] = useState("");
  const [memberRemovalReason, setMemberRemovalReason] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadRoomDetails = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const details = await apiRequest<RoomDetailsResponse>(`/api/rooms/${room.id}`);
      setRoomDetails(details);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The room management details could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [room.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadRoomDetails();
  }, [isOpen, loadRoomDetails]);

  const normalizedSearch = searchDraft.trim().toLowerCase();
  const filteredMembers = useMemo(
    () => filterByUserName(roomDetails?.members ?? [], normalizedSearch),
    [normalizedSearch, roomDetails?.members],
  );
  const filteredAdmins = useMemo(
    () => filterByUserName(roomDetails?.admins ?? [], normalizedSearch),
    [normalizedSearch, roomDetails?.admins],
  );
  const filteredBans = useMemo(
    () => filterByUserName(roomDetails?.bans ?? [], normalizedSearch),
    [normalizedSearch, roomDetails?.bans],
  );
  const filteredInvitations = useMemo(
    () => filterByUserName(roomDetails?.pendingInvitations ?? [], normalizedSearch, (item) => item.invitedUserName),
    [normalizedSearch, roomDetails?.pendingInvitations],
  );

  async function runRoomAction(actionKey: string, action: () => Promise<void>, successMessage: string, closeAfter = false) {
    setPendingAction(actionKey);
    setNotice(null);
    setErrorMessage(null);

    try {
      await action();
      setNotice(successMessage);
      await onWorkspaceRefresh();

      if (closeAfter) {
        onClose();
        return;
      }

      await loadRoomDetails();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The room action could not be completed."));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleInviteSubmit() {
    if (!inviteDraft.trim()) {
      return;
    }

    await runRoomAction(
      "invite",
      async () => {
        const payload: InviteToRoomRequest = {
          targetUserName: inviteDraft.trim(),
        };

        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/invitations`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setInviteDraft("");
      },
      "Invitation sent.",
    );
  }

  async function handleGrantAdminSubmit() {
    if (!adminDraft.trim()) {
      return;
    }

    await runRoomAction(
      "grant-admin",
      async () => {
        const payload: UpdateRoomAdminRequest = {
          targetUserName: adminDraft.trim(),
        };

        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/admins`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setAdminDraft("");
      },
      "Admin granted.",
    );
  }

  async function handleMakeAdmin(member: RoomMemberResponse) {
    if (!window.confirm(`Grant admin rights to ${member.userName}?`)) {
      return;
    }

    await runRoomAction(
      `make-admin-${member.userId}`,
      async () => {
        const payload: UpdateRoomAdminRequest = {
          targetUserName: member.userName,
        };

        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/admins`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      "Admin granted.",
    );
  }

  async function handleRevokeAdmin(admin: RoomAdminResponse) {
    if (!window.confirm(`Remove admin access for ${admin.userName}?`)) {
      return;
    }

    await runRoomAction(
      `revoke-admin-${admin.userId}`,
      async () => {
        const payload: UpdateRoomAdminRequest = {
          targetUserName: admin.userName,
        };

        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/admins/remove`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      "Admin rights revoked.",
    );
  }

  async function handleRemoveMember(member: RoomMemberResponse) {
    if (!window.confirm(`Remove ${member.userName} from the room? This also applies a room ban.`)) {
      return;
    }

    await runRoomAction(
      `remove-member-${member.userId}`,
      async () => {
        const payload: RemoveRoomMemberRequest = {
          targetUserName: member.userName,
          reason: memberRemovalReason.trim() || null,
        };

        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/members/remove`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMemberRemovalReason("");
      },
      `${member.userName} was removed and banned from the room.`,
    );
  }

  async function handleUnban(ban: RoomBanResponse) {
    if (!window.confirm(`Allow ${ban.userName} to join the room again?`)) {
      return;
    }

    await runRoomAction(
      `unban-${ban.userId}`,
      async () => {
        const payload: RemoveRoomBanRequest = {
          targetUserName: ban.userName,
        };

        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/bans/remove`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      `${ban.userName} can join again.`,
    );
  }

  async function handleLeaveRoom() {
    if (!window.confirm("Leave this room? You will lose access to its history and files unless invited back.")) {
      return;
    }

    await runRoomAction(
      "leave-room",
      async () => {
        await apiRequest<MessageResponse>(`/api/rooms/${room.id}/leave`, {
          method: "POST",
        });
      },
      "You left the room.",
      true,
    );
  }

  async function handleDeleteRoom() {
    if (!window.confirm("Delete this room permanently? Messages and attachments will be removed forever.")) {
      return;
    }

    await runRoomAction(
      "delete-room",
      async () => {
        await apiRequest<MessageResponse>(`/api/rooms/${room.id}`, {
          method: "DELETE",
        });
      },
      "Room deleted permanently.",
      true,
    );
  }

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      onClose={onClose}
      open={isOpen}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Manage room
            </Typography>
            <Typography variant="h2" sx={{ mt: 0.5 }}>
              # {room.name}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {room.description ?? "Use this modal to review members, invitations, bans, and safe room actions."}
            </Typography>
          </Box>
          <IconButton aria-label="Close room manager" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 0, pb: 3 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
          >
            <Tabs value={activeTab} onChange={(_, value: RoomTab) => setActiveTab(value)} variant="scrollable">
              <Tab value="members" label={`Members (${roomDetails?.members.length ?? 0})`} />
              <Tab value="admins" label={`Admins (${roomDetails?.admins.length ?? 0})`} />
              <Tab value="invitations" label={`Invites (${roomDetails?.pendingInvitations.length ?? 0})`} />
              <Tab value="bans" label={`Bans (${roomDetails?.bans.length ?? 0})`} />
              <Tab value="settings" label="Settings" />
            </Tabs>

            {activeTab !== "settings" ? (
              <TextField
                size="small"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Filter by username"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ minWidth: { md: 280 } }}
              />
            ) : null}
          </Stack>

          {notice ? <Alert severity="success">{notice}</Alert> : null}
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          {loading ? (
            <Box sx={{ py: 6, textAlign: "center" }}>
              <Typography color="text.secondary">Loading room management details…</Typography>
            </Box>
          ) : null}

          {!loading && roomDetails ? (
            <>
              {activeTab === "members" ? (
                <TwoColumnDialog
                  left={
                    <EntityListCard
                      count={filteredMembers.length}
                      icon={<GroupIcon fontSize="small" />}
                      title="Members"
                      subtitle="People in the room"
                    >
                      {filteredMembers.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No members match the current search.
                        </Typography>
                      ) : (
                        <List disablePadding>
                          {filteredMembers.map((member) => (
                            <EntityListItem
                              key={member.userId}
                              primary={member.userName}
                              secondary={`Joined ${formatDateTime(member.joinedAtUtc)}`}
                              trailing={
                                <Stack direction="row" spacing={0.75}>
                                  {member.isOwner ? <Chip size="small" label="Owner" color="secondary" /> : null}
                                  {member.isAdmin ? <Chip size="small" label="Admin" variant="outlined" /> : null}
                                  {member.userName === currentUserName ? <Chip size="small" label="You" color="primary" /> : null}
                                  {roomDetails.permissions.canManageAdmins && !member.isOwner && !member.isAdmin ? (
                                    <Button
                                      disabled={pendingAction === `make-admin-${member.userId}`}
                                      onClick={() => void handleMakeAdmin(member)}
                                      size="small"
                                      variant="outlined"
                                    >
                                      {pendingAction === `make-admin-${member.userId}` ? "Saving…" : "Make admin"}
                                    </Button>
                                  ) : null}
                                  {roomDetails.permissions.canRemoveMembers && !member.isOwner ? (
                                    <Button
                                      color="error"
                                      disabled={pendingAction === `remove-member-${member.userId}`}
                                      onClick={() => void handleRemoveMember(member)}
                                      size="small"
                                      variant="outlined"
                                    >
                                      {pendingAction === `remove-member-${member.userId}` ? "Removing…" : "Remove"}
                                    </Button>
                                  ) : null}
                                </Stack>
                              }
                            />
                          ))}
                        </List>
                      )}
                    </EntityListCard>
                  }
                  right={
                    <EntityListCard
                      icon={<PersonOffIcon fontSize="small" />}
                      title="Remove with room ban"
                      subtitle="Moderation note"
                    >
                      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                        Removing a user also bans them until an explicit unban. Add an optional
                        reason before using the remove action from the member list.
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        minRows={4}
                        onChange={(event) => setMemberRemovalReason(event.target.value)}
                        placeholder="Optional moderation reason"
                        value={memberRemovalReason}
                      />
                    </EntityListCard>
                  }
                />
              ) : null}

              {activeTab === "admins" ? (
                <TwoColumnDialog
                  left={
                    <EntityListCard
                      count={filteredAdmins.length}
                      icon={<ShieldIcon fontSize="small" />}
                      title="Admins"
                      subtitle="Trusted operators"
                    >
                      {filteredAdmins.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No admins match the current search.
                        </Typography>
                      ) : (
                        <List disablePadding>
                          {filteredAdmins.map((admin) => (
                            <EntityListItem
                              key={admin.userId}
                              primary={admin.userName}
                              secondary={admin.isOwner ? "Room owner" : `Granted ${formatDateTime(admin.grantedAtUtc)}`}
                              trailing={
                                <Stack direction="row" spacing={0.75}>
                                  {admin.isOwner ? <Chip size="small" label="Owner" color="secondary" /> : null}
                                  {admin.userName === currentUserName ? <Chip size="small" label="You" color="primary" /> : null}
                                  {roomDetails.permissions.canManageAdmins && !admin.isOwner ? (
                                    <Button
                                      disabled={pendingAction === `revoke-admin-${admin.userId}`}
                                      onClick={() => void handleRevokeAdmin(admin)}
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                    >
                                      {pendingAction === `revoke-admin-${admin.userId}` ? "Saving…" : "Revoke"}
                                    </Button>
                                  ) : null}
                                </Stack>
                              }
                            />
                          ))}
                        </List>
                      )}
                    </EntityListCard>
                  }
                  right={
                    <EntityListCard
                      icon={<GppGoodIcon fontSize="small" />}
                      title="Add an admin by username"
                      subtitle="Grant access"
                    >
                      {roomDetails.permissions.canManageAdmins ? (
                        <Stack
                          component="form"
                          spacing={2}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleGrantAdminSubmit();
                          }}
                        >
                          <TextField
                            label="Username"
                            onChange={(event) => setAdminDraft(event.target.value)}
                            value={adminDraft}
                          />
                          <Button
                            type="submit"
                            variant="contained"
                            disabled={pendingAction === "grant-admin"}
                          >
                            {pendingAction === "grant-admin" ? "Granting…" : "Grant admin"}
                          </Button>
                        </Stack>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          Only the room owner can grant or revoke admin access.
                        </Typography>
                      )}
                    </EntityListCard>
                  }
                />
              ) : null}

              {activeTab === "invitations" ? (
                <TwoColumnDialog
                  left={
                    <EntityListCard
                      count={filteredInvitations.length}
                      icon={<SendIcon fontSize="small" />}
                      title="Outstanding invitations"
                      subtitle="Pending invites"
                    >
                      {filteredInvitations.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No pending invitations match this filter.
                        </Typography>
                      ) : (
                        <List disablePadding>
                          {filteredInvitations.map((invitation) => (
                            <EntityListItem
                              key={invitation.id}
                              primary={invitation.invitedUserName}
                              secondary={`Invited by ${invitation.invitedByUserName} on ${formatDateTime(invitation.createdAtUtc)}`}
                              trailing={<Chip size="small" label={invitation.status} variant="outlined" />}
                            />
                          ))}
                        </List>
                      )}
                    </EntityListCard>
                  }
                  right={
                    <EntityListCard
                      icon={<SendIcon fontSize="small" />}
                      title="Invite a user by username"
                      subtitle="Send invite"
                    >
                      {roomDetails.permissions.canInvite ? (
                        <Stack
                          component="form"
                          spacing={2}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleInviteSubmit();
                          }}
                        >
                          <TextField
                            label="Username"
                            onChange={(event) => setInviteDraft(event.target.value)}
                            value={inviteDraft}
                          />
                          <Button
                            type="submit"
                            variant="contained"
                            disabled={pendingAction === "invite"}
                            endIcon={<SendIcon />}
                          >
                            {pendingAction === "invite" ? "Sending…" : "Send invite"}
                          </Button>
                        </Stack>
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          Only authorized members can invite users to this room.
                        </Typography>
                      )}
                    </EntityListCard>
                  }
                />
              ) : null}

              {activeTab === "bans" ? (
                <TwoColumnDialog
                  left={
                    <EntityListCard
                      count={filteredBans.length}
                      icon={<PersonOffIcon fontSize="small" />}
                      title="People who cannot rejoin"
                      subtitle="Room bans"
                    >
                      {filteredBans.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No banned users match the current search.
                        </Typography>
                      ) : (
                        <List disablePadding>
                          {filteredBans.map((ban) => (
                            <EntityListItem
                              key={ban.userId}
                              primary={ban.userName}
                              secondary={`Banned by ${ban.bannedByUserName} on ${formatDateTime(ban.createdAtUtc)}${ban.reason ? ` · ${ban.reason}` : ""}`}
                              trailing={
                                roomDetails.permissions.canUnbanMembers ? (
                                  <Button
                                    disabled={pendingAction === `unban-${ban.userId}`}
                                    onClick={() => void handleUnban(ban)}
                                    size="small"
                                    variant="outlined"
                                  >
                                    {pendingAction === `unban-${ban.userId}` ? "Saving…" : "Unban"}
                                  </Button>
                                ) : null
                              }
                            />
                          ))}
                        </List>
                      )}
                    </EntityListCard>
                  }
                  right={
                    <EntityListCard
                      icon={<PersonOffIcon fontSize="small" />}
                      title="How bans work"
                      subtitle="Rule reminder"
                    >
                      <Stack spacing={1.25}>
                        <Typography color="text.secondary" variant="body2">
                          Removing a member applies a room ban immediately.
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                          Banned users cannot rejoin public rooms until explicitly unbanned.
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                          Unbanning restores join eligibility but does not automatically re-add the member.
                        </Typography>
                      </Stack>
                    </EntityListCard>
                  }
                />
              ) : null}

              {activeTab === "settings" ? (
                <TwoColumnDialog
                  left={
                    <EntityListCard
                      icon={<SettingsIcon fontSize="small" />}
                      title="Current configuration"
                      subtitle="Room settings"
                    >
                      <Stack spacing={1.25}>
                        <MetricRow label="Name" value={`# ${roomDetails.room.name}`} />
                        <MetricRow label="Visibility" value={roomDetails.room.isPrivate ? "Private" : "Public"} />
                        <MetricRow label="Members" value={roomDetails.room.memberCount} />
                        <MetricRow label="Unread" value={roomDetails.room.unreadCount} />
                        <MetricRow
                          label="Latest activity"
                          value={roomDetails.room.lastMessageAtUtc ? formatDateTime(roomDetails.room.lastMessageAtUtc) : "No messages yet"}
                        />
                        <MetricRow label="Description" value={roomDetails.room.description ?? "No description"} />
                      </Stack>
                    </EntityListCard>
                  }
                  right={
                    <EntityListCard
                      icon={<DeleteForeverIcon fontSize="small" />}
                      title="Destructive actions"
                      subtitle="Danger zone"
                    >
                      <Stack spacing={1.5}>
                        <MetricRow label="Current role" value={room.isOwner ? "Owner" : room.isAdmin ? "Admin" : "Member"} />
                        {roomDetails.permissions.canLeave ? (
                          <Button
                            disabled={pendingAction === "leave-room"}
                            onClick={() => void handleLeaveRoom()}
                            variant="outlined"
                          >
                            {pendingAction === "leave-room" ? "Leaving…" : "Leave room"}
                          </Button>
                        ) : null}
                        {room.isOwner ? (
                          <Button
                            color="error"
                            disabled={pendingAction === "delete-room"}
                            onClick={() => void handleDeleteRoom()}
                            variant="contained"
                            startIcon={<DeleteForeverIcon />}
                          >
                            {pendingAction === "delete-room" ? "Deleting…" : "Delete room permanently"}
                          </Button>
                        ) : null}
                        {!roomDetails.permissions.canLeave && !room.isOwner ? (
                          <Typography color="text.secondary" variant="body2">
                            Your current permissions do not allow destructive room actions from this tab.
                          </Typography>
                        ) : null}
                      </Stack>
                    </EntityListCard>
                  }
                />
              ) : null}
            </>
          ) : null}

          {!loading && !roomDetails && !errorMessage ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
              No room details are available yet. Try reopening the manager to reload the latest state.
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function TwoColumnDialog({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.25fr) minmax(300px, 0.85fr)" },
        gap: 2,
      }}
    >
      {left}
      {right}
    </Box>
  );
}

function EntityListCard({
  title,
  subtitle,
  icon,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 3,
        border: "1px solid rgba(255,255,255,0.08)",
        bgcolor: alpha("#fff", 0.03),
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Avatar sx={{ width: 34, height: 34, bgcolor: alpha("#66c8ff", 0.12), color: "primary.light" }}>
              {icon}
            </Avatar>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {subtitle}
              </Typography>
              <Typography variant="h3" sx={{ mt: 0.25 }}>
                {title}
              </Typography>
            </Box>
          </Stack>
          {typeof count === "number" ? <Chip size="small" label={count} variant="outlined" /> : null}
        </Stack>
        <Divider />
        {children}
      </Stack>
    </Box>
  );
}

function EntityListItem({
  primary,
  secondary,
  trailing,
}: {
  primary: string;
  secondary: string;
  trailing?: ReactNode;
}) {
  return (
    <ListItem
      disableGutters
      sx={{
        py: 1.25,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        "&:last-of-type": { borderBottom: 0, pb: 0 },
      }}
      secondaryAction={trailing}
    >
      <ListItemText
        primary={
          <Typography variant="subtitle1">
            {primary}
          </Typography>
        }
        secondary={
          <Typography color="text.secondary" variant="body2">
            {secondary}
          </Typography>
        }
        sx={{ pr: trailing ? 16 : 0 }}
      />
    </ListItem>
  );
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
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

function filterByUserName<T>(items: T[], normalizedSearch: string, selector?: (item: T) => string) {
  if (!normalizedSearch) {
    return items;
  }

  return items.filter((item) => (selector ? selector(item) : (item as { userName: string }).userName).toLowerCase().includes(normalizedSearch));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.detail ?? error.title ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
