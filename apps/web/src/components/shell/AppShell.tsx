"use client";

import Link from "next/link";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";

type AppShellProps = {
  children: React.ReactNode;
};

const navigationItems = [
  {
    href: "/",
    label: "Overview",
    kicker: "Home",
  },
  {
    href: "/auth",
    label: "Auth",
    kicker: "Entry",
  },
  {
    href: "/chat",
    label: "Chat",
    kicker: "Messaging",
  },
  {
    href: "/sessions",
    label: "Sessions",
    kicker: "Security",
  },
  {
    href: "/presence",
    label: "Presence",
    kicker: "Realtime",
  },
] as const;

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent">
        <Toolbar sx={{ gap: 2, minHeight: 72 }}>
          <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: "center" }}>
            <Avatar
              variant="rounded"
              sx={{
                bgcolor: "rgba(127, 63, 152, 0.22)",
                color: "secondary.light",
                width: 40,
                height: 40,
                fontWeight: 800,
              }}
            >
              SC
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">
                Slack App Competition
              </Typography>
              <Typography variant="subtitle1" noWrap>
                Modern classic chat shell
              </Typography>
            </Box>
          </Stack>

          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={{
              display: "flex",
              gap: 1,
              minWidth: 0,
              overflowX: "auto",
              flex: 1,
              px: { xs: 0, md: 1 },
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
            {navigationItems.map((item) => {
              const isActive =
                item.href === "/" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Button
                  component={Link}
                  href={item.href}
                  key={item.href}
                  color={isActive ? "secondary" : "inherit"}
                  variant={isActive ? "contained" : "text"}
                  sx={{
                    whiteSpace: "nowrap",
                    color: isActive ? "common.white" : "text.secondary",
                    backgroundColor: isActive ? "rgba(127, 63, 152, 0.26)" : "transparent",
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Tooltip title="Realtime stays additive: REST remains the source of truth.">
              <Chip label="REST + SignalR" size="small" variant="outlined" />
            </Tooltip>
            <Chip label="Dark UX refactor" size="small" color="primary" />
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
        {children}
      </Container>
    </Box>
  );
}
