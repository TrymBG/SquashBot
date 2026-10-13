// Entry point: creates the Discord client, logs in, and routes slash commands to their handler.
// Step 1

// Entry point: creates the Discord client, logs in, and routes slash commands to their handler.
import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.login(config.token);

