// Entry point: creates the Discord client, logs in, and routes slash commands to their handler.
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";
import { openDatabase } from "./db.js";

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
    // An interaction can only be replied to once. If the command already replied (or deferred), send a follow-up instead.
    const message = { content: "Something went wrong.", flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  }
});

openDatabase(config.databasePath);
client.login(config.token);
