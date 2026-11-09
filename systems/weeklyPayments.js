
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

const MEMBER_ROLE_ID = "1542602740771983553";

const MANAGEMENT_ROLES = [
  "1542602740784562234", // Leaderschaft
  "1569147990080487434", // Wochenabgabenverwaltung
  "1568850050312831118", // Vollzugriff
];

const PREFIX = "ccw_";
const sanctionRuns = new Set();

// =====================================================
// SLASH COMMAND
// =====================================================

const weeklyPanelCommand = new SlashCommandBuilder()
  .setName("wochenabgabe-panel")
  .setDescription(
    "Veröffentlicht oder repariert das CC-Wochenabgabenpanel."
  );

// =====================================================
// BERECHTIGUNGEN
// =====================================================

function hasManagementRole(member) {
  const roles = member?.roles;

  return MANAGEMENT_ROLES.some(
    id =>
      roles?.cache?.has?.(id) ||
      (
        Array.isArray(roles) &&
        roles.includes(id)
      )
  );
}

// =====================================================
// GELD UND DATUM
// =====================================================

function money(n) {
  return `${Number(n || 0).toLocaleString("de-DE")}$`;
}

function berlinDateKey() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(x => [x.type, x.value])
  );

  return `${p.year}-${p.month}-${p.day}`;
}

