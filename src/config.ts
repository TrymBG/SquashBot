// Reads environment variables once at startup. Fails fast with a clear error if one is missing.
// The rest of the code imports `config` from here and never reads process.env directly.


function requireEnv(name: string ): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const config = {
  token: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("CLIENT_ID"),
  guildId: requireEnv("GUILD_ID"),

  
};

 console.log("Config loaded, guild: ", config.guildId);