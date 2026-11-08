const {
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
  loadData,
  saveData,
} = require("../utils/dataStore");

const {
  getGermanDateTime,
  formatGermanDateTimeFromMs,
  getBerlinParts,
  addDaysToDateKey,
  formatDateKeyGerman,
  normalizeGermanDateInput,
  repairBrokenGermanYear,
  unixTimestamp,
} = require("../utils/dates");

const {
  getReadableUserName,
  createShortId,
} = require("../utils/format");

const {
  canUseAbsenceDecisionButtons,
} = require("../utils/permissions");

const {
  sendToChannel,
  safeReply,
  fetchMessage,
  deleteMessageSafe,
} = require("../utils/discord");

// =====================================================
// ABMELDUNG: FORMULAR
// =====================================================

function createAbsenceModal(member) {
  const modal = new ModalBuilder()
    .setCustomId("absence_modal")
    .setTitle("📋 Abmeldung");

  const nameInput = new TextInputBuilder()
    .setCustomId("absence_name")
    .setLabel("Name")
    .setPlaceholder("Wird automatisch übernommen")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(50)
    .setRequired(true)
    .setValue(member?.displayName || "");

  const fromInput = new TextInputBuilder()
    .setCustomId("absence_from")
    .setLabel("Von")
    .setPlaceholder("TT.MM.JJJJ")
    .setStyle(TextInputStyle.Short)
    .setMinLength(8)
    .setMaxLength(10)
    .setRequired(true);

  const untilInput = new TextInputBuilder()
    .setCustomId("absence_until")
    .setLabel("Bis")
    .setPlaceholder("TT.MM.JJJJ")
    .setStyle(TextInputStyle.Short)
    .setMinLength(8)
    .setMaxLength(10)
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId("absence_reason")
    .setLabel("Grund")
    .setPlaceholder("z. B. Urlaub, Arbeit, privat")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(fromInput),
    new ActionRowBuilder().addComponents(untilInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  return modal;
}

// =====================================================
// GENEHMIGEN / ABLEHNEN BUTTONS
// =====================================================

function createAbsenceDecisionButtons(absence) {
  const decided = Boolean(
    absence.status &&
    absence.status !== "Offen"
  );

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`absence_approve_${absence.id}`)
      .setLabel("Genehmigt")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(decided),

    new ButtonBuilder()
      .setCustomId(`absence_reject_${absence.id}`)
      .setLabel("Abgelehnt")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(decided)
  );
}

// =====================================================
// ABMELDUNGS-EMBED
// =====================================================

function createAbsenceEmbed(absence) {
  const statusText =
    absence.status === "Genehmigt"
      ? `✅ Genehmigt von <@${absence.decidedBy}>`
      : absence.status === "Abgelehnt"
        ? `❌ Abgelehnt von <@${absence.decidedBy}>`
        : "⏳ Offen";

  const statusColor =
    absence.status === "Genehmigt"
      ? CONFIG.successColor
      : absence.status === "Abgelehnt"
        ? CONFIG.dangerColor
        : CONFIG.warningColor;

  return new EmbedBuilder()
    .setColor(statusColor)
    .setTitle("📋 Abmeldung")
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        `👤 **Name:** ${absence.name}`,
        `📅 **Von:** ${absence.fromDateText}`,
        `📅 **Bis:** ${absence.untilDateText}`,
        "",
        "📝 **Grund:**",
        absence.reason || "—",
        "",
        `📨 **Eingereicht von:** <@${absence.userId}>`,
        `📌 **Status:** ${statusText}`,
        `🕘 **Eingereicht am:** <t:${unixTimestamp(absence.createdAt)}:F>`,
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .setFooter({
      text: `${CONFIG.shortName} • Abmeldung-ID: ${absence.id}`,
    });
}

// =====================================================
// ABMELDUNGSDATENSATZ
// =====================================================

