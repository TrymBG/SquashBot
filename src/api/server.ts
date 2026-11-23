// Builds the HTTP server: the API, and in production also the built website. Doesn't listen on a port: the caller
// does that, and tests use `inject` instead, which sends a fake request straight to the server.
import { resolve } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { cookieSecure, devLogin, inviteCode, webDistPath } from "../config.js";
import { authRoutes, type AuthOptions } from "./authRoutes.js";
import { devRoutes } from "./devRoutes.js";
import { reportRoutes } from "./reportRoutes.js";
import { apiRoutes } from "./routes.js";
import { tournamentPublicRoutes, tournamentRoutes } from "./tournamentRoutes.js";

export interface ServerOptions {
  inviteCode?: string | null; // null = sign-up closed
  cookieSecure?: boolean;
  webDistPath?: string | null; // folder with the built website, or null to serve only the API (dev: Vite serves it)
  authRateLimit?: AuthOptions["rateLimit"];
  devLogin?: boolean; // dev-only "Log in as…" routes (never in production, see config.ts)
  logger?: boolean; // log errors (default on; tests turn it off to keep the output clean)
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
  // Safe because the app only listens on localhost (index.ts, api.ts), so Caddy is the only one who can reach it.
  // logger level "warn": errors and warnings reach the log (journalctl in production), but not one line per request,
  // so no visitor IP addresses are stored.
  const app = Fastify({ trustProxy: true, logger: (options.logger ?? true) ? { level: "warn" } : false });
  addSecurityHeaders(app, auth.cookieSecure);
  hideInternalErrors(app);
  app.register(fastifyCookie); // parses the Cookie header into request.cookies, adds reply.setCookie
  app.register(fastifyRateLimit, { global: false }); // only routes that ask for it (login, sign-up) are limited
  app.register(apiRoutes);
  app.register(authRoutes, auth);
  app.register(reportRoutes);
  app.register(tournamentPublicRoutes); // viewing: no login
  app.register(tournamentRoutes); // creating and changing: behind requireLogin
  if (options.devLogin ?? devLogin) {
    app.register(devRoutes, { cookieSecure: auth.cookieSecure });
  }
  if (websitePath) {
    serveWebsite(app, resolve(websitePath));
  }
  return app;
}

// How long the browser may keep a file without asking again.
// - Files in assets/ have a hash of their content in the name (index-X2eA.js): a new build gives new names, so the
//   old file never changes. The browser may keep it for a year without asking ("immutable").
// - Everything else (index.html, favicon, robots.txt) keeps its name between builds, so the browser must check with
//   the server every time ("no-cache" means "check first", not "don't store"). That's how a deploy reaches everyone:
//   the fresh index.html points to the new asset names.
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";

function setCacheHeaders(reply: { header(name: string, value: string): unknown }, path: string): void {
  reply.header("Cache-Control", path.includes("/assets/") ? IMMUTABLE : REVALIDATE);
}

// Headers the browser should get on every response (API, pages, files, errors):
// - nosniff: the browser trusts our Content-Type instead of guessing (a guessed "HTML" upload could run as a page).
// - X-Frame-Options DENY: no other site can show ours inside a frame, so it can't trick you into clicking our buttons (clickjacking).
// - Referrer-Policy: other sites we link to only see our domain, not the full page URL.
// - X-Robots-Tag noindex: search engines don't list the site, so friends' names don't end up on Google (also robots.txt).
// - HSTS (production only): the browser uses HTTPS for this site for a year, even if someone types http://.
//   Not on localhost, where it would force HTTPS on every local project.
function addSecurityHeaders(app: FastifyInstance, https: boolean): void {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Robots-Tag", "noindex, nofollow");
    if (https) {
      reply.header("Strict-Transport-Security", "max-age=31536000");
    }
    return payload;
  });
}

// A crash inside a route (a bug, a database error) answers 500 with a plain message, never the internal error text
// (which could contain SQL or file paths). The full error goes to the log instead.
// Errors with a status below 500 keep their answers: a real Error (like a 400 from schema validation) is rethrown to
// Fastify's default handler; a plain object (the rate limit's 429 body from errorResponseBuilder) is sent as it is.
function hideInternalErrors(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) {
      if (error instanceof Error) {
        throw error;
      }
      return reply.code(status).send(error);
    }
    request.log.error(error);
    return reply.code(500).send({ error: "Something went wrong" });
  });
}

// Serves the built React app. Real files (JS, CSS, images) are served as they are. Any other GET that isn't /api
// gets index.html, so a reload on /players/123 works: React Router reads the URL in the browser and shows the page.
function serveWebsite(app: FastifyInstance, root: string): void {
  app.register(fastifyStatic, { root, wildcard: false, setHeaders: setCacheHeaders });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });
}
