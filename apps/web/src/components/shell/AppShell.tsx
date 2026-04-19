"use client";

import { usePathname } from "next/navigation";
import { AuthShell } from "@/components/shell/AuthShell";
import { ChatShell } from "@/components/shell/ChatShell";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/auth")) {
    return <AuthShell>{children}</AuthShell>;
  }

  return <ChatShell>{children}</ChatShell>;
}
