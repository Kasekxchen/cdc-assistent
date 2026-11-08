// =====================================================
// CC-ASSISTENT | ZENTRALES LOGSYSTEM
// Feste, bereits angelegte Discord-Kanal-IDs verwenden.
// Wochenabgabe-Logs werden bewusst NICHT verwendet.
// =====================================================

const fs = require("fs");
const path = require("path");
const util = require("util");
const { EmbedBuilder } = require("discord.js");

const CONFIG = require("../config");

const {
  loadData,
  saveData,
  onDataSaved,
  DATA_FILE,
  BACKUP_DIR,
  ensureDataFile,
} = require("../utils/dataStore");

const {
  getBerlinParts,
  formatGermanDateTimeFromMs,
} = require("../utils/dates");

// =====================================================
// DEINE FESTEN CC-LOGKANÄLE
// =====================================================

const CHANNEL_IDS = Object.freeze({
  sanctions: "1568702067311251597",
  absences: "1568702225654747167",
  bot: "1568702320974241933",
  errors: "1568702361088827473",
  storage: "1568702391555985478",
});

// =====================================================
// INTERNER ZUSTAND
// =====================================================

let clientInstance = null;
let channels = {};
let previousSanctions = new Map();
let initialized = false;

let taskTimer = null;
let healthTimer = null;
let originalConsoleError = null;

const recentErrors = new Map();
const logQueue = [];

let flushing = false;

// =====================================================
// FORMATIERUNG
// =====================================================

function toMoney(value) {
  return `${Number(value || 0).toLocaleString("de-DE")}$`;
}

function timeText(ms = Date.now()) {
  return formatGermanDateTimeFromMs(ms);
}

function sanitize(value, max = 1000) {
  let output = String(value ?? "—");

  if (process.env.DISCORD_TOKEN) {
    output = output
      .split(process.env.DISCORD_TOKEN)
      .join("[TOKEN AUSGEBLENDET]");
  }

  for (const variable of [
    "DATABASE_URL",
    "PGPASSWORD",
  ]) {
    if (process.env[variable]) {
      output = output
        .split(process.env[variable])
        .join("[GEHEIMNIS AUSGEBLENDET]");
    }
  }

  return output
    .replace(/@everyone|@here/gi, "Mitglied")
    .slice(0, max) || "—";
}

function logEmbed(
  title,
  lines,
  color = 0xf1c40f,
  footer = "CC • Systemlog"
) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(sanitize(title, 220))
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        ...lines,
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n").slice(0, 4000)
    )
    .setFooter({ text: footer })
    .setTimestamp();
}

// =====================================================
// LOG-NACHRICHTEN VERSENDEN
// =====================================================

function enqueue(type, embed) {
  const channelId = channels[type];

  if (!channelId || !clientInstance) {
    return;
  }

  logQueue.push({
    id: channelId,
    embed,
  });

  void flushQueue();
}

async function flushQueue() {
  if (flushing || !clientInstance) {
    return;
  }

  flushing = true;

  try {
    while (logQueue.length) {
      const item = logQueue.shift();

      try {
        const channel =
          await clientInstance.channels.fetch(item.id);

        if (channel?.isTextBased?.()) {
          await channel.send({
            embeds: [item.embed],
            allowedMentions: {
              parse: [],
            },
          });
        }

      } catch (error) {
        const writeError =
          originalConsoleError || console.error;

        writeError(
          "❌ Lognachricht konnte nicht gesendet werden:",
          error?.message || error
        );
      }
    }
  } finally {
    flushing = false;
  }
}

// =====================================================
// SANKTIONSSTATUS
// =====================================================

function sanctionStatus(status) {
  return {
    open: "⏳ Offen",
    paid: "✅ Bezahlt",
    cancelled: "❌ Storniert",
    overdue: "⏰ Überfällig",
  }[status] || sanitize(status, 70);
}

