"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Forum as ForumIcon } from "@mui/icons-material";
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

type AuthShellProps = {
  children: React.ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();
  const isSignIn = pathname === "/auth" || pathname.startsWith("/auth/sign-in");
  const isRegister = pathname.startsWith("/auth/register");

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" color="transparent">
        <Toolbar sx={{ gap: 2, minHeight: 72 }}>
          <Stack
            component={Link}
            href="/"
            direction="row"
            spacing={1.25}
            sx={{
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #2d7bd6, #f08ab7)",
                color: "common.white",
              }}
            >
              <ForumIcon fontSize="small" />
            </Box>
            <Typography variant="h3" sx={{ letterSpacing: "-0.03em" }}>
              ChatLogo
            </Typography>
          </Stack>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1}>
            <Button
              component={Link}
              href="/auth/sign-in"
              variant={isSignIn ? "contained" : "text"}
              color={isSignIn ? "primary" : "inherit"}
            >
              Sign in
            </Button>
            <Button
              component={Link}
              href="/auth/register"
              variant={isRegister ? "contained" : "outlined"}
              color={isRegister ? "primary" : "inherit"}
            >
              Register
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container
        maxWidth="sm"
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: { xs: 4, md: 6 },
        }}
      >
        {children}
      </Container>
    </Box>
  );
}
