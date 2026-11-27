// Group endpoints, all behind requireLogin: groups are for members only, so there's no public plugin here.
// Thin like the other route files: check input, call groupService, turn its result into a status code.
// Non-members get 404 for a group (they can't tell whether it exists), non-owners 403 for owner-only actions.
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createGroup,
  deleteGroup,
  getGroup,
  isMember,
  joinGroup,
  leaveGroup,
  listMyGroups,
  MAX_NAME_LENGTH,
  newInviteLink,
  previewInvite,
  removeMember,
  type GroupChangeResult,
} from "../services/groupService.js";
import { getLeaderboard } from "../services/statsService.js";
import { loggedInUser, requireLogin } from "./authRoutes.js";

const idParams = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 } },
  required: ["id"],
} as const;

const memberParams = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 }, playerId: { type: "string", minLength: 1, maxLength: 64 } },
  required: ["id", "playerId"],
} as const;

// Invite codes are 12 base64url characters; the schema rejects anything else before we look it up.
const codeParams = {
  type: "object",
  properties: { code: { type: "string", pattern: "^[A-Za-z0-9_-]{12}$" } },
  required: ["code"],
} as const;

const createBody = {
  type: "object",
  properties: { name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH, pattern: "\\S" } }, // not only spaces
  required: ["name"],
} as const;

const NOT_FOUND = { error: "Group not found" };
const INVITE_NOT_FOUND = { error: "This invite link doesn't work any more. Ask a member for a new one." };

const changeErrors = {
  "not-found": { status: 404, error: NOT_FOUND.error },
  "not-allowed": { status: 403, error: "Only the group's owner can do that" },
  "not-member": { status: 404, error: "That player isn't in the group" },
  "cannot-remove-self": { status: 400, error: "Use Leave group to leave your own group" },
} as const;

function sendChange(reply: FastifyReply, result: GroupChangeResult) {
  if (result.ok) return reply.code(204).send();
  const { status, error } = changeErrors[result.reason];
  return reply.code(status).send({ error });
}

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.decorateRequest("user", null);
  app.addHook("onRequest", requireLogin);

  app.get("/api/groups", async (request) => listMyGroups(loggedInUser(request)));

  app.post<{ Body: { name: string } }>("/api/groups", { schema: { body: createBody } }, async (request, reply) => {
    return reply.code(201).send(createGroup(loggedInUser(request), request.body.name));
  });

  app.get<{ Params: { id: number } }>("/api/groups/:id", { schema: { params: idParams } }, async (request, reply) => {
    return getGroup(loggedInUser(request), request.params.id) ?? reply.code(404).send(NOT_FOUND);
  });

  // The group's ladder: the overall leaderboard filtered to the members, with movement counted within the group.
  app.get<{ Params: { id: number } }>("/api/groups/:id/leaderboard", { schema: { params: idParams } }, async (request, reply) => {
    if (!isMember(loggedInUser(request), request.params.id)) {
      return reply.code(404).send(NOT_FOUND);
    }
    return getLeaderboard(new Date(), request.params.id);
  });

  app.post<{ Params: { id: number } }>("/api/groups/:id/invite", { schema: { params: idParams } }, async (request, reply) => {
    const result = newInviteLink(loggedInUser(request), request.params.id);
    if (result.ok) return { inviteCode: result.inviteCode };
    const { status, error } = changeErrors[result.reason];
    return reply.code(status).send({ error });
  });

  app.delete<{ Params: { id: number; playerId: string } }>(
    "/api/groups/:id/members/:playerId",
    { schema: { params: memberParams } },
    async (request, reply) => sendChange(reply, removeMember(loggedInUser(request), request.params.id, request.params.playerId)),
  );

  app.post<{ Params: { id: number } }>("/api/groups/:id/leave", { schema: { params: idParams } }, async (request, reply) =>
    sendChange(reply, leaveGroup(loggedInUser(request), request.params.id)),
  );

  app.delete<{ Params: { id: number } }>("/api/groups/:id", { schema: { params: idParams } }, async (request, reply) =>
    sendChange(reply, deleteGroup(loggedInUser(request), request.params.id)),
  );

  // The join page: which group the link belongs to.
  app.get<{ Params: { code: string } }>("/api/invites/:code", { schema: { params: codeParams } }, async (request, reply) => {
    return previewInvite(request.params.code) ?? reply.code(404).send(INVITE_NOT_FOUND);
  });

  app.post<{ Params: { code: string } }>("/api/invites/:code/join", { schema: { params: codeParams } }, async (request, reply) => {
    const result = joinGroup(loggedInUser(request), request.params.code);
    return result.ok ? { groupId: result.groupId } : reply.code(404).send(INVITE_NOT_FOUND);
  });
}
