// /leaderboard: show current ratings.
import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getLeaderboard } from "../services/statsService.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the current ratings");

const MEDALS = ["🥇", "🥈", "🥉"];

export async function execute(interaction: ChatInputCommandInteraction) {
  const players = getLeaderboard();

  if (players.length === 0) {
    await interaction.reply("No matches yet. Use `/result` to log the first one!");
    return;
  }

  const lines = players.map((player, index) => {
    const position = MEDALS[index] ?? `**${index + 1}.**`;
    return `${position} **${player.displayName}** ${Math.round(player.rating)} (${player.wins}W–${player.losses}L)`;
  });

  const embed = new EmbedBuilder()
    .setTitle("🏆 Leaderboard")
    .setDescription(lines.join("\n"))
    .setColor(0xf1c40f);

  await interaction.reply({ embeds: [embed] });
}
