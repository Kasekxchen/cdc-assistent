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
const { loadData, saveData } = require("../utils/dataStore");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// CC KAMPFTRAINING – KONFIGURATION
// =====================================================

const CREATE_BUTTON = "leader_create_combat";
const PREFIX = "cccombat_";

// Ausschließlich diese zwei Rollen dürfen Trainings
// erstellen, bearbeiten, absagen, schließen und öffnen.
const MANAGEMENT_ROLE_IDS = [
  "1568850050312831118",
  "1542602740784562234", // Leaderschaft
  "1542602740771983554", // Kampfausbilder
];

// =====================================================
// BERECHTIGUNGEN
// =====================================================

function hasRole(member, ids) {
  const roles = member?.roles;

  if (!roles || !Array.isArray(ids)) {
    return false;
  }

  if (typeof roles.cache?.has === "function") {
    return ids.some(id => roles.cache.has(id));
  }

  if (Array.isArray(roles)) {
    return ids.some(id => roles.includes(id));
  }

  return false;
}

function canManage(member) {
  return hasRole(member, MANAGEMENT_ROLE_IDS);
}

function canParticipate(member) {
  return (
    canManage(member) ||
    hasRole(member, [CONFIG.familyMemberRoleId])
  );
}

// =====================================================
// DATUM UND UHRZEIT
// =====================================================

function getBerlinNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const p = Object.fromEntries(
    parts.map(item => [item.type, item.value])
  );

  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

function validSchedule(dateText, timeText) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateText);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText);

  if (!m || !t) {
    return "❌ Datum TT.MM.JJJJ und Uhrzeit HH:MM eingeben.";
  }

  const [, day, month, year] = m;

  const d = new Date(
    Date.UTC(+year, +month - 1, +day)
  );

  if (
    d.getUTCFullYear() !== +year ||
    d.getUTCMonth() !== +month - 1 ||
    d.getUTCDate() !== +day
  ) {
    return "❌ Dieses Datum existiert nicht.";
  }

  const now = getBerlinNow();
  const date = `${year}-${month}-${day}`;

  if (
    date < now.date ||
    (date === now.date && timeText < now.time)
  ) {
    return "❌ Das Training darf nicht in der Vergangenheit liegen.";
  }

  return null;
}

// =====================================================
// TEILNEHMER
// =====================================================

function escapeName(name) {
  return String(name || "Mitglied")
    .replace(/@everyone|@here/gi, "Mitglied")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
}

function userList(event, status) {
  return Object.entries(event.users || {})
    .filter(([, entry]) => entry.status === status)
    .sort(
      (a, b) =>
        Number(a[1].changedAt || 0) -
        Number(b[1].changedAt || 0)
    )
    .map(([id, entry]) => ({
      id,
      name: escapeName(entry.name),
    }));
}

function formatUsers(users) {
  if (!users.length) {
    return "—";
  }

  let result = "";

  for (const [i, user] of users.entries()) {
    const line =
      `${i === users.length - 1 ? "┖" : "┃"} ${user.name}`;

    if ((result + "\n" + line).length > 890) {
      return (
        result +
        `\n… und weitere (${users.length - i})`
      );
    }

    result += (result ? "\n" : "") + line;
  }

  return result;
}

// =====================================================
// EVENT EMBED
// =====================================================

function eventEmbed(event) {
  const present = userList(event, "present");
  const absent = userList(event, "absent");
  const unsure = userList(event, "unsure");

  const status =
    event.status === "cancelled"
      ? "🛑 Abgesagt"
      : event.status === "closed"
        ? "🔒 Geschlossen"
        : "✅ Offen";

  return new EmbedBuilder()
    .setColor(
      event.status === "cancelled"
        ? CONFIG.dangerColor
        : event.status === "closed"
          ? CONFIG.warningColor
          : CONFIG.embedColor
    )
    .setTitle(
      event.status === "cancelled"
        ? "🛑 • CC KAMPFTRAINING ABGESAGT"
        : "🎯 • CC KAMPFTRAINING"
    )
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        `🥊 **Training:** ${event.title}`,
        `📅 **Datum:** ${event.dateText}`,
        `🕘 **Uhrzeit:** ${event.timeText} Uhr`,
        `📍 **Treffpunkt:** ${event.placeText}`,
        `📌 **Status:** ${status}`,
        "",
        "📝 **Trainingsinhalt**",
        event.description,
        "",
        `👑 **Erstellt von:** <@${event.creatorId}>`,
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .addFields(
      {
        name: `✅ Dabei (${present.length})`,
        value: formatUsers(present),
        inline: true,
      },
      {
        name: `❌ Nicht dabei (${absent.length})`,
        value: formatUsers(absent),
        inline: true,
      },
      {
        name: `⏳ Ungewiss (${unsure.length})`,
        value: formatUsers(unsure),
        inline: false,
      }
    )
    .setFooter({
      text: `${CONFIG.shortName} • Training-ID: ${event.id}`,
    });
}

