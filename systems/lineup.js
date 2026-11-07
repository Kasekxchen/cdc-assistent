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

const { loadData, saveData } = require("../utils/dataStore");
const {
  getBerlinParts,
  getTomorrowBerlinParts,
  formatGermanDateTimeFromMs,
} = require("../utils/dates");
const { hasLeaderPermission } = require("../utils/permissions");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// SLASH COMMANDS
// =====================================================

const lineupTomorrowCommand = new SlashCommandBuilder()
  .setName("aufstellung-morgen")
  .setDescription("Erstellt die Aufstellung für morgen.");

const lineupForceTodayCommand = new SlashCommandBuilder()
  .setName("aufstellung-neu")
  .setDescription("Erstellt die heutige Aufstellung neu.");

// =====================================================
// GRUNDLOGIK
// =====================================================

function isLineupDay(weekday) {
  // CDC: Jeden Tag ist Aufstellung, auch Montag und Freitag.
  return [
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
  ].includes(weekday);
}

function hasLineupAnnouncementTimePassed() {
  const now = getBerlinParts();

  const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
  const targetMinutes =
    Number(CONFIG.lineupAnnouncementHour || 12) * 60 +
    Number(CONFIG.lineupAnnouncementMinute || 0);

  return currentMinutes >= targetMinutes;
}

function getLineupTitle(weekday) {
  return weekday === "Sonntag" ? "Pflichtaufstellung" : "Tagesaufstellung";
}

function getDefaultLineupStartText(weekday) {
  return CONFIG.lineupSpecialStartTimes?.[weekday] || CONFIG.lineupStartTimeText;
}

function getLineupStartText(lineup) {
  if (!lineup?.lastTimeChangeBy) {
    return getDefaultLineupStartText(lineup?.weekday);
  }

  return lineup.startTimeText || getDefaultLineupStartText(lineup?.weekday);
}

function parseLineupStartMinutes(startText) {
  const match = String(startText || "").match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return 20 * 60;

  const hours = Math.min(Math.max(Number(match[1]) || 0, 0), 23);
  const minutes = Math.min(Math.max(Number(match[2]) || 0, 0), 59);

  return hours * 60 + minutes;
}

function getCurrentBerlinMinutes() {
  const now = getBerlinParts();
  return Number(now.hour) * 60 + Number(now.minute);
}

function hasLineupStartPassed(lineup) {
  const now = getBerlinParts();

  if (now.dateKey > lineup.dateKey) return true;
  if (now.dateKey < lineup.dateKey) return false;

  return getCurrentBerlinMinutes() >= parseLineupStartMinutes(getLineupStartText(lineup));
}

function getLineupStatus(lineup) {
  if (lineup.cancelled) return "Aufstellung abgesagt";
  if (lineup.closed || hasLineupStartPassed(lineup)) return "Anmeldung geschlossen";
  return "Anmeldung offen";
}

function isLineupInteractionClosed(lineup) {
  return Boolean(lineup.cancelled || lineup.closed || hasLineupStartPassed(lineup));
}

function getLineupReminderMinutes(lineup) {
  return parseLineupStartMinutes(getLineupStartText(lineup)) - 30;
}

function shouldSendLineupReminder(lineup) {
  const now = getBerlinParts();

  if (!lineup || lineup.cancelled || lineup.closed) return false;
  if (now.dateKey !== lineup.dateKey) return false;

  const currentMinutes = getCurrentBerlinMinutes();
  const reminderMinutes = getLineupReminderMinutes(lineup);
  const startMinutes = parseLineupStartMinutes(getLineupStartText(lineup));

  // WICHTIG:
  // Reminder wird nur exakt zur Reminder-Minute gesendet.
  // Dadurch wird nach Bot-Neustart / Railway-Deploy keine alte Erinnerung nachgeholt.
  if (currentMinutes !== reminderMinutes) return false;

  // Extra Sicherheit: Falls Startzeit erreicht oder vorbei ist, niemals erinnern.
  if (currentMinutes >= startMinutes) return false;

  return true;
}

