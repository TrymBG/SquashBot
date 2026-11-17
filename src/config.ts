// Reads environment variables. The rest of the code imports from here and never reads process.env directly.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

// Optional values, needed by both the bot and the API.
// `||` (not `??`) so an empty `DATABASE_PATH=` line also falls back to the default.
export const databasePath = process.env.DATABASE_PATH || "squash.db";
export const port = Number(process.env.PORT || 3000);

// The code friends enter to sign up on the website. Unset means sign-up is closed.
export const inviteCode = process.env.INVITE_CODE || null;

// Session cookies are HTTPS-only in production. Local dev runs on plain http, where a `secure` cookie wouldn't be sent.
export const cookieSecure = process.env.NODE_ENV === "production";
if (!Number.isInteger(port)) {
  throw new Error(`PORT must be a whole number, got: ${process.env.PORT}`);
}

// The Discord values, needed only by the bot and deploy-commands. A function instead of a constant,
// so `npm run api` can start without them. Call it once at startup: it fails fast if one is missing.
export function discordConfig() {
  return {
    token: requireEnv("DISCORD_TOKEN"),
    clientId: requireEnv("CLIENT_ID"),
    guildId: requireEnv("GUILD_ID"),
  };
}
