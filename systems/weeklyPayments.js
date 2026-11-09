
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const CONFIG = require("../config");
const { loadData, saveData } = require("../utils/dataStore");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// CC WOCHENABGABE
// =====================================================

const WEEKLY_AMOUNT = 350000;
const PENALTY_AMOUNT = 100000;

// Nur Mitglieder mit dieser Rolle zahlen Wochenabgabe.
const MEMBER_ROLE_ID = "1542602740771983553";

// Nur diese Rolle darf die Wochenabgabe verwalten.
const LEADER_ROLE_ID = "1542602740784562234";

const TIMEZONE = "Europe/Berlin";
const PREFIX = "ccw_";

const activeSanctionRuns = new Set();

// =====================================================
// SLASH COMMAND
// =====================================================

const weeklyPanelCommand = new SlashCommandBuilder()
  .setName("wochenabgabe-panel")
  .setDescription(
    "Erstellt oder aktualisiert die CC-Wochenabgabenübersicht."
  );

// =====================================================
// BERECHTIGUNGEN
// =====================================================

function isLeader(member) {

  // CC_WEEKLY_EXTRA_ACCESS
  // Zusätzliche CC-Verwaltungsrollen.
  const extraRoles = ["1569147990080487434", "1568850050312831118"];

  if (
    extraRoles.some(roleId =>
      member?.roles?.cache?.has(roleId) ||
      (
        Array.isArray(member?.roles) &&
        member.roles.includes(roleId)
      )
    )
  ) {
    return true;
  }

  // CC_SUPERADMIN: voller Zugriff auf Verwaltungsaktionen.
  if (
    member?.roles?.cache?.has(CONFIG.fullAccessRoleId) ||
    (
      Array.isArray(member?.roles) &&
      member.roles.includes(CONFIG.fullAccessRoleId)
    )
  ) {
    return true;
  }

  return Boolean(
    member?.roles?.cache?.has(LEADER_ROLE_ID)
  );
}

// =====================================================
// GELD
// =====================================================

function money(amount) {
  return `${Number(amount || 0).toLocaleString("de-DE")}$`;
}

// =====================================================
// BERLIN-DATUM
// =====================================================

function berlinParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const p = Object.fromEntries(
    parts.map((x) => [x.type, x.value])
  );

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
  };
}

