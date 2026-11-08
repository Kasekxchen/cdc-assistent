
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const CONFIG = require("../config");

const {
  cleanName,
  getReadableUserName,
} = require("../utils/format");

const {
  getGermanDateTime,
} = require("../utils/dates");

const {
  hasLeaderPermission,
} = require("../utils/permissions");

const {
  sendToChannel,
  safeReply,
} = require("../utils/discord");

// =====================================================
// BUTTON-IDS
// =====================================================

const REGISTER_BUTTON_ID = "cc_register_button";
const REGISTER_MODAL_ID = "cc_register_modal";

// Kompatibilität mit älteren Panels
const LEGACY_BUTTON_ID = "smv_register_button";
const LEGACY_MODAL_ID = "smv_register_modal";

// =====================================================
// SLASH COMMAND
// =====================================================

const registrationPanelCommand = new SlashCommandBuilder()
  .setName("registrierungspanel")
  .setDescription("Sendet das CC-Registrierungspanel.");

// =====================================================
// ROLLEN NACH REGISTRIERUNG
// =====================================================

async function addRegisteredRoles(member) {
  const addedRoles = [];
  const failedRoles = [];

  const roleIds = [
    ...new Set(CONFIG.registeredRoleIds || []),
  ];

  for (const roleId of roleIds) {
    try {
      const role = await member.guild.roles
        .fetch(roleId)
        .catch(() => null);

      if (!role) {
        failedRoles.push(roleId);

        console.error(
          `❌ CC-Registrierung: Rolle nicht gefunden (${roleId}).`
        );

        continue;
      }

      if (member.roles.cache.has(roleId)) {
        addedRoles.push(role.name);
        continue;
      }

      await member.roles.add(
        role,
        "CC Registrierung"
      );

      addedRoles.push(role.name);
    } catch (error) {
      failedRoles.push(roleId);

      console.error(
        `❌ CC-Registrierung: Rolle ${roleId} konnte nicht vergeben werden:`,
        error
      );
    }
  }

  return {
    addedRoles,
    failedRoles,
  };
}

// =====================================================
// REGISTRIERUNGSPANEL
// =====================================================

function createRegisterPanelEmbed() {
  return new EmbedBuilder()
    .setColor(CONFIG.embedColor)
    .setTitle("👤 • REGISTRIERUNGSPANEL")
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "¡Bienvenido a la familia **Cartel del Caido**!",
        "",
        "📝 **Registrierung**",
        "└ Drücke unten auf den Button und trage deinen **Vor- und Nachnamen** ein.",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .setFooter({
      text: `${CONFIG.shortName} • Registrierung • ${getGermanDateTime()}`,
    });
}

// =====================================================
// REGISTRIERUNGSBUTTON
// =====================================================

function createRegisterButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(REGISTER_BUTTON_ID)
      .setLabel("Registrieren")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary)
  );
}

// =====================================================
// REGISTRIERUNGSFORMULAR
// =====================================================

function createRegisterModal() {
  const modal = new ModalBuilder()
    .setCustomId(REGISTER_MODAL_ID)
    .setTitle("CC Registrierung");

  const firstNameInput = new TextInputBuilder()
    .setCustomId("first_name")
    .setLabel("Vorname")
    .setPlaceholder("z. B. Max")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(20)
    .setRequired(true);

  const lastNameInput = new TextInputBuilder()
    .setCustomId("last_name")
    .setLabel("Nachname")
    .setPlaceholder("z. B. Mustermann")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(25)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(firstNameInput),
    new ActionRowBuilder().addComponents(lastNameInput)
  );

  return modal;
}

// =====================================================
// REGISTRIERUNGSPANEL SENDEN
// =====================================================

async function sendRegistrationPanel(client, interaction) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content:
        "❌ Nur die Leaderschaft darf das Registrierungspanel veröffentlichen.",
      ephemeral: true,
    });
  }

  const message = await sendToChannel(
    client,
    CONFIG.registrationChannelId,
    {
      embeds: [
        createRegisterPanelEmbed(),
      ],
      components: [
        createRegisterButtonRow(),
      ],
    }
  );

  if (!message) {
    return safeReply(interaction, {
      content:
        "❌ Das Registrierungspanel konnte nicht gesendet werden. Prüfe Kanal-ID und Bot-Rechte.",
      ephemeral: true,
    });
  }

  return safeReply(interaction, {
    content:
      `✅ Registrierungspanel wurde in <#${CONFIG.registrationChannelId}> veröffentlicht.`,
    ephemeral: true,
  });
}

// =====================================================
// REGISTRIERUNG ABSCHICKEN
// =====================================================

