// /ping: replies "pong". Proves the bot works.
// Step 1

import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("check the bot is alive");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply("pong");
}
