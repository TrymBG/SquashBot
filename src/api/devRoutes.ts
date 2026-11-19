// Dev-only "Log in as…": switch between test accounts without passwords, for testing tournaments with many players.
// Only registered when config.devLogin is on (DEV_LOGIN=1 and not production); otherwise these routes don't exist (404).
import type { FastifyInstance } from "fastify";
import { devLoginAs, listAccounts } from "../services/authService.js";
import { setSessionCookie } from "./authRoutes.js";

const loginAsBody = {
  type: "object",
  properties: { playerId: { type: "string", minLength: 1, maxLength: 64 } },
  required: ["playerId"],
} as const;

export async function devRoutes(app: FastifyInstance, options: { cookieSecure: boolean }): Promise<void> {
  app.get("/api/dev/users", async () =>
    listAccounts().map((user) => ({ playerId: user.playerId, displayName: user.displayName })),
  );

  app.post<{ Body: { playerId: string } }>("/api/dev/login-as", { schema: { body: loginAsBody } }, async (request, reply) => {
    const result = devLoginAs(request.body.playerId);
    if (!result) {
      return reply.code(404).send({ error: "No account for that player" });
    }
    setSessionCookie(reply, result.sessionToken, options.cookieSecure);
    return { user: result.user };
  });
}