function snapshotSanctions(sanctions) {
  const snapshot = new Map();

  for (
    const [id, sanction]
    of Object.entries(sanctions || {})
  ) {
    if (
      sanction &&
      typeof sanction === "object"
    ) {
      snapshot.set(id, {
        status: String(
          sanction.status || "open"
        ),
      });
    }
  }

  return snapshot;
}

// =====================================================
// SANKTIONSÄNDERUNGEN AUTOMATISCH ERKENNEN
// =====================================================

function detectSanctionChanges(data) {
  const current = snapshotSanctions(
    data.sanctions
  );

  for (const [id, now] of current) {
    const before = previousSanctions.get(id);

    if (
      before &&
      before.status === now.status
    ) {
      continue;
    }

    const sanction =
      data.sanctions?.[id] || {};

    const isNew = !before;

    const actionBy =
      now.status === "paid"
        ? sanction.paidBy
        : now.status === "cancelled"
          ? sanction.cancelledBy
          : sanction.creatorId;

    const title = isNew
      ? "🚫 Neue Sanktion erstellt"
      : now.status === "paid"
        ? "✅ Sanktion bezahlt"
        : now.status === "cancelled"
          ? "❌ Sanktion storniert"
          : now.status === "overdue"
            ? "⏰ Sanktion überfällig"
            : "📝 Sanktion geändert";

    const embed = logEmbed(
      title,
      [
        `👤 **Name:** ${
          sanction.targetId
            ? `<@${sanction.targetId}>`
            : sanitize(
                sanction.targetName,
                100
              )
        }`,

        `💰 **Zu bezahlen:** ${toMoney(
          sanction.totalAmount
        )}`,

        `📌 **Status:** ${sanctionStatus(
          now.status
        )}`,

        `🕘 **Frist:** ${
          sanction.dueAt
            ? `<t:${Math.floor(
                sanction.dueAt / 1000
              )}:F>`
            : "—"
        }`,

        `👑 **Bearbeitet von:** ${
          actionBy
            ? `<@${actionBy}>`
            : "Automatisch"
        }`,

        `🆔 **Sanktions-ID:** \`${sanitize(
          id,
          90
        )}\``,

        `🕒 **Zeitpunkt:** ${timeText()}`,
      ],
      now.status === "paid"
        ? 0x2ecc71
        : 0xf1c40f,
      "CC • Sanktionslog"
    );

    enqueue(
      "sanctions",
      embed
    );
  }

  previousSanctions = current;
}

// =====================================================
// FEHLER LOGGEN
// =====================================================

function logError(error, where = "Bot") {
  if (!initialized) {
    return;
  }

  const stack =
    error instanceof Error
      ? error.stack || error.message
      : util.format(error);

  const details = sanitize(
    stack,
    1850
  );

  const key =
    `${where}:${details.slice(0, 220)}`;

  const last =
    recentErrors.get(key) || 0;

  // Gleiche Fehler höchstens einmal pro Minute.
  if (Date.now() - last < 60000) {
    return;
  }

  recentErrors.set(
    key,
    Date.now()
  );

  if (recentErrors.size > 120) {
    recentErrors.clear();
  }

  enqueue(
    "errors",
    logEmbed(
      "🚨 Botfehler erkannt",
      [
        `📍 **Bereich:** ${sanitize(where, 150)}`,
        `🕒 **Zeit:** ${timeText()}`,
        "**Fehlerdetails:**",
        `\`\`\`\n${details.replace(
          /```/g,
          "'''"
        )}\n\`\`\``,
      ],
      0xff3b30,
      "CC • Fehlerlog"
    )
  );
}

// =====================================================
// CONSOLE.ERROR AUTOMATISCH PROTOKOLLIEREN
// =====================================================

function installConsoleErrorCapture() {
  if (originalConsoleError) {
    return;
  }

  originalConsoleError =
    console.error.bind(console);

  console.error = (...args) => {
    originalConsoleError(...args);

    try {
      const detail = args.map(
        value =>
          value instanceof Error
            ? value.stack || value.message
            : util.format(value)
      ).join(" ");

      logError(
        detail,
        "Konsole"
      );

    } catch (error) {
      originalConsoleError(
        "❌ Fehlerlog-Verarbeitung:",
        error
      );
    }
  };
}

