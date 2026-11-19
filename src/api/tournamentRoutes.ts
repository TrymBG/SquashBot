// Tournament endpoints. Two plugins, because the requireLogin hook applies to a whole plugin:
// viewing is public (like the other stats), creating and changing a tournament needs a login.
// Thin like routes.ts: check input, call tournamentService, turn its result into a status code.
import type { FastifyInstance, FastifyReply } from "fastify";
import { MATCH_FORMATS } from "../formats.js";
import {
  addPlayer,
  createTournament,
  getTournamentDetails,
  listTournaments,
  removePlayer,
  startTournament,
  type ChangeResult,
} from "../services/tournamentService.js";
import { loggedInUser, requireLogin } from "./authRoutes.js";

const idParams = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 } },
  required: ["id"],
} as const;

const playerParams = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 }, playerId: { type: "string", minLength: 1, maxLength: 64 } },
  required: ["id", "playerId"],
} as const;

const createBody = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 60, pattern: "\\S" }, // at least one non-space character
    matchFormat: { type: "string", enum: [...MATCH_FORMATS] },
    type: { type: "string", enum: ["round_robin", "knockout"] }, // default round robin
    ranking: { type: "string", enum: ["wins", "points"] }, // round robin only, default wins
    thirdPlace: { type: "boolean" }, // knockout only, default false
  },
  required: ["name", "matchFormat"],
} as const;

const addPlayerBody = {
  type: "object",
  properties: { playerId: { type: "string", minLength: 1, maxLength: 64 } },
  required: ["playerId"],
} as const;

const createErrors = {
  "invalid-format": { status: 400, error: "Unknown match format" },
  "points-need-rally-format": { status: 400, error: "Ranking by points needs a fixed-rally format (11, 15 or 21 rallies)" },
} as const;

const changeErrors = {
  "not-found": { status: 404, error: "Tournament not found" },
  "not-allowed": { status: 403, error: "Only the organizer can do that" },
  "not-draft": { status: 409, error: "The tournament has already started" },
  "player-not-found": { status: 404, error: "Player not found (they need a web account)" },
  "already-in": { status: 409, error: "That player is already in the tournament" },
  "not-in": { status: 404, error: "That player isn't in the tournament" },
  full: { status: 409, error: "The tournament is full" },
  "too-few-players": { status: 409, error: "Not enough players yet (round robin: 3, knockout: 4)" },
} as const;

function sendChange(reply: FastifyReply, result: ChangeResult) {
  if (result.ok) return { ok: true };
  const { status, error } = changeErrors[result.reason];
  return reply.code(status).send({ error });
}

export async function tournamentPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/tournaments", async () => listTournaments());

  app.get<{ Params: { id: number } }>("/api/tournaments/:id", { schema: { params: idParams } }, async (request, reply) => {
    return getTournamentDetails(request.params.id) ?? reply.code(404).send({ error: changeErrors["not-found"].error });
  });
}

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.decorateRequest("user", null);
  app.addHook("onRequest", requireLogin);

  app.post<{
    Body: { name: string; matchFormat: string; type?: "round_robin" | "knockout"; ranking?: "wins" | "points"; thirdPlace?: boolean };
  }>(
    "/api/tournaments",
    { schema: { body: createBody } },
    async (request, reply) => {
      const result = createTournament(loggedInUser(request), request.body);
      if (!result.ok) {
        const { status, error } = createErrors[result.reason];
        return reply.code(status).send({ error });
      }
      return reply.code(201).send({ tournament: result.tournament });
    },
  );

  app.post<{ Params: { id: number }; Body: { playerId: string } }>(
    "/api/tournaments/:id/players",
    { schema: { params: idParams, body: addPlayerBody } },
    async (request, reply) => sendChange(reply, addPlayer(loggedInUser(request), request.params.id, request.body.playerId)),
  );

  app.delete<{ Params: { id: number; playerId: string } }>(
    "/api/tournaments/:id/players/:playerId",
    { schema: { params: playerParams } },
    async (request, reply) => sendChange(reply, removePlayer(loggedInUser(request), request.params.id, request.params.playerId)),
  );

  app.post<{ Params: { id: number } }>("/api/tournaments/:id/start", { schema: { params: idParams } }, async (request, reply) =>
    sendChange(reply, startTournament(loggedInUser(request), request.params.id)),
  );
}
