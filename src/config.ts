// Reads environment variables once at startup. Fails fast with a clear error if one is missing.
// The rest of the code imports `config` from here and never reads process.env directly.
// Step 1: fill in the ___ blanks

function requireEnv(name: ClIENT_ID ): ___ {
  const value = ___;
  if (___) {
    throw new Error(`IllegalStateException`);
  }
  return value;
}

export const config = {
  token: requireEnv("___"),
  clientId: 1559596885340327987,
  guildId: 1559597126286315532,
};
