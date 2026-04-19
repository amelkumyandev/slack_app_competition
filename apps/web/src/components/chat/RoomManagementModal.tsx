"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

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

  if (!isOpen) {
    return null;
  }

  const permissions = roomDetails?.permissions;

  return (
    <div aria-modal="true" className="modal-backdrop" onClick={onClose} role="dialog">
      <section className="room-modal" onClick={(event) => event.stopPropagation()}>
        <header className="room-modal-header">
          <div>
            <span className="panel-kicker">Manage room</span>
            <h2># {room.name}</h2>
            <p className="panel-copy">
              {room.description ?? "Use this modal to review members, invitations, bans, and safe room actions."}
            </p>
          </div>
          <button aria-label="Close room manager" className="ghost-link" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="room-modal-toolbar">
          <div className="toggle-row" role="tablist" aria-label="Room management tabs">
            {[
              ["members", `Members (${roomDetails?.members.length ?? 0})`],
              ["admins", `Admins (${roomDetails?.admins.length ?? 0})`],
              ["invitations", `Invites (${roomDetails?.pendingInvitations.length ?? 0})`],
              ["bans", `Bans (${roomDetails?.bans.length ?? 0})`],
              ["settings", "Settings"],
            ].map(([tab, label]) => (
              <button
                className={activeTab === tab ? "toggle-button active" : "toggle-button"}
                key={tab}
                onClick={() => setActiveTab(tab as RoomTab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab !== "settings" ? (
            <label className="field room-search-field">
              <span>Member search</span>
              <input
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Filter by username"
                type="search"
                value={searchDraft}
              />
            </label>
          ) : null}
        </div>

        {notice ? <div className="feedback-banner success-banner">{notice}</div> : null}
        {errorMessage ? <div className="feedback-banner error-banner">{errorMessage}</div> : null}

        {loading ? (
          <div className="panel-skeleton">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        ) : null}

        {!loading && roomDetails ? (
          <div className="room-modal-content">
            {activeTab === "members" ? (
              <div className="room-tab-grid">
                <article className="room-tab-card">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">People in the room</span>
                      <h3>Members</h3>
                    </div>
                    <span className="counter-pill">{filteredMembers.length}</span>
                  </div>

                  {filteredMembers.length === 0 ? (
                    <div className="empty-state">
                      <strong>No members match the current search.</strong>
                      <p>Try another username filter or switch tabs.</p>
                    </div>
                  ) : (
                    <div className="room-entity-list">
                      {filteredMembers.map((member) => (
                        <article className="room-entity-card" key={member.userId}>
                          <div>
                            <strong>{member.userName}</strong>
                            <span>Joined {formatDateTime(member.joinedAtUtc)}</span>
                          </div>
                          <div className="session-badges">
                            {member.isOwner ? <span className="chip chip-accent">Owner</span> : null}
                            {member.isAdmin ? <span className="chip chip-muted">Admin</span> : null}
                            {member.userName === currentUserName ? <span className="chip chip-online">You</span> : null}
                            {permissions?.canRemoveMembers && !member.isOwner ? (
                              <button
                                className="danger-button compact-button"
                                disabled={pendingAction === `remove-member-${member.userId}`}
                                onClick={() => void handleRemoveMember(member)}
                                type="button"
                              >
                                {pendingAction === `remove-member-${member.userId}` ? "Removing..." : "Remove"}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article className="room-tab-card side-panel">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Moderation note</span>
                      <h3>Remove with room ban</h3>
                    </div>
                  </div>

                  <p className="panel-copy">
                    Removing a user from a room also bans them until an explicit unban. Add an
                    optional reason below before using the remove action from the member list.
                  </p>

                  <label className="field">
                    <span>Removal reason</span>
                    <textarea
                      onChange={(event) => setMemberRemovalReason(event.target.value)}
                      placeholder="Optional moderation reason"
                      rows={4}
                      value={memberRemovalReason}
                    />
                  </label>
                </article>
              </div>
            ) : null}

            {activeTab === "admins" ? (
              <div className="room-tab-grid">
                <article className="room-tab-card">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Trusted operators</span>
                      <h3>Admins</h3>
                    </div>
                    <span className="counter-pill">{filteredAdmins.length}</span>
                  </div>

                  {filteredAdmins.length === 0 ? (
                    <div className="empty-state">
                      <strong>No admins match the current search.</strong>
                      <p>Try another username or clear the filter.</p>
                    </div>
                  ) : (
                    <div className="room-entity-list">
                      {filteredAdmins.map((admin) => (
                        <article className="room-entity-card" key={admin.userId}>
                          <div>
                            <strong>{admin.userName}</strong>
                            <span>{admin.isOwner ? "Room owner" : `Granted ${formatDateTime(admin.grantedAtUtc)}`}</span>
                          </div>
                          <div className="session-badges">
                            {admin.isOwner ? <span className="chip chip-accent">Owner</span> : null}
                            {admin.userName === currentUserName ? <span className="chip chip-online">You</span> : null}
                            {permissions?.canManageAdmins && !admin.isOwner ? (
                              <button
                                className="danger-button compact-button"
                                disabled={pendingAction === `revoke-admin-${admin.userId}`}
                                onClick={() => void handleRevokeAdmin(admin)}
                                type="button"
                              >
                                {pendingAction === `revoke-admin-${admin.userId}` ? "Saving..." : "Revoke"}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article className="room-tab-card side-panel">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Grant access</span>
                      <h3>Add an admin by username</h3>
                    </div>
                  </div>

                  {permissions?.canManageAdmins ? (
                    <form
                      className="auth-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleGrantAdminSubmit();
                      }}
                    >
                      <label className="field">
                        <span>Username</span>
                        <input
                          onChange={(event) => setAdminDraft(event.target.value)}
                          placeholder="username"
                          type="text"
                          value={adminDraft}
                        />
                      </label>
                      <button className="primary-button" disabled={pendingAction === "grant-admin"} type="submit">
                        {pendingAction === "grant-admin" ? "Granting..." : "Grant admin"}
                      </button>
                    </form>
                  ) : (
                    <div className="empty-state">
                      <strong>You cannot change room admins.</strong>
                      <p>Only the room owner can grant or revoke admin access.</p>
                    </div>
                  )}
                </article>
              </div>
            ) : null}

            {activeTab === "invitations" ? (
              <div className="room-tab-grid">
                <article className="room-tab-card">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Pending invites</span>
                      <h3>Outstanding invitations</h3>
                    </div>
                    <span className="counter-pill">{filteredInvitations.length}</span>
                  </div>

                  {filteredInvitations.length === 0 ? (
                    <div className="empty-state">
                      <strong>No pending invitations match this filter.</strong>
                      <p>Invite another user or clear the search input.</p>
                    </div>
                  ) : (
                    <div className="room-entity-list">
                      {filteredInvitations.map((invitation) => (
                        <article className="room-entity-card" key={invitation.id}>
                          <div>
                            <strong>{invitation.invitedUserName}</strong>
                            <span>
                              Invited by {invitation.invitedByUserName} on {formatDateTime(invitation.createdAtUtc)}
                            </span>
                          </div>
                          <div className="session-badges">
                            <span className="chip chip-muted">{invitation.status}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article className="room-tab-card side-panel">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Send invite</span>
                      <h3>Invite a user by username</h3>
                    </div>
                  </div>

                  {permissions?.canInvite ? (
                    <form
                      className="auth-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleInviteSubmit();
                      }}
                    >
                      <label className="field">
                        <span>Username</span>
                        <input
                          onChange={(event) => setInviteDraft(event.target.value)}
                          placeholder="username"
                          type="text"
                          value={inviteDraft}
                        />
                      </label>
                      <button className="primary-button" disabled={pendingAction === "invite"} type="submit">
                        {pendingAction === "invite" ? "Sending..." : "Send invite"}
                      </button>
                    </form>
                  ) : (
                    <div className="empty-state">
                      <strong>You cannot send room invitations.</strong>
                      <p>Only authorized members can invite users to this room.</p>
                    </div>
                  )}
                </article>
              </div>
            ) : null}

            {activeTab === "bans" ? (
              <div className="room-tab-grid">
                <article className="room-tab-card">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Room bans</span>
                      <h3>People who cannot rejoin</h3>
                    </div>
                    <span className="counter-pill">{filteredBans.length}</span>
                  </div>

                  {filteredBans.length === 0 ? (
                    <div className="empty-state">
                      <strong>No banned users match the current search.</strong>
                      <p>Users removed from the room will appear here until unbanned.</p>
                    </div>
                  ) : (
                    <div className="room-entity-list">
                      {filteredBans.map((ban) => (
                        <article className="room-entity-card" key={ban.userId}>
                          <div>
                            <strong>{ban.userName}</strong>
                            <span>
                              Banned by {ban.bannedByUserName} on {formatDateTime(ban.createdAtUtc)}
                            </span>
                            {ban.reason ? <span>Reason: {ban.reason}</span> : null}
                          </div>
                          <div className="session-badges">
                            {permissions?.canUnbanMembers ? (
                              <button
                                className="secondary-button compact-button"
                                disabled={pendingAction === `unban-${ban.userId}`}
                                onClick={() => void handleUnban(ban)}
                                type="button"
                              >
                                {pendingAction === `unban-${ban.userId}` ? "Saving..." : "Unban"}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article className="room-tab-card side-panel">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Rule reminder</span>
                      <h3>How bans work</h3>
                    </div>
                  </div>

                  <ul className="fact-list">
                    <li>Removing a member applies a room ban immediately.</li>
                    <li>Banned users cannot rejoin public rooms until explicitly unbanned.</li>
                    <li>Unbanning restores join eligibility but does not automatically re-add the member.</li>
                  </ul>
                </article>
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <div className="room-tab-grid">
                <article className="room-tab-card">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Room settings</span>
                      <h3>Current configuration</h3>
                    </div>
                  </div>

                  <div className="presence-details">
                    <div>
                      <dt>Name</dt>
                      <dd># {roomDetails.room.name}</dd>
                    </div>
                    <div>
                      <dt>Visibility</dt>
                      <dd>{roomDetails.room.isPrivate ? "Private" : "Public"}</dd>
                    </div>
                    <div>
                      <dt>Members</dt>
                      <dd>{roomDetails.room.memberCount}</dd>
                    </div>
                    <div>
                      <dt>Unread</dt>
                      <dd>{roomDetails.room.unreadCount}</dd>
                    </div>
                    <div>
                      <dt>Latest activity</dt>
                      <dd>{roomDetails.room.lastMessageAtUtc ? formatDateTime(roomDetails.room.lastMessageAtUtc) : "No messages yet"}</dd>
                    </div>
                    <div>
                      <dt>Description</dt>
                      <dd>{roomDetails.room.description ?? "No description"}</dd>
                    </div>
                  </div>
                </article>

                <article className="room-tab-card side-panel">
                  <div className="panel-header">
                    <div>
                      <span className="panel-kicker">Danger zone</span>
                      <h3>Destructive actions</h3>
                    </div>
                  </div>

                  <div className="room-action-list">
                    <div className="detail-metric">
                      <span>Current role</span>
                      <strong>{room.isOwner ? "Owner" : room.isAdmin ? "Admin" : "Member"}</strong>
                    </div>
                    {permissions?.canLeave ? (
                      <button
                        className="secondary-button"
                        disabled={pendingAction === "leave-room"}
                        onClick={() => void handleLeaveRoom()}
                        type="button"
                      >
                        {pendingAction === "leave-room" ? "Leaving..." : "Leave room"}
                      </button>
                    ) : null}
                    {room.isOwner ? (
                      <button
                        className="danger-button"
                        disabled={pendingAction === "delete-room"}
                        onClick={() => void handleDeleteRoom()}
                        type="button"
                      >
                        {pendingAction === "delete-room" ? "Deleting..." : "Delete room permanently"}
                      </button>
                    ) : null}
                    {!permissions?.canLeave && !room.isOwner ? (
                      <div className="empty-state">
                        <strong>No destructive actions available.</strong>
                        <p>Your current permissions do not allow room settings changes from this tab.</p>
                      </div>
                    ) : null}
                  </div>
                </article>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && !roomDetails && !errorMessage ? (
          <div className="empty-state">
            <strong>No room details are available yet.</strong>
            <p>Try refreshing the room manager to load the latest state from the API.</p>
          </div>
        ) : null}
      </section>
    </div>
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
