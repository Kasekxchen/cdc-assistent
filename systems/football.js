const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require("discord.js");

const CONFIG = require("../config");

const { loadData, saveData } = require("../utils/dataStore");
const { getGermanDateTime, unixTimestamp } = require("../utils/dates");
const { createShortId, getReadableUserName } = require("../utils/format");
const { hasFootballCreatorPermission } = require("../utils/permissions");
const { sendToChannel, safeReply } = require("../utils/discord");

// Zwischenspeicher: Wer gerade ein Fußball-Event erstellt
const footballDrafts = new Map();

// =====================================================
// RECHTE
// =====================================================

function hasFootballManagePermission(member) {
  if (!member || !member.roles || !member.roles.cache) return false;

  const allowedRoleIds = CONFIG.footballManageRoleIds || [];

  return allowedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

// =====================================================
// HELI-AUSWAHL / MODAL
// =====================================================

function createFootballHeliSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("football_heli_select")
      .setPlaceholder("Mit Heli oder ohne Heli?")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        {
          label: "Mit Heli",
          value: "mit_heli",
          emoji: "🚁",
          description: "Fußball-Event mit Heli",
        },
        {
          label: "Ohne Heli",
          value: "ohne_heli",
          emoji: "🚫",
          description: "Fußball-Event ohne Heli",
        }
      )
  );
}

function createFootballEventModal() {
  const modal = new ModalBuilder()
    .setCustomId("football_event_modal")
    .setTitle("⚽ Fußball-Event erstellen");

  const opponentInput = new TextInputBuilder()
    .setCustomId("football_opponent")
    .setLabel("Gegner / Familie")
    .setPlaceholder("z. B. La Matadores")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(60)
    .setRequired(true);

  const dateInput = new TextInputBuilder()
    .setCustomId("football_date")
    .setLabel("Datum")
    .setPlaceholder("z. B. Heute, Morgen oder 16.07.2026")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(30)
    .setRequired(true);

  const timeInput = new TextInputBuilder()
    .setCustomId("football_time")
    .setLabel("Uhrzeit")
    .setPlaceholder("z. B. 20:30 Uhr")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(30)
    .setRequired(true);

  const placeInput = new TextInputBuilder()
    .setCustomId("football_place")
    .setLabel("Ort / Treffpunkt")
    .setPlaceholder("z. B. Anwesen / Fußballplatz")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(80)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId("football_note")
    .setLabel("Hinweis / Beschreibung")
    .setPlaceholder("z. B. Bitte pünktlich erscheinen")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(opponentInput),
    new ActionRowBuilder().addComponents(dateInput),
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(placeInput),
    new ActionRowBuilder().addComponents(noteInput)
  );

  return modal;
}

function createFootballTimeModal(eventId) {
  const modal = new ModalBuilder()
    .setCustomId(`football_time_modal_${eventId}`)
    .setTitle("🕘 Fußball-Uhrzeit ändern");

  const timeInput = new TextInputBuilder()
    .setCustomId("football_new_time")
    .setLabel("Neue Uhrzeit")
    .setPlaceholder("z. B. 21:00 Uhr")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(30)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(timeInput));

  return modal;
}

function normalizeFootballTimeText(input) {
  const value = String(input || "").trim();
  if (!value) return "20:30 Uhr";
  if (/uhr/i.test(value)) return value;
  return `${value} Uhr`;
}

// =====================================================
// EVENT-DATEN
// =====================================================

function createFootballEventRecord({
  creatorId,
  opponent,
  dateText,
  timeText,
  placeText,
  note,
  heliMode,
}) {
  return {
    id: createShortId(),
    creatorId,
    opponent,
    dateText,
    timeText,
    placeText,
    note,
    heliMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageId: null,

    cancelled: false,
    cancelledBy: null,
    cancelledAt: null,

    reopenedBy: null,
    reopenedAt: null,

    lastTimeChangeBy: null,
    lastTimeChangeAt: null,

    users: {},
  };
}

function getFootballHeliText(event) {
  if (event.heliMode === "mit_heli") return "Mit Heli";
  if (event.heliMode === "ohne_heli") return "Ohne Heli";
  return "Nicht angegeben";
}

function getFootballStatusText(event) {
  if (event.cancelled) return "Abgesagt";
  return "Offen";
}