function createAbsenceRecord({
  userId,
  name,
  fromDateKey,
  fromDateText,
  untilDateKey,
  untilDateText,
  reason,
}) {
  return {
    id: createShortId(),
    userId,
    name,
    fromDateKey,
    fromDateText,
    untilDateKey,
    untilDateText,
    reason,
    status: "Offen",
    decidedBy: null,
    decidedAt: null,
    messageId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// =====================================================
// ABMELDUNG ABSENDEN
// =====================================================

async function submitAbsence(
  client,
  interaction
) {
  const rawName = String(
    interaction.fields.getTextInputValue(
      "absence_name"
    ) || ""
  ).trim();

  const rawFrom = String(
    interaction.fields.getTextInputValue(
      "absence_from"
    ) || ""
  ).trim();

  const rawUntil = String(
    interaction.fields.getTextInputValue(
      "absence_until"
    ) || ""
  ).trim();

  const reason = String(
    interaction.fields.getTextInputValue(
      "absence_reason"
    ) || ""
  ).trim();

  const memberName = getReadableUserName(
    interaction.member,
    interaction.user
  );

  const name = rawName || memberName;

  const fromResult =
    normalizeGermanDateInput(rawFrom);

  const untilResult =
    normalizeGermanDateInput(rawUntil);

  if (!fromResult.ok) {
    return safeReply(interaction, {
      content:
        `❌ **Von-Datum ungültig:** ${fromResult.error}`,
      ephemeral: true,
    });
  }

  if (!untilResult.ok) {
    return safeReply(interaction, {
      content:
        `❌ **Bis-Datum ungültig:** ${untilResult.error}`,
      ephemeral: true,
    });
  }

  const today = getBerlinParts().dateKey;

  if (fromResult.dateKey < today) {
    return safeReply(interaction, {
      content:
        "❌ Das Von-Datum darf nicht in der Vergangenheit liegen.",
      ephemeral: true,
    });
  }

  if (
    untilResult.dateKey <
    fromResult.dateKey
  ) {
    return safeReply(interaction, {
      content:
        "❌ Das Bis-Datum darf nicht vor dem Von-Datum liegen.",
      ephemeral: true,
    });
  }

  const absence = createAbsenceRecord({
    userId: interaction.user.id,
    name,
    fromDateKey: fromResult.dateKey,
    fromDateText: fromResult.dateText,
    untilDateKey: untilResult.dateKey,
    untilDateText: untilResult.dateText,
    reason,
  });

  const message = await sendToChannel(
    client,
    CONFIG.absenceChannelId,
    {
      embeds: [
        createAbsenceEmbed(absence),
      ],

      components: [
        createAbsenceDecisionButtons(absence),
      ],

      allowedMentions: {
        users: [
          interaction.user.id,
        ],
      },
    }
  );

  if (!message) {
    return safeReply(interaction, {
      content:
        "❌ Abmeldung konnte nicht gesendet werden. Bitte prüfe Channel-ID und Bot-Rechte.",
      ephemeral: true,
    });
  }

  absence.messageId = message.id;

  const data = loadData();

  data.absences ||= {};
  data.absences[absence.id] = absence;

  saveData(data);

  return safeReply(interaction, {
    content:
      `✅ Deine Abmeldung wurde in <#${CONFIG.absenceChannelId}> eingereicht.`,
    ephemeral: true,
  });
}

// =====================================================
// ABMELDUNG GENEHMIGEN / ABLEHNEN
// =====================================================

async function decideAbsence(
  client,
  interaction,
  absenceId,
  decision
) {
  if (
    !canUseAbsenceDecisionButtons(
      interaction.member
    )
  ) {
    return safeReply(interaction, {
      content:
        "❌ Du hast keine Berechtigung, Abmeldungen zu genehmigen oder abzulehnen.",
      ephemeral: true,
    });
  }

  const data = loadData();

  const absence =
    data.absences?.[absenceId];

  if (!absence) {
    return safeReply(interaction, {
      content:
        "❌ Diese Abmeldung wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
  }

  if (
    absence.status &&
    absence.status !== "Offen"
  ) {
    return safeReply(interaction, {
      content:
        `ℹ️ Diese Abmeldung wurde bereits **${absence.status}**.`,
      ephemeral: true,
    });
  }

  absence.status = decision;
  absence.decidedBy = interaction.user.id;
  absence.decidedAt = Date.now();
  absence.updatedAt = Date.now();

  data.absences[absenceId] = absence;

  saveData(data);

  await interaction.message.edit({
    embeds: [
      createAbsenceEmbed(absence),
    ],
    components: [
      createAbsenceDecisionButtons(absence),
    ],
  }).catch(() => null);

  return safeReply(interaction, {
    content:
      `✅ Abmeldung wurde als **${decision}** markiert.`,
    ephemeral: true,
  });
}

// =====================================================
// ALTBESTAND: DATEN AUS EMBED AUSLESEN
// =====================================================

function extractAbsenceDateFromEmbed(
  embed,
  label
) {
  const description =
    embed?.description || "";

  const regex = new RegExp(
    `${label}:\\*\\*\\s*([^\\n]+)`,
    "i"
  );

  const match =
    description.match(regex);

  if (!match) {
    return null;
  }

  return repairBrokenGermanYear(
    match[1].trim()
  );
}

function extractAbsenceNameFromEmbed(embed) {
  const description =
    embed?.description || "";

  const match = description.match(
    /👤\s*\*\*Name:\*\*\s*([^\n]+)/i
  );

  return match
    ? match[1].trim()
    : "Unbekannt";
}

function extractAbsenceUserIdFromEmbed(embed) {
  const description =
    embed?.description || "";

  const match =
    description.match(/<@!?(\d+)>/);

  return match
    ? match[1]
    : null;
}

// =====================================================
// ALTE BOT-ABMELDUNGEN ÜBERNEHMEN
// =====================================================

async function scanOldBotAbsences(
  client,
  limit = 1000
) {
  const channel = await client.channels
    .fetch(CONFIG.absenceChannelId)
    .catch(() => null);

  if (!channel?.messages) {
    return {
      scanned: 0,
      added: 0,
    };
  }

  const data = loadData();

  data.absences ||= {};

  const knownMessageIds = new Set(
    Object.values(data.absences)
      .map(
        absence => absence.messageId
      )
      .filter(Boolean)
  );

  let scanned = 0;
  let added = 0;
  let before = null;

  while (scanned < limit) {
    const fetchLimit = Math.min(
      100,
      limit - scanned
    );

    const options = before
      ? {
          limit: fetchLimit,
          before,
        }
      : {
          limit: fetchLimit,
        };

    const messages =
      await channel.messages.fetch(options)
        .catch(() => null);

    if (
      !messages ||
      messages.size === 0
    ) {
      break;
    }

    for (const message of messages.values()) {
      scanned++;

      before = message.id;

      if (
        message.author?.id !== client.user.id
      ) {
        continue;
      }

      if (
        knownMessageIds.has(message.id)
      ) {
        continue;
      }

      const embed = message.embeds?.[0];

      if (!embed) {
        continue;
      }

      const title =
        embed.title || "";

      const description =
        embed.description || "";

      if (
        !title.toLowerCase().includes(
          "abmeldung"
        ) &&
        !description.toLowerCase().includes(
          "abmeldung"
        )
      ) {
        continue;
      }

      const fromTextRaw =
        extractAbsenceDateFromEmbed(
          embed,
          "Von"
        );

      const untilTextRaw =
        extractAbsenceDateFromEmbed(
          embed,
          "Bis"
        );

      if (
        !fromTextRaw ||
        !untilTextRaw
      ) {
        continue;
      }

      const fromResult =
        normalizeGermanDateInput(
          fromTextRaw
        );

      const untilResult =
        normalizeGermanDateInput(
          untilTextRaw
        );

      if (
        !fromResult.ok ||
        !untilResult.ok
      ) {
        continue;
      }

      const id = createShortId();

      data.absences[id] = {
        id,

        userId:
          extractAbsenceUserIdFromEmbed(embed),

        name:
          extractAbsenceNameFromEmbed(embed),

        fromDateKey:
          fromResult.dateKey,

        fromDateText:
          fromResult.dateText,

        untilDateKey:
          untilResult.dateKey,

        untilDateText:
          untilResult.dateText,

        reason:
          "Aus alter Bot-Nachricht übernommen",

        status:
          description.includes("✅ Genehmigt")
            ? "Genehmigt"
            : description.includes("❌ Abgelehnt")
              ? "Abgelehnt"
              : "Offen",

        decidedBy: null,
        decidedAt: null,

        messageId: message.id,

        createdAt:
          message.createdTimestamp ||
          Date.now(),

        updatedAt: Date.now(),
      };

      knownMessageIds.add(message.id);
      added++;
    }

    if (
      messages.size < fetchLimit
    ) {
      break;
    }
  }

  saveData(data);

  return {
    scanned,
    added,
  };
}

// =====================================================
// AUTOMATISCHE LÖSCHUNG NACH 14 TAGEN
// =====================================================

function getDeleteDateKeyForAbsence(absence) {
  if (!absence?.untilDateKey) {
    return null;
  }

  return addDaysToDateKey(
    absence.untilDateKey,
    14
  );
}

function shouldDeleteAbsence(
  absence,
  nowDateKey = getBerlinParts().dateKey
) {
  const deleteDateKey =
    getDeleteDateKeyForAbsence(absence);

  if (!deleteDateKey) {
    return false;
  }

  return nowDateKey >= deleteDateKey;
}

// =====================================================
// ABMELDUNGSLÖSCHUNG PROTOKOLLIEREN
// =====================================================

async function logAbsenceDeletion(
  client,
  absence,
  resultText
) {
  await sendToChannel(
    client,
    CONFIG.absenceDeleteLogChannelId,
    {
      embeds: [
        new EmbedBuilder()
          .setColor(CONFIG.warningColor)
          .setTitle(
            "🧹 Abmeldung gelöscht / bereinigt"
          )
          .setDescription(
            [
              "━━━━━━━━━━━━━━━━━━━━",

              `👤 **Name:** ${
                absence.name || "Unbekannt"
              }`,

              `📅 **Von:** ${
                absence.fromDateText ||
                formatDateKeyGerman(
                  absence.fromDateKey
                )
              }`,

              `📅 **Bis:** ${
                absence.untilDateText ||
                formatDateKeyGerman(
                  absence.untilDateKey
                )
              }`,

              `🗑️ **Ergebnis:** ${resultText}`,

              `🕘 **Zeitpunkt:** ${
                formatGermanDateTimeFromMs(
                  Date.now()
                )
              }`,

              absence.messageId
                ? `💬 **Message-ID:** \`${absence.messageId}\``
                : null,

              "━━━━━━━━━━━━━━━━━━━━",
            ]
              .filter(Boolean)
              .join("\n")
          )
          .setFooter({
            text:
              `${CONFIG.shortName} • Abmeldungs-Löschlog`,
          }),
      ],
    }
  );
}

// =====================================================
// ABGELAUFENE ABMELDUNGEN BEREINIGEN
// =====================================================

async function cleanupExpiredAbsences(
  client,
  options = {}
) {
  const {
    scanFirst = false,
  } = options;

  if (scanFirst) {
    await scanOldBotAbsences(client)
      .catch(() => null);
  }

  const data = loadData();

  data.absences ||= {};

  const channel = await client.channels
    .fetch(CONFIG.absenceChannelId)
    .catch(() => null);

  const nowDateKey =
    getBerlinParts().dateKey;

  let checked = 0;
  let deleted = 0;
  let missingCleaned = 0;
  let failed = 0;

  for (
    const [absenceId, absence]
    of Object.entries(data.absences)
  ) {
    checked++;

    if (
      !shouldDeleteAbsence(
        absence,
        nowDateKey
      )
    ) {
      continue;
    }

    if (
      !channel ||
      !absence.messageId
    ) {
      delete data.absences[absenceId];

      missingCleaned++;

      await logAbsenceDeletion(
        client,
        absence,
        "Interner Eintrag ohne erreichbare Nachricht bereinigt"
      );

      continue;
    }

    const message = await fetchMessage(
      channel,
      absence.messageId
    );

    if (!message) {
      delete data.absences[absenceId];

      missingCleaned++;

      await logAbsenceDeletion(
        client,
        absence,
        "Nachricht existierte bereits nicht mehr, Speicher bereinigt"
      );

      continue;
    }

    const result = await deleteMessageSafe(
      message,
      "Abmeldung älter als Bis-Datum + 14 Tage"
    );

    if (
      result.ok ||
      result.missing
    ) {
      delete data.absences[absenceId];

      if (result.ok) {
        deleted++;

        await logAbsenceDeletion(
          client,
          absence,
          "Discord-Nachricht gelöscht"
        );

      } else {
        missingCleaned++;

        await logAbsenceDeletion(
          client,
          absence,
          "Nachricht war bereits weg, Speicher bereinigt"
        );
      }

    } else {
      failed++;
    }
  }

  saveData(data);

  return {
    checked,
    deleted,
    missingCleaned,
    failed,
  };
}

// =====================================================
// INTERACTION BUTTONS
// =====================================================

async function handleAbsenceButton(
  client,
  interaction
) {
  if (!interaction.isButton()) {
    return false;
  }

  if (
    interaction.customId ===
      "family_absence"
  ) {
    await interaction.showModal(
      createAbsenceModal(
        interaction.member
      )
    );

    return true;
  }

  if (
    interaction.customId.startsWith(
      "absence_approve_"
    )
  ) {
    const absenceId =
      interaction.customId.replace(
        "absence_approve_",
        ""
      );

    await decideAbsence(
      client,
      interaction,
      absenceId,
      "Genehmigt"
    );

    return true;
  }

  if (
    interaction.customId.startsWith(
      "absence_reject_"
    )
  ) {
    const absenceId =
      interaction.customId.replace(
        "absence_reject_",
        ""
      );

    await decideAbsence(
      client,
      interaction,
      absenceId,
      "Abgelehnt"
    );

    return true;
  }

  return false;
}

// =====================================================
// INTERACTION MODAL
// =====================================================

async function handleAbsenceModal(
  client,
  interaction
) {
  if (!interaction.isModalSubmit()) {
    return false;
  }

  if (
    interaction.customId !==
      "absence_modal"
  ) {
    return false;
  }

  await submitAbsence(
    client,
    interaction
  );

  return true;
}

// =====================================================
// HAUPT-HANDLER
// =====================================================

async function handleAbsenceInteraction(
  client,
  interaction
) {
  if (
    await handleAbsenceButton(
      client,
      interaction
    )
  ) {
    return true;
  }

  if (
    await handleAbsenceModal(
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
  createAbsenceModal,
  createAbsenceEmbed,
  createAbsenceDecisionButtons,

  handleAbsenceInteraction,

  scanOldBotAbsences,
  cleanupExpiredAbsences,
};