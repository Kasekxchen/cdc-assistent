const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const CONFIG = require("../config");
const { getGermanDateTime } = require("../utils/dates");
const { hasLeaderPermission } = require("../utils/permissions");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// CC FAMILIENPANEL
// =====================================================

// Die Kennung wird vom Kampftraining-System verarbeitet.
const COMBAT_BUTTON_ID = "leader_create_combat";

// =====================================================
// SLASH COMMAND
// =====================================================

const familyPanelCommand = new SlashCommandBuilder()
  .setName("familienpanel")
  .setDescription("Sendet das CC-Familienpanel.");

// =====================================================
// FAMILIENPANEL DESIGN
// =====================================================

function createFamilyPanelEmbed() {
  return new EmbedBuilder()
    .setColor(CONFIG.embedColor)
    .setTitle("👥 • CC FAMILIENPANEL")
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "Verwaltung für **Cartel del Caido**.",
        "",
        "📋 Abmeldungen",
        "🎯 Kampftraining",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .setFooter({
      text:
        `${CONFIG.shortName} • Familienpanel • ${getGermanDateTime()}`,
    });
}

// =====================================================
// FAMILIENPANEL BUTTONS
// =====================================================

function createFamilyPanelButtons() {
  return new ActionRowBuilder().addComponents(

    // ABMELDUNG
    new ButtonBuilder()
      .setCustomId("family_absence")
      .setLabel("Abmeldung")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Primary),

    // KAMPFTRAINING
    new ButtonBuilder()
      .setCustomId(COMBAT_BUTTON_ID)
      .setLabel("Kampftraining")
      .setEmoji("🎯")
      .setStyle(ButtonStyle.Secondary)

  );
}

// =====================================================
// FAMILIENPANEL VERÖFFENTLICHEN
// =====================================================

async function sendFamilyPanel(client, interaction) {

  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content:
        "❌ Nur die Leaderschaft darf das Familienpanel veröffentlichen.",
      ephemeral: true,
    });
  }

  const channelId = CONFIG.familyPanelChannelId;

  if (!channelId) {
    return safeReply(interaction, {
      content:
        "❌ Der Familienpanel-Kanal fehlt in der config.js.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const message = await sendToChannel(
    client,
    channelId,
    {
      embeds: [
        createFamilyPanelEmbed(),
      ],
      components: [
        createFamilyPanelButtons(),
      ],
    }
  );

  return interaction.editReply(
    message
      ? `✅ CC-Familienpanel in <#${channelId}> veröffentlicht.`
      : "❌ Familienpanel konnte nicht gesendet werden. Bitte Bot-Rechte prüfen."
  );
}

// =====================================================
// INTERACTION HANDLER
// =====================================================

async function handleFamilyPanelInteraction(
  client,
  interaction
) {

  if (
    !interaction.isChatInputCommand() ||
    interaction.commandName !== "familienpanel"
  ) {
    return false;
  }

  await sendFamilyPanel(
    client,
    interaction
  );

  return true;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  familyPanelCommand,
  createFamilyPanelEmbed,
  createFamilyPanelButtons,
  handleFamilyPanelInteraction,
};