function dateKey(date) {
  const year = date.getUTCFullYear();

  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function germanDate(date) {
  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  return `${day}.${month}.${date.getUTCFullYear()}`;
}

// =====================================================
// SONNTAG BIS SONNTAG
// =====================================================

function getWeekRange() {
  const p = berlinParts();

  const today = new Date(
    Date.UTC(p.year, p.month - 1, p.day)
  );

  const daysSinceSunday = today.getUTCDay();

  const start = new Date(today);

  start.setUTCDate(
    start.getUTCDate() - daysSinceSunday
  );

  const end = new Date(start);

  end.setUTCDate(
    end.getUTCDate() + 7
  );

  return {
    id: dateKey(start),
    startDate: dateKey(start),
    endDate: dateKey(end),
    period:
      `${germanDate(start)} – ${germanDate(end)}`,
  };
}

function isWeekFinished(week) {
  if (!week?.endDate) {
    return false;
  }

  const p = berlinParts();

  const today =
    `${p.year}-` +
    `${String(p.month).padStart(2, "0")}-` +
    `${String(p.day).padStart(2, "0")}`;

  return today >= week.endDate;
}

// =====================================================
// DATENSPEICHER
// =====================================================

function getState(data) {
  if (!data.ccWeeklyDashboard) {
    data.ccWeeklyDashboard = {
      channelId: null,
      messageId: null,
      week: null,
    };
  }

  return data.ccWeeklyDashboard;
}

// =====================================================
// MITGLIEDERNAMEN
// =====================================================

function formatName(member) {
  return String(
    member.displayName ||
    member.user?.username ||
    "Unbekannt"
  )
    .replace(/^CC\s*I\s*/i, "")
    .replace(/@everyone|@here/gi, "Mitglied")
    .replace(/[\r\n]/g, " ")
    .replace(/([*_`~|>\\])/g, "\\$1")
    .slice(0, 70);
}

// =====================================================
// MITGLIEDER ÜBER REST LADEN
// =====================================================

async function listAllGuildMembers(guild) {
  const result = new Map();

  let after;

  while (true) {
    const batch = await guild.members.list({
      limit: 1000,
      after,
    });

    if (!batch.size) {
      break;
    }

    for (const member of batch.values()) {
      result.set(member.id, member);
    }

    if (batch.size < 1000) {
      break;
    }

    const lastId = Array.from(
      batch.keys()
    ).at(-1);

    if (!lastId || lastId === after) {
      throw new Error(
        "Mitgliederliste konnte nicht vollständig geladen werden."
      );
    }

    after = lastId;
  }

  return result.values();
}

// =====================================================
// NUR CC-FAMILIENROLLE ÜBERNEHMEN
// =====================================================

async function syncWeekMembers(guild, week) {
  const original = week.members || {};

  const eligible = {};

  const members = await listAllGuildMembers(guild);

  for (const member of members) {

    // Bots nicht aufnehmen.
    if (member.user?.bot) {
      continue;
    }

    // WICHTIG:
    // Nur Mitglieder mit der exakten Familienrolle.
    if (!member.roles.cache.has(MEMBER_ROLE_ID)) {
      continue;
    }

    const existing = original[member.id];

    // Keine neuen Personen rückwirkend in eine
    // bereits abgelaufene Woche aufnehmen.
    if (!existing && isWeekFinished(week)) {
      continue;
    }

    if (existing) {
      // Bereits gespeicherte Zahlungsdaten behalten.
      eligible[member.id] = {
        ...existing,
        name: formatName(member),
      };

    } else {
      // Neues berechtigtes Mitglied aufnehmen.
      eligible[member.id] = {
        name: formatName(member),
        status: "open",

        paidAt: null,
        paidBy: null,

        excusedAt: null,
        excusedBy: null,
        excusedReason: null,

        sanctionId: null,
      };
    }
  }

  // Alle ohne die richtige Rolle werden entfernt.
  const removed = Object.keys(original)
    .filter((id) => !eligible[id])
    .length;

  // Neue Mitglieder zählen.
  const added = Object.keys(eligible)
    .filter((id) => !original[id])
    .length;

  week.members = eligible;

  return {
    added,
    removed,
    total: Object.keys(eligible).length,
  };
}

// =====================================================
// NEUE WOCHE ERSTELLEN
// =====================================================

async function createWeek(guild) {
  const week = {
    ...getWeekRange(),

    amount: WEEKLY_AMOUNT,
    penalty: PENALTY_AMOUNT,

    createdAt: Date.now(),

    members: {},
  };

  await syncWeekMembers(guild, week);

  return week;
}

// =====================================================
// MITGLIEDER NACH STATUS
// =====================================================

function membersByStatus(week, status) {
  return Object.entries(
    week?.members || {}
  )
    .filter(
      ([, member]) => member.status === status
    )
    .sort(
      (a, b) =>
        a[1].name.localeCompare(
          b[1].name,
          "de"
        )
    );
}

function formatMemberList(items, symbol) {
  if (!items.length) {
    return "┖ Niemand";
  }

  let text = "";

  for (let i = 0; i < items.length; i++) {
    const line =
      `${i === items.length - 1 ? "┖" : "┃"} ` +
      `${symbol} ${items[i][1].name}`;

    if ((text + "\n" + line).length > 950) {
      text +=
        `\n… und ${items.length - i} weitere`;

      break;
    }

    text += (text ? "\n" : "") + line;
  }

  return text;
}

// =====================================================
// WOCHENABGABEN-EMBED
// =====================================================

function dashboardEmbed(week) {
  const paid = membersByStatus(week, "paid");
  const excused = membersByStatus(week, "excused");
  const open = membersByStatus(week, "open");

  const total = Object.keys(
    week.members || {}
  ).length;

  const lines = [
    `📅 **Woche:** ${week.period}`,
    "",

    "💰 **Wochenabgabe**",
    `┖ **${money(WEEKLY_AMOUNT)}**`,
    "",

    `👥 **Gesamt:** ${total}`,
    `✅ **Bezahlt:** ${paid.length}`,
    `🟡 **Entschuldigt:** ${excused.length}`,
    `❌ **Offen:** ${open.length}`,
    "",

    `✅ **Bezahlt (${paid.length})**`,
    formatMemberList(paid, "✅"),
    "",

    `🟡 **Entschuldigt (${excused.length})**`,
    formatMemberList(excused, "🟡"),
    "",

    `❌ **Offen (${open.length})**`,
    formatMemberList(open, "❌"),
  ];

  return new EmbedBuilder()
    .setColor(
      CONFIG.embedColor || 0x2b2d31
    )
    .setTitle("💸 • CC WOCHENABGABE")
    .setDescription(
      lines.join("\n").slice(0, 4000)
    )
    .setFooter({
      text:
        "CC • Wochenabgabe • Sonntag bis Sonntag",
    });
}

// =====================================================
// VERWALTUNGSBUTTONS
// =====================================================

function dashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ccw_paid")
        .setLabel("Bezahlt markieren")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ccw_undo_paid")
        .setLabel("Zahlung zurücknehmen")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ccw_excuse")
        .setLabel("Entschuldigen")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ccw_undo_excuse")
        .setLabel("Entschuldigung aufheben")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ccw_sanction")
        .setLabel("Offene sanktionieren")
        .setEmoji("⚠️")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("ccw_new_week")
        .setLabel("Neue Woche starten")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

// =====================================================
// DASHBOARD AKTUALISIEREN
// =====================================================

async function refreshDashboard(client, state) {
  if (
    !state.channelId ||
    !state.messageId ||
    !state.week
  ) {
    return false;
  }

  const channel = await client.channels
    .fetch(state.channelId)
    .catch(() => null);

  const message = await channel?.messages
    ?.fetch(state.messageId)
    .catch(() => null);

  if (!message) {
    return false;
  }

  await message.edit({
    embeds: [
      dashboardEmbed(state.week),
    ],
    components: dashboardButtons(),
  });

  return true;
}

// =====================================================
// DASHBOARD SENDEN / MITGLIEDER AKTUALISIEREN
// =====================================================

async function sendDashboard(client, interaction) {
  if (!isLeader(interaction.member)) {
    await safeReply(interaction, {
      content:
        "❌ Nur die Leaderschaft darf die Wochenabgabe verwalten.",
      ephemeral: true,
    });

    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);

  let changes;

  try {
    if (!state.week) {
      // Neue Wochenübersicht.
      state.week = await createWeek(
        interaction.guild
      );

      changes = {
        added: Object.keys(
          state.week.members
        ).length,
        removed: 0,
        total: Object.keys(
          state.week.members
        ).length,
      };

    } else {
      // WICHTIG:
      // Auch die bereits gespeicherte Woche
      // erneut mit der aktuellen Rollenliste abgleichen.
      changes = await syncWeekMembers(
        interaction.guild,
        state.week
      );
    }
  } catch (error) {
    console.error(
      "❌ CC-Wochenabgabe: Mitglieder konnten nicht geladen werden:",
      error
    );

    await interaction.editReply(
      "❌ Die Mitgliederrollen konnten nicht geprüft werden. Bitte erneut versuchen."
    );

    return;
  }

  saveData(data);

  // Bereits vorhandenes Panel aktualisieren.
  if (
    state.channelId === interaction.channelId &&
    await refreshDashboard(
      client,
      state
    ).catch(() => false)
  ) {
    await interaction.editReply(
      `✅ Wochenübersicht aktualisiert!\n` +
      `👥 Mitglieder mit Familienrolle: **${changes.total}**\n` +
      `➕ Neu aufgenommen: **${changes.added}**\n` +
      `➖ Ohne Rolle entfernt: **${changes.removed}**`
    );

    return;
  }

  // Neues Panel posten.
  const message = await sendToChannel(
    client,
    interaction.channelId,
    {
      embeds: [
        dashboardEmbed(state.week),
      ],
      components: dashboardButtons(),
    }
  );

  if (!message) {
    await interaction.editReply(
      "❌ Panel konnte nicht gepostet werden. Prüfe die Bot-Rechte im Kanal."
    );

    return;
  }

  state.channelId = interaction.channelId;
  state.messageId = message.id;

  saveData(data);

  await interaction.editReply(
    `✅ Wochenübersicht in <#${state.channelId}> veröffentlicht.`
  );
}

// =====================================================
// MITGLIED AUSWÄHLEN
// =====================================================

function memberSelect(action) {
  const placeholders = {
    paid: "Wen als bezahlt markieren?",
    undo_paid: "Bei wem Zahlung zurücknehmen?",
    excuse: "Wen entschuldigen?",
    undo_excuse: "Bei wem Entschuldigung aufheben?",
  };

  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(
        `${PREFIX}member_${action}`
      )
      .setPlaceholder(
        placeholders[action] ||
        "Mitglied auswählen"
      )
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// =====================================================
// ENTSCHULDIGUNGSFORMULAR
// =====================================================

function excuseModal(userId) {
  return new ModalBuilder()
    .setCustomId(
      `${PREFIX}excuse_modal_${userId}`
    )
    .setTitle("Mitglied entschuldigen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Grund der Entschuldigung")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true)
      )
    );
}

// =====================================================
// ZAHLUNGEN UND ENTSCHULDIGUNGEN
// =====================================================

async function selectMemberAction(
  client,
  interaction,
  action
) {
  const data = loadData();
  const state = getState(data);

  const targetId = interaction.values?.[0];

  const record = state.week?.members?.[targetId];

  if (!record) {
    await safeReply(interaction, {
      content:
        "❌ Mitglied gehört nicht zur aktuellen Wochenübersicht.",
      ephemeral: true,
    });

    return;
  }

  if (action === "excuse") {
    if (record.status === "paid") {
      await safeReply(interaction, {
        content:
          "❌ Zahlung erst zurücknehmen, bevor das Mitglied entschuldigt wird.",
        ephemeral: true,
      });

      return;
    }

    await interaction.showModal(
      excuseModal(targetId)
    );

    return;
  }

  if (action === "paid") {
    record.status = "paid";

    record.paidAt = Date.now();
    record.paidBy = interaction.user.id;

    record.excusedAt = null;
    record.excusedBy = null;
    record.excusedReason = null;

  } else if (action === "undo_paid") {
    if (record.status !== "paid") {
      await safeReply(interaction, {
        content:
          "❌ Mitglied ist nicht als bezahlt markiert.",
        ephemeral: true,
      });

      return;
    }

    record.status = "open";

    record.paidAt = null;
    record.paidBy = null;

  } else if (action === "undo_excuse") {
    if (record.status !== "excused") {
      await safeReply(interaction, {
        content:
          "❌ Mitglied ist nicht entschuldigt.",
        ephemeral: true,
      });

      return;
    }

    record.status = "open";

    record.excusedAt = null;
    record.excusedBy = null;
    record.excusedReason = null;

  } else {
    return;
  }

  saveData(data);

  const updated = await refreshDashboard(
    client,
    state
  ).catch(() => false);

  await safeReply(interaction, {
    content: updated
      ? "✅ Wochenübersicht aktualisiert."
      : "✅ Gespeichert, aber die Panel-Nachricht konnte nicht aktualisiert werden.",
    ephemeral: true,
  });
}

// =====================================================
// ENTSCHULDIGUNG SPEICHERN
// =====================================================

async function submitExcuse(
  client,
  interaction,
  userId
) {
  const data = loadData();
  const state = getState(data);

  const record = state.week?.members?.[userId];

  if (!record || record.status === "paid") {
    await safeReply(interaction, {
      content:
        "❌ Mitglied nicht gefunden oder bereits bezahlt.",
      ephemeral: true,
    });

    return;
  }

  const reason = interaction.fields
    .getTextInputValue("reason")
    .trim();

  if (!reason) {
    await safeReply(interaction, {
      content:
        "❌ Bitte einen Grund eingeben.",
      ephemeral: true,
    });

    return;
  }

  record.status = "excused";

  record.excusedAt = Date.now();
  record.excusedBy = interaction.user.id;
  record.excusedReason = reason.slice(0, 300);

  saveData(data);

  const updated = await refreshDashboard(
    client,
    state
  ).catch(() => false);

  await safeReply(interaction, {
    content: updated
      ? "✅ Mitglied entschuldigt."
      : "✅ Entschuldigt, Panel konnte nicht aktualisiert werden.",
    ephemeral: true,
  });
}

// =====================================================
// WOCHENABGABEN-SANKTION
// =====================================================

function makeWeeklySanction(
  userId,
  member,
  week,
  issuerId
) {
  const now = Date.now();

  const id =
    `ccw${now.toString(36)}` +
    `${Math.random().toString(36).slice(2, 6)}`;

  const reason =
    `Wochenabgabe nicht bezahlt (${week.period})`;

  return {
    id,

    targetId: userId,
    targetName: member.name,
    creatorId: issuerId,

    items: [
      {
        reason,
        amount: PENALTY_AMOUNT,
        special: null,
        note: null,
        catalogId: null,
      },
    ],

    totalAmount: PENALTY_AMOUNT,

    status: "open",
    createdAt: now,

    dueAt:
      now +
      Number(CONFIG.sanctionDueDays || 7) *
      86400000,

    messageId: null,

    paidBy: null,
    paidAt: null,

    cancelledBy: null,
    cancelledAt: null,

    overdueNotified: false,
  };
}

// =====================================================
// SANKTION IM SANKTIONSKANAL POSTEN
// =====================================================

async function postWeeklySanction(
  client,
  sanction
) {
  const deadline = Math.floor(
    sanction.dueAt / 1000
  );

  const message = await sendToChannel(
    client,
    CONFIG.sanctionChannelId,
    {
      content: `<@${sanction.targetId}>`,

      allowedMentions: {
        users: [sanction.targetId],
      },

      embeds: [
        new EmbedBuilder()
          .setColor(CONFIG.warningColor)
          .setTitle("🚫 SANKTION 🚫")
          .addFields(
            {
              name: "Name",
              value: `<@${sanction.targetId}>`,
            },
            {
              name: "Sanktion",
              value:
                `**${sanction.items[0].reason}**\n` +
                `┖ ${money(PENALTY_AMOUNT)}`,
            },
            {
              name: "Zu bezahlen",
              value:
                `**${money(PENALTY_AMOUNT)}**`,
              inline: true,
            },
            {
              name: "Sonderstrafe",
              value: "Keine",
              inline: true,
            },
            {
              name: "Zeitraum",
              value:
                `Frist: <t:${deadline}:F>\n` +
                `Restzeit: <t:${deadline}:R>`,
            },
            {
              name: "Ausgestellt von",
              value: `<@${sanction.creatorId}>`,
              inline: true,
            },
            {
              name: "Status",
              value: "⏳ Offen",
              inline: true,
            }
          )
          .setFooter({
            text:
              `${CONFIG.shortName || "CC"} • Sanktions-ID: ${sanction.id}`,
          }),
      ],

      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `sanction_paid_${sanction.id}`
            )
            .setEmoji("✅")
            .setLabel("Bezahlt markieren")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(
              `sanction_cancel_${sanction.id}`
            )
            .setEmoji("❌")
            .setLabel("Stornieren")
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    }
  );

  if (!message) {
    return false;
  }

  sanction.messageId = message.id;

  return true;
}

