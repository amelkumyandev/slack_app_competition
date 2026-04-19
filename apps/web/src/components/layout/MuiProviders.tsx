"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/500.css";
import { CssBaseline, ThemeProvider } from "@mui/material";
import type { ReactNode } from "react";
import { appTheme } from "@/lib/theme/appTheme";

type MuiProvidersProps = {
  children: ReactNode;
};

export function MuiProviders({ children }: MuiProvidersProps) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