function utcDate(key) {
  return new Date(`${key}T00:00:00.000Z`);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function german(key) {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

// =====================================================
// SONNTAG BIS SONNTAG
// =====================================================

function currentWeekRange() {
  const today = utcDate(berlinDateKey());

  today.setUTCDate(
    today.getUTCDate() - today.getUTCDay()
  );

  const end = new Date(today);

  end.setUTCDate(
    end.getUTCDate() + 7
  );

  return {
    id: iso(today),
    startDate: iso(today),
    endDate: iso(end),
    period:
      `${german(iso(today))} – ${german(iso(end))}`,
  };
}

function weekExpired(week) {
  return Boolean(
    week?.endDate &&
    berlinDateKey() >= week.endDate
  );
}

// =====================================================
// DATENSPEICHER
// =====================================================

function getState(data) {
  data.ccWeeklyDashboard ||= {
    channelId: null,
    messageId: null,
    week: null,
  };

  return data.ccWeeklyDashboard;
}

// =====================================================
// MITGLIEDERNAMEN
// =====================================================

function cleanName(member) {
  return String(
    member.displayName ||
    member.user?.username ||
    "Mitglied"
  )
    .replace(/^CC\s*I\s*/i, "")
    .replace(/@everyone|@here/gi, "Mitglied")
    .replace(/[\r\n]/g, " ")
    .replace(/([*_`~|>\\])/g, "\\$1")
    .slice(0, 70);
}

// =====================================================
// MITGLIEDER PER DISCORD REST LADEN
// =====================================================

async function listMembers(guild) {
  const all = new Map();

  let after;

  while (true) {
    const batch = await guild.members.list({
      limit: 1000,
      ...(after ? { after } : {}),
    });

    if (!batch.size) {
      break;
    }

    for (const [id, member] of batch) {
      all.set(id, member);
    }

    if (batch.size < 1000) {
      break;
    }

    const next = batch.lastKey();

    if (!next || next === after) {
      throw new Error(
        "Mitglieder-Paginierung konnte nicht fortgesetzt werden."
      );
    }

    after = next;
  }

  return all.values();
}

// =====================================================
// NEUER MITGLIEDEREINTRAG
// =====================================================

function newEntry(member) {
  return {
    name: cleanName(member),
    status: "open",

    paidAt: null,
    paidBy: null,

    excusedAt: null,
    excusedBy: null,
    excusedReason: null,

    sanctionId: null,
  };
}

// =====================================================
// MITGLIEDER MIT ROLLE ABGLEICHEN
// =====================================================

async function synchronizeMembers(guild, week) {
  const old = week.members || {};
  const selected = {};

  for (const member of await listMembers(guild)) {
    if (
      member.user?.bot ||
      !member.roles.cache.has(MEMBER_ROLE_ID)
    ) {
      continue;
    }

    // Keine neuen Mitglieder nach Ablauf
    // der betreffenden Woche aufnehmen.
    if (
      !old[member.id] &&
      weekExpired(week)
    ) {
      continue;
    }

    selected[member.id] = old[member.id]
      ? {
          ...old[member.id],
          name: cleanName(member),
        }
      : newEntry(member);
  }

  week.members = selected;

  return {
    total: Object.keys(selected).length,

    added: Object.keys(selected)
      .filter(id => !old[id])
      .length,

    removed: Object.keys(old)
      .filter(id => !selected[id])
      .length,
  };
}

// =====================================================
// NEUE WOCHE ERSTELLEN
// =====================================================

async function makeWeek(guild) {
  const week = {
    ...currentWeekRange(),

    amount: WEEKLY_AMOUNT,
    penalty: PENALTY_AMOUNT,

    createdAt: Date.now(),
    members: {},
  };

  await synchronizeMembers(guild, week);

  return week;
}

// =====================================================
// MITGLIEDER NACH STATUS
// =====================================================

function group(week, status) {
  return Object.entries(
    week.members || {}
  )
    .filter(
      ([, member]) =>
        member.status === status
    )
    .sort(
      (a, b) =>
        a[1].name.localeCompare(
          b[1].name,
          "de"
        )
    );
}

function displayGroup(entries, symbol) {
  if (!entries.length) {
    return "┖ Niemand";
  }

  let s = "";

  for (let i = 0; i < entries.length; i++) {
    const line =
      `${i === entries.length - 1 ? "┖" : "┃"} ` +
      `${symbol} ${entries[i][1].name}`;

    if ((s + "\n" + line).length > 900) {
      s +=
        `\n… und ${entries.length - i} weitere`;

      break;
    }

    s += (s ? "\n" : "") + line;
  }

  return s;
}

// =====================================================
// WOCHENABGABEN EMBED
// =====================================================

function panelEmbed(week) {
  const paid = group(week, "paid");
  const excused = group(week, "excused");
  const open = group(week, "open");

  const lines = [
    `📅 **Woche:** ${week.period}`,
    "",

    `💰 **Wochenabgabe:** ${money(WEEKLY_AMOUNT)}`,
    "",

    `👥 **Gesamt:** ${
      Object.keys(week.members || {}).length
    }`,

    `✅ **Bezahlt:** ${paid.length}`,
    `🟡 **Entschuldigt:** ${excused.length}`,
    `❌ **Offen:** ${open.length}`,
    "",

    `✅ **Bezahlt (${paid.length})**`,
    displayGroup(paid, "✅"),
    "",

    `🟡 **Entschuldigt (${excused.length})**`,
    displayGroup(excused, "🟡"),
    "",

    `❌ **Offen (${open.length})**`,
    displayGroup(open, "❌"),
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
// BUTTON HILFSFUNKTION
// =====================================================

function button(id, label, emoji, style) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style);
}

// =====================================================
// PANEL BUTTONS
// =====================================================

function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      button(
        "ccw_paid",
        "Bezahlt markieren",
        "✅",
        ButtonStyle.Success
      ),

      button(
        "ccw_undo_paid",
        "Zahlung zurücknehmen",
        "↩️",
        ButtonStyle.Secondary
      )
    ),

    new ActionRowBuilder().addComponents(
      button(
        "ccw_excuse",
        "Entschuldigen",
        "🟡",
        ButtonStyle.Primary
      ),

      button(
        "ccw_undo_excuse",
        "Entschuldigung aufheben",
        "↩️",
        ButtonStyle.Secondary
      )
    ),

    new ActionRowBuilder().addComponents(
      button(
        "ccw_sanction",
        "Offene sanktionieren",
        "⚠️",
        ButtonStyle.Danger
      ),

      button(
        "ccw_new_week",
        "Neue Woche starten",
        "🔄",
        ButtonStyle.Primary
      )
    ),
  ];
}

// =====================================================
// PANEL NACHRICHT
// =====================================================

function panelPayload(week) {
  return {
    embeds: [
      panelEmbed(week),
    ],

    components: panelButtons(),
  };
}

// =====================================================
// DASHBOARD SICHER AKTUALISIEREN
// =====================================================

async function refreshPanel(client, state) {
  if (!state.week) {
    return {
      ok: false,
      reason: "Keine Woche gespeichert.",
    };
  }

  if (
    !state.channelId ||
    !state.messageId
  ) {
    return {
      ok: false,
      missing: true,
      reason:
        "Panel-Kanal oder Nachrichten-ID fehlt.",
    };
  }

  try {
    // Kanal laden.
    const channel = await client.channels.fetch(
      state.channelId
    );

    if (!channel?.messages) {
      throw new Error(
        "Kanal ist kein lesbarer Textkanal."
      );
    }

    // Gespeicherte Nachricht laden.
    const message = await channel.messages.fetch(
      state.messageId
    );

    // Nur Nachrichten des eigenen Bots bearbeiten.
    if (message.author?.id !== client.user.id) {
      throw new Error(
        "Die gespeicherte Nachricht stammt nicht von diesem Bot."
      );
    }

    // Inhalt und Buttons aktualisieren.
    await message.edit(
      panelPayload(state.week)
    );

    return {
      ok: true,
    };

  } catch (error) {
    const missing = [
      10003,
      10008,
    ].includes(Number(error.code));

    // WICHTIG:
    // Fehler nicht mehr verschlucken.
    console.error(
      "❌ CC-Wochenabgabe: Panel konnte nicht aktualisiert werden:",
      {
        channelId: state.channelId,
        messageId: state.messageId,
        code: error.code,
        message: error.message,
      }
    );

    return {
      ok: false,
      missing,
      reason: String(
        error.message || error
      ),
    };
  }
}

// =====================================================
// PANEL VERÖFFENTLICHEN ODER REPARIEREN
// =====================================================

async function postPanel(client, interaction) {
  if (!hasManagementRole(interaction.member)) {
    return safeReply(interaction, {
      content:
        "❌ Keine Berechtigung für Wochenabgaben.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);

  let changes;

  try {
    if (!state.week) {
      state.week = await makeWeek(
        interaction.guild
      );

      changes = {
        total: Object.keys(
          state.week.members
        ).length,
        added: 0,
        removed: 0,
      };

    } else {
      changes = await synchronizeMembers(
        interaction.guild,
        state.week
      );
    }

  } catch (error) {
    console.error(
      "❌ CC-Wochenabgabe: Mitglieder laden:",
      error
    );

    return interaction.editReply(
      "❌ Mitglieder konnten nicht geladen werden. Siehe Railway-Logs."
    );
  }

  saveData(data);

  // ===================================================
  // VORHANDENES PANEL AKTUALISIEREN
  // ===================================================

  if (
    state.channelId === interaction.channelId &&
    state.messageId
  ) {
    const result = await refreshPanel(
      client,
      state
    );

    if (result.ok) {
      return interaction.editReply(
        `✅ Panel aktualisiert.\n` +
        `👥 Mitglieder: ${changes.total}\n` +
        `➕ Neu: ${changes.added}\n` +
        `➖ Entfernt: ${changes.removed}`
      );
    }

    // Bei Berechtigungsfehlern nicht unkontrolliert
    // weitere Panels posten.
    if (!result.missing) {
      return interaction.editReply(
        `❌ Panel konnte nicht bearbeitet werden: ` +
        `${result.reason.slice(0, 250)}.\n` +
        "Prüfe die Bot-Rechte. Die Woche wurde nicht zurückgesetzt."
      );
    }
  }

  // ===================================================
  // PANEL FEHLT: WIEDERHERSTELLEN
  // ===================================================

  const message = await sendToChannel(
    client,
    interaction.channelId,
    panelPayload(state.week)
  );

  if (!message) {
    return interaction.editReply(
      "❌ Panel konnte nicht gepostet werden. Prüfe die Railway-Logs."
    );
  }

  // Neue Nachrichten-ID sichern.
  state.channelId = interaction.channelId;
  state.messageId = message.id;

  saveData(data);

  return interaction.editReply(
    "✅ Wochenabgabenpanel veröffentlicht.\n" +
    "Die aktuelle Woche und alle Zahlungen bleiben erhalten."
  );
}

// =====================================================
// MITGLIEDERAUSWAHL
// =====================================================

function selectMenu(action) {
  const labels = {
    paid: "Wen als bezahlt markieren?",
    undo_paid: "Bei wem Zahlung zurücknehmen?",
    excuse: "Wen entschuldigen?",
    undo_excuse:
      "Bei wem Entschuldigung aufheben?",
  };

  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(
        `${PREFIX}member_${action}`
      )
      .setPlaceholder(
        labels[action] ||
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

async function editMember(
  client,
  interaction,
  action
) {
  const data = loadData();
  const state = getState(data);

  const id = interaction.values?.[0];
  const entry = state.week?.members?.[id];

  if (!entry) {
    return safeReply(interaction, {
      content:
        "❌ Mitglied gehört nicht zur aktuellen Woche. Bitte Panel aktualisieren.",
      ephemeral: true,
    });
  }

  if (action === "excuse") {
    if (entry.status === "paid") {
      return safeReply(interaction, {
        content:
          "❌ Zahlung zuerst zurücknehmen.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      excuseModal(id)
    );
  }

  // Discord-Interaktion frühzeitig bestätigen.
  await interaction.deferReply({
    ephemeral: true,
  });

  if (action === "paid") {
    entry.status = "paid";

    entry.paidAt = Date.now();
    entry.paidBy = interaction.user.id;

    entry.excusedAt = null;
    entry.excusedBy = null;
    entry.excusedReason = null;

  } else if (action === "undo_paid") {
    if (entry.status !== "paid") {
      return interaction.editReply(
        "❌ Mitglied ist nicht als bezahlt markiert."
      );
    }

    entry.status = "open";
    entry.paidAt = null;
    entry.paidBy = null;

  } else if (action === "undo_excuse") {
    if (entry.status !== "excused") {
      return interaction.editReply(
        "❌ Mitglied ist nicht entschuldigt."
      );
    }

    entry.status = "open";

    entry.excusedAt = null;
    entry.excusedBy = null;
    entry.excusedReason = null;

  } else {
    return interaction.editReply(
      "❌ Unbekannte Aktion."
    );
  }

  // Zahlung zuerst dauerhaft speichern.
  saveData(data);

  const result = await refreshPanel(
    client,
    state
  );

  if (result.ok) {
    return interaction.editReply(
      "✅ Gespeichert und Wochenübersicht aktualisiert."
    );
  }

  return interaction.editReply(
    "✅ Zahlung gespeichert.\n" +
    `⚠️ Panel nicht aktualisiert: ` +
    `${result.reason.slice(0, 250)}.\n` +
    "Führe /wochenabgabe-panel im Abgabenkanal aus, um es zu reparieren."
  );
}

// =====================================================
// ENTSCHULDIGUNG SPEICHERN
// =====================================================

async function submitExcuse(
  client,
  interaction,
  id
) {
  const data = loadData();
  const state = getState(data);

  const entry = state.week?.members?.[id];

  if (
    !entry ||
    entry.status === "paid"
  ) {
    return safeReply(interaction, {
      content:
        "❌ Mitglied nicht vorhanden oder bereits bezahlt.",
      ephemeral: true,
    });
  }

  const reason = interaction.fields
    .getTextInputValue("reason")
    .trim();

  if (!reason) {
    return safeReply(interaction, {
      content:
        "❌ Bitte Grund angeben.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  entry.status = "excused";

  entry.excusedAt = Date.now();
  entry.excusedBy = interaction.user.id;
  entry.excusedReason = reason.slice(0, 300);

  saveData(data);

  const result = await refreshPanel(
    client,
    state
  );

  if (result.ok) {
    return interaction.editReply(
      "✅ Entschuldigt und Wochenübersicht aktualisiert."
    );
  }

  return interaction.editReply(
    "✅ Entschuldigt.\n" +
    `⚠️ Panel nicht aktualisiert: ` +
    `${result.reason.slice(0, 250)}.\n` +
    "Mit /wochenabgabe-panel kannst du die Übersicht reparieren."
  );
}

// =====================================================
// WOCHENABGABEN-SANKTION ERSTELLEN
// =====================================================

function newSanction(
  userId,
  member,
  week,
  creatorId
) {
  const now = Date.now();

  const id =
    `ccw${now.toString(36)}` +
    `${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,

    targetId: userId,
    targetName: member.name,
    creatorId,

    items: [
      {
        reason:
          `Wochenabgabe nicht bezahlt (${week.period})`,

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
// SANKTION VERÖFFENTLICHEN
// =====================================================

async function publishSanction(
  client,
  sanction
) {
  const due = Math.floor(
    sanction.dueAt / 1000
  );

  const embed = new EmbedBuilder()
    .setColor(
      CONFIG.warningColor || 0xf1c40f
    )
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
          `Frist: <t:${due}:F>\n` +
          `Restzeit: <t:${due}:R>`,
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
        `${CONFIG.shortName || "CC"} • ` +
        `Sanktions-ID: ${sanction.id}`,
    });

  const components = [
    new ActionRowBuilder().addComponents(
      button(
        `sanction_paid_${sanction.id}`,
        "Bezahlt markieren",
        "✅",
        ButtonStyle.Success
      ),
      button(
        `sanction_cancel_${sanction.id}`,
        "Stornieren",
        "❌",
        ButtonStyle.Danger
      )
    ),
  ];

  const msg = await sendToChannel(
    client,
    CONFIG.sanctionChannelId,
    {
      content: `<@${sanction.targetId}>`,

      allowedMentions: {
        users: [
          sanction.targetId,
        ],
      },

      embeds: [embed],
      components,
    }
  );

  if (!msg) {
    return false;
  }

  sanction.messageId = msg.id;

  return true;
}

// =====================================================
// OFFENE WOCHENABGABEN SANKTIONIEREN
// =====================================================

async function sanctionOpen(
  client,
  interaction,
  weekId
) {
  if (sanctionRuns.has(interaction.guildId)) {
    return safeReply(interaction, {
      content:
        "⏳ Die Sanktionierung läuft bereits.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  sanctionRuns.add(
    interaction.guildId
  );

  try {
    const data = loadData();
    const state = getState(data);
    const week = state.week;

    if (
      !week ||
      week.id !== weekId
    ) {
      return interaction.editReply(
        "❌ Die Woche hat sich geändert."
      );
    }

    if (!weekExpired(week)) {
      return interaction.editReply(
        "❌ Die Frist ist noch nicht abgelaufen."
      );
    }

    // Rollen vor Sanktionierung kontrollieren.
    try {
      await synchronizeMembers(
        interaction.guild,
        week
      );

      saveData(data);

    } catch (error) {
      console.error(
        "❌ Wochenabgabe: Rollenprüfung vor Sanktionen:",
        error
      );

      return interaction.editReply(
        "❌ Rollenprüfung fehlgeschlagen. Keine Sanktionen gesendet."
      );
    }

    const targets = Object.entries(
      week.members
    ).filter(
      ([, e]) =>
        e.status === "open" &&
        !e.sanctionId
    );

    if (!targets.length) {
      return interaction.editReply(
        "ℹ️ Keine offenen, unbestraften Abgaben."
      );
    }

    let ok = 0;
    let failed = 0;

    for (const [id, member] of targets) {
      const sanction = newSanction(
        id,
        member,
        week,
        interaction.user.id
      );

      if (
        !await publishSanction(
          client,
          sanction
        )
      ) {
        failed++;
        continue;
      }

      data.sanctions ||= {};

      data.sanctions[sanction.id] =
        sanction;

      member.sanctionId = sanction.id;

      saveData(data);

      ok++;
    }

    await refreshPanel(
      client,
      state
    );

    return interaction.editReply(
      `✅ ${ok} Sanktion(en) zu je ` +
      `${money(PENALTY_AMOUNT)} erstellt.` +
      (
        failed
          ? ` ⚠️ ${failed} fehlgeschlagen.`
          : ""
      )
    );

  } finally {
    sanctionRuns.delete(
      interaction.guildId
    );
  }
}

// =====================================================
// NEUE WOCHE STARTEN
// =====================================================

async function newWeek(
  client,
  interaction
) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);

  if (
    state.week?.id === currentWeekRange().id
  ) {
    return interaction.editReply(
      "ℹ️ Die Woche ist bereits aktuell. Kein doppelter Reset."
    );
  }

  let week;

  try {
    week = await makeWeek(
      interaction.guild
    );

  } catch (error) {
    console.error(
      "❌ Wochenabgabe: Neue Woche:",
      error
    );

    return interaction.editReply(
      "❌ Mitglieder konnten nicht geladen werden."
    );
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

  state.week = week;

  saveData(data);

  const result = await refreshPanel(
    client,
    state
  );

  if (result.ok) {
    return interaction.editReply(
      `✅ Neue Woche ${week.period} gestartet.`
    );
  }

  return interaction.editReply(
    "✅ Neue Woche gespeichert.\n" +
    `⚠️ Panel-Aktualisierung fehlgeschlagen: ` +
    `${result.reason.slice(0, 200)}.`
  );
}

// =====================================================
// HAUPT-HANDLER
// =====================================================

async function handleWeeklyPaymentInteraction(
  client,
  interaction
) {
  // ===================================================
  // SLASH COMMAND
  // ===================================================

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName ===
      "wochenabgabe-panel"
  ) {
    await postPanel(
      client,
      interaction
    );

    return true;
  }

  // ===================================================
  // ALTE PANELBUTTONS
  // ===================================================

  if (
    interaction.isButton() &&
    [
      "family_weekly_payment",
      "leader_weekly_manage",
    ].includes(interaction.customId)
  ) {
    await safeReply(interaction, {
      content:
        "ℹ️ Nutze /wochenabgabe-panel.",
      ephemeral: true,
    });

    return true;
  }

  if (
    !String(
      interaction.customId || ""
    ).startsWith(PREFIX)
  ) {
    return false;
  }

  // ===================================================
  // BERECHTIGUNGSKONTROLLE
  // ===================================================

  if (!hasManagementRole(interaction.member)) {
    await safeReply(interaction, {
      content:
        "❌ Nur Leaderschaft, Wochenabgabenverwaltung und Vollzugriff dürfen dies benutzen.",
      ephemeral: true,
    });

    return true;
  }

  // ===================================================
  // BUTTONS
  // ===================================================

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (
      [
        "ccw_paid",
        "ccw_undo_paid",
        "ccw_excuse",
        "ccw_undo_excuse",
      ].includes(id)
    ) {
      if (!getState(loadData()).week) {
        await safeReply(interaction, {
          content:
            "❌ Noch keine Woche erstellt.",
          ephemeral: true,
        });

      } else {
        await safeReply(interaction, {
          content:
            "Wähle das Mitglied aus:",

          components: [
            selectMenu(id.slice(4)),
          ],

          ephemeral: true,
        });
      }

      return true;
    }

    // Neue Woche.
    if (id === "ccw_new_week") {
      await newWeek(
        client,
        interaction
      );

      return true;
    }

    // Offene Sanktionen.
    if (id === "ccw_sanction") {
      await interaction.deferReply({
        ephemeral: true,
      });

      const data = loadData();
      const state = getState(data);
      const week = state.week;

      if (!week) {
        await interaction.editReply(
          "❌ Keine Woche vorhanden."
        );

        return true;
      }

      if (!weekExpired(week)) {
        await interaction.editReply(
          "❌ Woche noch nicht abgelaufen."
        );

        return true;
      }

      try {
        await synchronizeMembers(
          interaction.guild,
          week
        );

        saveData(data);

        await refreshPanel(
          client,
          state
        );

      } catch (error) {
        console.error(
          "❌ Wochenabgabe: Rollenprüfung:",
          error
        );

        await interaction.editReply(
          "❌ Rollenprüfung fehlgeschlagen; keine Sanktionen gesendet."
        );

        return true;
      }

      const count = Object.values(
        week.members
      ).filter(
        e =>
          e.status === "open" &&
          !e.sanctionId
      ).length;

      if (!count) {
        await interaction.editReply(
          "ℹ️ Keine offenen, unbestraften Abgaben."
        );

        return true;
      }

      await interaction.editReply({
        content:
          `⚠️ Wirklich ${count} offene ` +
          `Wochenabgaben zu je ` +
          `${money(PENALTY_AMOUNT)} sanktionieren?`,

        components: [
          new ActionRowBuilder().addComponents(
            button(
              `ccw_confirm_${week.id}`,
              "Ja, Sanktionen erstellen",
              "⚠️",
              ButtonStyle.Danger
            ),

            button(
              "ccw_cancel_confirm",
              "Abbrechen",
              "↩️",
              ButtonStyle.Secondary
            )
          ),
        ],
      });

      return true;
    }

    // Bestätigung abbrechen.
    if (id === "ccw_cancel_confirm") {
      await interaction.update({
        content:
          "✅ Abgebrochen.",
        components: [],
      });

      return true;
    }

    // Sanktionen bestätigen.
    if (
      id.startsWith("ccw_confirm_")
    ) {
      await sanctionOpen(
        client,
        interaction,
        id.slice(
          "ccw_confirm_".length
        )
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
    await editMember(
      client,
      interaction,
      interaction.customId.slice(
        "ccw_member_".length
      )
    );

    return true;
  }

  // ===================================================
  // ENTSCHULDIGUNG
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
