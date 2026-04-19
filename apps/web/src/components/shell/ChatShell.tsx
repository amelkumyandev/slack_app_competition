"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDropDown as ArrowDropDownIcon,
  Forum as ForumIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { CurrentUserResponse, MessageResponse } from "@/lib/api/contracts";

type ChatShellProps = {
  children: React.ReactNode;
};

export function ChatShell({ children }: ChatShellProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [profileAnchorEl, setProfileAnchorEl] = useState<HTMLElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiRequest<CurrentUserResponse>("/api/auth/me")
      .then((me) => {
        if (!cancelled) {
          setCurrentUser(me);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          router.replace("/auth/sign-in");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleScrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await apiRequest<MessageResponse>("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Even if the API call fails, we still redirect to sign-in.
    } finally {
      setSigningOut(false);
      setProfileAnchorEl(null);
      router.push("/auth/sign-in");
    }
  }

  const initials = (currentUser?.userName ?? "?").slice(0, 1).toUpperCase();

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" color="transparent">
        <Toolbar sx={{ gap: 2, minHeight: 72 }}>
          <Stack
            component={Link}
            href="/chat"
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

          <Stack
            component="nav"
            direction="row"
            spacing={0.5}
            sx={{
              ml: 2,
              flex: 1,
              display: { xs: "none", md: "flex" },
            }}
          >
            <Button color="inherit" onClick={() => handleScrollToSection("public-rooms")}>
              Public Rooms
            </Button>
            <Button color="inherit" onClick={() => handleScrollToSection("private-rooms")}>
              Private Rooms
            </Button>
            <Button color="inherit" onClick={() => handleScrollToSection("contacts")}>
              Contacts
            </Button>
            <Button color="inherit" component={Link} href="/sessions">
              Sessions
            </Button>
          </Stack>

          <Box sx={{ flex: 1, display: { xs: "block", md: "none" } }} />

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              onClick={(event) => setProfileAnchorEl(event.currentTarget)}
              sx={{
                color: "text.primary",
                px: 1,
                textTransform: "none",
              }}
              endIcon={<ArrowDropDownIcon />}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Avatar
                  sx={{
                    width: 30,
                    height: 30,
                    bgcolor: "rgba(127, 63, 152, 0.34)",
                    color: "secondary.light",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  {initials}
                </Avatar>
                <Box sx={{ textAlign: "left", display: { xs: "none", sm: "block" } }}>
                  <Typography variant="body2" sx={{ lineHeight: 1.1, fontWeight: 700 }}>
                    {currentUser?.userName ?? "Profile"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Account
                  </Typography>
                </Box>
              </Stack>
            </Button>

            <IconButton
              aria-label="Sign out"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              sx={{ display: { xs: "inline-flex", sm: "none" } }}
            >
              <LogoutIcon />
            </IconButton>
            <Button
              startIcon={<LogoutIcon />}
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              variant="outlined"
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </Stack>

          <Menu
            anchorEl={profileAnchorEl}
            open={Boolean(profileAnchorEl)}
            onClose={() => setProfileAnchorEl(null)}
            slotProps={{
              paper: { sx: { mt: 1, minWidth: 220 } },
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle1">{currentUser?.userName ?? "Loading…"}</Typography>
              <Typography variant="caption" color="text.secondary">
                {currentUser?.email ?? ""}
              </Typography>
            </Box>
            <Divider />
            <MenuItem component={Link} href="/sessions" onClick={() => setProfileAnchorEl(null)}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Sessions</ListItemText>
            </MenuItem>
            <MenuItem component={Link} href="/presence" onClick={() => setProfileAnchorEl(null)}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Presence</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{signingOut ? "Signing out…" : "Sign out"}</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </Box>
    </Box>
  );
}
