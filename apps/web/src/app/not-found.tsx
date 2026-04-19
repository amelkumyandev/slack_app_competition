import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";

export default function NotFound() {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 3,
      }}
    >
      <Stack spacing={2} sx={{ maxWidth: 480, textAlign: "center", alignItems: "center" }}>
        <Typography variant="overline" color="text.secondary">
          404
        </Typography>
        <Typography variant="h2">Page not found</Typography>
        <Typography color="text.secondary">
          The page you were looking for doesn&apos;t exist or has been moved.
        </Typography>
        <Button component={Link} href="/chat" variant="contained">
          Go to chat
        </Button>
      </Stack>
    </Box>
  );
}