function createEmptyLineup(dateKey, dateText, weekday, createdBy = null) {
  return {
    dateKey,
    dateText,
    weekday,
    title: getLineupTitle(weekday),
    startTimeText: getDefaultLineupStartText(weekday),
    createdBy,
    createdAt: Date.now(),
    closed: false,
    cancelled: false,
    cancelledBy: null,
    cancelledAt: null,
    lastTimeChangeBy: null,
    lastTimeChangeAt: null,
    messageId: null,
    users: {},
  };
}

// =====================================================
// LISTEN / EMBED / BUTTONS
// =====================================================

function getUsersByStatus(lineup, status) {
  return Object.entries(lineup.users || {})
    .filter(([, userData]) => userData.status === status)
    .map(([userId, userData]) => ({
      userId,
      name: userData.name || `<@${userId}>`,
      sortAt: userData.statusChangedAt || userData.registeredAt || userData.updatedAt || "",
    }))
    .sort((a, b) => String(a.sortAt).localeCompare(String(b.sortAt)));
}

function formatLineupUserList(users) {
  if (users.length === 0) return "—";

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

function createLineupEmbed(lineup) {
  const presentUsers = getUsersByStatus(lineup, "present");
  const absentUsers = getUsersByStatus(lineup, "absent");
  const total = presentUsers.length + absentUsers.length;
  const statusText = getLineupStatus(lineup);

  return new EmbedBuilder()
    .setColor(
      lineup.cancelled
        ? CONFIG.dangerColor
        : statusText === "Anmeldung geschlossen"
          ? CONFIG.warningColor
          : CONFIG.embedColor
    )
    .setTitle(lineup.title || getLineupTitle(lineup.weekday))
    .setDescription(
      [
        "**Event Info:**",
        `📅 **Datum:** ${lineup.dateText}`,
        `🕘 **Beginn:** ${getLineupStartText(lineup)}`,
        "",
        "**Deskription:**",
        "✅ Ihr schafft es pünktlich zur Aufstellung zu kommen.",
        "❌ Ihr schafft es nicht zur Aufstellung zu kommen.",
      ].filter(Boolean).join("\n")
    )
    .addFields(
      {
        name: `✅ Anwesend (${presentUsers.length})`,
        value: formatLineupUserList(presentUsers),
        inline: true,
      },
      {
        name: `❌ Abwesend (${absentUsers.length})`,
        value: formatLineupUserList(absentUsers),
        inline: true,
      },
      {
        name: "Info",
        value: [
          `Status: **${statusText}**`,
          `Anmeldungen: **${total}**`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({
      text: `${CONFIG.shortName} • Aufstellung • ${lineup.dateText}`,
    });
}

function createLineupButtons(lineup) {
  const presentUsers = getUsersByStatus(lineup, "present");
  const absentUsers = getUsersByStatus(lineup, "absent");
  const closed = isLineupInteractionClosed(lineup);

  const participationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lineup_present_${lineup.dateKey}`)
      .setLabel(`${presentUsers.length}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),

    new ButtonBuilder()
      .setCustomId(`lineup_absent_${lineup.dateKey}`)
      .setLabel(`${absentUsers.length}`)
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed)
  );

  const managementRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lineup_cancel_${lineup.dateKey}`)
      .setLabel("Aufstellung absagen")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(lineup.cancelled)),

    new ButtonBuilder()
      .setCustomId(`lineup_reopen_${lineup.dateKey}`)
      .setLabel("Aufstellung wieder öffnen")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!lineup.cancelled),

    new ButtonBuilder()
      .setCustomId(`lineup_time_${lineup.dateKey}`)
      .setLabel("Aufstellungsuhrzeit ändern")
      .setEmoji("🕘")
      .setStyle(ButtonStyle.Secondary)
  );

  return [participationRow, managementRow];
}

function createConfirmActionRow(action, dateKey) {
  const actionLabel = action === "cancel" ? "Absage bestätigen" : "Öffnen bestätigen";
  const actionEmoji = action === "cancel" ? "🛑" : "🔓";
  const actionStyle = action === "cancel" ? ButtonStyle.Danger : ButtonStyle.Success;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lineup_${action}_confirm_${dateKey}`)
      .setLabel(actionLabel)
      .setEmoji(actionEmoji)
      .setStyle(actionStyle),

    new ButtonBuilder()
      .setCustomId("lineup_confirm_abort")
      .setLabel("Abbrechen")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary)
  );
}

