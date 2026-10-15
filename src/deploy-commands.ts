// Separate script: registers the slash commands with Discord (run after adding/changing a command).
import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";

const body = commands.map((command) => command.data.toJSON());

const rest = new REST().setToken(config.token);

await rest.put(
  Routes.applicationGuildCommands(config.clientId, config.guildId),
  { body },
);

console.log(`Registered ${body.length} command(s).`);
