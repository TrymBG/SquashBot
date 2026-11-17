// Builds the HTTP server for the website. Doesn't listen on a port: the caller does that,
// and tests use `inject` instead, which sends a fake request straight to the server.
import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { cookieSecure, inviteCode } from "../config.js";
import { authRoutes, type AuthOptions } from "./authRoutes.js";
import { apiRoutes } from "./routes.js";

// Settings come from config.ts by default; tests pass their own (e.g. an invite code) instead of touching process.env.
export function buildServer(auth: AuthOptions = { inviteCode, cookieSecure }): FastifyInstance {
  const app = Fastify();
  app.register(fastifyCookie); // parses the Cookie header into request.cookies, adds reply.setCookie
  app.register(apiRoutes);
  app.register(authRoutes, auth);
  return app;
}