function createLineupTimeModal(dateKey) {
  const modal = new ModalBuilder()
    .setCustomId(`lineup_time_modal_${dateKey}`)
    .setTitle("🕘 Aufstellungsuhrzeit ändern");

  const timeInput = new TextInputBuilder()
    .setCustomId("lineup_new_time")
    .setLabel("Neue Uhrzeit")
    .setPlaceholder("z. B. 21:00 Uhr")
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(30)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(timeInput));

  return modal;
}

function normalizeLineupTimeText(input) {
  const value = String(input || "").trim();
  if (!value) return CONFIG.lineupStartTimeText;
  if (/uhr/i.test(value)) return value;
  return `${value} Uhr`;
}

// =====================================================
// MESSAGE FINDEN / UPDATEN
// =====================================================

async function updateLineupMessage(client, lineup) {
  if (!lineup.messageId) return;

  const channel = await client.channels.fetch(CONFIG.lineupChannelId).catch(() => null);
  if (!channel || !channel.messages) {
    console.error("❌ Aufstellungs-Channel nicht gefunden.");
    return;
  }

  const message = await channel.messages.fetch(lineup.messageId).catch(() => null);
  if (!message) {
    console.error("❌ Aufstellungsnachricht nicht gefunden.");
    return;
  }

  await message.edit({
    embeds: [createLineupEmbed(lineup)],
    components: createLineupButtons(lineup),
  }).catch(() => null);
}

async function findExistingLineupMessageForDate(client, dateText) {
  const channel = await client.channels.fetch(CONFIG.lineupChannelId).catch(() => null);
  if (!channel || !channel.messages) return null;

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return null;

  for (const message of messages.values()) {
    if (message.author?.id !== client.user.id) continue;

    const hasTodayLineupEmbed = message.embeds?.some((embed) => {
      const title = embed.title || "";
      const description = embed.description || "";
      const footer = embed.footer?.text || "";

      return (
        title.toLowerCase().includes("aufstellung") &&
        (
          description.includes(`📅 **Datum:** ${dateText}`) ||
          footer.includes(`Aufstellung • ${dateText}`) ||
          footer.includes(dateText)
        )
      );
    });

    if (hasTodayLineupEmbed) return message;
  }

  return null;
}

async function findLineupMessageById(client, messageId) {
  if (!messageId) return null;

  const channel = await client.channels.fetch(CONFIG.lineupChannelId).catch(() => null);
  if (!channel || !channel.messages) return null;

  return channel.messages.fetch(messageId).catch(() => null);
}

// =====================================================
// ANKÜNDIGUNGEN
// =====================================================

async function announceLineupCancelled(client, lineup, leaderId) {
  await sendToChannel(client, CONFIG.lineupChannelId, {
    content: [
      `<@&${CONFIG.lineupMentionRoleId}>`,
      "",
      "🛑 **CDC AUFSTELLUNG ABGESAGT**",
      "",
      "Die heutige Aufstellung wurde von der Leaderschaft abgesagt.",
      "",
      `📅 **Datum:** ${lineup.dateText}`,
      `🕘 **Ursprüngliche Uhrzeit:** ${getLineupStartText(lineup)}`,
      `👑 **Abgesagt von:** <@${leaderId}>`,
    ].join("\n"),
    allowedMentions: { roles: [CONFIG.lineupMentionRoleId], users: [leaderId] },
  });
}

