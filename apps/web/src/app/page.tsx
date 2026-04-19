import Link from "next/link";

const backendModules = [
  ["Identity", "Account lifecycle, login, password flows"],
  ["Sessions", "Per-browser sessions and selective revocation"],
  ["Presence", "Heartbeat aggregation and tab-aware status"],
  ["Contacts", "Friendship, bans, and PM authorization"],
  ["Rooms", "Room lifecycle, moderation, membership"],
  ["Messaging", "History, replies, edits, deletes, sync"],
  ["Attachments", "Uploads, secure downloads, cleanup"],
  ["Notifications", "Unread counters and summaries"],
  ["Administration", "Moderation tooling and audit surfaces"],
  ["XmppBridge", "Optional phase 2 federation boundary"],
] as const;

const scaffoldingMilestones = [
  ["F01", "Monorepo scaffold and starter apps"],
  ["F02", "Docker Compose bootstrap"],
  ["F03", "Auth and account core"],
  ["F04", "Session management screen"],
  ["F13", "Slack-like shell and dedicated auth screens"],
] as const;

export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Scaffold Ready</span>
              <h1>Slack-style chat, now framed as one cohesive product shell.</h1>
              <p>
                The monorepo now has a dedicated auth entry route, shared app
                chrome around every core screen, and the earlier feature slices
                gathered into a single frontend shell instead of isolated demo
                pages.
              </p>
              <div className="hero-actions">
                <Link className="primary-link" href="/auth">
                  Open auth
                </Link>
                <Link className="primary-link" href="/chat">
                  Open chat workspace
                </Link>
                <Link className="secondary-button" href="/sessions">
                  Open sessions workspace
                </Link>
                <Link className="secondary-button" href="/presence">
                  Open presence workspace
                </Link>
                <div className="badge">Current slice: shared Slack-like shell and auth entry screens</div>
              </div>
            </div>

            <div className="callouts">
              <article className="callout">
                <span className="callout-label">Realtime Contract</span>
                <strong>REST for persistence, SignalR for live fan-out</strong>
              </article>
              <article className="callout">
                <span className="callout-label">Durability</span>
                <strong>PostgreSQL for history, Redis for presence</strong>
              </article>
              <article className="callout">
                <span className="callout-label">History Model</span>
                <strong>Conversation watermarks with gap repair</strong>
              </article>
            </div>
          </div>
        </section>

        <section className="grid">
          <article className="panel">
            <h2>Backend module lanes</h2>
            <p>
              The folder structure mirrors the solution blueprint so feature work
              can land without reshaping the repo later.
            </p>
            <div className="stack">
              {backendModules.map(([moduleName, description]) => (
                <div className="item" key={moduleName}>
                  <strong>{moduleName}</strong>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <h2>Immediate milestones</h2>
            <p>
              The first branches focus on making the monorepo runnable before any
              business logic is introduced.
            </p>
            <div className="stack">
              {scaffoldingMilestones.map(([featureId, description]) => (
                <div className="item" key={featureId}>
                  <strong>{featureId}</strong>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="footer-note">
          The shell is now in place. Later branches can focus on room management,
          admin modals, and QA hardening without first stitching the product
          routes together.
        </section>
      </div>
    </main>
  );
}
