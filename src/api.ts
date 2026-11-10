// Entry point for `npm run api`: runs only the website API, without logging the bot into Discord.
// Handy when working on the website, e.g. `DATABASE_PATH=seed.db npm run api`.
import { databasePath, port } from "./config.js";
import { openDatabase } from "./db.js";
import { buildServer } from "./api/server.js";

openDatabase(databasePath);
const address = await buildServer().listen({ port });
console.log(`API listening on ${address}`);