async function announceLineupReopened(client, lineup, leaderId) {
  await sendToChannel(client, CONFIG.lineupChannelId, {
    content: [
      `<@&${CONFIG.lineupMentionRoleId}>`,
      "",
      "🔓 **CDC AUFSTELLUNG WIEDER GEÖFFNET**",
      "",
      "Die heutige Aufstellung wurde wieder geöffnet.",
      "",
      `📅 **Datum:** ${lineup.dateText}`,
      `🕘 **Beginn:** ${getLineupStartText(lineup)}`,
      `👑 **Geöffnet von:** <@${leaderId}>`,
      "",
      "Ihr könnt euch jetzt wieder anmelden.",
    ].join("\n"),
    allowedMentions: { roles: [CONFIG.lineupMentionRoleId], users: [leaderId] },
  });
}

async function announceLineupTimeChanged(client, lineup, oldTime, newTime, leaderId) {
  await sendToChannel(client, CONFIG.lineupChannelId, {
    content: [
      `<@&${CONFIG.lineupMentionRoleId}>`,
      "",
      "🕘 **AUFSTELLUNGSUHRZEIT GEÄNDERT**",
      "",
      "Die heutige Aufstellung wurde verschoben.",
      "",
      `📅 **Datum:** ${lineup.dateText}`,
      `🕘 **Alte Uhrzeit:** ${oldTime}`,
      `🕘 **Neue Uhrzeit:** ${newTime}`,
      `👑 **Geändert von:** <@${leaderId}>`,
      `🕘 **Zeitpunkt:** ${formatGermanDateTimeFromMs(Date.now())}`,
      "",
      "Bitte beachtet die neue Uhrzeit.",
    ].join("\n"),
    allowedMentions: { roles: [CONFIG.lineupMentionRoleId], users: [leaderId] },
  });
}

// =====================================================
// AUFSTELLUNG ERSTELLEN
// =====================================================

async function createLineupForDate(client, targetParts, reason = "scheduled", createdBy = null, force = false) {
  if (!isLineupDay(targetParts.weekday)) {
    console.log(`ℹ️ ${targetParts.weekday} ist kein Aufstellungstag.`);
    return null;
  }

  const data = loadData();

  if (!force && data.postedDates[targetParts.dateKey]) {
    const savedMessage = await findLineupMessageById(client, data.postedDates[targetParts.dateKey].messageId);

    if (savedMessage) {
      console.log(`ℹ️ Aufstellung für ${targetParts.dateKey} wurde bereits erstellt und die Nachricht existiert noch.`);
      return savedMessage;
    }

    console.log(`⚠️ Aufstellung für ${targetParts.dateKey} war gespeichert, aber die Discord-Nachricht fehlt. Ich erstelle sie neu.`);
    delete data.postedDates[targetParts.dateKey];

    if (data.lineups?.[targetParts.dateKey]) {
      data.lineups[targetParts.dateKey].messageId = null;
      data.lineups[targetParts.dateKey].closed = false;
      data.lineups[targetParts.dateKey].cancelled = false;
    }

    saveData(data);
  }

  if (!force) {
    const existingMessage = await findExistingLineupMessageForDate(client, targetParts.dateText);

    if (existingMessage) {
      const existingLineup =
        data.lineups?.[targetParts.dateKey] ||
        createEmptyLineup(targetParts.dateKey, targetParts.dateText, targetParts.weekday, createdBy || client.user.id);

      existingLineup.messageId = existingMessage.id;

      data.postedDates[targetParts.dateKey] = {
        messageId: existingMessage.id,
        createdAt: new Date().toISOString(),
        reason: "existing-message-found",
      };

      data.lineups[targetParts.dateKey] = existingLineup;
      saveData(data);

      console.log(`ℹ️ Es existiert bereits eine Aufstellung für ${targetParts.dateText}. Keine neue Nachricht erstellt.`);
      return existingMessage;
    }
  }

  const lineup = createEmptyLineup(targetParts.dateKey, targetParts.dateText, targetParts.weekday, createdBy || client.user.id);

  const message = await sendToChannel(client, CONFIG.lineupChannelId, {
    content: `<@&${CONFIG.lineupMentionRoleId}>`,
    embeds: [createLineupEmbed(lineup)],
    components: createLineupButtons(lineup),
    allowedMentions: { roles: [CONFIG.lineupMentionRoleId] },
  });

  if (!message) {
    console.error("❌ Aufstellung konnte nicht gesendet werden.");
    return null;
  }

  lineup.messageId = message.id;

  data.postedDates[targetParts.dateKey] = {
    messageId: message.id,
    createdAt: new Date().toISOString(),
    reason,
  };

  data.lineups[targetParts.dateKey] = lineup;
  saveData(data);

  console.log(`✅ ${lineup.title} für ${targetParts.dateText} wurde erstellt. Grund: ${reason}`);
  return message;
}