// =====================================================
// EVENT BUTTONS
// =====================================================

function eventButtons(event) {
  const disabled = event.status !== "open";

  // Die erste Reihe ist für Teilnehmer.
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}present_${event.id}`)
        .setEmoji("✅")
        .setLabel(`${userList(event, "present").length}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(`${PREFIX}absent_${event.id}`)
        .setEmoji("❌")
        .setLabel(`${userList(event, "absent").length}`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(`${PREFIX}unsure_${event.id}`)
        .setEmoji("⏳")
        .setLabel(`${userList(event, "unsure").length}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    ),
  ];

  // Die zweite Reihe ist ausschließlich für die
  // Leaderschaft und Kampfausbilder.
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}edit_${event.id}`)
        .setEmoji("✏️")
        .setLabel("Bearbeiten")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`${PREFIX}cancel_${event.id}`)
        .setEmoji("🛑")
        .setLabel("Absagen")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(event.status !== "open"),

      new ButtonBuilder()
        .setCustomId(`${PREFIX}close_${event.id}`)
        .setEmoji("🔒")
        .setLabel("Schließen")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(event.status !== "open"),

      new ButtonBuilder()
        .setCustomId(`${PREFIX}reopen_${event.id}`)
        .setEmoji("🔓")
        .setLabel("Wiederöffnen")
        .setStyle(ButtonStyle.Success)
        .setDisabled(event.status === "open")
    )
  );

  return rows;
}

// =====================================================
// FORMULAR FÜR ERSTELLEN UND BEARBEITEN
// =====================================================

function trainingModal(event = null) {
  const modal = new ModalBuilder()
    .setCustomId(
      event
        ? `${PREFIX}editmodal_${event.id}`
        : `${PREFIX}createmodal`
    )
    .setTitle(
      event
        ? "🎯 Kampftraining bearbeiten"
        : "🎯 Kampftraining erstellen"
    );

  const fields = [
    [
      "title",
      "Titel",
      "z. B. Paintball-Training",
      80,
      false,
    ],
    [
      "date",
      "Datum (TT.MM.JJJJ)",
      "z. B. 15.11.2026",
      10,
      false,
    ],
    [
      "time",
      "Uhrzeit (HH:MM)",
      "z. B. 20:00",
      5,
      false,
    ],
    [
      "place",
      "Treffpunkt",
      "z. B. Anwesen",
      100,
      false,
    ],
    [
      "description",
      "Was wird trainiert?",
      "Trainingsablauf und Hinweise ...",
      800,
      true,
    ],
  ];

  const oldValues = event
    ? [
        event.title,
        event.dateText,
        event.timeText,
        event.placeText,
        event.description,
      ]
    : [];

  fields.forEach(
    ([id, label, placeholder, maxLength, paragraph], index) => {
      const input = new TextInputBuilder()
        .setCustomId(`${PREFIX}${id}`)
        .setLabel(label)
        .setPlaceholder(placeholder)
        .setStyle(
          paragraph
            ? TextInputStyle.Paragraph
            : TextInputStyle.Short
        )
        .setMaxLength(maxLength)
        .setRequired(true);

      if (oldValues[index]) {
        input.setValue(
          String(oldValues[index]).slice(0, maxLength)
        );
      }

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );
    }
  );

  return modal;
}

function getModalValues(interaction) {
  const get = name =>
    interaction.fields
      .getTextInputValue(`${PREFIX}${name}`)
      .trim();

  return {
    title: get("title"),
    dateText: get("date"),
    timeText: get("time"),
    placeText: get("place"),
    description: get("description"),
  };
}

// =====================================================
// TRAININGSNACHRICHT AKTUALISIEREN
// =====================================================

async function refreshEvent(client, event) {
  const channel = await client.channels
    .fetch(CONFIG.combatTrainingChannelId)
    .catch(() => null);

  if (!channel?.messages) {
    throw new Error(
      "Kampftraining-Channel nicht gefunden."
    );
  }

  const message = await channel.messages
    .fetch(event.messageId)
    .catch(() => null);

  if (!message) {
    throw new Error(
      "Training-Nachricht nicht gefunden."
    );
  }

  await message.edit({
    embeds: [eventEmbed(event)],
    components: eventButtons(event),
  });
}

