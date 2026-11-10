// Builds the HTTP server for the website. Doesn't listen on a port: the caller does that,
// and tests use `inject` instead, which sends a fake request straight to the server.
import Fastify, { type FastifyInstance } from "fastify";
import { apiRoutes } from "./routes.js";

export function buildServer(): FastifyInstance {
  const app = Fastify();
  app.register(apiRoutes);
  return app;
}
