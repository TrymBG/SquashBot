// The read-only website API. Thin like commands/: call a service and return its plain data as JSON. No SQL here.
// Each route declares a schema for its input. Fastify checks it before the handler runs and answers 400 if it doesn't
// match, and it converts query strings like "20" to numbers.
import type { FastifyInstance } from "fastify";
import { getHeadToHead, getLeaderboard, getPlayerMatches, getPlayerProfile } from "../services/statsService.js";

const playerId = { type: "string", minLength: 1, maxLength: 32 } as const;

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
  },
} as const;

const headToHeadParams = {
  type: "object",
  properties: { id: playerId, opponentId: playerId },
  required: ["id", "opponentId"],
} as const;

const notFound = { error: "Player not found" };

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/leaderboard", async () => getLeaderboard());

  app.get<{ Params: { id: string } }>("/api/players/:id", { schema: { params: playerParams } }, async (request, reply) => {
    const profile = getPlayerProfile(request.params.id);
    return profile ?? reply.code(404).send(notFound);
  });

  app.get<{ Params: { id: string }; Querystring: { limit: number; before?: number } }>(
    "/api/players/:id/matches",
    { schema: { params: playerParams, querystring: matchesQuery } },
    async (request, reply) => {
      const page = getPlayerMatches(request.params.id, request.query.limit, request.query.before);
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
