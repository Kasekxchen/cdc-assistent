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
} = require("discord.js");

const CONFIG = require("../config");
const { loadData, saveData } = require("../utils/dataStore");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// CC SERVER-INFOS
// =====================================================
//
// WICHTIG:
// - KEINE neuen Sprachkanäle erstellen.
// - KEINE neue Kategorie erstellen.
// - Vorhandene Kanäle erkennen und wiederverwenden.
// - Nur Änderungen an Kanalnamen vornehmen.
// =====================================================

const LEADER_IDS = [
  "1542602740784562234",
  "1568850050312831118",
];

const MEMBER_ROLE = "1542602740771983553";
const HANGAROUND_ROLE = "1568852155543191603";

const CHECK_EVERY = 15 * 60 * 1000;
const MIN_COUNT_GAP = 10 * 60 * 1000;

const INFO_CHANNELS = [
  {
    key: "memberCounterChannelId",
    field: "members",
    prefix: "👥・Mitglieder:",
  },
  {
    key: "hangaroundCounterChannelId",
    field: "hangarounds",
    prefix: "🧊・Hangaround:",
  },
  {
    key: "funkChannelId",
    field: "funk",
    prefix: "📻・Funk:",
  },
  {
    key: "funkPasswordChannelId",
    field: "funkPassword",
    prefix: "🔑・Passwort-Funk:",
  },
  {
    key: "darkChatChannelId",
    field: "darkChat",
    prefix: "💬・Dark Chat:",
  },
  {
    key: "bennysPasswordChannelId",
    field: "bennysPassword",
    prefix: "🔧・Bennys PW:",
  },
  {
    key: "casaChannelId",
    field: "casa",
    prefix: "🏠・Casa:",
  },
];

const DEFAULT_INFO = {
  funk: "",
  funkPassword: "Drake",
  darkChat: "6WXME7",
  bennysPassword: "Ein Scheiß kriegst du",
  casa: "5009",
};

let timer = null;

const running = new Set();
const requested = new Map();

// =====================================================
// SLASH COMMANDS
// =====================================================

const infoPanelCommand = new SlashCommandBuilder()
  .setName("server-infos")
  .setDescription(
    "CC-Infotafel veröffentlichen oder aktualisieren."
  );

const editInfoCommand = new SlashCommandBuilder()
  .setName("server-infos-bearbeiten")
  .setDescription(
    "Funk, Passwörter und weitere CC-Infos bearbeiten."
  );

const inviteInfoCommand = new SlashCommandBuilder()
  .setName("server-einladung")
  .setDescription(
    "Einladungslink der CC-Infotafel ändern."
  )
  .addStringOption(option =>
    option
      .setName("link")
      .setDescription("HTTPS-Einladungslink")
      .setRequired(true)
      .setMaxLength(450)
  );

const roleCounterCommand = new SlashCommandBuilder()
  .setName("rollen-zaehler")
  .setDescription(
    "Vorhandene CC-Infokanäle manuell aktualisieren."
  );

// =====================================================
// DATENSPEICHER
// =====================================================

function stateOf(data) {
  data.ccServerInfo ||= {};

  const state = data.ccServerInfo;

  state.info ||= {};

  for (
    const [key, value]
    of Object.entries(DEFAULT_INFO)
  ) {
    if (state.info[key] == null) {
      state.info[key] = value;
    }
  }

  return state;
}

// =====================================================
// BERECHTIGUNGEN
// =====================================================

function hasAccess(member) {
  return LEADER_IDS.some(id =>
    member?.roles?.cache?.has?.(id) ||
    (
      Array.isArray(member?.roles) &&
      member.roles.includes(id)
    )
  );
}

async function requireAccess(interaction) {
  if (
    interaction.inGuild() &&
    hasAccess(interaction.member)
  ) {
    return true;
  }

  await safeReply(interaction, {
    content:
      "❌ Nur Leaderschaft oder Vollzugriff dürfen die Infos verwalten.",
    ephemeral: true,
  });

  return false;
}

// =====================================================
// TEXTFORMATIERUNG
// =====================================================