// =====================================================
// OFFENE WOCHENABGABEN SANKTIONIEREN
// =====================================================

async function sanctionOpenMembers(
  client,
  interaction,
  weekId
) {
  if (activeSanctionRuns.has(interaction.guildId)) {
    await safeReply(interaction, {
      content:
        "⏳ Eine Sanktionierung läuft bereits.",
      ephemeral: true,
    });

    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  activeSanctionRuns.add(
    interaction.guildId
  );

  try {
    const data = loadData();
    const state = getState(data);
    const week = state.week;

    if (!week || week.id !== weekId) {
      await interaction.editReply(
        "❌ Die Woche wurde inzwischen gewechselt."
      );

      return;
    }

    if (!isWeekFinished(week)) {
      await interaction.editReply(
        "❌ Sanktionen sind erst nach Ablauf der Wochenfrist möglich."
      );

      return;
    }

    // WICHTIG:
    // Vor der Sanktionierung die aktuellen Rollen
    // erneut überprüfen.
    try {
      await syncWeekMembers(
        interaction.guild,
        week
      );

      saveData(data);
    } catch (error) {
      console.error(
        "❌ Rollenprüfung vor Sanktionierung:",
        error
      );

      await interaction.editReply(
        "❌ Rollenprüfung fehlgeschlagen. Keine Sanktionen versendet."
      );

      return;
    }

    const targets = Object.entries(
      week.members
    ).filter(
      ([, member]) =>
        member.status === "open" &&
        !member.sanctionId
    );

    if (!targets.length) {
      await interaction.editReply(
        "ℹ️ Keine offenen, unbestraften Wochenabgaben vorhanden."
      );

      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const [userId, member] of targets) {
      const sanction = makeWeeklySanction(
        userId,
        member,
        week,
        interaction.user.id
      );

      const success = await postWeeklySanction(
        client,
        sanction
      );

      if (!success) {
        failCount++;
        continue;
      }

      if (!data.sanctions) {
        data.sanctions = {};
      }

      data.sanctions[sanction.id] = sanction;

      member.sanctionId = sanction.id;

      // Jede Sanktion einzeln speichern.
      saveData(data);

      successCount++;
    }

    await refreshDashboard(
      client,
      state
    ).catch(console.error);

    await interaction.editReply(
      `✅ **${successCount}** Sanktion(en) zu je **${money(PENALTY_AMOUNT)}** erstellt.` +
      (failCount
        ? ` ⚠️ ${failCount} fehlgeschlagen.`
        : "")
    );

  } finally {
    activeSanctionRuns.delete(
      interaction.guildId
    );
  }
}

// =====================================================
// NEUE WOCHE STARTEN
// =====================================================

async function startNewWeek(
  client,
  interaction
) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);
  const range = getWeekRange();

  if (state.week?.id === range.id) {
    await interaction.editReply(
      "ℹ️ Die Wochenübersicht ist bereits aktuell. Kein doppelter Reset."
    );

    return;
  }

  let nextWeek;

  try {
    nextWeek = await createWeek(
      interaction.guild
    );
  } catch (error) {
    console.error(
      "❌ Neue Woche konnte nicht erstellt werden:",
      error
    );

    await interaction.editReply(
      "❌ Mitglieder konnten nicht geladen werden."
    );

    return;
  }

  // Alte Woche archivieren.
  if (state.week) {
    data.ccWeeklyHistory ||= [];

    data.ccWeeklyHistory.unshift({
      ...state.week,
      archivedAt: Date.now(),
    });

    data.ccWeeklyHistory =
      data.ccWeeklyHistory.slice(0, 52);
  }

  state.week = nextWeek;

  saveData(data);

  const updated = await refreshDashboard(
    client,
    state
  ).catch(() => false);

  await interaction.editReply(
    updated
      ? `✅ Neue CC-Woche **${nextWeek.period}** gestartet.`
      : "✅ Neue Woche gespeichert. Bitte /wochenabgabe-panel erneut ausführen."
  );
}

