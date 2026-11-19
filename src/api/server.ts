// Builds the HTTP server: the API, and in production also the built website. Doesn't listen on a port: the caller
// does that, and tests use `inject` instead, which sends a fake request straight to the server.
import { resolve } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { cookieSecure, inviteCode, webDistPath } from "../config.js";
import { authRoutes, type AuthOptions } from "./authRoutes.js";
import { reportRoutes } from "./reportRoutes.js";
import { apiRoutes } from "./routes.js";
import { tournamentPublicRoutes, tournamentRoutes } from "./tournamentRoutes.js";

export interface ServerOptions {
  inviteCode?: string | null; // null = sign-up closed
  cookieSecure?: boolean;
  webDistPath?: string | null; // folder with the built website, or null to serve only the API (dev: Vite serves it)
  authRateLimit?: AuthOptions["rateLimit"];
}

// Login attempts (and, separately, sign-up attempts) allowed per IP address in the time window. Slows down password guessing.
const DEFAULT_AUTH_RATE_LIMIT = { max: 10, timeWindowMs: 15 * 60 * 1000 };

// Settings come from config.ts by default; tests pass their own instead of touching process.env.
// `"key" in options` (not `??`), because null is a real value: inviteCode null means sign-up is closed.
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const auth: AuthOptions = {
    inviteCode: "inviteCode" in options ? (options.inviteCode ?? null) : inviteCode,
    cookieSecure: options.cookieSecure ?? cookieSecure,
    rateLimit: options.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT,
  };
  const websitePath = "webDistPath" in options ? (options.webDistPath ?? null) : webDistPath;

  // trustProxy: in production Caddy sits in front and passes the visitor's real IP in X-Forwarded-For.
  // Safe because the app only listens on 127.0.0.1, so Caddy is the only one who can reach it.
  const app = Fastify({ trustProxy: true });
  app.register(fastifyCookie); // parses the Cookie header into request.cookies, adds reply.setCookie
  app.register(fastifyRateLimit, { global: false }); // only routes that ask for it (login, sign-up) are limited
  app.register(apiRoutes);
  app.register(authRoutes, auth);
  app.register(reportRoutes);
  app.register(tournamentPublicRoutes); // viewing: no login
  app.register(tournamentRoutes); // creating and changing: behind requireLogin
  if (websitePath) {
    serveWebsite(app, resolve(websitePath));
  }
  return app;
}

// Serves the built React app. Real files (JS, CSS, images) are served as they are. Any other GET that isn't /api
// gets index.html, so a reload on /players/123 works: React Router reads the URL in the browser and shows the page.
function serveWebsite(app: FastifyInstance, root: string): void {
  app.register(fastifyStatic, { root, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });
}
