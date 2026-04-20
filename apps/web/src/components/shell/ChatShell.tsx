"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AccountCircleOutlined as AccountCircleOutlinedIcon,
  ChatBubbleOutlined as ChatBubbleOutlineIcon,
  Forum as ForumIcon,
  HomeOutlined as HomeOutlinedIcon,
  Logout as LogoutIcon,
  Search as SearchIcon,
  SensorsOutlined as SensorsOutlinedIcon,
  TabletMacOutlined as TabletMacOutlinedIcon,
} from "@mui/icons-material";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { CurrentUserResponse, MessageResponse } from "@/lib/api/contracts";

type ChatShellProps = {
  children: React.ReactNode;
};

const navigationItems = [
  { href: "/", label: "Home", icon: <HomeOutlinedIcon fontSize="small" /> },
  { href: "/chat", label: "Chat", icon: <ChatBubbleOutlineIcon fontSize="small" /> },
  { href: "/sessions", label: "Sessions", icon: <TabletMacOutlinedIcon fontSize="small" /> },
  { href: "/presence", label: "Presence", icon: <SensorsOutlinedIcon fontSize="small" /> },
];

export function ChatShell({ children }: ChatShellProps) {
  const router = useRouter();
  const pathname = usePathname();
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

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await apiRequest<MessageResponse>("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Redirect to sign-in even if the current session is already invalid.
    } finally {
      setSigningOut(false);
      setProfileAnchorEl(null);
      router.push("/auth/sign-in");
    }
  }

  const initials = (currentUser?.userName ?? "?").slice(0, 1).toUpperCase();
  const activeLabel = useMemo(
    () => navigationItems.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))?.label ?? "Chat",
    [pathname],
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" color="transparent">
        <Toolbar sx={{ gap: 2, minHeight: 72, px: { xs: 1.5, md: 2.5 } }}>
          <Stack
            component={Link}
            href="/chat"
            direction="row"
            spacing={1.25}
            sx={{
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
              minWidth: "fit-content",
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2.5,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(160deg, rgba(104,124,255,0.95), rgba(77,178,255,0.95))",
                color: "common.white",
                boxShadow: `0 10px 24px ${alpha("#587dff", 0.26)}`,
              }}
            >
              <ForumIcon fontSize="small" />
            </Box>
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
              <Typography variant="h3" sx={{ fontSize: "1rem" }}>
                DataArt Chat
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {activeLabel}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <TextField
              aria-label="Search"
              placeholder="Search"
              size="small"
              value=""
              sx={{
                width: "100%",
                maxWidth: 420,
                display: { xs: "none", md: "flex" },
              }}
              slotProps={{
                input: {
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          <Stack direction="row" spacing={0.75} sx={{ display: { xs: "none", lg: "flex" }, alignItems: "center" }}>
            {navigationItems.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  startIcon={item.icon}
                  variant={active ? "contained" : "text"}
                  color={active ? "primary" : "inherit"}
                  sx={{
                    minWidth: "fit-content",
                    px: 1.5,
                    color: active ? "common.white" : "text.secondary",
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Stack>

          <IconButton
            aria-label="Open account menu"
            onClick={(event) => setProfileAnchorEl(event.currentTarget)}
            sx={{
              ml: { xs: 0, md: 1 },
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              px: 0.75,
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Avatar
                sx={{
                  width: 30,
                  height: 30,
                  bgcolor: alpha("#587dff", 0.18),
                  color: "primary.light",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                }}
              >
                {initials}
              </Avatar>
              <Box sx={{ display: { xs: "none", sm: "block" }, textAlign: "left" }}>
                <Typography variant="body2" sx={{ lineHeight: 1.1, fontWeight: 700 }}>
                  {currentUser?.userName ?? "Account"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {currentUser?.email ?? "Loading account"}
                </Typography>
              </Box>
            </Stack>
          </IconButton>

          <Menu
            anchorEl={profileAnchorEl}
            open={Boolean(profileAnchorEl)}
            onClose={() => setProfileAnchorEl(null)}
            slotProps={{
              paper: { sx: { mt: 1, minWidth: 240 } },
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle1">{currentUser?.userName ?? "Loading..."}</Typography>
              <Typography variant="caption" color="text.secondary">
                {currentUser?.email ?? ""}
              </Typography>
            </Box>
            <Divider />
            <MenuItem component={Link} href="/auth">
              <ListItemIcon>
                <AccountCircleOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>View account</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{signingOut ? "Signing out..." : "Sign out"}</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</Box>
    </Box>
  );
}