function getFootballUsersByStatus(event, status) {
  return Object.entries(event.users || {})
    .filter(([, userData]) => userData.status === status)
    .map(([userId, userData]) => ({
      userId,
      name: userData.name || `<@${userId}>`,
      sortAt: userData.statusChangedAt || userData.joinedAt || userData.updatedAt || "",
    }))
    .sort((a, b) => String(a.sortAt).localeCompare(String(b.sortAt)));
}

function formatFootballUserList(users) {
  if (!users || users.length === 0) return "—";

  const lines = users.map((user, index) => {
    const isLast = index === users.length - 1;
    return `${isLast ? "┖" : "┃"} ${user.name}`;
  });

  const result = lines.join("\n");

  if (result.length <= 1000) return result;

  const safeLines = [];
  let currentLength = 0;

  for (const line of lines) {
    const nextLength = currentLength + line.length + (safeLines.length > 0 ? 1 : 0);
    if (nextLength > 960) break;

    safeLines.push(line);
    currentLength = nextLength;
  }

  const remaining = users.length - safeLines.length;

  if (remaining > 0) {
    if (safeLines.length > 0) {
      safeLines[safeLines.length - 1] = safeLines[safeLines.length - 1].replace(/^┃/, "┖");
    }

    safeLines.push(`┖ ... und ${remaining} weitere`);
  }

  return safeLines.join("\n").slice(0, 1000);
}

// =====================================================
// EMBED / BUTTONS
// =====================================================

function createFootballEventEmbed(event) {
  const presentUsers = getFootballUsersByStatus(event, "present");
  const absentUsers = getFootballUsersByStatus(event, "absent");
  const unsureUsers = getFootballUsersByStatus(event, "unsure");

  const statusText = getFootballStatusText(event);

  return new EmbedBuilder()
    .setColor(event.cancelled ? CONFIG.dangerColor : CONFIG.embedColor)
    .setTitle(event.cancelled ? "🛑 • CC FUSSBALL ABGESAGT" : "⚽ • CC FUSSBALL")
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        `⚔️ **Gegner:** ${event.opponent}`,
        `📅 **Datum:** ${event.dateText}`,
        `🕘 **Uhrzeit:** ${event.timeText}`,
        `📍 **Ort:** ${event.placeText}`,
        `🚁 **Heli:** ${getFootballHeliText(event)}`,
        `📌 **Status:** ${statusText}`,
        "",
        event.note ? `📝 **Hinweis:**\n${event.note}` : "📝 **Hinweis:**\n—",
        "",
        event.cancelled
          ? `🛑 **Abgesagt von:** <@${event.cancelledBy}>`
          : null,
        event.cancelledAt
          ? `🕘 **Abgesagt am:** <t:${unixTimestamp(event.cancelledAt)}:F>`
          : null,
        event.lastTimeChangeBy
          ? `🕘 **Uhrzeit zuletzt geändert von:** <@${event.lastTimeChangeBy}>`
          : null,
        event.lastTimeChangeAt
          ? `🕘 **Geändert am:** <t:${unixTimestamp(event.lastTimeChangeAt)}:F>`
          : null,
        "━━━━━━━━━━━━━━━━━━━━",
      ].filter(Boolean).join("\n")
    )
    .addFields(
      {
        name: `✅ Dabei (${presentUsers.length})`,
        value: formatFootballUserList(presentUsers),
        inline: true,
      },
      {
        name: `❌ Nicht dabei (${absentUsers.length})`,
        value: formatFootballUserList(absentUsers),
        inline: true,
      },
      {
        name: `⏳ Ungewiss (${unsureUsers.length})`,
        value: formatFootballUserList(unsureUsers),
        inline: false,
      }
    )
    .setFooter({
      text: `${CONFIG.shortName} • Fußball-ID: ${event.id}`,
    });
}

