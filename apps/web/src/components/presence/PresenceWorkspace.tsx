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
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { CurrentPresenceResponse, PresenceHeartbeatAcceptedResponse } from "@/lib/api/contracts";

export function PresenceWorkspace() {
  const [presence, setPresence] = useState<CurrentPresenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadPresence(true);
  }, []);

  async function loadPresence(showSpinner: boolean) {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const response = await apiRequest<CurrentPresenceResponse>("/api/presence/me");
      setPresence(response);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Your current presence could not be loaded."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleHeartbeat() {
    setRefreshing(true);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const now = new Date().toISOString();
      const accepted = await apiRequest<PresenceHeartbeatAcceptedResponse>("/api/presence/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          tabId: `presence-page-${Date.now().toString(36)}`,
          lastInteractionAtUtc: now,
          visibilityState: "visible",
          connectedAtUtc: now,
        }),
      });

      setPresence((current) =>
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
      setFeedbackMessage("Presence refreshed.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "A presence heartbeat could not be recorded."));
    } finally {
      setRefreshing(false);
    }
  }

  const summary = useMemo(() => {
    const snapshot = presence?.presence;
    return {
      state: snapshot?.state ?? "offline",
      liveTabs: snapshot?.liveTabCount ?? 0,
      lastSeen: snapshot?.lastHeartbeatAtUtc ? formatDateTime(snapshot.lastHeartbeatAtUtc) : "No heartbeat yet",
    };
  }, [presence]);

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
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Presence
                </Typography>
                <Typography variant="h2" sx={{ mt: 0.5 }}>
                  Current status
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 620 }}>
                  Your status is derived from live browser heartbeats, focus changes, and recent activity across tabs.
                </Typography>
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button disabled={refreshing} onClick={() => void loadPresence(false)} variant="outlined">
                  Refresh
                </Button>
                <Button disabled={refreshing} onClick={() => void handleHeartbeat()} variant="contained">
                  Send heartbeat
                </Button>
              </Stack>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: 2.5 }}>
              <MetricCard label="State" value={<Chip color={presenceColor(summary.state)} label={toPresenceLabel(summary.state)} size="small" />} />
              <MetricCard label="Live tabs" value={summary.liveTabs} />
              <MetricCard label="Last heartbeat" value={summary.lastSeen} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h3">Connected tabs</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, mb: 2 }}>
              The server aggregates all visible tabs before deciding whether you are online, away, or offline.
            </Typography>

            {loading ? (
              <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : presence?.presence.tabs.length ? (
              <Stack spacing={1.5}>
                {presence.presence.tabs.map((tab) => (
                  <Box
                    key={tab.tabId}
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
                          <Typography variant="subtitle1">{tab.tabId}</Typography>
                          <Chip label={tab.visibilityState} size="small" variant="outlined" />
                        </Stack>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1.25 }}>
                          <DetailItem label="Connected" value={formatDateTime(tab.connectedAtUtc)} />
                          <DetailItem label="Last interaction" value={formatDateTime(tab.lastInteractionAtUtc)} />
                          <DetailItem label="Last heartbeat" value={formatDateTime(tab.lastHeartbeatAtUtc)} />
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography color="text.secondary" variant="body2">
                No live tab records are available right now.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
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
      <Box sx={{ mt: 0.5 }}>
        {typeof value === "number" || typeof value === "string" ? <Typography variant="h3">{value}</Typography> : value}
      </Box>
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

function presenceColor(state: string) {
  if (state === "online") {
    return "success";
  }

  if (state === "afk") {
    return "warning";
  }

  return "default";
}

function toPresenceLabel(state: string) {
  if (state === "online") {
    return "Online";
  }

  if (state === "afk") {
    return "Away";
  }

  return "Offline";
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
