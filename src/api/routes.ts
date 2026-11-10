// The read-only website API. Thin like commands/: call a service and return its plain data as JSON. No SQL here.
import type { FastifyInstance } from "fastify";
import { getLeaderboard } from "../services/statsService.js";

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/leaderboard", async () => getLeaderboard());
}