function createFootballEventButtons(event) {
  const presentUsers = getFootballUsersByStatus(event, "present");
  const absentUsers = getFootballUsersByStatus(event, "absent");
  const unsureUsers = getFootballUsersByStatus(event, "unsure");

  const participationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`football_present_${event.id}`)
      .setLabel(`${presentUsers.length}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(event.cancelled)),

    new ButtonBuilder()
      .setCustomId(`football_absent_${event.id}`)
      .setLabel(`${absentUsers.length}`)
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(event.cancelled)),

    new ButtonBuilder()
      .setCustomId(`football_unsure_${event.id}`)
      .setLabel(`${unsureUsers.length}`)
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(event.cancelled))
  );

  const managementRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`football_cancel_${event.id}`)
      .setLabel("Fußball absagen")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(event.cancelled)),

    new ButtonBuilder()
      .setCustomId(`football_reopen_${event.id}`)
      .setLabel("Fußball wieder öffnen")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!event.cancelled),

    new ButtonBuilder()
      .setCustomId(`football_time_${event.id}`)
      .setLabel("Uhrzeit ändern")
      .setEmoji("🕘")
      .setStyle(ButtonStyle.Secondary)
  );

  return [participationRow, managementRow];
}

// =====================================================
// ANKÜNDIGUNGEN
// =====================================================

async function announceFootballCancelled(client, event, leaderId) {
  await sendToChannel(client, CONFIG.footballEventChannelId, {
    content: [
      `<@&${CONFIG.familyMemberRoleId}>`,
      "",
      "🛑 **CC FUSSBALL ABGESAGT**",
      "",
      "Das Fußball-Event wurde abgesagt.",
      "",
      `⚔️ **Gegner:** ${event.opponent}`,
      `📅 **Datum:** ${event.dateText}`,
      `🕘 **Uhrzeit:** ${event.timeText}`,
      `👑 **Abgesagt von:** <@${leaderId}>`,
    ].join("\n"),
    allowedMentions: {
      roles: [CONFIG.familyMemberRoleId],
      users: [leaderId],
    },
  });
}

async function announceFootballReopened(client, event, leaderId) {
  await sendToChannel(client, CONFIG.footballEventChannelId, {
    content: [
      `<@&${CONFIG.familyMemberRoleId}>`,
      "",
      "🔓 **CC FUSSBALL WIEDER GEÖFFNET**",
      "",
      "Das Fußball-Event wurde wieder geöffnet.",
      "",
      `⚔️ **Gegner:** ${event.opponent}`,
      `📅 **Datum:** ${event.dateText}`,
      `🕘 **Uhrzeit:** ${event.timeText}`,
      `👑 **Geöffnet von:** <@${leaderId}>`,
      "",
      "Ihr könnt euch wieder anmelden.",
    ].join("\n"),
    allowedMentions: {
      roles: [CONFIG.familyMemberRoleId],
      users: [leaderId],
    },
  });
}

async function announceFootballTimeChanged(client, event, oldTime, newTime, leaderId) {
  await sendToChannel(client, CONFIG.footballEventChannelId, {
    content: [
      `<@&${CONFIG.familyMemberRoleId}>`,
      "",
      "🕘 **FUSSBALL-UHRZEIT GEÄNDERT**",
      "",
      "Die Uhrzeit für das Fußball-Event wurde geändert.",
      "",
      `⚔️ **Gegner:** ${event.opponent}`,
      `📅 **Datum:** ${event.dateText}`,
      `🕘 **Alte Uhrzeit:** ${oldTime}`,
      `🕘 **Neue Uhrzeit:** ${newTime}`,
      `👑 **Geändert von:** <@${leaderId}>`,
      `🕘 **Zeitpunkt:** ${getGermanDateTime()}`,
      "",
      "Bitte beachtet die neue Uhrzeit.",
    ].join("\n"),
    allowedMentions: {
      roles: [CONFIG.familyMemberRoleId],
      users: [leaderId],
    },
  });
}

// =====================================================
// EVENT POSTEN / AKTUALISIEREN
// =====================================================

async function updateFootballEventMessage(client, event) {
  if (!event.messageId) return null;

  const channel = await client.channels.fetch(CONFIG.footballEventChannelId).catch(() => null);
  if (!channel || !channel.messages) return null;

  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  if (!message) return null;

  await message.edit({
    embeds: [createFootballEventEmbed(event)],
    components: createFootballEventButtons(event),
  }).catch(() => null);

  return message;
}

async function postFootballEvent(client, interaction, event) {
  const message = await sendToChannel(client, CONFIG.footballEventChannelId, {
    content: `<@&${CONFIG.familyMemberRoleId}>`,
    embeds: [createFootballEventEmbed(event)],
    components: createFootballEventButtons(event),
    allowedMentions: { roles: [CONFIG.familyMemberRoleId] },
  });

  if (!message) {
    return safeReply(interaction, {
      content: "❌ Fußball-Event konnte nicht gesendet werden. Bitte prüfe Channel-ID und Bot-Rechte.",
      ephemeral: true,
    });
  }

  event.messageId = message.id;

  const data = loadData();
  if (!data.footballEvents) data.footballEvents = {};
  data.footballEvents[event.id] = event;
  saveData(data);

  return safeReply(interaction, {
    content: `✅ Fußball-Event wurde in <#${CONFIG.footballEventChannelId}> erstellt.`,
    ephemeral: true,
  });
}

