"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { SessionRevocationResponse, UserSessionResponse, UserSessionsResponse } from "@/lib/api/contracts";

export function SessionsWorkspace() {
  const [sessions, setSessions] = useState<UserSessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiRequest<UserSessionsResponse>("/api/sessions");
      setSessions(response.sessions);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The session list could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(session: UserSessionResponse) {
    if (!session.canRevoke) {
      return;
    }

    setRevokingSessionId(session.id);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const response = await apiRequest<SessionRevocationResponse>(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });

      setFeedbackMessage(response.message);
      await loadSessions();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "That session could not be revoked."));
    } finally {
      setRevokingSessionId(null);
    }
  }

  const sessionSummary = useMemo(() => {
    const active = sessions.filter((session) => session.state === "active").length;
    const revoked = sessions.filter((session) => session.state === "revoked").length;
    const current = sessions.filter((session) => session.isCurrent).length;

    return { active, current, revoked };
  }, [sessions]);

  return (
    <Box sx={{ flex: 1, px: { xs: 1, md: 2 }, py: { xs: 1, md: 2 } }}>
      <Stack spacing={1.5} sx={{ maxWidth: 1160, mx: "auto" }}>
        {feedbackMessage ? (
          <Alert severity="success" onClose={() => setFeedbackMessage(null)}>
            {feedbackMessage}
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert severity="error" onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        ) : null}

        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary">
                  Account security
                </Typography>
                <Typography variant="h2" sx={{ mt: 0.5 }}>
                  Browser sessions
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 620 }}>
                  Review where your account is signed in and revoke any session that should no longer stay active.
                </Typography>
              </Box>

              <Button onClick={() => void loadSessions()} variant="outlined">
                Refresh
              </Button>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: 2.5 }}>
              <SummaryCard label="Active" value={sessionSummary.active} />
              <SummaryCard label="Current" value={sessionSummary.current} />
              <SummaryCard label="Revoked" value={sessionSummary.revoked} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Box>
                <Typography variant="h3">Signed-in devices</Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                  Each session is isolated, so signing out here does not automatically revoke your other browsers.
                </Typography>
              </Box>
            </Stack>

            {loading ? (
              <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : sessions.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                No active or historical sessions are available yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {sessions.map((session) => (
                  <Box
                    key={session.id}
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: alpha("#fff", 0.03),
                    }}
                  >
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                          <Typography variant="subtitle1" sx={{ minWidth: 0 }}>
                            {session.userAgent ?? "Unknown browser"}
                          </Typography>
                          {session.isCurrent ? <Chip label="Current session" size="small" color="primary" /> : null}
                          <Chip label={toSessionStateLabel(session.state)} size="small" variant="outlined" />
                          {session.rememberMe ? <Chip label="Persistent login" size="small" variant="outlined" /> : null}
                        </Stack>

                        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>
                          {session.ipAddress ?? "Unknown IP"} - Last seen {formatDateTime(session.lastSeenAtUtc)}
                        </Typography>

                        <Divider sx={{ my: 1.5 }} />

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                          <DetailItem label="Created" value={formatDateTime(session.createdAtUtc)} />
                          <DetailItem label="Expires" value={formatDateTime(session.expiresAtUtc)} />
                          <DetailItem
                            label="Revoked"
                            value={session.revokedAtUtc ? formatDateTime(session.revokedAtUtc) : "Not revoked"}
                          />
                        </Stack>
                      </Box>

                      <Stack sx={{ justifyContent: "center" }}>
                        <Button
                          color="error"
                          disabled={!session.canRevoke || revokingSessionId === session.id}
                          onClick={() => void handleRevoke(session)}
                          variant={session.canRevoke ? "outlined" : "text"}
                        >
                          {revokingSessionId === session.id ? "Revoking..." : session.canRevoke ? "Revoke" : "Unavailable"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: 2,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: alpha("#fff", 0.03),
      }}
    >
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography variant="h3" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Box>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.3 }}>
        {value}
      </Typography>
    </Box>
  );
}

function toSessionStateLabel(state: UserSessionResponse["state"]) {
  if (state === "active") {
    return "Active";
  }

  if (state === "revoked") {
    return "Revoked";
  }

  return "Expired";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.detail || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
