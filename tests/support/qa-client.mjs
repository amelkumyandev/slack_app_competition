const defaultApiBaseUrl = process.env.QA_API_BASE_URL ?? "http://localhost:8080";
const defaultWebBaseUrl = process.env.QA_WEB_BASE_URL ?? "http://localhost:3000";
const defaultPassword = process.env.QA_DEFAULT_PASSWORD ?? "Password123";

export function getQaConfig() {
  return {
    apiBaseUrl: new URL(defaultApiBaseUrl),
    webBaseUrl: new URL(defaultWebBaseUrl),
    defaultPassword
  };
}

export function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function assertStatus(response, expectedStatus, context) {
  if (response.status === expectedStatus) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `${context} failed with ${response.status} ${response.statusText}. Response body: ${body || "<empty>"}`
  );
}

export function createUniqueHandle(prefix) {
  const normalizedPrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);

  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${normalizedPrefix}-${entropy}`.slice(0, 30);
}

export class QaSession {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.cookies = new Map();
  }

  get cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(path, options = {}) {
    const url = new URL(path, this.apiBaseUrl);
    const headers = new Headers(options.headers ?? {});

    if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.cookies.size > 0 && !headers.has("Cookie")) {
      headers.set("Cookie", this.cookieHeader);
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined || options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body)
    });

    this.captureCookies(response);
    return response;
  }

  async getJson(path, context) {
    const response = await this.request(path);
    await assertStatus(response, 200, context);
    return response.json();
  }

  async postJson(path, body, expectedStatus, context) {
    const response = await this.request(path, {
      method: "POST",
      body
    });

    await assertStatus(response, expectedStatus, context);
    return response.json();
  }

  async delete(path, expectedStatus, context) {
    const response = await this.request(path, {
      method: "DELETE"
    });

    await assertStatus(response, expectedStatus, context);
    return response;
  }

  captureCookies(response) {
    const setCookieHeaders =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    for (const header of setCookieHeaders) {
      const [cookiePair] = header.split(";", 1);
      const separatorIndex = cookiePair.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const name = cookiePair.slice(0, separatorIndex);
      const value = cookiePair.slice(separatorIndex + 1);
      this.cookies.set(name, value);
    }
  }
}

export async function expectReachable(url, context) {
  const response = await fetch(url);
  await assertStatus(response, 200, context);
}

export async function registerUser(session, prefix) {
  const userName = createUniqueHandle(prefix);
  const email = `${userName}@example.com`;
  const { defaultPassword: password } = getQaConfig();

  const payload = await session.postJson(
    "/api/auth/register",
    {
      email,
      userName,
      password,
      acceptTerms: false
    },
    201,
    `register ${userName}`
  );

  return {
    email,
    password,
    payload,
    userName
  };
}

export async function sendFriendRequest(requesterSession, targetUserName) {
  return requesterSession.postJson(
    "/api/contacts/friend-requests",
    {
      targetUserName
    },
    201,
    `send friend request to ${targetUserName}`
  );
}

export async function acceptIncomingFriendRequest(session, targetUserName) {
  const contacts = await session.getJson("/api/contacts", `load contacts for ${targetUserName}`);
  const incomingRequest = contacts.incomingFriendRequests.find(
    (candidate) => candidate.userName === targetUserName
  );

  ensure(incomingRequest, `No incoming friend request found from ${targetUserName}.`);

  const response = await session.request(`/api/contacts/friend-requests/${incomingRequest.id}/accept`, {
    method: "POST"
  });

  await assertStatus(response, 200, `accept friend request from ${targetUserName}`);
}

export async function createRoom(session, name, description, isPrivate = false) {
  return session.postJson(
    "/api/rooms",
    {
      name,
      description,
      isPrivate
    },
    201,
    `create room ${name}`
  );
}

export async function joinRoom(session, roomId) {
  const response = await session.request(`/api/rooms/${roomId}/join`, {
    method: "POST"
  });

  await assertStatus(response, 200, `join room ${roomId}`);
}

export async function postMessage(session, conversationId, text, replyToMessageId = null) {
  return session.postJson(
    `/api/conversations/${conversationId}/messages`,
    {
      text,
      replyToMessageId
    },
    201,
    `post message to conversation ${conversationId}`
  );
}

export async function openDirectConversation(session, targetUserName) {
  return session.postJson(
    "/api/conversations/direct",
    {
      targetUserName
    },
    201,
    `open direct conversation with ${targetUserName}`
  );
}

export async function uploadAttachment(session, conversationId, fileName, contentType, fileContents, comment = null) {
  const form = new FormData();
  form.set("file", new Blob([fileContents], { type: contentType }), fileName);

  if (comment) {
    form.set("comment", comment);
  }

  const response = await session.request(`/api/conversations/${conversationId}/attachments`, {
    method: "POST",
    body: form
  });

  await assertStatus(response, 201, `upload attachment ${fileName}`);
  return response.json();
}

export async function recordHeartbeat(session, tabId) {
  return session.postJson(
    "/api/presence/heartbeat",
    {
      tabId,
      lastInteractionAtUtc: new Date().toISOString(),
      visibilityState: "visible",
      connectedAtUtc: new Date().toISOString()
    },
    200,
    `record heartbeat for ${tabId}`
  );
}

export async function removeRoomMember(session, roomId, targetUserName, reason) {
  const response = await session.request(`/api/rooms/${roomId}/members/remove`, {
    method: "POST",
    body: {
      targetUserName,
      reason
    }
  });

  await assertStatus(response, 200, `remove ${targetUserName} from room ${roomId}`);
}
