// Entry point: creates the Discord client, logs in, and routes slash commands to their handler.
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";
import { initSchema } from "./db.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandsByName.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
  }
});

initSchema();
client.login(config.token);