function clean(value, max = 75) {
  return String(value ?? "")
    .trim()
    .replace(/[\r\n]/g, " ")
    .replace(/@everyone|@here/gi, "Mitglied")
    .slice(0, max);
}

function escaped(value) {
  return (
    clean(value, 150) || "Nicht eingestellt"
  ).replace(
    /([*_`~|>\\])/g,
    "\\$1"
  );
}

function validUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// =====================================================
// ALLGEMEINE INFOS
// =====================================================

function infoEmbed(state) {
  return new EmbedBuilder()
    .setColor(0x2385c7)
    .setTitle("Allgemeine Infos")
    .setDescription(
      [
        `**Funk:** ${escaped(state.info.funk)}`,
        `**Passwort-Funk:** ${escaped(state.info.funkPassword)}`,
        `**Dark Chat:** ${escaped(state.info.darkChat)}`,
        `**Bennys PW:** ${escaped(state.info.bennysPassword)}`,
        `**Casa:** ${escaped(state.info.casa)}`,
        `**Invite-Link:** ${
          state.inviteUrl
            ? "Über den Button unten"
            : "Nicht eingestellt"
        }`,
      ].join("\n")
    )
    .setFooter({
      text:
        `${CONFIG.shortName || "CC"} • Allgemeine Infos`,
    });
}

function infoButtons(state) {
  if (!validUrl(state.inviteUrl)) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Einladungslink")
        .setStyle(ButtonStyle.Link)
        .setURL(state.inviteUrl)
    ),
  ];
}

// =====================================================
// BESTEHENDE INFOTAFEL AKTUALISIEREN
// =====================================================

async function updateInfoPanel(client, state) {
  if (
    !state.panelChannelId ||
    !state.panelMessageId
  ) {
    return false;
  }

  try {
    const channel = await client.channels.fetch(
      state.panelChannelId
    );

    const message = await channel.messages.fetch(
      state.panelMessageId
    );

    await message.edit({
      embeds: [infoEmbed(state)],
      components: infoButtons(state),
    });

    return true;

  } catch (error) {
    console.error(
      "❌ CC-Infotafel:",
      error
    );

    return false;
  }
}

// =====================================================
// INFOTAFEL VERÖFFENTLICHEN
// =====================================================

async function postPanel(client, interaction) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = stateOf(data);

  if (
    state.panelChannelId === interaction.channelId &&
    await updateInfoPanel(client, state)
  ) {
    return interaction.editReply(
      "✅ Bestehende Infotafel aktualisiert."
    );
  }

  const message = await sendToChannel(
    client,
    interaction.channelId,
    {
      embeds: [infoEmbed(state)],
      components: infoButtons(state),
    }
  );

  if (!message) {
    return interaction.editReply(
      "❌ Infotafel konnte nicht gesendet werden."
    );
  }

  state.panelChannelId = interaction.channelId;
  state.panelMessageId = message.id;

  saveData(data);

  return interaction.editReply(
    "✅ Infotafel veröffentlicht."
  );
}

// =====================================================
// INFOFORMULAR
// =====================================================

function editModal(info) {
  const modal = new ModalBuilder()
    .setCustomId("ccinfo_edit_modal")
    .setTitle("CC • Allgemeine Infos");

  const fields = [
    ["funk", "Funk"],
    ["funkPassword", "Passwort-Funk"],
    ["darkChat", "Dark Chat"],
    ["bennysPassword", "Bennys PW"],
    ["casa", "Casa"],
  ];

  for (const [key, label] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(key)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(90);

    if (info[key]) {
      input.setValue(
        clean(info[key], 90)
      );
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

// =====================================================
// INFOS SPEICHERN
// =====================================================

async function saveInfo(client, interaction) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = stateOf(data);

  for (const key of Object.keys(DEFAULT_INFO)) {
    state.info[key] = interaction.fields
      .getTextInputValue(key)
      .trim();
  }

  saveData(data);

  // Ausschließlich vorhandene Kanäle bearbeiten.
  const updated = await syncVoiceInfoChannels(
    client,
    interaction.guildId,
    {
      staticOnly: true,
    }
  );

  await updateInfoPanel(
    client,
    state
  );

  return interaction.editReply(
    updated
      ? "✅ Infos gespeichert und vorhandene Sprachkanäle aktualisiert."
      : "✅ Infos gespeichert. Kanalaktualisierung vorerst nicht möglich, siehe Railway-Logs."
  );
}

// =====================================================
// EINLADUNGSLINK
// =====================================================

async function setInvite(client, interaction) {
  const url = interaction.options
    .getString("link", true)
    .trim();

  if (!validUrl(url)) {
    return safeReply(interaction, {
      content:
        "❌ Ungültiger HTTPS-Link.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const data = loadData();
  const state = stateOf(data);

  state.inviteUrl = url;

  saveData(data);

  await updateInfoPanel(
    client,
    state
  );

  return interaction.editReply(
    "✅ Einladungslink gespeichert."
  );
}

// =====================================================
// VORHANDENE SPRACHKANÄLE FINDEN
// =====================================================
//
// 1. Zuerst die gespeicherte Kanal-ID prüfen.
// 2. Falls nicht vorhanden, serverweit nach
//    dem passenden Kanalnamen suchen.
// 3. Niemals einen neuen Kanal erstellen.
//
// =====================================================

async function findExistingVoice(
  guild,
  state,
  specification
) {
  const id = state[specification.key];

  const known = id
    ? guild.channels.cache.get(id)
    : null;

  if (
    known?.type === ChannelType.GuildVoice
  ) {
    return known;
  }

  const matched = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildVoice &&
      String(channel.name || "").startsWith(
        specification.prefix
      )
  );

  if (matched) {
    state[specification.key] = matched.id;
  }

  return matched || null;
}

// =====================================================
// MITGLIEDER UND HANGAROUNDS ZÄHLEN
// =====================================================

async function countRoles(guild) {
  let members = 0;
  let hangarounds = 0;

  let after;

  while (true) {
    const batch = await guild.members.list({
      limit: 1000,
      ...(after ? { after } : {}),
    });

    if (!batch.size) {
      break;
    }

    for (const member of batch.values()) {
      if (member.user?.bot) {
        continue;
      }

      if (
        member.roles.cache.has(MEMBER_ROLE)
      ) {
        members++;
      }

      if (
        member.roles.cache.has(HANGAROUND_ROLE)
      ) {
        hangarounds++;
      }
    }

    if (batch.size < 1000) {
      break;
    }

    const next = batch.lastKey();

    if (!next || next === after) {
      throw new Error(
        "Discord-Mitgliederliste konnte nicht vollständig gelesen werden."
      );
    }

    after = next;
  }

  return {
    members,
    hangarounds,
  };
}

// =====================================================
// VORHANDENE SPRACHKANÄLE AKTUALISIEREN
// =====================================================

async function syncVoiceInfoChannels(
  client,
  guildId,
  {
    force = false,
    staticOnly = false,
  } = {}
) {
  if (
    !guildId ||
    running.has(guildId)
  ) {
    return false;
  }

  running.add(guildId);

  try {
    const guild =
      client.guilds.cache.get(guildId) ||
      await client.guilds.fetch(guildId);

    // Vorhandene Kanäle abrufen.
    // KEINE neuen erstellen.
    await guild.channels.fetch();

    const data = loadData();
    const state = stateOf(data);

    const found = new Map();

    for (const specification of INFO_CHANNELS) {
      const channel = await findExistingVoice(
        guild,
        state,
        specification
      );

      if (channel) {
        found.set(
          specification.field,
          channel
        );
      } else {
        console.warn(
          `⚠️ CC-Infokanal fehlt (wird NICHT neu erstellt): ${specification.prefix}`
        );
      }
    }

    // Gefundene Kanal-IDs dauerhaft speichern.
    saveData(data);

    // =================================================
    // FESTE INFORMATIONEN
    // =================================================

    for (const specification of INFO_CHANNELS.slice(2)) {
      const channel = found.get(
        specification.field
      );

      if (!channel) {
        continue;
      }

      const expected = (
        `${specification.prefix} ` +
        `${
          clean(
            state.info[specification.field],
            70
          ) || "Nicht eingestellt"
        }`
      ).slice(0, 100);

      // Nur ändern, wenn der Wert abweicht.
      if (channel.name !== expected) {
        await channel.setName(
          expected,
          "CC-Info aktualisiert"
        );
      }
    }

    // =================================================
    // MITGLIEDERZAHLEN
    // =================================================

    const enoughTime =
      Date.now() -
      Number(state.lastCounterRefreshAt || 0) >=
      MIN_COUNT_GAP;

    if (
      !staticOnly &&
      (force || enoughTime)
    ) {
      const counts = await countRoles(guild);

      for (const specification of INFO_CHANNELS.slice(0, 2)) {
        const channel = found.get(
          specification.field
        );

        if (!channel) {
          continue;
        }

        const expected =
          `${specification.prefix} ` +
          `${counts[specification.field]}`;

        // Nur bei veränderter Zahl umbenennen.
        if (channel.name !== expected) {
          await channel.setName(
            expected,
            "CC-Rollenzähler aktualisiert"
          );
        }
      }

      state.lastCounterRefreshAt = Date.now();

      saveData(data);

      console.log(
        `✅ CC-Rollenzähler: ` +
        `${counts.members} Mitglieder / ` +
        `${counts.hangarounds} Hangarounds`
      );
    }

    return true;

  } catch (error) {
    console.error(
      "❌ CC-Sprachkanäle aktualisieren:",
      error
    );

    return false;

  } finally {
    running.delete(guildId);
  }
}

// =====================================================
// AKTUALISIERUNG BEI ROLLENÄNDERUNGEN
// =====================================================

function requestCounterRefresh(client, guildId) {
  if (
    !guildId ||
    requested.has(guildId)
  ) {
    return;
  }

  const state = stateOf(loadData());

  const remaining =
    MIN_COUNT_GAP -
    (
      Date.now() -
      Number(state.lastCounterRefreshAt || 0)
    );

  const timeout = setTimeout(async () => {
    requested.delete(guildId);

    await syncVoiceInfoChannels(
      client,
      guildId
    );
  }, Math.max(45000, remaining + 2000));

  requested.set(guildId, timeout);
}

// =====================================================
// AUTOMATISCHER START
// =====================================================

function startServerInfoUpdater(client) {
  if (timer) {
    return;
  }

  const guildId = process.env.GUILD_ID;

  if (!guildId) {
    console.error(
      "❌ CC-Infokanäle: GUILD_ID fehlt."
    );

    return;
  }

  // Beim Start ausschließlich vorhandene
  // Sprachkanäle suchen und aktualisieren.
  void syncVoiceInfoChannels(
    client,
    guildId,
    {
      force: true,
    }
  );

  // Danach alle 15 Minuten prüfen.
  timer = setInterval(() => {
    void syncVoiceInfoChannels(
      client,
      guildId
    );
  }, CHECK_EVERY);
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
    : "";

  if (
    [
      "server-infos",
      "server-infos-bearbeiten",
      "server-einladung",
      "rollen-zaehler",
    ].includes(command)
  ) {
    if (
      !await requireAccess(interaction)
    ) {
      return true;
    }

    if (command === "server-infos") {
      await postPanel(
        client,
        interaction
      );
    }

    if (command === "server-infos-bearbeiten") {
      await interaction.showModal(
        editModal(
          stateOf(loadData()).info
        )
      );
    }

    if (command === "server-einladung") {
      await setInvite(
        client,
        interaction
      );
    }

    if (command === "rollen-zaehler") {
      await interaction.deferReply({
        ephemeral: true,
      });

      const updated = await syncVoiceInfoChannels(
        client,
        interaction.guildId,
        {
          force: true,
        }
      );

      await interaction.editReply(
        updated
          ? "✅ Vorhandene Infokanäle aktualisiert."
          : "❌ Aktualisierung fehlgeschlagen, siehe Railway-Logs."
      );
    }

    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId === "ccinfo_edit_modal"
  ) {
    if (
      !await requireAccess(interaction)
    ) {
      return true;
    }

    await saveInfo(
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