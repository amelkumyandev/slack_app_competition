"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { MessageResponse } from "@/lib/api/contracts";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await apiRequest<MessageResponse>(
        "/api/auth/password-reset/request",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
      );

      setSuccessMessage(
        response.message ??
          "If an account exists for that email, a reset link is on its way.",
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "We could not send the reset link."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card sx={{ width: "100%" }}>
      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Account recovery
            </Typography>
            <Typography variant="h2" sx={{ mt: 0.5 }}>
              Forgot password
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Enter your email address and we will send you a reset link.
            </Typography>
          </Box>

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

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

              <Button
                disabled={submitting}
                fullWidth
                size="large"
                type="submit"
                variant="contained"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </Button>

              <Stack direction="row" spacing={0.75} sx={{ justifyContent: "center" }}>
                <Typography color="text.secondary" variant="body2">
                  Remembered it?
                </Typography>
                <Link href="/auth/sign-in" style={{ textDecoration: "none" }}>
                  <Typography color="primary" variant="body2" sx={{ fontWeight: 600 }}>
                    Back to sign in
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
