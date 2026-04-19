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
  ["F07", "Realtime SignalR foundation"],
] as const;

export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Scaffold Ready</span>
              <h1>Slack-style chat, grounded in a modular monolith.</h1>
              <p>
                This branch lays down the repo structure for a Next.js frontend,
                an ASP.NET Core API, shared backend modules, and the test lanes
                we will fill in branch by branch.
              </p>
              <div className="badge">Next stop: Docker Compose bootstrap</div>
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
          The UI here is only a placeholder landing page. The Slack-like shell,
          chat views, admin flows, and reconnect states are intentionally deferred
          to later branches in the implementation backlog.
        </section>
      </div>
    </main>
  );
}
