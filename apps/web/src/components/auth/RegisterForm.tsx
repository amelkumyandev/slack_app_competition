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
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { AuthResponse, CurrentUserResponse } from "@/lib/api/contracts";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await apiRequest<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, userName, password, rememberMe: true }),
      });

      router.push("/chat");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "We could not create your account."));
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

  const passwordsMismatch =
    confirmPassword.length > 0 && password.length > 0 && password !== confirmPassword;

  return (
    <Card sx={{ width: "100%" }}>
      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Get started
            </Typography>
            <Typography variant="h2" sx={{ mt: 0.5 }}>
              Create your account
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Pick a username and a strong password to start chatting.
            </Typography>
          </Box>

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                autoComplete="email"
                label="Email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
              <TextField
                autoComplete="username"
                label="Username"
                onChange={(event) => setUserName(event.target.value)}
                required
                value={userName}
              />
              <TextField
                autoComplete="new-password"
                label="Password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <TextField
                autoComplete="new-password"
                error={passwordsMismatch}
                helperText={passwordsMismatch ? "Passwords do not match." : undefined}
                label="Confirm password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />

              <Button
                disabled={submitting}
                fullWidth
                size="large"
                type="submit"
                variant="contained"
              >
                {submitting ? "Creating account…" : "Create account"}
              </Button>

              <Stack direction="row" spacing={0.75} sx={{ justifyContent: "center" }}>
                <Typography color="text.secondary" variant="body2">
                  Already have an account?
                </Typography>
                <Link href="/auth/sign-in" style={{ textDecoration: "none" }}>
                  <Typography color="primary" variant="body2" sx={{ fontWeight: 600 }}>
                    Sign in
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
