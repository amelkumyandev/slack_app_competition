import Link from "next/link";
import {
  ArrowForwardRounded as ArrowForwardRoundedIcon,
  ChatBubbleOutlineRounded as ChatBubbleOutlineRoundedIcon,
  GroupOutlined as GroupOutlinedIcon,
  HubOutlined as HubOutlinedIcon,
} from "@mui/icons-material";
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

const highlights = [
  {
    icon: <ChatBubbleOutlineRoundedIcon fontSize="small" />,
    title: "Simple chat surface",
    detail: "Open a room or direct message and stay focused on history, unread state, and the composer.",
  },
  {
    icon: <HubOutlinedIcon fontSize="small" />,
    title: "REST plus SignalR",
    detail: "Durable history stays on the backend while live updates, reconnect, and sync repair remain visible.",
  },
  {
    icon: <GroupOutlinedIcon fontSize="small" />,
    title: "Room context when needed",
    detail: "Members, moderation, and room controls stay available without crowding the first screen.",
  },
];

export default function Home() {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "calc(100vh - 72px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
      }}
    >
      <Card
        sx={{
          width: "100%",
          maxWidth: 1080,
          borderRadius: 5,
          overflow: "hidden",
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Stack spacing={4}>
            <Box>
              <Chip label="Competition chat workspace" size="small" variant="outlined" />
              <Typography variant="h1" sx={{ mt: 2, maxWidth: 720, fontSize: { xs: "2.15rem", md: "3.25rem" } }}>
                Calm, readable messaging with durable history and live updates.
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 620, fontSize: { xs: "1rem", md: "1.05rem" } }}>
                This workspace keeps the required competition layout while stripping the home experience back to the essentials:
                open a chat, read history, send messages, and manage context only when you need it.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Button component={Link} href="/chat" size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />}>
                Open chat
              </Button>
              <Button component={Link} href="/auth" size="large" variant="outlined">
                Account and sign-in
              </Button>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              {highlights.map((highlight) => (
                <Box
                  key={highlight.title}
                  sx={{
                    flex: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    p: 2.5,
                    bgcolor: alpha("#fff", 0.03),
                  }}
                >
                  <Stack spacing={1.25}>
                    <Box sx={{ color: "primary.light", display: "inline-flex" }}>{highlight.icon}</Box>
                    <Typography variant="h3" sx={{ fontSize: "1rem" }}>
                      {highlight.title}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {highlight.detail}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
