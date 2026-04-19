"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { AuthResponse, CurrentUserResponse } from "@/lib/api/contracts";

export function SignInForm() {
  const router = useRouter();
  const [emailOrUserName, setEmailOrUserName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiRequest<CurrentUserResponse>("/api/auth/me")
      .then(() => {
        if (!cancelled) {
          router.replace("/chat");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCheckingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await apiRequest<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ emailOrUserName, password, rememberMe }),
      });

      router.push("/chat");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Sign-in could not be completed."));
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card sx={{ width: "100%" }}>
      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Welcome back
            </Typography>
            <Typography variant="h2" sx={{ mt: 0.5 }}>
              Sign in
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Use your email or username to access your conversations.
            </Typography>
          </Box>

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                autoComplete="username"
                label="Email or username"
                onChange={(event) => setEmailOrUserName(event.target.value)}
                required
                value={emailOrUserName}
              />
              <TextField
                autoComplete="current-password"
                label="Password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                  }
                  label="Keep me signed in"
                />
                <Link href="/auth/forgot-password" style={{ textDecoration: "none" }}>
                  <Typography color="primary" variant="body2" sx={{ fontWeight: 600 }}>
                    Forgot password?
                  </Typography>
                </Link>
              </Stack>

              <Button
                disabled={submitting}
                fullWidth
                size="large"
                type="submit"
                variant="contained"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>

              <Stack direction="row" spacing={0.75} sx={{ justifyContent: "center" }}>
                <Typography color="text.secondary" variant="body2">
                  New here?
                </Typography>
                <Link href="/auth/register" style={{ textDecoration: "none" }}>
                  <Typography color="primary" variant="body2" sx={{ fontWeight: 600 }}>
                    Create an account
                  </Typography>
                </Link>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
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
