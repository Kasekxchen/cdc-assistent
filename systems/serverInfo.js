const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const CONFIG = require("../config");
const { loadData, saveData } = require("../utils/dataStore");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// CC SERVER-INFOS | AUTOMATISCHE SPRACHKANAELE
// =====================================================

const LEADER_ROLE_ID = "1542602740784562234";
const MEMBER_ROLE_ID = "1542602740771983553";
const HANGAROUND_ROLE_ID = "1568852155543191603";

const CATEGORY_NAME = "📊・CC INFORMATIONEN";

const UPDATE_INTERVAL = 15 * 60 * 1000;
const MIN_COUNT_INTERVAL = 10 * 60 * 1000;
const EVENT_DELAY = 45 * 1000;

const activeUpdates = new Set();
const pendingUpdates = new Map();

let updateTimer = null;

// =====================================================
// STANDARDWERTE
// =====================================================

// Bereits gespeicherte Werte werden nicht ueberschrieben.

const DEFAULT_INFO = {
  funk: "",
  funkPassword: "Drake",
  darkChat: "6WXME7",
  bennysPassword: "Ein Scheiß kriegst du",
  casa: "5009",
};

// =====================================================
// SIEBEN INFORMATIONSKANAELE
// =====================================================

const CHANNELS = [
  {
    key: "memberCounterChannelId",
    type: "member",
    prefix: "👥・Mitglieder:",
  },
  {
    key: "hangaroundCounterChannelId",
    type: "hangaround",
    prefix: "🧊・Hangaround:",
  },
  {
    key: "funkChannelId",
    type: "funk",
    prefix: "📻・Funk:",
  },
  {
    key: "funkPasswordChannelId",
    type: "funkPassword",
    prefix: "🔑・Passwort-Funk:",
  },
  {
    key: "darkChatChannelId",
    type: "darkChat",
    prefix: "💬・Dark Chat:",
  },
  {
    key: "bennysPasswordChannelId",
    type: "bennysPassword",
    prefix: "🔧・Bennys PW:",
  },
  {
    key: "casaChannelId",
    type: "casa",
    prefix: "🏠・Casa:",
  },
];

// =====================================================
// SLASH COMMANDS
// =====================================================

const infoPanelCommand = new SlashCommandBuilder()
  .setName("server-infos")
  .setDescription(
    "Veroeffentlicht oder aktualisiert die CC-Infotafel."
  );

const editInfoCommand = new SlashCommandBuilder()
  .setName("server-infos-bearbeiten")
  .setDescription(
    "Aendert Funk, Passwort, Dark Chat, Bennys PW und Casa."
  );

const inviteInfoCommand = new SlashCommandBuilder()
  .setName("server-einladung")
  .setDescription(
    "Aendert den Einladungslink der CC-Infotafel."
  )
  .addStringOption(option =>
    option
      .setName("link")
      .setDescription(
        "Vollstaendiger HTTPS-Einladungslink"
      )
      .setRequired(true)
      .setMaxLength(450)
  );

const roleCounterCommand = new SlashCommandBuilder()
  .setName("rollen-zaehler")
  .setDescription(
    "Prueft die sieben automatischen CC-Info-Sprachkanaele."
  );

// =====================================================
// DATENSPEICHER
// =====================================================

function getState(data) {
  data.ccServerInfo ||= {};

  const state = data.ccServerInfo;

  state.info ||= {};

  for (const [key, value] of Object.entries(DEFAULT_INFO)) {
    if (
      state.info[key] === undefined ||
      state.info[key] === null
    ) {
      state.info[key] = value;
    }
  }

  state.guildId ||= null;
  state.categoryId ||= null;

  state.panelChannelId ||= null;
  state.panelMessageId ||= null;

  state.inviteUrl ||= "";
  state.lastCounterRefreshAt ||= 0;

  for (const channel of CHANNELS) {
    state[channel.key] ||= null;
  }

  // Alte Lagerfunk-ID nur fuer die Entfernung behalten.
  state.lagerfunkChannelId ||= null;

  return state;
}

// =====================================================
// BERECHTIGUNGEN
// =====================================================

function isLeader(member) {
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

  const roles = member?.roles;

  if (typeof roles?.cache?.has === "function") {
    return roles.cache.has(LEADER_ROLE_ID);
  }

  return (
    Array.isArray(roles) &&
    roles.includes(LEADER_ROLE_ID)
  );
}

