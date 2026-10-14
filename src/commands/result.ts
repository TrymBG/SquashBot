// /result: log a match against an opponent with a score.
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { isValidScore } from "../validation.js";

export const data = new SlashCommandBuilder()
  .setName("result")
  .setDescription("Log a squash match")
  .addUserOption((option) =>
    option
      .setName("opponent")
      .setDescription("Who you played against")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("format")
      .setDescription("Match format")
      .setRequired(true)
      .addChoices(
        { name: "Best of 1", value: "bo1" },
        { name: "Best of 3", value: "bo3" },
        { name: "Best of 5", value: "bo5" },
        { name: "First to 6 (win by 2)", value: "ft6" },
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName("my_games")
      .setDescription("Games you won")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(30),
  )
  .addIntegerOption((option) =>
    option
      .setName("their_games")
      .setDescription("Games your opponent won")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(30),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const reporter = interaction.user;
  const opponent = interaction.options.getUser("opponent", true);
  const format = interaction.options.getString("format", true);
  const myGames = interaction.options.getInteger("my_games", true);
  const theirGames = interaction.options.getInteger("their_games", true);

  if (opponent.id === reporter.id) {
    await interaction.reply({ content: "You can't play against yourself.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isValidScore(format, myGames, theirGames)) {
    await interaction.reply({
      content: `${myGames}-${theirGames} is not a valid score for ${format}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply(
    `${reporter.username} vs ${opponent.username} (${format}): ${myGames}-${theirGames}`,
  );
}