// =====================================================
// INTERACTION-HANDLER
// =====================================================

async function handleWeeklyPaymentInteraction(
  client,
  interaction
) {
  // Slash-Command.
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "wochenabgabe-panel"
  ) {
    await sendDashboard(
      client,
      interaction
    );

    return true;
  }

  // Alte Panels.
  if (
    interaction.isButton() &&
    [
      "family_weekly_payment",
      "leader_weekly_manage",
    ].includes(interaction.customId)
  ) {
    await safeReply(interaction, {
      content:
        "ℹ️ Die Wochenabgabe wird über /wochenabgabe-panel von der Leaderschaft verwaltet.",
      ephemeral: true,
    });

    return true;
  }

  if (
    !(interaction.customId || "").startsWith(PREFIX)
  ) {
    return false;
  }

  // Ausschließlich Leaderschaft.
  if (!isLeader(interaction.member)) {
    await safeReply(interaction, {
      content:
        "❌ Nur die Leaderschaft darf die Wochenabgabe bedienen.",
      ephemeral: true,
    });

    return true;
  }

  // ===================================================
  // BUTTONS
  // ===================================================

  if (interaction.isButton()) {
    const id = interaction.customId;

    // Bezahlen / Entschuldigen.
    if (
      [
        "ccw_paid",
        "ccw_undo_paid",
        "ccw_excuse",
        "ccw_undo_excuse",
      ].includes(id)
    ) {
      const state = getState(
        loadData()
      );

      if (!state.week) {
        await safeReply(interaction, {
          content:
            "❌ Es wurde noch keine Woche erstellt.",
          ephemeral: true,
        });

        return true;
      }

      await safeReply(interaction, {
        content:
          "Wähle das Mitglied aus:",

        components: [
          memberSelect(
            id.slice(4)
          ),
        ],

        ephemeral: true,
      });

      return true;
    }

    // Neue Woche starten.
    if (id === "ccw_new_week") {
      await startNewWeek(
        client,
        interaction
      );

      return true;
    }

    // Offene Mitglieder sanktionieren.
    if (id === "ccw_sanction") {
      await interaction.deferReply({
        ephemeral: true,
      });

      const data = loadData();
      const state = getState(data);
      const week = state.week;

      if (!week) {
        await interaction.editReply(
          "❌ Noch keine Wochenübersicht vorhanden."
        );

        return true;
      }

      if (!isWeekFinished(week)) {
        await interaction.editReply(
          "❌ Sanktionen sind erst nach Ablauf der Woche möglich."
        );

        return true;
      }

      // Vor Bestätigung aktuelle Rollen überprüfen.
      try {
        await syncWeekMembers(
          interaction.guild,
          week
        );

        saveData(data);

        await refreshDashboard(
          client,
          state
        ).catch(() => false);

      } catch (error) {
        console.error(
          "❌ Rollenprüfung:",
          error
        );

        await interaction.editReply(
          "❌ Die Mitgliederrollen konnten nicht geprüft werden. Keine Sanktionen erstellt."
        );

        return true;
      }

      const count = Object.values(
        week.members
      ).filter(
        (member) =>
          member.status === "open" &&
          !member.sanctionId
      ).length;

      if (!count) {
        await interaction.editReply(
          "ℹ️ Keine offenen, unbestraften Wochenabgaben vorhanden."
        );

        return true;
      }

      await interaction.editReply({
        content:
          `⚠️ Wirklich **${count}** offene Wochenabgaben ` +
          `mit jeweils **${money(PENALTY_AMOUNT)}** sanktionieren?`,

        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `ccw_confirm_${week.id}`
              )
              .setLabel(
                "Ja, Sanktionen erstellen"
              )
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId(
                "ccw_cancel_confirm"
              )
              .setLabel("Abbrechen")
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
      });

      return true;
    }

    // Sanktionierung abbrechen.
    if (id === "ccw_cancel_confirm") {
      await interaction.update({
        content:
          "✅ Sanktionierung abgebrochen.",
        components: [],
      });

      return true;
    }

    // Sanktionierung bestätigen.
    if (id.startsWith("ccw_confirm_")) {
      await sanctionOpenMembers(
        client,
        interaction,
        id.slice("ccw_confirm_".length)
      );

      return true;
    }
  }

  // ===================================================
  // MITGLIEDERAUSWAHL
  // ===================================================

  if (
    interaction.isUserSelectMenu() &&
    interaction.customId.startsWith(
      "ccw_member_"
    )
  ) {
    await selectMemberAction(
      client,
      interaction,
      interaction.customId.slice(
        "ccw_member_".length
      )
    );

    return true;
  }

  // ===================================================
  // ENTSCHULDIGUNGSFORMULAR
  // ===================================================

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(
      "ccw_excuse_modal_"
    )
  ) {
    await submitExcuse(
      client,
      interaction,
      interaction.customId.slice(
        "ccw_excuse_modal_".length
      )
    );

    return true;
  }

  return false;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  weeklyPanelCommand,
  handleWeeklyPaymentInteraction,
};