// =====================================================
// INTERACTIONS
// =====================================================

async function handleFootballFamilyButton(client, interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== "family_football") return false;

  if (!hasFootballCreatorPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Fußball-Events zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  footballDrafts.set(interaction.user.id, {
    creatorId: interaction.user.id,
    heliMode: null,
    createdAt: Date.now(),
  });

  await safeReply(interaction, {
    content: "⚽ Wähle aus, ob das Fußball-Event mit Heli oder ohne Heli ist.",
    components: [createFootballHeliSelect()],
    ephemeral: true,
  });

  return true;
}

async function handleFootballHeliSelect(client, interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== "football_heli_select") return false;

  if (!hasFootballCreatorPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Fußball-Events zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const heliMode = interaction.values?.[0];

  if (!["mit_heli", "ohne_heli"].includes(heliMode)) {
    await safeReply(interaction, {
      content: "❌ Ungültige Heli-Auswahl.",
      ephemeral: true,
    });
    return true;
  }

  footballDrafts.set(interaction.user.id, {
    creatorId: interaction.user.id,
    heliMode,
    createdAt: Date.now(),
  });

  await interaction.showModal(createFootballEventModal());
  return true;
}

async function handleFootballModal(client, interaction) {
  if (!interaction.isModalSubmit()) return false;

  if (interaction.customId === "football_event_modal") {
    if (!hasFootballCreatorPermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Du hast keine Berechtigung, Fußball-Events zu erstellen.",
        ephemeral: true,
      });
      return true;
    }

    const draft = footballDrafts.get(interaction.user.id);

    if (!draft?.heliMode) {
      await safeReply(interaction, {
        content: "❌ Heli-Auswahl wurde nicht gefunden. Bitte starte das Fußball-Event nochmal über das Familienpanel.",
        ephemeral: true,
      });
      return true;
    }

    const opponent = String(interaction.fields.getTextInputValue("football_opponent") || "").trim();
    const dateText = String(interaction.fields.getTextInputValue("football_date") || "").trim();
    const timeText = String(interaction.fields.getTextInputValue("football_time") || "").trim();
    const placeText = String(interaction.fields.getTextInputValue("football_place") || "").trim();
    const note = String(interaction.fields.getTextInputValue("football_note") || "").trim();

    const event = createFootballEventRecord({
      creatorId: interaction.user.id,
      opponent,
      dateText,
      timeText,
      placeText,
      note,
      heliMode: draft.heliMode,
    });

    footballDrafts.delete(interaction.user.id);

    await postFootballEvent(client, interaction, event);
    return true;
  }

  if (interaction.customId.startsWith("football_time_modal_")) {
    const eventId = interaction.customId.replace("football_time_modal_", "");

    if (!hasFootballManagePermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Du hast keine Berechtigung, die Fußball-Uhrzeit zu ändern.",
        ephemeral: true,
      });
      return true;
    }

    const data = loadData();
    const event = data.footballEvents?.[eventId];

    if (!event) {
      await safeReply(interaction, {
        content: "❌ Dieses Fußball-Event wurde nicht im Speicher gefunden.",
        ephemeral: true,
      });
      return true;
    }

    const oldTime = event.timeText;
    const newTime = normalizeFootballTimeText(interaction.fields.getTextInputValue("football_new_time"));

    event.timeText = newTime;
    event.lastTimeChangeBy = interaction.user.id;
    event.lastTimeChangeAt = Date.now();
    event.updatedAt = Date.now();

    data.footballEvents[eventId] = event;
    saveData(data);

    await updateFootballEventMessage(client, event);
    await announceFootballTimeChanged(client, event, oldTime, newTime, interaction.user.id);

    await safeReply(interaction, {
      content: `✅ Fußball-Uhrzeit wurde von **${oldTime}** auf **${newTime}** geändert.`,
      ephemeral: true,
    });

    return true;
  }

  return false;
}

