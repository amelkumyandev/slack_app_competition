import { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress size={28} />
        </Box>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}
