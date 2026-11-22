// The read-only website API. Thin like commands/: call a service and return its plain data as JSON. No SQL here.
// Each route declares a schema for its input. Fastify checks it before the handler runs and answers 400 if it doesn't
// match, and it converts query strings like "20" to numbers.
import type { FastifyInstance } from "fastify";
import { MATCH_FORMATS } from "../formats.js";
import { checkHealth } from "../services/healthService.js";
import { getHeadToHead, getLeaderboard, getPlayerMatches, getPlayerProfile, getRecentMatches } from "../services/statsService.js";

// Discord ids (up to 20 digits) or web players' UUIDs (36 characters).
const playerId = { type: "string", minLength: 1, maxLength: 64 } as const;

const playerParams = {
  type: "object",
  properties: { id: playerId },
  required: ["id"],
} as const;

const matchesQuery = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    before: { type: "integer", minimum: 1 },
    opponent: playerId, // filter: only matches against this player
    format: { type: "string", enum: [...MATCH_FORMATS] }, // filter: only this format
  },
} as const;

const feedQuery = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    before: { type: "integer", minimum: 1 },
  },
} as const;

const headToHeadParams = {
  type: "object",
  properties: { id: playerId, opponentId: playerId },
  required: ["id", "opponentId"],
} as const;

const notFound = { error: "Player not found" };

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => checkHealth());

  app.get("/api/leaderboard", async () => getLeaderboard());

  // The front page's activity feed: everyone's matches, newest first, paged with ?before.
  app.get<{ Querystring: { limit: number; before?: number } }>(
    "/api/matches",
    { schema: { querystring: feedQuery } },
    async (request) => getRecentMatches({ limit: request.query.limit, before: request.query.before }),
  );

  app.get<{ Params: { id: string } }>("/api/players/:id", { schema: { params: playerParams } }, async (request, reply) => {
    const profile = getPlayerProfile(request.params.id);
    return profile ?? reply.code(404).send(notFound);
  });

  app.get<{ Params: { id: string }; Querystring: { limit: number; before?: number; opponent?: string; format?: string } }>(
    "/api/players/:id/matches",
    { schema: { params: playerParams, querystring: matchesQuery } },
    async (request, reply) => {
      const { limit, before, opponent, format } = request.query;
      const page = getPlayerMatches(request.params.id, { limit, before, opponentId: opponent, format });
      return page ?? reply.code(404).send(notFound);
    },
  );

  app.get<{ Params: { id: string; opponentId: string } }>(
    "/api/h2h/:id/:opponentId",
    { schema: { params: headToHeadParams } },
    async (request, reply) => {
      const { id, opponentId } = request.params;
      if (id === opponentId) {
        return reply.code(400).send({ error: "Pick two different players" });
      }
      return getHeadToHead(id, opponentId) ?? reply.code(404).send(notFound);
    },
  );
}