// =====================================================
// BENACHRICHTIGUNGEN
// =====================================================

async function announce(client, event, message) {
  const roleId = CONFIG.familyMemberRoleId;

  await sendToChannel(
    client,
    CONFIG.combatTrainingChannelId,
    {
      content: [
        roleId ? `<@&${roleId}>` : "",
        message,
        `🎯 **${event.title}** | 📅 ${event.dateText} | 🕘 ${event.timeText} Uhr`,
      ]
        .filter(Boolean)
        .join("\n"),

      allowedMentions: {
        roles: roleId ? [roleId] : [],
      },
    }
  );
}

// =====================================================
// TRAINING ERSTELLEN
// =====================================================

async function createTraining(client, interaction) {
  const values = getModalValues(interaction);

  const invalid = validSchedule(
    values.dateText,
    values.timeText
  );

  if (invalid) {
    return safeReply(interaction, {
      content: invalid,
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const event = {
    ...values,

    id:
      `ct${Date.now().toString(36)}` +
      `${Math.random().toString(36).slice(2, 6)}`,

    creatorId: interaction.user.id,
    guildId: interaction.guildId,

    status: "open",
    users: {},

    createdAt: Date.now(),
    updatedAt: Date.now(),

    messageId: null,
  };

  const roleId = CONFIG.familyMemberRoleId;

  const message = await sendToChannel(
    client,
    CONFIG.combatTrainingChannelId,
    {
      content: roleId ? `<@&${roleId}>` : "",

      embeds: [
        eventEmbed(event),
      ],

      components: eventButtons(event),

      allowedMentions: {
        roles: roleId ? [roleId] : [],
      },
    }
  );

  if (!message) {
    return interaction.editReply(
      "❌ Training konnte nicht gepostet werden. Kanal und Bot-Rechte prüfen."
    );
  }

  event.messageId = message.id;

  const data = loadData();

  data.combatTrainings ||= {};
  data.combatTrainings[event.id] = event;

  saveData(data);

  return interaction.editReply(
    `✅ Kampftraining erstellt in <#${CONFIG.combatTrainingChannelId}>.`
  );
}

// =====================================================
// TRAINING BEARBEITEN
// =====================================================

async function editTraining(client, interaction, eventId) {
  const values = getModalValues(interaction);

  const invalid = validSchedule(
    values.dateText,
    values.timeText
  );

  if (invalid) {
    return safeReply(interaction, {
      content: invalid,
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const event = data.combatTrainings?.[eventId];

  if (!event) {
    return interaction.editReply(
      "❌ Training nicht gefunden."
    );
  }

  Object.assign(event, values, {
    updatedAt: Date.now(),
    lastEditedBy: interaction.user.id,
  });

  await refreshEvent(client, event);

  saveData(data);

  await announce(
    client,
    event,
    `✏️ **CC KAMPFTRAINING AKTUALISIERT**\nBearbeitet von <@${interaction.user.id}>.`
  );

  return interaction.editReply(
    "✅ Trainingsdaten aktualisiert."
  );
}

// =====================================================
// INTERACTION HANDLER
// =====================================================

async function handleCombatTrainingInteraction(
  client,
  interaction
) {

  // ===================================================
  // TRAINING AUS DEM FAMILIENPANEL ERSTELLEN
  // ===================================================

  if (
    interaction.isButton() &&
    interaction.customId === CREATE_BUTTON
  ) {
    if (!canManage(interaction.member)) {
      await safeReply(interaction, {
        content:
          "❌ Nur Leaderschaft oder Kampfausbilder dürfen Trainings erstellen.",
        ephemeral: true,
      });

      return true;
    }

    await interaction.showModal(
      trainingModal()
    );

    return true;
  }

  // ===================================================
  // ERSTELLUNGSFORMULAR
  // ===================================================

  if (
    interaction.isModalSubmit() &&
    interaction.customId === `${PREFIX}createmodal`
  ) {
    if (!canManage(interaction.member)) {
      await safeReply(interaction, {
        content:
          "❌ Nur Leaderschaft oder Kampfausbilder dürfen Trainings erstellen.",
        ephemeral: true,
      });

      return true;
    }

    await createTraining(
      client,
      interaction
    );

    return true;
  }

  // ===================================================
  // BEARBEITUNGSFORMULAR
  // ===================================================

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(
      `${PREFIX}editmodal_`
    )
  ) {
    if (!canManage(interaction.member)) {
      await safeReply(interaction, {
        content:
          "❌ Nur Leaderschaft oder Kampfausbilder dürfen Trainings bearbeiten.",
        ephemeral: true,
      });

      return true;
    }

    const id = interaction.customId.slice(
      `${PREFIX}editmodal_`.length
    );

    await editTraining(
      client,
      interaction,
      id
    );

    return true;
  }

  // ===================================================
  // NORMALE BUTTONS
  // ===================================================

  if (
    !interaction.isButton() ||
    !interaction.customId.startsWith(PREFIX)
  ) {
    return false;
  }

  const match =
    /^cccombat_(present|absent|unsure|edit|cancel|close|reopen)_(.+)$/
      .exec(interaction.customId);

  if (!match) {
    return false;
  }

  const [, action, eventId] = match;

  const data = loadData();
  const event = data.combatTrainings?.[eventId];

  if (
    !event ||
    event.guildId !== interaction.guildId
  ) {
    await safeReply(interaction, {
      content:
        "❌ Training nicht gefunden.",
      ephemeral: true,
    });

    return true;
  }

  // ===================================================
  // ZUGRIFFSKONTROLLE
  // ===================================================

  const managing = [
    "edit",
    "cancel",
    "close",
    "reopen",
  ].includes(action);

  // Verwaltung ausschließlich für Leaderschaft
  // oder Kampfausbilder.
  // Teilnahme für normale Familienmitglieder.
  if (
    managing
      ? !canManage(interaction.member)
      : !canParticipate(interaction.member)
  ) {
    await safeReply(interaction, {
      content:
        managing
          ? "❌ Nur die Leaderschaft oder Kampfausbilder dürfen dieses Kampftraining verwalten."
          : "❌ Du benötigst die Familienrolle, um an diesem Training teilzunehmen.",
      ephemeral: true,
    });

    return true;
  }

  // ===================================================
  // TRAINING BEARBEITEN
  // ===================================================

  if (action === "edit") {
    await interaction.showModal(
      trainingModal(event)
    );

    return true;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  // ===================================================
  // TEILNAHME
  // ===================================================

  if (
    ["present", "absent", "unsure"].includes(action)
  ) {
    if (event.status !== "open") {
      return interaction.editReply(
        "❌ Dieses Training ist nicht mehr offen."
      );
    }

    const existing =
      event.users?.[interaction.user.id];

    event.users ||= {};

    event.users[interaction.user.id] = {
      status: action,

      name: escapeName(
        interaction.member?.displayName ||
        interaction.user.globalName ||
        interaction.user.username
      ),

      changedAt: Date.now(),
    };

    try {
      await refreshEvent(
        client,
        event
      );
    } catch (error) {
      console.error(
        "❌ Kampftraining aktualisieren:",
        error
      );

      return interaction.editReply(
        "❌ Die Trainingsnachricht konnte nicht aktualisiert werden."
      );
    }

    saveData(data);

    const label = {
      present: "Dabei",
      absent: "Nicht dabei",
      unsure: "Ungewiss",
    }[action];

    return interaction.editReply(
      existing?.status === action
        ? `✅ Dein Status bleibt **${label}**.`
        : `✅ Du bist als **${label}** eingetragen.`
    );
  }

  // ===================================================
  // EVENT VERWALTEN
  // ===================================================

  if (action === "reopen") {

    if (event.status === "open") {
      return interaction.editReply(
        "ℹ️ Das Training ist bereits offen."
      );
    }

    event.status = "open";

  } else {

    if (event.status !== "open") {
      return interaction.editReply(
        "ℹ️ Das Training ist bereits geschlossen oder abgesagt."
      );
    }

    event.status =
      action === "cancel"
        ? "cancelled"
        : "closed";
  }

  event.updatedAt = Date.now();
  event.lastChangedBy = interaction.user.id;

  try {
    await refreshEvent(
      client,
      event
    );
  } catch (error) {
    console.error(
      "❌ Kampftraining Status:",
      error
    );

    return interaction.editReply(
      "❌ Die Trainingsnachricht konnte nicht aktualisiert werden."
    );
  }

  saveData(data);

  const messages = {
    cancelled:
      "🛑 **CC KAMPFTRAINING ABGESAGT**",

    closed:
      "🔒 **CC KAMPFTRAINING GESCHLOSSEN**",

    open:
      "🔓 **CC KAMPFTRAINING WIEDER GEÖFFNET**",
  };

  await announce(
    client,
    event,
    `${messages[event.status]}\nVerwaltet von <@${interaction.user.id}>.`
  );

  return interaction.editReply(
    "✅ Trainingsstatus aktualisiert."
  );
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  handleCombatTrainingInteraction,
};