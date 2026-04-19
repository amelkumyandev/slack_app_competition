"use client";

import Link from "next/link";
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

const routeMeta: Record<string, { title: string; description: string; stage: string; highlights: string[] }> = {
  "/": {
    title: "Competition Workspace",
    description: "A single-product shell for the modular monolith, with the core frontend routes gathered into one Slack-inspired frame.",
    stage: "Frontend shell",
    highlights: [
      "One app frame across chat, sessions, presence, and auth.",
      "Keeps architecture status visible while feature slices keep landing.",
      "Sets up the visual baseline for later admin and polish work.",
    ],
  },
  "/auth": {
    title: "Authentication Entry",
    description: "Dedicated sign-in and create-account screens that feed the same session-backed backend flows used elsewhere in the app.",
    stage: "Account access",
    highlights: [
      "Sign in or create an account without detouring through the sessions screen.",
      "Leans on the existing cookie-backed auth and persistent session model.",
      "Routes signed-in users back into the product shell quickly.",
    ],
  },
  "/chat": {
    title: "Messaging Workspace",
    description: "Unread-aware room and direct navigation, durable history, attachment sharing, and realtime gap repair in one central panel.",
    stage: "Core chat",
    highlights: [
      "Unread badges clear as the active conversation read watermark advances.",
      "Replies, edits, deletes, and attachments stay in the durable history flow.",
      "Realtime gaps still fall back to REST sync repair.",
    ],
  },
  "/sessions": {
    title: "Session Control",
    description: "Browser session inventory, selective revoke, and a cleaner security-focused screen inside the shared shell.",
    stage: "Account security",
    highlights: [
      "Current-session sign-out stays separate from targeted revoke.",
      "Great for validating the persisted user_sessions model.",
      "Signed-out users now flow through the dedicated auth route.",
    ],
  },
  "/presence": {
    title: "Presence Diagnostics",
    description: "Heartbeat-driven presence, tab aggregation, and reconnect visibility framed as a first-class app screen instead of a standalone demo.",
    stage: "Realtime health",
    highlights: [
      "Multi-tab online, AFK, and offline inference remains explicit.",
      "Manual heartbeat and reconnect states stay visible.",
      "Keeps presence behavior close to the main product navigation.",
    ],
  },
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const meta = routeMeta[pathname] ?? routeMeta["/"];

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="eyebrow">Slack App Competition</span>
          <h1>Classic chat, one monorepo, one product shell.</h1>
          <p>
            Frontend F13 turns the earlier route demos into a cohesive app surface without changing
            the backend guardrails underneath them.
          </p>
        </div>

        <nav className="app-nav" aria-label="Primary navigation">
          {navigationItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link className={isActive ? "app-nav-item active" : "app-nav-item"} href={item.href} key={item.href}>
                <span>{item.kicker}</span>
                <strong>{item.label}</strong>
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar-card">
          <span className="panel-kicker">Stable commands</span>
          <ul className="app-inline-list">
            <li>`docker compose up --build`</li>
            <li>`dotnet test`</li>
            <li>`npm run build`</li>
          </ul>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div>
            <span className="eyebrow">{meta.stage}</span>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>

          <div className="app-topbar-actions">
            <Link className="ghost-link" href="/chat">
              Open chat
            </Link>
            <Link className="ghost-link" href="/auth">
              Open auth
            </Link>
          </div>
        </header>

        <div className="app-content">{children}</div>
      </div>

      <aside className="app-rail">
        <div className="app-rail-card">
          <span className="panel-kicker">Current focus</span>
          <h2>{meta.title}</h2>
          <ul className="fact-list">
            {meta.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </div>

        <div className="app-rail-card">
          <span className="panel-kicker">Guardrails</span>
          <ul className="fact-list">
            <li>REST remains the command surface, while SignalR handles live fan-out.</li>
            <li>Unread, presence, and access control stay server-authoritative.</li>
            <li>Docker-first startup remains the trunk contract for QA.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
