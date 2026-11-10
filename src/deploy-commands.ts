// Separate script: registers the slash commands with Discord (run after adding/changing a command).
import { REST, Routes } from "discord.js";
import { discordConfig } from "./config.js";
import { commands } from "./commands/index.js";

const config = discordConfig();
const body = commands.map((command) => command.data.toJSON());

const rest = new REST().setToken(config.token);

await rest.put(
  Routes.applicationGuildCommands(config.clientId, config.guildId),
  { body },
);

console.log(`Registered ${body.length} command(s).`);
