"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LockOutlined as LockOutlinedIcon,
  Login as LoginIcon,
  PersonAddAlt1 as PersonAddAlt1Icon,
  Security as SecurityIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { type AuthResponse, type CurrentUserResponse } from "@/lib/api/contracts";
import { ApiClientError, apiRequest } from "@/lib/api/client";

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

export function AuthWorkspace() {
  const router = useRouter();
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginDraft, setLoginDraft] = useState(defaultLoginDraft);
  const [registerDraft, setRegisterDraft] = useState(defaultRegisterDraft);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setErrorMessage(null);

    try {
      const me = await apiRequest<CurrentUserResponse>("/api/auth/me");
      setCurrentUser(me);
      setWorkspaceStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        setCurrentUser(null);
        setWorkspaceStatus("auth");
        return;
      }

      setWorkspaceStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't load the authentication entry screen."));
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

        setNotice("Signed in. Redirecting to the chat workspace.");
      } else {
        await apiRequest<AuthResponse>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(registerDraft),
        });

        setNotice("Account created. Redirecting to the chat workspace.");
      }

      await loadWorkspace();
      router.push("/chat");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Authentication did not complete."));
      setWorkspaceStatus("auth");
    } finally {
      setAuthSubmitting(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 1320, mx: "auto" }}>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, xl: 8 }}>
          <Card
            sx={{
              minHeight: 280,
              background:
                "linear-gradient(145deg, rgba(26,30,40,0.98), rgba(42,23,59,0.96))",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack spacing={2}>
                <Chip
                  icon={<LockOutlinedIcon />}
                  label="Competition auth entry"
                  color="secondary"
                  sx={{ alignSelf: "flex-start", bgcolor: "rgba(240,138,183,0.12)" }}
                />
                <Typography variant="h1" sx={{ maxWidth: 720 }}>
                  Secure entry with a calmer, Slack-inspired product voice.
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
                  The auth route now behaves like a real product entry point instead of a borrowed
                  feature screen. Persistent login, account creation, and redirect into chat all
                  stay on the same backend session model.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Chip label="Cookie-backed sessions" variant="outlined" />
                  <Chip label="Persistent login optional" variant="outlined" />
                  <Chip label="Redirects into /chat" variant="outlined" />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, xl: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="overline" color="text.secondary">
                  Why this matters
                </Typography>
                <Typography variant="h3">One product entry path</Typography>
                <Stack spacing={1.5}>
                  <FeatureBullet
                    icon={<LoginIcon fontSize="small" />}
                    text="Chat, sessions, and presence can all send users to a real sign-in destination."
                  />
                  <FeatureBullet
                    icon={<SecurityIcon fontSize="small" />}
                    text="The frontend stays aligned with the existing backend auth and session contracts."
                  />
                  <FeatureBullet
                    icon={<PersonAddAlt1Icon fontSize="small" />}
                    text="Registration and login share one visual system instead of two separate feature demos."
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        {notice ? (
          <Grid size={12}>
            <Alert severity="success" variant="filled">
              {notice}
            </Alert>
          </Grid>
        ) : null}
        {errorMessage ? (
          <Grid size={12}>
            <Alert severity="error" variant="filled">
              {errorMessage}
            </Alert>
          </Grid>
        ) : null}

        {workspaceStatus === "loading" ? (
          <Grid size={12}>
            <Card>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h3" gutterBottom>
                  Loading authentication entry…
                </Typography>
                <Typography color="text.secondary">
                  Checking whether this browser already has an authenticated session.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : null}

        {workspaceStatus === "auth" ? (
          <>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Card>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Stack spacing={3}>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Access entry
                      </Typography>
                      <Typography variant="h2" sx={{ mt: 0.5 }}>
                        {authMode === "login" ? "Sign in to continue" : "Create your account"}
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 660 }}>
                        Keep the backend exactly as it is. This refactor only changes the visual
                        language, spacing, and hierarchy around the same cookie-backed auth flows.
                      </Typography>
                    </Box>

                    <Tabs
                      value={authMode}
                      onChange={(_, value: AuthMode) => setAuthMode(value)}
                      sx={{
                        bgcolor: alpha("#fff", 0.03),
                        p: 0.5,
                        borderRadius: 2,
                        width: "fit-content",
                      }}
                    >
                      <Tab label="Sign in" value="login" />
                      <Tab label="Create account" value="register" />
                    </Tabs>

                    <Box component="form" onSubmit={handleAuthSubmit}>
                      <Stack spacing={2}>
                        {authMode === "login" ? (
                          <>
                            <TextField
                              autoComplete="username"
                              label="Email or username"
                              onChange={(event) =>
                                setLoginDraft((current) => ({
                                  ...current,
                                  emailOrUserName: event.target.value,
                                }))
                              }
                              required
                              value={loginDraft.emailOrUserName}
                            />
                            <TextField
                              autoComplete="current-password"
                              label="Password"
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
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={loginDraft.rememberMe}
                                  onChange={(event) =>
                                    setLoginDraft((current) => ({
                                      ...current,
                                      rememberMe: event.target.checked,
                                    }))
                                  }
                                />
                              }
                              label="Keep this browser signed in"
                            />
                          </>
                        ) : (
                          <>
                            <TextField
                              autoComplete="email"
                              label="Email"
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
                            <TextField
                              autoComplete="username"
                              label="Username"
                              onChange={(event) =>
                                setRegisterDraft((current) => ({
                                  ...current,
                                  userName: event.target.value,
                                }))
                              }
                              required
                              value={registerDraft.userName}
                            />
                            <TextField
                              autoComplete="new-password"
                              label="Password"
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
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={registerDraft.rememberMe}
                                  onChange={(event) =>
                                    setRegisterDraft((current) => ({
                                      ...current,
                                      rememberMe: event.target.checked,
                                    }))
                                  }
                                />
                              }
                              label="Create a persistent session for this browser"
                            />
                          </>
                        )}

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
                          <Button disabled={authSubmitting} size="large" type="submit" variant="contained">
                            {authSubmitting
                              ? authMode === "login"
                                ? "Signing in…"
                                : "Creating account…"
                              : authMode === "login"
                                ? "Sign in"
                                : "Create account"}
                          </Button>
                          <Typography color="text.secondary" variant="body2">
                            Forgot-password UI is still backed by the existing reset flow scaffolding.
                          </Typography>
                        </Stack>
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, lg: 5 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2.5}>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Product shell
                      </Typography>
                      <Typography variant="h3" sx={{ mt: 0.5 }}>
                        What this route unlocks
                      </Typography>
                    </Box>

                    <Stack spacing={1.75}>
                      <FeatureBullet
                        icon={<LoginIcon fontSize="small" />}
                        text="Signed-out users reach a real entry screen instead of borrowing the sessions page."
                      />
                      <FeatureBullet
                        icon={<SecurityIcon fontSize="small" />}
                        text="Presence and sessions can keep explicit auth-required states without duplicating forms."
                      />
                      <FeatureBullet
                        icon={<PersonAddAlt1Icon fontSize="small" />}
                        text="The app starts to read as one product instead of several feature demos."
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </>
        ) : null}

        {workspaceStatus === "ready" ? (
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Already signed in
                    </Typography>
                    <Typography variant="h2" sx={{ mt: 0.5 }}>
                      {currentUser?.userName}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                      This browser already has an active authenticated session. You can go straight
                      into chat or review the persisted session inventory from the security screen.
                    </Typography>
                  </Box>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Button component={Link} href="/chat" variant="contained">
                      Open chat
                    </Button>
                    <Button component={Link} href="/sessions" variant="outlined">
                      Review sessions
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ) : null}

        {workspaceStatus === "error" ? (
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Recoverable error
                    </Typography>
                    <Typography variant="h2" sx={{ mt: 0.5 }}>
                      The auth screen needs a retry
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                      The frontend keeps sign-in failure states explicit so users have a clear way
                      back into the product without refreshing the entire page.
                    </Typography>
                  </Box>

                  <Button onClick={() => void loadWorkspace()} variant="contained">
                    Retry auth screen
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
}

type FeatureBulletProps = {
  icon: ReactNode;
  text: string;
};

function FeatureBullet({ icon, text }: FeatureBulletProps) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 2,
          bgcolor: "rgba(255,255,255,0.05)",
          color: "primary.light",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Typography color="text.secondary" variant="body2">
        {text}
      </Typography>
    </Stack>
  );
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
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
