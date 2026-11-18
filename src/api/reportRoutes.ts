// Reporting results on the website. Every route here needs a login: the requireLogin hook checks it before
// anything else runs. Thin like routes.ts: check input, call reportService, turn its result into a status code.
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  cancelReport,
  confirmReport,
  listOpponents,
  listReports,
  rejectReport,
  reportResult,
  type ChangeFailure,
} from "../services/reportService.js";
import { loggedInUser, requireLogin } from "./authRoutes.js";

const reportBody = {
  type: "object",
  properties: {
    opponentId: { type: "string", minLength: 1, maxLength: 64 },
    format: { type: "string", enum: ["bo1", "bo3", "bo5", "ft6"] },
    myGames: { type: "integer", minimum: 0, maximum: 99 },
    opponentGames: { type: "integer", minimum: 0, maximum: 99 },
    playedAt: { type: "string", format: "date-time" },
  },
  required: ["opponentId", "format", "myGames", "opponentGames"],
} as const;

const reportParams = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 } },
  required: ["id"],
} as const;

const reportErrors = {
  self: { status: 400, error: "You can't report a match against yourself" },
  "invalid-score": { status: 400, error: "That score isn't possible for this format" },
  "invalid-date": { status: 400, error: "The date must be within the last 30 days and not in the future" },
  "opponent-not-found": { status: 404, error: "Opponent not found" },
} as const;

const changeErrors = {
  "not-found": { status: 404, error: "Report not found" },
  "not-allowed": { status: 403, error: "You can't do that with this report" },
  "not-pending": { status: 409, error: "This report has already been handled" },
} as const;

function sendChangeFailure(reply: FastifyReply, failure: ChangeFailure) {
  const { status, error } = changeErrors[failure.reason];
  return reply.code(status).send({ error });
}

interface ReportBody {
  opponentId: string;
  format: string;
  myGames: number;
  opponentGames: number;
  playedAt?: string;
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // Applies to every route in this plugin only (Fastify plugins are encapsulated), not to the public stats routes.
  app.decorateRequest("user", null);
  app.addHook("onRequest", requireLogin);

  app.get("/api/opponents", async (request) => listOpponents(loggedInUser(request)));

  app.get("/api/reports", async (request) => listReports(loggedInUser(request)));

  app.post<{ Body: ReportBody }>("/api/reports", { schema: { body: reportBody } }, async (request, reply) => {
    const result = reportResult(loggedInUser(request), request.body);
    if (!result.ok) {
      const { status, error } = reportErrors[result.reason];
      return reply.code(status).send({ error });
    }
    return reply.code(201).send({ report: result.report });
  });

  app.post<{ Params: { id: number } }>("/api/reports/:id/confirm", { schema: { params: reportParams } }, async (request, reply) => {
    const result = confirmReport(loggedInUser(request), request.params.id);
    return result.ok ? { matchId: result.matchId } : sendChangeFailure(reply, result);
  });

  app.post<{ Params: { id: number } }>("/api/reports/:id/reject", { schema: { params: reportParams } }, async (request, reply) => {
    const result = rejectReport(loggedInUser(request), request.params.id);
    return result.ok ? { ok: true } : sendChangeFailure(reply, result);
  });

  app.post<{ Params: { id: number } }>("/api/reports/:id/cancel", { schema: { params: reportParams } }, async (request, reply) => {
    const result = cancelReport(loggedInUser(request), request.params.id);
    return result.ok ? { ok: true } : sendChangeFailure(reply, result);
  });
}