async function handleFootballParticipationButton(client, interaction) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId;

  let status = null;
  let eventId = null;

  if (customId.startsWith("football_present_")) {
    status = "present";
    eventId = customId.replace("football_present_", "");
  } else if (customId.startsWith("football_absent_")) {
    status = "absent";
    eventId = customId.replace("football_absent_", "");
  } else if (customId.startsWith("football_unsure_")) {
    status = "unsure";
    eventId = customId.replace("football_unsure_", "");
  } else {
    return false;
  }

  const data = loadData();
  const event = data.footballEvents?.[eventId];

  if (!event) {
    await safeReply(interaction, {
      content: "❌ Dieses Fußball-Event wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
    return true;
  }

  if (event.cancelled) {
    await safeReply(interaction, {
      content: "❌ Dieses Fußball-Event wurde abgesagt.",
      ephemeral: true,
    });
    return true;
  }

  const name = getReadableUserName(interaction.member, interaction.user);

  if (!event.users) event.users = {};

  event.users[interaction.user.id] = {
    userId: interaction.user.id,
    name,
    status,
    statusChangedAt: Date.now(),
    updatedAt: Date.now(),
  };

  event.updatedAt = Date.now();

  data.footballEvents[eventId] = event;
  saveData(data);

  await updateFootballEventMessage(client, event);

  const statusText =
    status === "present"
      ? "Dabei"
      : status === "absent"
        ? "Nicht dabei"
        : "Ungewiss";

  await safeReply(interaction, {
    content: `✅ Du wurdest bei diesem Fußball-Event als **${statusText}** eingetragen.`,
    ephemeral: true,
  });

  return true;
}

async function handleFootballManageButton(client, interaction) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId;

  let action = null;
  let eventId = null;

  if (customId.startsWith("football_cancel_")) {
    action = "cancel";
    eventId = customId.replace("football_cancel_", "");
  } else if (customId.startsWith("football_reopen_")) {
    action = "reopen";
    eventId = customId.replace("football_reopen_", "");
  } else if (customId.startsWith("football_time_")) {
    action = "time";
    eventId = customId.replace("football_time_", "");
  } else {
    return false;
  }

  if (!hasFootballManagePermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, dieses Fußball-Event zu verwalten.",
      ephemeral: true,
    });
    return true;
  }

  const data = loadData();
  const event = data.footballEvents?.[eventId];

  if (!event) {
    await safeReply(interaction, {
      content: "❌ Dieses Fußball-Event wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
    return true;
  }

  if (action === "time") {
    await interaction.showModal(createFootballTimeModal(eventId));
    return true;
  }

  if (action === "cancel") {
    if (event.cancelled) {
      await safeReply(interaction, {
        content: "ℹ️ Dieses Fußball-Event ist bereits abgesagt.",
        ephemeral: true,
      });
      return true;
    }

    event.cancelled = true;
    event.cancelledBy = interaction.user.id;
    event.cancelledAt = Date.now();
    event.updatedAt = Date.now();

    data.footballEvents[eventId] = event;
    saveData(data);

    await updateFootballEventMessage(client, event);
    await announceFootballCancelled(client, event, interaction.user.id);

    await safeReply(interaction, {
      content: "✅ Fußball-Event wurde abgesagt und die Familie wurde informiert.",
      ephemeral: true,
    });

    return true;
  }

  if (action === "reopen") {
    if (!event.cancelled) {
      await safeReply(interaction, {
        content: "ℹ️ Dieses Fußball-Event ist bereits geöffnet.",
        ephemeral: true,
      });
      return true;
    }

    event.cancelled = false;
    event.cancelledBy = null;
    event.cancelledAt = null;
    event.reopenedBy = interaction.user.id;
    event.reopenedAt = Date.now();
    event.updatedAt = Date.now();

    data.footballEvents[eventId] = event;
    saveData(data);

    await updateFootballEventMessage(client, event);
    await announceFootballReopened(client, event, interaction.user.id);

    await safeReply(interaction, {
      content: "✅ Fußball-Event wurde wieder geöffnet und die Familie wurde informiert.",
      ephemeral: true,
    });

    return true;
  }

  return false;
}

async function handleFootballInteraction(client, interaction) {
  if (await handleFootballFamilyButton(client, interaction)) return true;
  if (await handleFootballHeliSelect(client, interaction)) return true;
  if (await handleFootballModal(client, interaction)) return true;
  if (await handleFootballManageButton(client, interaction)) return true;
  if (await handleFootballParticipationButton(client, interaction)) return true;

  return false;
}

module.exports = {
  handleFootballInteraction,
  createFootballEventEmbed,
  createFootballEventButtons,
};
