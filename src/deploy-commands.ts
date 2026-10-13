// Separate script: registers the slash commands with Discord (run after adding/changing a command).
import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import * as ping from "./commands/ping.js";
import * as result from "./commands/result.js";

const commands = [ping.data.toJSON(), result.data.toJSON()];

const rest = new REST().setToken(config.token);

await rest.put(
  Routes.applicationGuildCommands(config.clientId, config.guildId),
  { body: commands },
);

console.log(`Registered ${commands.length} command(s).`);