// =====================================================
// BOT-START
// =====================================================

function logBotOnline(client) {
  enqueue(
    "bot",
    logEmbed(
      "✅ CC-ASSISTENT ONLINE",
      [
        `🤖 **Bot:** ${sanitize(
          client.user?.tag || CONFIG.botName,
          120
        )}`,
        `🕒 **Gestartet:** ${timeText()}`,
      ],
      0x2ecc71,
      "CC • Botlog"
    )
  );
}

// =====================================================
// HEALTHCHECK
// =====================================================

function logHealthcheck() {
  if (!initialized) {
    return;
  }

  enqueue(
    "bot",
    logEmbed(
      "✅ CC HEALTHCHECK",
      [
        "🤖 **Bot:** Läuft",

        `📡 **Discord:** ${
          clientInstance?.isReady?.()
            ? "Verbunden"
            : "Nicht verbunden"
        }`,

        "⏱️ **Scheduler:** Aktiv",

        `🕒 **Letzter Check:** ${timeText()}`,
      ],
      0x2ecc71,
      "CC • Healthcheck"
    )
  );
}

// =====================================================
// DATUM
// =====================================================

function dateOfToday() {
  return getBerlinParts().dateKey;
}

// =====================================================
// AUTOMATISCHES TAGESBACKUP
// =====================================================

function maybeBackup() {
  if (!initialized) {
    return;
  }

  try {
    const data = loadData();
    const date = dateOfToday();

    if (
      data.ccLogLastBackupDate === date
    ) {
      return;
    }

    ensureDataFile();

    fs.mkdirSync(
      BACKUP_DIR,
      { recursive: true }
    );

    const file =
      `cc-backup-${date}.json`;

    const target = path.join(
      BACKUP_DIR,
      file
    );

    fs.copyFileSync(
      DATA_FILE,
      target
    );

    // Maximal die letzten 14 CC-Tagesbackups.
    const all = fs.readdirSync(BACKUP_DIR)
      .filter(
        name =>
          /^cc-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)
      )
      .sort();

    for (
      const old of all.slice(
        0,
        Math.max(
          0,
          all.length - 14
        )
      )
    ) {
      fs.unlinkSync(
        path.join(BACKUP_DIR, old)
      );
    }

    data.ccLogLastBackupDate = date;

    saveData(data);

    const sizeKB = (
      fs.statSync(target).size / 1024
    ).toFixed(1);

    enqueue(
      "bot",
      logEmbed(
        "💾 CC BACKUP ERSTELLT",
        [
          `📁 **Datei:** \`${file}\``,
          `📦 **Größe:** ca. ${sizeKB} KB`,
          `🕒 **Zeitpunkt:** ${timeText()}`,
          "🗄️ **Aufbewahrung:** Die letzten 14 CC-Tagesbackups",
        ],
        0x2ecc71,
        "CC • Backup"
      )
    );

  } catch (error) {
    const writeError =
      originalConsoleError || console.error;

    writeError(
      "❌ CC-Backup fehlgeschlagen:",
      error
    );

    logError(
      error,
      "Backup"
    );
  }
}

// =====================================================
// TAGESPROTOKOLL
// =====================================================

