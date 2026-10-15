// /undo: remove the most recent match, after a confirmation button.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { canUndo, getLatestMatch, undoMatch, type MatchRow } from "../services/matchService.js";

export const data = new SlashCommandBuilder()
  .setName("undo")
  .setDescription("Remove the most recent match and restore the ratings");

const CONFIRM_TIMEOUT_MS = 30_000;

export async function execute(interaction: ChatInputCommandInteraction) {
  const match = getLatestMatch();

  if (!match) {
    await interaction.reply({ content: "There are no matches to undo.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!canUndo(match, interaction.user.id)) {
    await interaction.reply({ content: "You are not allowed to undo this match.", flags: MessageFlags.Ephemeral });
    return;
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("undo-confirm").setLabel("Yes, remove it").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("undo-cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );

  // Only the person who ran /undo sees this prompt.
  const prompt = await interaction.reply({
    content: `Remove match #${match.id}: ${describe(match)}?`,
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });

  // Wait for a button click. Throws after the timeout, which we turn into undefined.
  const click = await prompt
    .awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: CONFIRM_TIMEOUT_MS })
    .catch(() => undefined);

  if (!click) {
    await interaction.editReply({ content: "No answer, nothing was removed.", components: [] });
    return;
  }

  if (click.customId === "undo-cancel") {
    await click.update({ content: "Cancelled, nothing was removed.", components: [] });
    return;
  }

  const result = undoMatch(match.id, interaction.user.id);
  if (!result.ok) {
    await click.update({ content: result.reason, components: [] });
    return;
  }

  await click.update({ content: `Match #${match.id} removed.`, components: [] });

  // Public message, so everyone can see what was removed and by whom.
  await interaction.followUp(
    `↩️ ${interaction.user.displayName} removed match #${match.id}: ${describe(match)}. Ratings are restored.`,
  );
}

function describe(match: MatchRow): string {
  return `${match.winnerName} beat ${match.loserName} ${match.winnerGames}-${match.loserGames} (${match.format})`;
}
