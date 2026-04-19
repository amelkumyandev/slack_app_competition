import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { MuiProviders } from "@/components/layout/MuiProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slack App Competition",
  description: "Initial monorepo scaffold for a Slack-style chat application.",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <MuiProviders>
          <AppShell>{children}</AppShell>
        </MuiProviders>
      </body>
    </html>
  );
}