async function createLineupForToday(client, reason = "scheduled") {
  const now = getBerlinParts();
  return createLineupForDate(client, now, reason, client.user.id, false);
}

async function forcePostLineupForToday(client, reason = "manual-force") {
  const now = getBerlinParts();

  if (!isLineupDay(now.weekday)) {
    return {
      ok: false,
      message: `Heute ist **${now.weekday}**. Heute ist kein Aufstellungstag.`,
    };
  }

  const data = loadData();

  const lineup =
    data.lineups?.[now.dateKey] ||
    createEmptyLineup(now.dateKey, now.dateText, now.weekday, client.user.id);

  lineup.dateKey = now.dateKey;
  lineup.dateText = now.dateText;
  lineup.weekday = now.weekday;
  lineup.title = getLineupTitle(now.weekday);
  lineup.closed = false;
  lineup.cancelled = false;
  lineup.cancelledBy = null;
  lineup.cancelledAt = null;
  lineup.messageId = null;

  const message = await sendToChannel(client, CONFIG.lineupChannelId, {
    content: `<@&${CONFIG.lineupMentionRoleId}>`,
    embeds: [createLineupEmbed(lineup)],
    components: createLineupButtons(lineup),
    allowedMentions: { roles: [CONFIG.lineupMentionRoleId] },
  });

  if (!message) {
    return {
      ok: false,
      message: "Die Aufstellung konnte nicht gesendet werden. Bitte prüfe Channel-ID und Bot-Rechte.",
    };
  }

  lineup.messageId = message.id;

  data.postedDates[now.dateKey] = {
    messageId: message.id,
    createdAt: new Date().toISOString(),
    reason,
  };

  data.lineups[now.dateKey] = lineup;
  saveData(data);

  return {
    ok: true,
    message: `${lineup.title} für **${now.dateText}** wurde neu gepostet.`,
  };
}

// =====================================================
// COMMANDS
// =====================================================

async function createLineupForTomorrowCommand(client, interaction) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung für diesen Befehl.",
      ephemeral: true,
    });
  }

  const tomorrow = getTomorrowBerlinParts();

  if (!isLineupDay(tomorrow.weekday)) {
    return safeReply(interaction, {
      content: `ℹ️ Morgen ist **${tomorrow.weekday}**. Dafür gibt es keine Aufstellung.`,
      ephemeral: true,
    });
  }

  const message = await createLineupForDate(client, tomorrow, `morgen-command von ${interaction.user.tag}`, interaction.user.id, false);

  if (!message) {
    return safeReply(interaction, {
      content: "❌ Aufstellung für morgen konnte nicht erstellt werden.",
      ephemeral: true,
    });
  }

  return safeReply(interaction, {
    content: `✅ Aufstellung für morgen wurde in <#${CONFIG.lineupChannelId}> erstellt.\n📅 **${tomorrow.weekday}, ${tomorrow.dateText}**\n🕘 **${getDefaultLineupStartText(tomorrow.weekday)}**`,
    ephemeral: true,
  });
}