function maybeDailyReport() {
  if (!initialized) {
    return;
  }

  const now = getBerlinParts();

  // Jeden Tag zwischen 23:00 und 23:59 Uhr.
  if (Number(now.hour) !== 23) {
    return;
  }

  const data = loadData();

  if (
    data.ccLogLastDailyReportDate === now.dateKey
  ) {
    return;
  }

  const activeAbsences = Object.values(
    data.absences || {}
  ).filter(
    absence =>
      absence &&
      absence.fromDateKey <= now.dateKey &&
      absence.untilDateKey >= now.dateKey
  ).length;

  const openSanctions = Object.values(
    data.sanctions || {}
  ).filter(
    sanction =>
      sanction &&
      [
        "open",
        "overdue",
      ].includes(sanction.status)
  ).length;

  const lineup =
    data.lineups?.[now.dateKey];

  enqueue(
    "bot",
    logEmbed(
      "📋 CC TAGESPROTOKOLL",
      [
        `📅 **Datum:** ${now.dateText}`,

        `✅ **Aufstellung erstellt:** ${
          lineup ? "Ja" : "Nein"
        }`,

        `📋 **Aktive Abmeldungen:** ${activeAbsences}`,

        `🚫 **Offene Sanktionen:** ${openSanctions}`,

        "📝 **Grund:** Automatisch",
      ],
      0x2b2d31,
      "CC • Tagesprotokoll"
    )
  );

  data.ccLogLastDailyReportDate =
    now.dateKey;

  saveData(data);
}

// =====================================================
// LOGSYSTEM INITIALISIEREN
// =====================================================

async function initializeLogs(client) {
  if (initialized) {
    return { ...channels };
  }

  const guildId =
    process.env.GUILD_ID;

  if (!guildId) {
    throw new Error(
      "GUILD_ID fehlt für das CC-Logsystem."
    );
  }

  const guild =
    client.guilds.cache.get(guildId) ||
    await client.guilds.fetch(guildId);

  const verifiedIds = {};
  const missing = [];

  // Alle fünf vorhandenen Kanäle prüfen.
  for (
    const [type, id]
    of Object.entries(CHANNEL_IDS)
  ) {
    const channel =
      await guild.channels.fetch(id)
        .catch(() => null);

    if (
      channel &&
      channel.guildId === guildId &&
      channel.isTextBased?.() &&
      typeof channel.send === "function"
    ) {
      verifiedIds[type] = id;
    } else {
      missing.push(
        `${type}: ${id}`
      );
    }
  }

  if (missing.length) {
    console.warn(
      "⚠️ CC-Logkanäle nicht erreichbar:",
      missing.join(", ")
    );
  }

  // ===================================================
  // VORHANDENE SYSTEME MIT LOGKANÄLEN VERBINDEN
  // ===================================================

  CONFIG.sanctionLogChannelId =
    CHANNEL_IDS.sanctions;

  CONFIG.absenceDeleteLogChannelId =
    CHANNEL_IDS.absences;

  CONFIG.storageLogChannelId =
    CHANNEL_IDS.storage;

  CONFIG.storageDepositLogChannelId =
    CHANNEL_IDS.storage;

  CONFIG.storageWithdrawLogChannelId =
    CHANNEL_IDS.storage;

  CONFIG.dailyReportChannelId =
    CHANNEL_IDS.bot;

  CONFIG.backupLogChannelId =
    CHANNEL_IDS.bot;

  CONFIG.errorLogChannelId =
    CHANNEL_IDS.errors;

  clientInstance = client;
  channels = verifiedIds;

  const data = loadData();

  data.ccLogChannels = {
    ...CHANNEL_IDS,
  };

  // Bereits gespeicherte Sanktionen NICHT
  // nachträglich als neue Sanktionen loggen.
  previousSanctions = snapshotSanctions(
    data.sanctions
  );

  initialized = true;

  saveData(data);

  onDataSaved(
    detectSanctionChanges
  );

  installConsoleErrorCapture();

  logBotOnline(client);
  maybeBackup();
  logHealthcheck();

  // Backup und Tagesprotokoll prüfen.
  if (!taskTimer) {
    taskTimer = setInterval(() => {
      maybeBackup();
      maybeDailyReport();
    }, 60 * 1000);
  }

  // Healthcheck jede Stunde.
  if (!healthTimer) {
    healthTimer = setInterval(
      logHealthcheck,
      60 * 60 * 1000
    );
  }

  return { ...channels };
}

module.exports = {
  initializeLogs,
  logError,
};