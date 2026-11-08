// =====================================================
// CC-ASSISTENT | INDEX.JS
// =====================================================

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
} = require("discord.js");

const CONFIG = require("./config");

const {
  initDatabase,
} = require("./database");

const {
  getSlashCommandJson,
} = require("./commands/slashCommands");

const {
  handleInteraction,
} = require("./handlers/interactions");

const {
  startScheduler,
} = require("./scheduler");

const {
  startServerInfoUpdater,
  requestCounterRefresh,
} = require("./systems/serverInfo");

const {
  initializeLogs,
  logError,
} = require("./systems/logs");

const {
  sendWelcomeMessage,
  sendLeaveMessage,
} = require("./systems/registration");

// =====================================================
// UMGEBUNGSVARIABLEN PRÜFEN
// =====================================================

function checkEnv() {
  const requiredEnv = [
    "DISCORD_TOKEN",
    "CLIENT_ID",
    "GUILD_ID",
  ];

  const missingEnv = requiredEnv.filter(
    key => !process.env[key]
  );

  if (missingEnv.length > 0) {
    console.error(
      "❌ Fehlende .env-Variablen:",
      missingEnv.join(", ")
    );

    process.exit(1);
  }

  console.log(
    "✅ Alle wichtigen Variablen gefunden."
  );
}

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// =====================================================
// SLASH COMMANDS REGISTRIEREN
// =====================================================

async function registerSlashCommands() {
  try {
    const commands =
      getSlashCommandJson();

    const rest = new REST({
      version: "10",
    }).setToken(
      process.env.DISCORD_TOKEN
    );

    console.log(
      `🔄 Registriere ${commands.length} Slash Commands...`
    );

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands,
      }
    );

    console.log(
      "✅ Slash Commands registriert."
    );

  } catch (error) {
    console.error(
      "❌ Slash Commands konnten nicht registriert werden:",
      error
    );
  }
}

// =====================================================
// BOT BEREIT
// =====================================================

client.once("ready", async () => {
  console.log(
    `✅ Eingeloggt als ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name: CONFIG.familyName,
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });

  await initDatabase();

  await registerSlashCommands();

  // ===================================================
  // CC LOGSYSTEM
  // ===================================================
  //
  // Wichtig: Vor dem Scheduler starten.
  // So werden auch automatische Bereinigungen
  // und Sanktionsprüfungen protokolliert.
  // ===================================================

  try {
    const logChannels =
      await initializeLogs(client);

    console.log(
      "✅ CC-Logsystem gestartet."
    );

    console.log(
      `✅ Aktive Logkanäle: ${
        Object.keys(logChannels).length
      }/5`
    );

  } catch (error) {
    console.error(
      "❌ CC-Logsystem konnte nicht gestartet werden:",
      error
    );
  }

  // ===================================================
  // AUTOMATISCHE SYSTEME
  // ===================================================

  startScheduler(client);

  // Info-Sprachkanäle und Rollenzähler.
  startServerInfoUpdater(client);

  console.log(
    `✅ ${CONFIG.botName} vollständig gestartet.`
  );
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {
    try {
      await handleInteraction(
        client,
        interaction
      );

    } catch (error) {
      console.error(
        "❌ Interaction-Fehler:",
        error
      );

      logError(
        error,
        "Discord Interaction"
      );
    }
  }
);

// =====================================================
// MITGLIED TRITT SERVER BEI
// =====================================================

client.on(
  "guildMemberAdd",
  async member => {
    try {
      await sendWelcomeMessage(
        client,
        member
      );

    } catch (error) {
      console.error(
        "❌ Fehler bei guildMemberAdd:",
        error
      );
    }

    requestCounterRefresh(
      client,
      member.guild.id
    );
  }
);

// =====================================================
// MITGLIED VERLÄSST SERVER
// =====================================================

client.on(
  "guildMemberRemove",
  async member => {
    try {
      await sendLeaveMessage(
        client,
        member
      );

    } catch (error) {
      console.error(
        "❌ Fehler bei guildMemberRemove:",
        error
      );
    }

    requestCounterRefresh(
      client,
      member.guild.id
    );
  }
);

// =====================================================
// ROLLENÄNDERUNGEN
// =====================================================

client.on(
  "guildMemberUpdate",
  (oldMember, newMember) => {
    const relevantRoleIds = [
      "1542602740771983553",
      "1568852155543191603",
    ];

    const changed = relevantRoleIds.some(
      roleId =>
        oldMember.roles.cache.has(roleId) !==
        newMember.roles.cache.has(roleId)
    );

    if (changed) {
      requestCounterRefresh(
        client,
        newMember.guild.id
      );
    }
  }
);

// =====================================================
// DISCORD CLIENT FEHLER
// =====================================================

client.on("error", error => {
  console.error(
    "❌ Discord Client Error:",
    error
  );

  logError(
    error,
    "Discord Client"
  );
});

// =====================================================
// UNBEHANDELTE PROMISE-FEHLER
// =====================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled Rejection:",
      error
    );

    logError(
      error,
      "Unhandled Rejection"
    );
  }
);

// =====================================================
// UNBEHANDELTE AUSNAHMEN
// =====================================================

process.on(
  "uncaughtException",
  error => {
    console.error(
      "❌ Uncaught Exception:",
      error
    );

    logError(
      error,
      "Uncaught Exception"
    );
  }
);

// =====================================================
// BOT STARTEN
// =====================================================

checkEnv();

client.login(
  process.env.DISCORD_TOKEN
);