async function forceLineupTodayCommand(client, interaction) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung für diesen Befehl.",
      ephemeral: true,
    });
  }

  const result = await forcePostLineupForToday(client, `force-command von ${interaction.user.tag}`);

  return safeReply(interaction, {
    content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
    ephemeral: true,
  });
}

// =====================================================
// BUTTON-AKTIONEN
// =====================================================

async function setLineupStatus(client, interaction, dateKey, status) {
  const data = loadData();
  const lineup = data.lineups?.[dateKey];

  if (!lineup) {
    return safeReply(interaction, {
      content: "❌ Diese Aufstellung wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
  }

  if (isLineupInteractionClosed(lineup)) {
    await updateLineupMessage(client, lineup);
    return safeReply(interaction, {
      content: "❌ Die Anmeldung für diese Aufstellung ist geschlossen.",
      ephemeral: true,
    });
  }

  const memberName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;

  if (!lineup.users) lineup.users = {};

  lineup.users[interaction.user.id] = {
    userId: interaction.user.id,
    name: memberName,
    status,
    statusChangedAt: Date.now(),
    updatedAt: Date.now(),
  };

  data.lineups[dateKey] = lineup;
  saveData(data);

  await updateLineupMessage(client, lineup);

  const statusText = status === "present" ? "Anwesend" : "Abwesend";

  return safeReply(interaction, {
    content: `✅ Du wurdest als **${statusText}** eingetragen.`,
    ephemeral: true,
  });
}

async function cancelLineup(client, interaction, dateKey, alreadyAcknowledged = false) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, die Aufstellung abzusagen.",
      ephemeral: true,
    });
  }

  const data = loadData();
  const lineup = data.lineups?.[dateKey];

  if (!lineup) {
    return safeReply(interaction, {
      content: "❌ Diese Aufstellung wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
  }

  if (lineup.cancelled) {
    return safeReply(interaction, {
      content: "ℹ️ Diese Aufstellung wurde bereits abgesagt.",
      ephemeral: true,
    });
  }

  lineup.cancelled = true;
  lineup.closed = true;
  lineup.cancelledBy = interaction.user.id;
  lineup.cancelledAt = Date.now();

  data.lineups[dateKey] = lineup;
  saveData(data);

  await updateLineupMessage(client, lineup);
  await announceLineupCancelled(client, lineup, interaction.user.id);

  const doneMessage = "✅ Aufstellung wurde abgesagt und die CDC-Rolle wurde informiert.";

  if (alreadyAcknowledged && interaction.followUp) {
    return interaction.followUp({
      content: doneMessage,
      ephemeral: true,
    });
  }

  return safeReply(interaction, {
    content: doneMessage,
    ephemeral: true,
  });
}

async function reopenLineup(client, interaction, dateKey, alreadyAcknowledged = false) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, die Aufstellung wieder zu öffnen.",
      ephemeral: true,
    });
  }

  const data = loadData();
  const lineup = data.lineups?.[dateKey];

  if (!lineup) {
    return safeReply(interaction, {
      content: "❌ Diese Aufstellung wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
  }

  if (!lineup.cancelled) {
    return safeReply(interaction, {
      content: "ℹ️ Diese Aufstellung ist bereits geöffnet.",
      ephemeral: true,
    });
  }

  lineup.cancelled = false;
  lineup.cancelledBy = null;
  lineup.cancelledAt = null;
  lineup.closed = false;
  lineup.reopenedBy = interaction.user.id;
  lineup.reopenedAt = Date.now();

  data.lineups[dateKey] = lineup;
  saveData(data);

  await updateLineupMessage(client, lineup);
  await announceLineupReopened(client, lineup, interaction.user.id);

  const doneMessage = "✅ Aufstellung wurde wieder geöffnet und die CDC-Rolle wurde informiert.";

  if (alreadyAcknowledged && interaction.followUp) {
    return interaction.followUp({
      content: doneMessage,
      ephemeral: true,
    });
  }

  return safeReply(interaction, {
    content: doneMessage,
    ephemeral: true,
  });
}

async function changeLineupTime(client, interaction, dateKey) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, die Aufstellungsuhrzeit zu ändern.",
      ephemeral: true,
    });
  }

  const data = loadData();
  const lineup = data.lineups?.[dateKey];

  if (!lineup) {
    return safeReply(interaction, {
      content: "❌ Diese Aufstellung wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
  }

  const oldTime = getLineupStartText(lineup);
  const newTime = normalizeLineupTimeText(interaction.fields.getTextInputValue("lineup_new_time"));

  lineup.startTimeText = newTime;
  lineup.lastTimeChangeBy = interaction.user.id;
  lineup.lastTimeChangeAt = Date.now();
  lineup.closed = hasLineupStartPassed(lineup);

  data.lineups[dateKey] = lineup;
  saveData(data);

  await updateLineupMessage(client, lineup);
  await announceLineupTimeChanged(client, lineup, oldTime, newTime, interaction.user.id);

  return safeReply(interaction, {
    content: `✅ Aufstellungsuhrzeit wurde von **${oldTime}** auf **${newTime}** geändert und die CDC-Rolle wurde informiert.`,
    ephemeral: true,
  });
}

// =====================================================
// SCHEDULER
// =====================================================

async function checkDailyLineup(client) {
  const now = getBerlinParts();

  if (!isLineupDay(now.weekday)) return;

  if (!hasLineupAnnouncementTimePassed()) {
    console.log("ℹ️ Aufstellung wird erst ab 12:00 Uhr gepostet.");
    return;
  }

  await createLineupForToday(client, "auto-check");
}

async function checkLineupReminders(client) {
  const now = getBerlinParts();
  const data = loadData();
  const lineup = data.lineups?.[now.dateKey];

  if (!lineup) return;
  if (!shouldSendLineupReminder(lineup)) return;

  if (!data.lineupReminders) data.lineupReminders = {};
  if (data.lineupReminders[now.dateKey]) return;

  await sendToChannel(client, CONFIG.lineupChannelId, {
    content: [
      `<@&${CONFIG.lineupMentionRoleId}>`,
      "",
      "⏰ **CDC AUFSTELLUNGS-ERINNERUNG**",
      "",
      "Die Aufstellung beginnt in ungefähr **30 Minuten**.",
      "",
      `📅 **Datum:** ${lineup.dateText}`,
      `🕘 **Beginn:** ${getLineupStartText(lineup)}`,
      "",
      "Bitte meldet euch rechtzeitig mit ✅ oder ❌ an.",
    ].join("\n"),
    allowedMentions: { roles: [CONFIG.lineupMentionRoleId] },
  });

  data.lineupReminders[now.dateKey] = {
    sentAt: new Date().toISOString(),
    lineupMessageId: lineup.messageId || null,
  };

  saveData(data);

  console.log(`✅ Aufstellungs-Erinnerung für ${now.dateKey} wurde gesendet.`);
}

async function checkLineupClosures(client) {
  const data = loadData();
  let changed = false;

  for (const [dateKey, lineup] of Object.entries(data.lineups || {})) {
    if (!lineup || lineup.cancelled || lineup.closed) continue;

    if (hasLineupStartPassed(lineup)) {
      lineup.closed = true;
      data.lineups[dateKey] = lineup;
      changed = true;
      await updateLineupMessage(client, lineup);
      console.log(`✅ Aufstellung für ${lineup.dateText} wurde automatisch geschlossen.`);
    }
  }

  if (changed) saveData(data);
}

// =====================================================
// INTERACTIONS
// =====================================================

async function handleLineupCommand(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === "aufstellung-morgen") {
    await createLineupForTomorrowCommand(client, interaction);
    return true;
  }

  if (interaction.commandName === "aufstellung-neu") {
    await forceLineupTodayCommand(client, interaction);
    return true;
  }

  return false;
}

