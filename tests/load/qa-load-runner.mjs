import * as signalR from "@microsoft/signalr";
import {
  QaSession,
  createRoom,
  ensure,
  getQaConfig,
  joinRoom,
  postMessage,
  registerUser
} from "../support/qa-client.mjs";

const scenario = process.argv[2];

async function runHistoryScenario() {
  const { apiBaseUrl } = getQaConfig();
  const messageCount = Number.parseInt(process.env.QA_HISTORY_MESSAGE_COUNT ?? "100000", 10);
  const repairWindow = Number.parseInt(process.env.QA_HISTORY_REPAIR_WINDOW ?? "25", 10);
  const pageSize = Number.parseInt(process.env.QA_HISTORY_PAGE_SIZE ?? "50", 10);

  ensure(messageCount > repairWindow, "QA_HISTORY_MESSAGE_COUNT must be larger than QA_HISTORY_REPAIR_WINDOW.");

  const ownerSession = new QaSession(apiBaseUrl);
  const dormantSession = new QaSession(apiBaseUrl);

  const owner = await registerUser(ownerSession, "history-owner");
  const dormant = await registerUser(dormantSession, "history-dormant");

  const room = await createRoom(ownerSession, "History Load Room", "Large history QA scenario");
  await joinRoom(dormantSession, room.id);

  const initialSync = await dormantSession.getJson(
    `/api/conversations/${room.conversationId}/sync?afterWatermark=0`,
    "capture initial sync watermark"
  );

  let repairAnchorWatermark = initialSync.latestWatermark;

  for (let index = 1; index <= messageCount; index += 1) {
    const message = await postMessage(ownerSession, room.conversationId, `History seed ${index.toString().padStart(6, "0")}`);

    if (index === messageCount - repairWindow) {
      repairAnchorWatermark = message.createdWatermark;
    }

    if (index % 1000 === 0 || index === messageCount) {
      console.log(`Seeded ${index}/${messageCount} messages into ${room.name}.`);
    }
  }

  const latestWindow = await dormantSession.getJson(
    `/api/conversations/${room.conversationId}/messages?pageSize=${pageSize}`,
    "load latest history window"
  );

  ensure(latestWindow.messages.length === pageSize, `Expected the latest history window to contain ${pageSize} messages.`);
  ensure(Boolean(latestWindow.nextCursor), "Expected the latest history window to expose a paging cursor.");

  const repairPayload = await dormantSession.getJson(
    `/api/conversations/${room.conversationId}/sync?afterWatermark=${repairAnchorWatermark}`,
    "repair the recent watermark window"
  );

  ensure(
    repairPayload.missingMessages.length === repairWindow,
    `Expected ${repairWindow} repair messages, received ${repairPayload.missingMessages.length}.`
  );

  console.log("History scenario passed.");
  console.log(`Owner: ${owner.userName}`);
  console.log(`Dormant user: ${dormant.userName}`);
  console.log(`Room: ${room.name}`);
  console.log(`Latest watermark: ${repairPayload.latestWatermark}`);
}

class FanoutConnection {
  constructor(connection, userName) {
    this.connection = connection;
    this.userName = userName;
    this.watermarks = [];
  }

  mark(envelope) {
    if (envelope?.watermark) {
      this.watermarks.push(envelope.watermark);
    }
  }

  async waitForWatermark(expectedWatermark, timeoutMs) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (this.watermarks.some((watermark) => watermark >= expectedWatermark)) {
        return Date.now() - startedAt;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`${this.userName} did not receive watermark ${expectedWatermark} within ${timeoutMs}ms.`);
  }
}

async function runFanoutScenario() {
  const { apiBaseUrl } = getQaConfig();
  const userCount = Number.parseInt(process.env.QA_FANOUT_USER_COUNT ?? "120", 10);
  const messageCount = Number.parseInt(process.env.QA_FANOUT_MESSAGE_COUNT ?? "3", 10);
  const timeoutMs = Number.parseInt(process.env.QA_FANOUT_TIMEOUT_MS ?? "20000", 10);

  const ownerSession = new QaSession(apiBaseUrl);
  await registerUser(ownerSession, "fanout-owner");

  const room = await createRoom(ownerSession, "Fanout Room", "Realtime fan-out QA scenario");
  const participants = [];

  for (let index = 1; index <= userCount; index += 1) {
    const memberSession = new QaSession(apiBaseUrl);
    const member = await registerUser(memberSession, `fanout-${index}`);
    await joinRoom(memberSession, room.id);
    participants.push({ member, session: memberSession });

    if (index % 25 === 0 || index === userCount) {
      console.log(`Prepared ${index}/${userCount} fan-out users.`);
    }
  }

  const connections = [];

  try {
    for (const participant of participants) {
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(new URL("/hubs/realtime", apiBaseUrl).toString(), {
          headers: {
            Cookie: participant.session.cookieHeader
          },
          transport: signalR.HttpTransportType.LongPolling,
          withCredentials: false
        })
        .withAutomaticReconnect()
        .build();

      const tracker = new FanoutConnection(connection, participant.member.userName);
      connection.on("event.received", (envelope) => tracker.mark(envelope));

      await connection.start();
      await connection.invoke("SubscribeConversation", room.conversationId);
      connections.push(tracker);
    }

    let worstLatencyMs = 0;

    for (let index = 1; index <= messageCount; index += 1) {
      const message = await postMessage(ownerSession, room.conversationId, `Fanout message ${index}`);
      const latencies = await Promise.all(
        connections.map((tracker) => tracker.waitForWatermark(message.createdWatermark, timeoutMs))
      );

      const roundWorstLatency = Math.max(...latencies);
      worstLatencyMs = Math.max(worstLatencyMs, roundWorstLatency);
      console.log(`Delivered watermark ${message.createdWatermark} to ${connections.length} clients in ${roundWorstLatency}ms.`);
    }

    console.log("Fan-out scenario passed.");
    console.log(`Connected users: ${connections.length}`);
    console.log(`Worst-case observed latency: ${worstLatencyMs}ms`);
  } finally {
    await Promise.all(
      connections.map(async (tracker) => {
        await tracker.connection.stop();
      })
    );
  }
}

if (scenario === "history") {
  await runHistoryScenario().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else if (scenario === "fanout") {
  await runFanoutScenario().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else {
  console.error("Usage: node tests/load/qa-load-runner.mjs <history|fanout>");
  process.exitCode = 1;
}