async function submitRegistration(interaction) {
  const firstName = cleanName(
    interaction.fields.getTextInputValue("first_name")
  );

  const lastName = cleanName(
    interaction.fields.getTextInputValue("last_name")
  );

  if (!firstName || !lastName) {
    return safeReply(interaction, {
      content:
        "❌ Bitte gib einen gültigen Vor- und Nachnamen ein.",
      ephemeral: true,
    });
  }

  const fullName = `${firstName} ${lastName}`;

  // Beispiel: CC I Max Mustermann
  const nickname = `${CONFIG.nicknamePrefix} ${fullName}`;

  // Discord erlaubt maximal 32 Zeichen.
  if (nickname.length > 32) {
    return safeReply(interaction, {
      content:
        `❌ Der Nickname wäre zu lang (${nickname.length}/32 Zeichen). ` +
        "Bitte kürze deinen Vor- oder Nachnamen.",
      ephemeral: true,
    });
  }

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);

  if (!member) {
    return safeReply(interaction, {
      content:
        "❌ Dein Serverprofil konnte nicht geladen werden. Bitte versuche es erneut.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  // ===================================================
  // NICKNAME SETZEN
  // ===================================================

  let nicknameChanged = false;
  let nicknameError = null;

  try {
    await member.setNickname(
      nickname,
      "CC Registrierung"
    );

    nicknameChanged = true;
  } catch (error) {
    nicknameError = error;

    console.error(
      "❌ CC-Registrierung: Nickname konnte nicht gesetzt werden:",
      error
    );
  }

  // ===================================================
  // ROLLEN VERGEBEN
  // ===================================================

  const {
    addedRoles,
    failedRoles,
  } = await addRegisteredRoles(member);

  // ===================================================
  // ERGEBNIS
  // ===================================================

  const result = [
    nicknameChanged && failedRoles.length === 0
      ? "✅ **Registrierung erfolgreich!**"
      : "⚠️ **Registrierung teilweise abgeschlossen.**",

    "",
    `👤 **Name:** ${fullName}`,

    `🏷️ **Nickname:** ${
      nicknameChanged
        ? nickname
        : "Konnte nicht gesetzt werden"
    }`,

    "",

    addedRoles.length
      ? `✅ **Rollen erhalten:** ${addedRoles.join(", ")}`
      : "⚠️ **Rollen erhalten:** Keine",

    failedRoles.length
      ? `❌ **Rollen nicht vergeben:** ${
          failedRoles
            .map((id) => `\`${id}\``)
            .join(", ")
        }`
      : null,

    nicknameError
      ? "⚠️ Der Bot benötigt die Berechtigung **Nicknames verwalten** und muss in der Rollenliste über dem Mitglied stehen."
      : null,

    failedRoles.length
      ? "⚠️ Prüfe, ob der Bot **Rollen verwalten** darf und seine Rolle über beiden Registrierungsrollen steht."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return interaction.editReply({
    content: result,
  });
}

// =====================================================
// WILLKOMMENSNACHRICHT
// =====================================================

async function sendWelcomeMessage(client, member) {
  const name = getReadableUserName(
    member,
    member.user
  );

  await sendToChannel(
    client,
    CONFIG.welcomeChannelId,
    {
      embeds: [
        new EmbedBuilder()
          .setColor(CONFIG.successColor)
          .setTitle("👋 Willkommen bei Cartel del Caido")
          .setDescription(
            [
              "━━━━━━━━━━━━━━━━━━━━",
              "",
              `Willkommen bei **${CONFIG.familyName}**, **${name}**.`,
              "",
              `Bitte registriere dich in <#${CONFIG.registrationChannelId}>.`,
              "",
              "━━━━━━━━━━━━━━━━━━━━",
            ].join("\n")
          )
          .setFooter({
            text:
              `${CONFIG.shortName} • Willkommen • ${getGermanDateTime()}`,
          }),
      ],
      allowedMentions: {
        parse: [],
      },
    }
  );
}

// =====================================================
// BLOODOUT / VERLASSEN
// =====================================================

async function sendLeaveMessage(client, member) {
  const name = getReadableUserName(
    member,
    member.user
  );

  await sendToChannel(
    client,
    CONFIG.leaveChannelId,
    {
      embeds: [
        new EmbedBuilder()
          .setColor(CONFIG.dangerColor)
          .setTitle("🚪 Mitglied verlassen")
          .setDescription(
            [
              "━━━━━━━━━━━━━━━━━━━━",
              "",
              `**${name}** hat den Server verlassen.`,
              "",
              "━━━━━━━━━━━━━━━━━━━━",
            ].join("\n")
          )
          .setFooter({
            text:
              `${CONFIG.shortName} • Bloodout • ${getGermanDateTime()}`,
          }),
      ],
      allowedMentions: {
        parse: [],
      },
    }
  );
}

// =====================================================
// SLASH COMMAND HANDLER
// =====================================================

async function handleRegistrationCommand(
  client,
  interaction
) {
  if (!interaction.isChatInputCommand()) {
    return false;
  }

  if (
    interaction.commandName !==
    "registrierungspanel"
  ) {
    return false;
  }

  await sendRegistrationPanel(
    client,
    interaction
  );

  return true;
}

// =====================================================
// REGISTRIERUNGSBUTTON HANDLER
// =====================================================

async function handleRegistrationButton(
  client,
  interaction
) {
  if (!interaction.isButton()) {
    return false;
  }

  if (
    ![
      REGISTER_BUTTON_ID,
      LEGACY_BUTTON_ID,
    ].includes(interaction.customId)
  ) {
    return false;
  }

  await interaction.showModal(
    createRegisterModal()
  );

  return true;
}

// =====================================================
// REGISTRIERUNGSFORMULAR HANDLER
// =====================================================

async function handleRegistrationModal(
  client,
  interaction
) {
  if (!interaction.isModalSubmit()) {
    return false;
  }

  if (
    ![
      REGISTER_MODAL_ID,
      LEGACY_MODAL_ID,
    ].includes(interaction.customId)
  ) {
    return false;
  }

  await submitRegistration(interaction);

  return true;
}

// =====================================================
// HAUPT-HANDLER
// =====================================================

async function handleRegistrationInteraction(
  client,
  interaction
) {
  if (
    await handleRegistrationCommand(
      client,
      interaction
    )
  ) {
    return true;
  }

  if (
    await handleRegistrationButton(
      client,
      interaction
    )
  ) {
    return true;
  }

  if (
    await handleRegistrationModal(
      client,
      interaction
    )
  ) {
    return true;
  }

  return false;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  registrationPanelCommand,
  createRegisterPanelEmbed,
  createRegisterButtonRow,
  handleRegistrationInteraction,
  sendWelcomeMessage,
  sendLeaveMessage,
};
