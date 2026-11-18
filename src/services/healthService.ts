// Health check for the deploy script and monitoring: the server answers and the database can be read.
import { checkDatabase } from "../db.js";

export function checkHealth(): { ok: true } {
  checkDatabase(); // throws if the database is broken, which Fastify turns into a 500
  return { ok: true };
}