async function requireLeader(interaction) {
  if (
    interaction.inGuild() &&
    isLeader(interaction.member)
  ) {
    return true;
  }

  await safeReply(interaction, {
    content:
      "❌ Nur die CC-Leaderschaft darf diese Infos verwalten.",
    ephemeral: true,
  });

  return false;
}

// =====================================================
// TEXTE
// =====================================================

function cleanText(value, length = 100) {
  return String(value ?? "")
    .trim()
    .replace(/@everyone|@here/gi, "Mitglied")
    .replace(/[\r\n]/g, " ")
    .slice(0, length);
}

function embedValue(value) {
  return (
    cleanText(value, 150) ||
    "Noch nicht eingetragen"
  ).replace(
    /([*_`~|>\\])/g,
    "\\$1"
  );
}

// =====================================================
// ALLGEMEINE INFOTAFEL
// =====================================================

function infoEmbed(state) {
  const info = state.info;

  return new EmbedBuilder()
    .setColor(0x2385c7)
    .setTitle("Allgemeine Infos")
    .setDescription(
      [
        `**Funk:** ${embedValue(info.funk)}`,
        `**Passwort-Funk:** ${embedValue(info.funkPassword)}`,
        `**Dark Chat:** ${embedValue(info.darkChat)}`,
        `**Bennys PW:** ${embedValue(info.bennysPassword)}`,
        `**Casa:** ${embedValue(info.casa)}`,
        `**Invite-Link:** ${
          state.inviteUrl
            ? "Über den Button unten"
            : "Noch nicht eingetragen"
        }`,
      ].join("\n")
    )
    .setFooter({
      text:
        `${CONFIG.shortName || "CC"} • Allgemeine Infos`,
    });
}

// =====================================================
// EINLADUNGSLINK
// =====================================================

function validUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      Boolean(url.hostname)
    );

  } catch {
    return false;
  }
}

function infoComponents(state) {
  if (!validUrl(state.inviteUrl)) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Einladungslink")
        .setURL(state.inviteUrl)
    ),
  ];
}

// =====================================================
// INFOTAFEL AKTUALISIEREN
// =====================================================

async function refreshInfoPanel(client, state) {
  if (
    !state.panelChannelId ||
    !state.panelMessageId
  ) {
    return false;
  }

  const channel = await client.channels
    .fetch(state.panelChannelId)
    .catch(() => null);

  const message = await channel?.messages
    ?.fetch(state.panelMessageId)
    .catch(() => null);

  if (!message) {
    return false;
  }

  await message.edit({
    embeds: [
      infoEmbed(state),
    ],

    components: infoComponents(state),
  });

  return true;
}

// =====================================================
// INFOTAFEL POSTEN
// =====================================================

async function sendInfoPanel(client, interaction) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);

  state.guildId = interaction.guildId;

  if (
    state.panelChannelId === interaction.channelId &&
    await refreshInfoPanel(
      client,
      state
    ).catch(() => false)
  ) {
    saveData(data);

    return interaction.editReply(
      "✅ Bestehende CC-Infotafel aktualisiert."
    );
  }

  const message = await sendToChannel(
    client,
    interaction.channelId,
    {
      embeds: [
        infoEmbed(state),
      ],

      components: infoComponents(state),
    }
  );

  if (!message) {
    return interaction.editReply(
      "❌ Die Infotafel konnte nicht gepostet werden."
    );
  }

  state.panelChannelId = interaction.channelId;
  state.panelMessageId = message.id;

  saveData(data);

  return interaction.editReply(
    "✅ CC-Infotafel veröffentlicht."
  );
}

// =====================================================
// FORMULAR ZUM BEARBEITEN
// =====================================================

function infoEditModal(info) {
  const modal = new ModalBuilder()
    .setCustomId("ccinfo_edit_modal")
    .setTitle(
      "CC • Allgemeine Infos bearbeiten"
    );

  const fields = [
    [
      "funk",
      "Funk",
      "z. B. 191322",
    ],
    [
      "funkPassword",
      "Passwort-Funk",
      "z. B. Drake",
    ],
    [
      "darkChat",
      "Dark Chat",
      "z. B. 6WXME7",
    ],
    [
      "bennysPassword",
      "Bennys PW",
      "z. B. Ein Scheiß kriegst du",
    ],
    [
      "casa",
      "Casa",
      "z. B. 5009",
    ],
  ];

  for (const [key, label, placeholder] of fields) {
    const field = new TextInputBuilder()
      .setCustomId(key)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(placeholder)
      .setMaxLength(100)
      .setRequired(false);

    if (info[key]) {
      field.setValue(
        cleanText(info[key])
      );
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(field)
    );
  }

  return modal;
}

// =====================================================
// BEARBEITETE INFOS SPEICHERN
// =====================================================

async function saveInfoEdit(client, interaction) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);

  state.guildId = interaction.guildId;

  for (const key of Object.keys(DEFAULT_INFO)) {
    state.info[key] = interaction.fields
      .getTextInputValue(key)
      .trim();
  }

  saveData(data);

  const updatedChannels = await syncVoiceInfoChannels(
    client,
    interaction.guildId,
    {
      staticOnly: true,
    }
  );

  const updatedPanel = await refreshInfoPanel(
    client,
    state
  ).catch(() => false);

  return interaction.editReply(
    "✅ Serverinfos gespeichert." +
    (
      updatedChannels
        ? " Sprachkanäle aktualisiert."
        : " Die Sprachkanäle werden beim nächsten Durchlauf aktualisiert."
    ) +
    (
      updatedPanel
        ? " Infotafel aktualisiert."
        : ""
    )
  );
}

// =====================================================
// EINLADUNGSLINK SPEICHERN
// =====================================================

async function setInviteLink(client, interaction) {
  const link = interaction.options
    .getString("link", true)
    .trim();

  if (!validUrl(link)) {
    return safeReply(interaction, {
      content:
        "❌ Bitte einen gültigen HTTPS-Link angeben.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = getState(data);

  state.guildId = interaction.guildId;
  state.inviteUrl = link;

  saveData(data);

  await refreshInfoPanel(
    client,
    state
  ).catch(() => false);

  return interaction.editReply(
    "✅ Einladungslink gespeichert."
  );
}

// =====================================================
// NAMEN DER SPRACHKANAELE
// =====================================================

function voiceName(entry, state, counts = {}) {
  let value;

  if (entry.type === "member") {
    value = counts.members ?? "…";

  } else if (entry.type === "hangaround") {
    value = counts.hangarounds ?? "…";

  } else {
    value =
      cleanText(state.info[entry.type], 70) ||
      "Nicht eingestellt";
  }

  return `${entry.prefix} ${value}`.slice(0, 100);
}

function matchesType(channel, entry) {
  return String(
    channel.name || ""
  ).startsWith(entry.prefix);
}

// =====================================================
// KATEGORIE ERSTELLEN
// =====================================================

async function ensureCategory(guild, state) {
  const cached = state.categoryId
    ? guild.channels.cache.get(state.categoryId)
    : null;

  if (
    cached?.type === ChannelType.GuildCategory
  ) {
    return cached;
  }

  const existing = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name === CATEGORY_NAME
  );

  if (existing) {
    state.categoryId = existing.id;

    return existing;
  }

  const created = await guild.channels.create({
    name: CATEGORY_NAME,

    type: ChannelType.GuildCategory,

    reason:
      "CC-Assistent: Info-Kategorie",
  });

  state.categoryId = created.id;

  return created;
}

// =====================================================
// SPRACHKANAL ERSTELLEN / WIEDERVERWENDEN
// =====================================================

async function ensureVoice(
  guild,
  state,
  category,
  entry
) {
  const known = state[entry.key]
    ? guild.channels.cache.get(state[entry.key])
    : null;

  if (
    known?.type === ChannelType.GuildVoice
  ) {
    return known;
  }

  // Bereits vorhandene Kanaele verwenden.
  const existing = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildVoice &&
      channel.parentId === category.id &&
      matchesType(channel, entry)
  );

  if (existing) {
    state[entry.key] = existing.id;

    return existing;
  }

  // Noch nicht vorhanden: automatisch erstellen.
  const created = await guild.channels.create({
    name: voiceName(entry, state),

    type: ChannelType.GuildVoice,

    parent: category.id,

    // Reine Info-Sprachkanaele.
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,

        allow: [
          PermissionFlagsBits.ViewChannel,
        ],

        deny: [
          PermissionFlagsBits.Connect,
        ],
      },
    ],

    reason:
      "CC-Assistent: Info-Sprachkanal",
  });

  state[entry.key] = created.id;

  return created;
}

// =====================================================
// ALTEN LAGERFUNK-KANAL ENTFERNEN
// =====================================================

async function removeLegacyLagerfunk(
  guild,
  state,
  category
) {
  // Nur die alten Info-Kanaele in unserer
  // CC-Informationskategorie entfernen.
  // Andere Discord-Kanaele bleiben unangetastet.

  const legacy = guild.channels.cache.filter(
    channel =>
      channel.type === ChannelType.GuildVoice &&
      channel.parentId === category.id &&
      String(channel.name || "").startsWith(
        "🔐・Lagerfunk:"
      )
  );

  for (const channel of legacy.values()) {
    await channel.delete(
      "CC: Alter Lagerfunk-Infokanal wird nicht mehr verwendet"
    );

    console.log(
      `🗑️ Alter Lagerfunk-Infokanal entfernt: ${channel.id}`
    );
  }

  state.lagerfunkChannelId = null;

  delete state.info.lagerfunk;
}

// =====================================================
// MITGLIEDER UND HANGAROUNDS ZAEHLEN
// =====================================================

async function countRoles(guild) {
  let members = 0;
  let hangarounds = 0;

  let after;

  while (true) {
    // Discord REST: keine Gateway-Mitgliederabfrage.
    const batch = await guild.members.list({
      limit: 1000,
      after,
    });

    if (!batch.size) {
      break;
    }

    for (const member of batch.values()) {
      if (member.user?.bot) {
        continue;
      }

      if (
        member.roles.cache.has(MEMBER_ROLE_ID)
      ) {
        members++;
      }

      if (
        member.roles.cache.has(HANGAROUND_ROLE_ID)
      ) {
        hangarounds++;
      }
    }

    if (batch.size < 1000) {
      break;
    }

    const lastId = batch.lastKey();

    if (
      !lastId ||
      lastId === after
    ) {
      throw new Error(
        "CC: Mitgliederliste konnte nicht vollständig geladen werden."
      );
    }

    after = lastId;
  }

  return {
    members,
    hangarounds,
  };
}

// =====================================================
// ALLE KANAELE AUTOMATISCH AKTUALISIEREN
// =====================================================

async function syncVoiceInfoChannels(
  client,
  guildId,
  options = {}
) {
  const {
    staticOnly = false,
    force = false,
  } = options;

  if (
    !guildId ||
    activeUpdates.has(guildId)
  ) {
    return false;
  }

  activeUpdates.add(guildId);

  try {
    const guild =
      client.guilds.cache.get(guildId) ||
      await client.guilds.fetch(guildId);

    // Bestehende Kanalnamen laden.
    await guild.channels.fetch();

    const data = loadData();
    const state = getState(data);

    state.guildId = guildId;

    // Kategorie sicherstellen.
    const category = await ensureCategory(
      guild,
      state
    );

    saveData(data);

    // Alten Lagerfunk entfernen.
    await removeLegacyLagerfunk(
      guild,
      state,
      category
    );

    saveData(data);

    // Alle sieben Kanaele erstellen oder wiederverwenden.
    const channels = {};

    for (const entry of CHANNELS) {
      channels[entry.type] = await ensureVoice(
        guild,
        state,
        category,
        entry
      );

      // Nach jeder Erstellung sofort speichern.
      saveData(data);
    }

    // =================================================
    // FESTE INFOWERTE AKTUALISIEREN
    // =================================================

    for (
      const entry of CHANNELS.filter(
        e =>
          ![
            "member",
            "hangaround",
          ].includes(e.type)
      )
    ) {
      const channel = channels[entry.type];

      const wanted = voiceName(
        entry,
        state
      );

      if (channel.name !== wanted) {
        await channel.setName(
          wanted,
          "CC: Infos aktualisiert"
        );
      }
    }

    // =================================================
    // MITGLIEDERZAHLEN AKTUALISIEREN
    // =================================================

    const shouldCount =
      !staticOnly &&
      (
        force ||
        Date.now() -
          state.lastCounterRefreshAt >=
          MIN_COUNT_INTERVAL
      );

    if (shouldCount) {
      const counts = await countRoles(guild);

      for (const type of [
        "member",
        "hangaround",
      ]) {
        const entry = CHANNELS.find(
          e => e.type === type
        );

        const channel = channels[type];

        const wanted = voiceName(
          entry,
          state,
          counts
        );

        if (channel.name !== wanted) {
          await channel.setName(
            wanted,
            "CC: Rollenzähler aktualisiert"
          );
        }
      }

      state.lastCounterRefreshAt = Date.now();

      saveData(data);

      console.log(
        `✅ CC-Infos: ${counts.members} Mitglieder, ` +
        `${counts.hangarounds} Hangarounds`
      );
    }

    return true;

  } catch (error) {
    console.error(
      "❌ CC-Info-Kanäle konnten nicht aktualisiert werden:",
      error
    );

    return false;

  } finally {
    activeUpdates.delete(guildId);
  }
}

// =====================================================
// AKTUALISIERUNG BEI ROLLENAENDERUNG
// =====================================================

function requestCounterRefresh(client, guildId) {
  if (
    !guildId ||
    pendingUpdates.has(guildId)
  ) {
    return;
  }

  const state = getState(
    loadData()
  );

  const elapsed =
    Date.now() -
    Number(state.lastCounterRefreshAt || 0);

  const delay = Math.max(
    EVENT_DELAY,
    MIN_COUNT_INTERVAL - elapsed + 2000
  );

  const timer = setTimeout(async () => {
    pendingUpdates.delete(guildId);

    await syncVoiceInfoChannels(
      client,
      guildId
    );
  }, delay);

  pendingUpdates.set(guildId, timer);
}

// =====================================================
// AUTOMATISCH BEIM BOTSTART
// =====================================================

function startServerInfoUpdater(client) {
  if (updateTimer) {
    return;
  }

  const guildId = process.env.GUILD_ID;

  if (!guildId) {
    console.error(
      "❌ GUILD_ID fehlt für die CC-Info-Kanäle."
    );

    return;
  }

  // Beim Botstart:
  // 1. Kategorie erstellen
  // 2. Lagerfunk entfernen
  // 3. Sieben Sprachkanaele erstellen
  // 4. Mitglieder und Hangarounds zaehlen
  // 5. Alle Namen aktualisieren

  void syncVoiceInfoChannels(
    client,
    guildId,
    {
      force: true,
    }
  );

  // Danach alle 15 Minuten aktualisieren.
  updateTimer = setInterval(() => {
    void syncVoiceInfoChannels(
      client,
      guildId
    );
  }, UPDATE_INTERVAL);
}

// =====================================================
// INTERACTION HANDLER
// =====================================================

async function handleServerInfoInteraction(
  client,
  interaction
) {
  const command = interaction.isChatInputCommand()
    ? interaction.commandName
    : null;

  // INFOTAFEL
  if (command === "server-infos") {
    if (!(await requireLeader(interaction))) {
      return true;
    }

    await sendInfoPanel(
      client,
      interaction
    );

    return true;
  }

  // INFOS BEARBEITEN
  if (command === "server-infos-bearbeiten") {
    if (!(await requireLeader(interaction))) {
      return true;
    }

    const state = getState(
      loadData()
    );

    await interaction.showModal(
      infoEditModal(state.info)
    );

    return true;
  }

  // EINLADUNGSLINK
  if (command === "server-einladung") {
    if (!(await requireLeader(interaction))) {
      return true;
    }

    await setInviteLink(
      client,
      interaction
    );

    return true;
  }

  // MANUELLE AKTUALISIERUNG
  if (command === "rollen-zaehler") {
    if (!(await requireLeader(interaction))) {
      return true;
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    const success = await syncVoiceInfoChannels(
      client,
      interaction.guildId,
      {
        force: true,
      }
    );

    await interaction.editReply(
      success
        ? "✅ Alle sieben CC-Info-Sprachkanäle wurden aktualisiert."
        : "⚠️ Aktualisierung fehlgeschlagen. Prüfe 'Kanäle verwalten' und das Terminal."
    );

    return true;
  }

  // INFOFORMULAR SPEICHERN
  if (
    interaction.isModalSubmit() &&
    interaction.customId ===
      "ccinfo_edit_modal"
  ) {
    if (!(await requireLeader(interaction))) {
      return true;
    }

    await saveInfoEdit(
      client,
      interaction
    );

    return true;
  }

  return false;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  infoPanelCommand,
  editInfoCommand,
  inviteInfoCommand,
  roleCounterCommand,

  handleServerInfoInteraction,

  startServerInfoUpdater,
  requestCounterRefresh,
};