async function handleLineupButton(client, interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId.startsWith("lineup_present_")) {
    const dateKey = interaction.customId.replace("lineup_present_", "");
    await setLineupStatus(client, interaction, dateKey, "present");
    return true;
  }

  if (interaction.customId.startsWith("lineup_absent_")) {
    const dateKey = interaction.customId.replace("lineup_absent_", "");
    await setLineupStatus(client, interaction, dateKey, "absent");
    return true;
  }

  if (interaction.customId.startsWith("lineup_cancel_") && !interaction.customId.startsWith("lineup_cancel_confirm_")) {
    const dateKey = interaction.customId.replace("lineup_cancel_", "");

    if (!hasLeaderPermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Du hast keine Berechtigung, die Aufstellung abzusagen.",
        ephemeral: true,
      });
      return true;
    }

    await safeReply(interaction, {
      content: "⚠️ Möchtest du diese Aufstellung wirklich absagen?",
      components: [createConfirmActionRow("cancel", dateKey)],
      ephemeral: true,
    });

    return true;
  }

  if (interaction.customId.startsWith("lineup_reopen_") && !interaction.customId.startsWith("lineup_reopen_confirm_")) {
    const dateKey = interaction.customId.replace("lineup_reopen_", "");

    if (!hasLeaderPermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Du hast keine Berechtigung, die Aufstellung wieder zu öffnen.",
        ephemeral: true,
      });
      return true;
    }

    await safeReply(interaction, {
      content: "🔓 Möchtest du diese Aufstellung wirklich wieder öffnen?",
      components: [createConfirmActionRow("reopen", dateKey)],
      ephemeral: true,
    });

    return true;
  }

  if (interaction.customId.startsWith("lineup_cancel_confirm_")) {
    const dateKey = interaction.customId.replace("lineup_cancel_confirm_", "");

    await interaction.update({
      content: "⏳ Aufstellung wird abgesagt...",
      components: [],
    });

    await cancelLineup(client, interaction, dateKey, true);
    return true;
  }

  if (interaction.customId.startsWith("lineup_reopen_confirm_")) {
    const dateKey = interaction.customId.replace("lineup_reopen_confirm_", "");

    await interaction.update({
      content: "⏳ Aufstellung wird wieder geöffnet...",
      components: [],
    });

    await reopenLineup(client, interaction, dateKey, true);
    return true;
  }

  if (interaction.customId === "lineup_confirm_abort") {
    await interaction.update({
      content: "❌ Aktion abgebrochen.",
      components: [],
    });

    return true;
  }

  if (interaction.customId.startsWith("lineup_time_")) {
    const dateKey = interaction.customId.replace("lineup_time_", "");

    if (!hasLeaderPermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Du hast keine Berechtigung, die Aufstellungsuhrzeit zu ändern.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.showModal(createLineupTimeModal(dateKey));
    return true;
  }

  return false;
}

async function handleLineupModal(client, interaction) {
  if (!interaction.isModalSubmit()) return false;

  if (interaction.customId.startsWith("lineup_time_modal_")) {
    const dateKey = interaction.customId.replace("lineup_time_modal_", "");
    await changeLineupTime(client, interaction, dateKey);
    return true;
  }

  return false;
}

async function handleLineupInteraction(client, interaction) {
  if (await handleLineupCommand(client, interaction)) return true;
  if (await handleLineupButton(client, interaction)) return true;
  if (await handleLineupModal(client, interaction)) return true;

  return false;
}

module.exports = {
  lineupTomorrowCommand,
  lineupForceTodayCommand,
  handleLineupInteraction,
  checkDailyLineup,
  checkLineupReminders,
  checkLineupClosures,
  createLineupForToday,
  forcePostLineupForToday,
};
