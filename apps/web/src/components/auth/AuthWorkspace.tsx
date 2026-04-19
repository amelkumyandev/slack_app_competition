"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { type AuthResponse, type CurrentUserResponse } from "@/lib/api/contracts";
import { ApiClientError, apiRequest } from "@/lib/api/client";

type WorkspaceStatus = "loading" | "ready" | "auth" | "error";
type AuthMode = "login" | "register";

const defaultLoginDraft = {
  emailOrUserName: "",
  password: "",
  rememberMe: true,
};

const defaultRegisterDraft = {
  email: "",
  userName: "",
  password: "",
  rememberMe: true,
};

export function AuthWorkspace() {
  const router = useRouter();
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginDraft, setLoginDraft] = useState(defaultLoginDraft);
  const [registerDraft, setRegisterDraft] = useState(defaultRegisterDraft);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setErrorMessage(null);

    try {
      const me = await apiRequest<CurrentUserResponse>("/api/auth/me");
      setCurrentUser(me);
      setWorkspaceStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        setCurrentUser(null);
        setWorkspaceStatus("auth");
        return;
      }

      setWorkspaceStatus("error");
      setErrorMessage(getErrorMessage(error, "We couldn't load the authentication entry screen."));
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      if (authMode === "login") {
        await apiRequest<AuthResponse>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(loginDraft),
        });

        setNotice("Signed in. Redirecting to the chat workspace.");
      } else {
        await apiRequest<AuthResponse>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(registerDraft),
        });

        setNotice("Account created. Redirecting to the chat workspace.");
      }

      await loadWorkspace();
      router.push("/chat");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Authentication did not complete."));
      setWorkspaceStatus("auth");
    } finally {
      setAuthSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        {notice ? <div className="feedback-banner success-banner">{notice}</div> : null}
        {errorMessage ? <div className="feedback-banner error-banner">{errorMessage}</div> : null}

        {workspaceStatus === "loading" ? (
          <section className="auth-grid">
            <article className="auth-panel panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </article>
            <article className="auth-panel panel-skeleton">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </article>
          </section>
        ) : null}

        {workspaceStatus === "auth" ? (
          <section className="auth-grid">
            <article className="auth-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Access entry</span>
                  <h2>{authMode === "login" ? "Sign in to continue" : "Create your account"}</h2>
                </div>
              </div>

              <p className="panel-copy">
                This is the dedicated frontend auth screen for the shared shell. It uses the same
                cookie-backed backend flows as the sessions and chat workspaces, but now it has a
                first-class route of its own.
              </p>

              <div className="toggle-row" role="tablist" aria-label="Authentication mode">
                <button
                  className={authMode === "login" ? "toggle-button active" : "toggle-button"}
                  onClick={() => setAuthMode("login")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className={authMode === "register" ? "toggle-button active" : "toggle-button"}
                  onClick={() => setAuthMode("register")}
                  type="button"
                >
                  Create account
                </button>
              </div>

              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {authMode === "login" ? (
                  <>
                    <label className="field">
                      <span>Email or username</span>
                      <input
                        autoComplete="username"
                        onChange={(event) =>
                          setLoginDraft((current) => ({
                            ...current,
                            emailOrUserName: event.target.value,
                          }))
                        }
                        required
                        type="text"
                        value={loginDraft.emailOrUserName}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        autoComplete="current-password"
                        onChange={(event) =>
                          setLoginDraft((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        required
                        type="password"
                        value={loginDraft.password}
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        checked={loginDraft.rememberMe}
                        onChange={(event) =>
                          setLoginDraft((current) => ({
                            ...current,
                            rememberMe: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>Keep this browser signed in</span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>Email</span>
                      <input
                        autoComplete="email"
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        required
                        type="email"
                        value={registerDraft.email}
                      />
                    </label>
                    <label className="field">
                      <span>Username</span>
                      <input
                        autoComplete="username"
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            userName: event.target.value,
                          }))
                        }
                        required
                        type="text"
                        value={registerDraft.userName}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        autoComplete="new-password"
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        required
                        type="password"
                        value={registerDraft.password}
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        checked={registerDraft.rememberMe}
                        onChange={(event) =>
                          setRegisterDraft((current) => ({
                            ...current,
                            rememberMe: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>Create a persistent session for this browser</span>
                    </label>
                  </>
                )}

                <button className="primary-button" disabled={authSubmitting} type="submit">
                  {authSubmitting
                    ? authMode === "login"
                      ? "Signing in..."
                      : "Creating account..."
                    : authMode === "login"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
            </article>

            <article className="auth-panel side-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Product shell</span>
                  <h2>What this route unlocks</h2>
                </div>
              </div>

              <ul className="fact-list">
                <li>Chat can redirect to a real sign-in destination instead of piggybacking on sessions.</li>
                <li>Presence and sessions keep explicit signed-out states without duplicating the whole auth flow.</li>
                <li>The app starts feeling like one product with a real entry point rather than separate feature demos.</li>
              </ul>
            </article>
          </section>
        ) : null}

        {workspaceStatus === "ready" ? (
          <section className="auth-grid">
            <article className="auth-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Already signed in</span>
                  <h2>{currentUser?.userName}</h2>
                </div>
              </div>

              <p className="panel-copy">
                This browser already has an active authenticated session. You can go straight into
                the chat workspace, or review the persisted session inventory from the security
                screen.
              </p>

              <div className="presence-empty-actions">
                <Link className="primary-link" href="/chat">
                  Open chat
                </Link>
                <Link className="ghost-link" href="/sessions">
                  Review sessions
                </Link>
              </div>
            </article>
          </section>
        ) : null}

        {workspaceStatus === "error" ? (
          <section className="auth-grid">
            <article className="auth-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Recoverable error</span>
                  <h2>The auth screen needs a retry</h2>
                </div>
              </div>

              <p className="panel-copy">
                The frontend shell keeps sign-in failure states explicit so users have a clear way
                back into the product without refreshing the entire page.
              </p>

              <button className="primary-button" onClick={() => void loadWorkspace()} type="button">
                Retry auth screen
              </button>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.detail ?? error.title ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
