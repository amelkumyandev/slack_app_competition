import {
  QaSession,
  acceptIncomingFriendRequest,
  assertStatus,
  createRoom,
  ensure,
  expectReachable,
  getQaConfig,
  joinRoom,
  openDirectConversation,
  postMessage,
  recordHeartbeat,
  registerUser,
  removeRoomMember,
  sendFriendRequest,
  uploadAttachment
} from "../support/qa-client.mjs";

async function main() {
  const { apiBaseUrl, webBaseUrl } = getQaConfig();
  console.log(`Running Docker smoke suite against API ${apiBaseUrl} and web ${webBaseUrl}.`);

  await expectReachable(new URL("/healthz", apiBaseUrl), "API health endpoint");
  await expectReachable(new URL("/", webBaseUrl), "web root");
  await expectReachable(new URL("/auth", webBaseUrl), "auth route");
  await expectReachable(new URL("/chat", webBaseUrl), "chat route");
  await expectReachable(new URL("/sessions", webBaseUrl), "sessions route");
  await expectReachable(new URL("/presence", webBaseUrl), "presence route");

  const ownerSession = new QaSession(apiBaseUrl);
  const memberSession = new QaSession(apiBaseUrl);

  const owner = await registerUser(ownerSession, "smoke-owner");
  const member = await registerUser(memberSession, "smoke-member");

  const currentUser = await ownerSession.getJson("/api/auth/me", "load current user");
  ensure(currentUser.userName === owner.userName, "Current-user payload did not match the registered owner.");

  const sessions = await ownerSession.getJson("/api/sessions", "load sessions");
  ensure(Array.isArray(sessions.sessions) && sessions.sessions.length >= 1, "Expected at least one persisted session.");

  const room = await createRoom(ownerSession, "Smoke Room", "Docker smoke coverage");
  await joinRoom(memberSession, room.id);

  const firstRoomMessage = await postMessage(ownerSession, room.conversationId, "Smoke room hello");
  const replyMessage = await postMessage(
    memberSession,
    room.conversationId,
    "Smoke room reply",
    firstRoomMessage.messageId
  );

  const roomHistory = await ownerSession.getJson(
    `/api/conversations/${room.conversationId}/messages?pageSize=20`,
    "load room history"
  );
  ensure(roomHistory.messages.length === 2, "Expected the smoke room history to contain exactly two messages.");
  ensure(
    roomHistory.messages[1].replyToMessageId === firstRoomMessage.messageId,
    "Expected the second room message to be stored as a reply."
  );

  await sendFriendRequest(ownerSession, member.userName);
  await acceptIncomingFriendRequest(memberSession, owner.userName);

  const directConversation = await openDirectConversation(ownerSession, member.userName);
  await postMessage(ownerSession, directConversation.conversationId, "Smoke direct hello");

  const directHistory = await memberSession.getJson(
    `/api/conversations/${directConversation.conversationId}/messages?pageSize=20`,
    "load direct history"
  );
  ensure(directHistory.messages.length === 1, "Expected one direct message in the smoke direct conversation.");

  const attachmentMessage = await uploadAttachment(
    ownerSession,
    room.conversationId,
    "smoke-note.txt",
    "text/plain",
    Buffer.from("smoke attachment", "utf8"),
    "Smoke upload"
  );

  const attachment = attachmentMessage.attachments?.[0];
  ensure(attachment?.downloadPath, "Expected the uploaded smoke attachment to include a download path.");

  const allowedDownload = await memberSession.request(attachment.downloadPath);
  await assertStatus(allowedDownload, 200, "download smoke attachment before removal");

  await recordHeartbeat(ownerSession, `smoke-tab-${Date.now().toString(36)}`);
  const presenceSnapshot = await ownerSession.getJson("/api/presence/me", "load current presence");
  ensure(presenceSnapshot.presence.state === "online", "Expected smoke heartbeat to keep the owner online.");

  await removeRoomMember(ownerSession, room.id, member.userName, "smoke moderation check");

  const blockedDownload = await memberSession.request(attachment.downloadPath);
  await assertStatus(blockedDownload, 403, "reject attachment download after room removal");

  console.log("Smoke suite passed.");
  console.log(`Owner: ${owner.userName}`);
  console.log(`Member: ${member.userName}`);
  console.log(`Room: ${room.name} (${room.id})`);
  console.log(`Reply watermark: ${replyMessage.createdWatermark}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
