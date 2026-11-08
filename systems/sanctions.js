const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const CONFIG = require("../config");
const { loadData, saveData } = require("../utils/dataStore");
const { hasLeaderPermission } = require("../utils/permissions");
const { sendToChannel, safeReply } = require("../utils/discord");

// =====================================================
// SLASH COMMAND
// =====================================================

const leaderPanelCommand = new SlashCommandBuilder()
  .setName("leaderpanel")
  .setDescription("Sendet das CC-Leaderpanel.");

// =====================================================
// ENTWÜRFE
// =====================================================

const sanctionDrafts = new Map();

// =====================================================
// SANKTIONSKATEGORIEN
// =====================================================

const SANCTION_CATEGORIES = [
  {
    id: "allgemein",
    label: "Allgemeine Pflichten",
    emoji: "📋",
  },
  {
    id: "familie",
    label: "Verhalten innerhalb der Familie",
    emoji: "🤝",
  },
  {
    id: "schwer",
    label: "Gewalt und schwerwiegende Verstöße",
    emoji: "⚠️",
  },
  {
    id: "funk",
    label: "Funk und Kommunikation",
    emoji: "📻",
  },
  {
    id: "fahrzeuge",
    label: "Kolonne und Fahrzeuge",
    emoji: "🚗",
  },
  {
    id: "zahlungen",
    label: "Zahlungen",
    emoji: "💰",
  },
];

// =====================================================
// SANKTIONSKATALOG
// =====================================================

const SANCTION_CATALOG = [
  // ALLGEMEINE PFLICHTEN
  {
    id: "p1",
    categoryId: "allgemein",
    label: "§1 Nicht im Funk sein, ohne Abmeldung",
    amount: 140000,
  },
  {
    id: "p2",
    categoryId: "allgemein",
    label: "§2 Nichttragen der Familienkleidung während Familienaktionen",
    amount: 350000,
  },
  {
    id: "p3",
    categoryId: "allgemein",
    label: "§3 Bei einer Aufstellung angemeldet, aber nicht anwesend",
    amount: 100000,
  },
  {
    id: "p4",
    categoryId: "allgemein",
    label: "§4 Nichteinhaltung der Funkdisziplin",
    amount: 140000,
  },
  {
    id: "p5",
    categoryId: "allgemein",
    label: "§5 Unangemessenes Verhalten in der Öffentlichkeit, das die Familie gefährdet",
    amount: 350000,
  },
  {
    id: "p6",
    categoryId: "allgemein",
    label: "§6 Unangemeldete Teilnahme an Aktivitäten, die die Familie gefährden",
    amount: 420000,
  },
  {
    id: "p7",
    categoryId: "allgemein",
    label: "§7 Beleidigungen jeglicher Art",
    amount: 150000,
  },
  {
    id: "p8",
    categoryId: "allgemein",
    label: "§8 Fehlende Grundausstattung",
    amount: 170000,
  },
  {
    id: "p9",
    categoryId: "allgemein",
    label: "§9 Nach einem Up-Rank fragen",
    amount: 300000,
    special: "Downrank",
  },

  // VERHALTEN INNERHALB DER FAMILIE
  {
    id: "p10",
    categoryId: "familie",
    label: "§10 Zinken von Familienmitgliedern",
    amount: 200000,
  },
  {
    id: "p11",
    categoryId: "familie",
    label: "§11 Nicht auf die Aufstellung reagieren",
    amount: 100000,
  },
  {
    id: "p12",
    categoryId: "familie",
    label: "§12 Eine Waffe nicht zurückbringen",
    amount: 700000,
  },
  {
    id: "p13",
    categoryId: "familie",
    label: "§13 Missbrauch von Familiengeldern für persönliche Zwecke",
    amount: 700000,
  },
  {
    id: "p14",
    categoryId: "familie",
    label: "§14 Respektlosigkeit innerhalb der Familie oder gegenüber der Leaderschaft",
    amount: 350000,
  },
  {
    id: "p15",
    categoryId: "familie",
    label: "§15 Nichteinhaltung von Befehlen während Missionen",
    amount: 280000,
  },
  {
    id: "p16",
    categoryId: "familie",
    label: "§16 Streitigkeiten oder Unruhe innerhalb der Familie stiften",
    amount: 280000,
  },
  {
    id: "p17",
    categoryId: "familie",
    label: "§17 Unangemessenes Benehmen auf dem Anwesen",
    amount: 150000,
  },
  {
    id: "p18",
    categoryId: "familie",
    label: "§18 Unnötiges Schlagen oder Überfahren von Familienmitgliedern",
    amount: 200000,
  },
  {
    id: "p19",
    categoryId: "familie",
    label: "§19 Fehlende Disziplin bei Aufstellungen",
    amount: 300000,
  },
  {
    id: "p20",
    categoryId: "familie",
    label: "§20 Respektloses Verhalten gegenüber anderen Familien oder Fremden",
    amount: 250000,
  },
  {
    id: "p21",
    categoryId: "familie",
    label: "§21 Missachtung eines Befehls der Leaderschaft",
    amount: 750000,
  },

  // GEWALT UND SCHWERWIEGENDE VERSTÖSSE
  {
    id: "p22",
    categoryId: "schwer",
    label: "§22 Schießen auf Familienmitglieder",
    amount: 500000,
  },
  {
    id: "p23",
    categoryId: "schwer",
    label: "§23 Grundloses Töten oder Bewusstlosschießen eines Familienmitglieds",
    amount: 0,
    special: "Bloodout",
  },
  {
    id: "p24",
    categoryId: "schwer",
    label: "§24 Verkauf oder Preisgabe der Familie",
    amount: 0,
    special: "Bloodout",
  },
  {
    id: "p25",
    categoryId: "schwer",
    label: "§25 Unnötiges Schießen auf dem Anwesen",
    amount: 150000,
  },

  // FUNK UND KOMMUNIKATION
  {
    id: "p26",
    categoryId: "funk",
    label: "§26 Privatgespräche im Funk",
    amount: 100000,
  },
  {
    id: "p27",
    categoryId: "funk",
    label: "§27 Alleingänge ohne Rücksprache bei Operationen",
    amount: 350000,
  },
  {
    id: "p28",
    categoryId: "funk",
    label: "§28 Versagen in kritischen Situationen aufgrund von Fahrlässigkeit",
    amount: 280000,
  },
  {
    id: "p29",
    categoryId: "funk",
    label: "§29 Nichtbefolgen von Einsatzbefehlen",
    amount: 280000,
  },
  {
    id: "p30",
    categoryId: "funk",
    label: "§30 Feindkontakte während einer Operation nicht melden",
    amount: 140000,
  },
  {
    id: "p31",
    categoryId: "funk",
    label: "§31 Verlassen des Einsatzortes ohne Erlaubnis",
    amount: 140000,
  },
  {
    id: "p32",
    categoryId: "funk",
    label: "§32 Nicht auf einen Rapidoruf im Funk reagieren",
    amount: 210000,
  },
  {
    id: "p33",
    categoryId: "funk",
    label: "§33 Missbrauch des Rapidorufs",
    amount: 700000,
  },
  {
    id: "p34",
    categoryId: "funk",
    label: "§34 Einsammeln von Gefechtswaffen oder Beständen ohne Rückgabe",
    amount: 0,
    special: "Bloodout",
  },
  {
    id: "p35",
    categoryId: "funk",
    label: "§35 Nicht auf den Funker hören",
    amount: 500000,
  },

  // KOLONNE UND FAHRZEUGE
  {
    id: "p36",
    categoryId: "fahrzeuge",
    label: "§36 Absichtliches Pitten innerhalb der Kolonne",
    amount: 150000,
  },
  {
    id: "p37",
    categoryId: "fahrzeuge",
    label: "§37 Auf die Reifen von Familienmitgliedern schießen",
    amount: 200000,
  },
  {
    id: "p38",
    categoryId: "fahrzeuge",
    label: "§38 Kolonne nicht rechtzeitig aufgestellt",
    amount: 150000,
  },

  // ZAHLUNGEN
  {
    id: "p39",
    categoryId: "zahlungen",
    label: "§39 Sanktionen nicht rechtzeitig und ohne triftigen Grund beglichen",
    percent: 30,
  },
];

// =====================================================
// HILFSFUNKTIONEN
// =====================================================

function formatMoney(amount) {
  return `${Number(amount || 0).toLocaleString("de-DE")}$`;
}

function parseMoney(input) {
  const cleaned = String(input || "")
    .trim()
    .replace(/[.$\s]/g, "");

  if (!/^\d+$/.test(cleaned)) return null;

  const amount = Number(cleaned);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    return null;
  }

  return amount;
}

function createShortSanctionId() {
  return `cc${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function getUnixTimestamp(ms) {
  return Math.floor(Number(ms || Date.now()) / 1000);
}

function getDueAt() {
  const days = Number(CONFIG.sanctionDueDays || 7);
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function formatDateTime(ms) {
  if (!ms) return "—";

  return new Date(ms).toLocaleString("de-DE", {
    timeZone: CONFIG.timezone || "Europe/Berlin",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCatalogItem(itemId) {
  return SANCTION_CATALOG.find((item) => item.id === itemId) || null;
}

function getCategory(categoryId) {
  return SANCTION_CATEGORIES.find(
    (category) => category.id === categoryId
  ) || null;
}

function getCatalogItemsByCategory(categoryId) {
  return SANCTION_CATALOG.filter(
    (item) => item.categoryId === categoryId
  );
}

function getMemberDisplayName(member, user) {
  return (
    member?.displayName ||
    user?.globalName ||
    user?.username ||
    "Unbekannt"
  );
}

function hasAnyRole(member, roleIds = []) {
  if (!member || !member.roles || !member.roles.cache) {
    return false;
  }

  return roleIds.some((roleId) =>
    member.roles.cache.has(roleId)
  );
}

function hasSanctionPermission(member) {
  return (
    hasLeaderPermission(member) ||
    hasAnyRole(member, CONFIG.sanctionCreatorRoleIds || [])
  );
}

function cleanText(input, fallback = "—") {
  const value = String(input || "").trim();
  if (!value) return fallback;
  return value.slice(0, 500);
}

function getDraft(userId) {
  return sanctionDrafts.get(userId) || null;
}

function createNewDraft(userId) {
  const draft = {
    creatorId: userId,
    targetId: null,
    targetName: null,
    items: [],
    createdAt: Date.now(),
  };

  sanctionDrafts.set(userId, draft);
  return draft;
}

function getItemAmount(item) {
  return Number(item.amount ?? item.metalAmount ?? 0) || 0;
}

function getDraftTotal(draft) {
  return (draft?.items || []).reduce(
    (sum, item) => sum + getItemAmount(item),
    0
  );
}

function getSanctionTotalAmount(sanction) {
  if (
    sanction.totalAmount != null &&
    Number.isFinite(Number(sanction.totalAmount))
  ) {
    return Number(sanction.totalAmount);
  }

  return (sanction.items || []).reduce(
    (sum, item) => sum + getItemAmount(item),
    0
  );
}

// =====================================================
// SANKTIONEN FORMATIEREN
// =====================================================

function formatDraftItems(items = []) {
  if (!items.length) {
    return "┖ Noch kein Vergehen ausgewählt";
  }

  return items
    .map((item) => {
      const amount = getItemAmount(item);

      const extra =
        item.special ||
        (item.catalogId === "p39" ? null : item.note);

      return [
        `**${item.reason}**`,
        amount > 0
          ? `┖ ${formatMoney(amount)}`
          : "┖ Keine Geldstrafe",
        extra ? `┖ Sonderstrafe: ${extra}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n")
    .slice(0, 1000);
}

function formatFinalSanctionItems(items = []) {
  if (!items.length) {
    return "Keine Vergehen eingetragen";
  }

  return items
    .map((item) => {
      const amount = getItemAmount(item);

      return [
        `**${item.reason}**`,
        amount > 0
          ? `┖ ${formatMoney(amount)}`
          : "┖ Keine Geldstrafe",
        item.catalogId === "p39" && item.note
          ? `┖ ${item.note}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n")
    .slice(0, 1024);
}

function getSpecialPunishments(items = []) {
  const notes = items
    .map((item) =>
      item.special ||
      (item.catalogId === "p39" ? null : item.note)
    )
    .filter(Boolean);

  return notes.length
    ? [...new Set(notes)].join("\n").slice(0, 1024)
    : "Keine";
}

// =====================================================
// LEADERPANEL
// =====================================================

function createLeaderPanelEmbed() {
  return new EmbedBuilder()
    .setColor(CONFIG.embedColor)
    .setTitle("👑 • LEADER CENTER")
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        "Sanktionen verwalten.",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .setFooter({
      text: `${CONFIG.shortName} • Leader Center`,
    });
}

function createLeaderPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("leader_create_sanction")
      .setLabel("Sanktion")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Danger)
  );
}

async function sendLeaderPanel(client, interaction) {
  if (!hasLeaderPermission(interaction.member)) {
    return safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, das Leaderpanel zu senden.",
      ephemeral: true,
    });
  }

  const channelId =
    CONFIG.leaderPanelChannelId || CONFIG.sanctionChannelId;

  const message = await sendToChannel(client, channelId, {
    embeds: [createLeaderPanelEmbed()],
    components: [createLeaderPanelButtons()],
  });

  if (!message) {
    return safeReply(interaction, {
      content: "❌ Leaderpanel konnte nicht gesendet werden.",
      ephemeral: true,
    });
  }

  return safeReply(interaction, {
    content: `✅ Leaderpanel wurde in <#${channelId}> gesendet.`,
    ephemeral: true,
  });
}

// =====================================================
// SANKTIONSENTWURF
// =====================================================

function createTargetSelectRow() {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("sanction_target_select")
      .setPlaceholder("Person auswählen")
      .setMinValues(1)
      .setMaxValues(1)
  );
}

function createDraftEmbed(draft) {
  const personText = draft.targetId
    ? `<@${draft.targetId}>`
    : "Noch nicht ausgewählt";

  return new EmbedBuilder()
    .setColor(CONFIG.warningColor)
    .setTitle("⚠️ • SANKTIONSENTWURF")
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "👤 **BETROFFENE PERSON**",
        `┖ ${personText}`,
        "",
        "📋 **AUSGEWÄHLTE VERGEHEN**",
        formatDraftItems(draft.items),
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "💵 **GESAMTABGABE**",
        `┖ **${formatMoney(getDraftTotal(draft))}**`,
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .setFooter({
      text: `${CONFIG.shortName} • Sanktionsentwurf`,
    });
}

function createDraftButtons(draft) {
  const hasTarget = Boolean(draft.targetId);
  const hasItems = draft.items.length > 0;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sanction_add_catalog")
        .setLabel("Aus Katalog")
        .setEmoji("📚")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasTarget),

      new ButtonBuilder()
        .setCustomId("sanction_add_custom")
        .setLabel("Freier Grund")
        .setEmoji("✍️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasTarget),

      new ButtonBuilder()
        .setCustomId("sanction_finish")
        .setLabel("Sanktion posten")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasTarget || !hasItems),

      new ButtonBuilder()
        .setCustomId("sanction_abort")
        .setLabel("Abbrechen")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

// =====================================================
// KATEGORIEAUSWAHL
// =====================================================

function createCategorySelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sanction_category_select")
      .setPlaceholder("Kategorie auswählen")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        SANCTION_CATEGORIES.map((category) => ({
          label: category.label,
          value: category.id,
          emoji: category.emoji,
        }))
      )
  );
}

function createCategorySelectionEmbed() {
  return new EmbedBuilder()
    .setColor(CONFIG.embedColor)
    .setTitle("📚 • SANKTIONSKATALOG")
    .setDescription(
      "Wähle eine Kategorie aus, um die dazugehörigen Vergehen anzuzeigen."
    )
    .setFooter({
      text: `${CONFIG.shortName} • Kategorieauswahl`,
    });
}

// =====================================================
// VERGEHENSAUSWAHL
// =====================================================

function createOffenseSelectRow(categoryId) {
  const items = getCatalogItemsByCategory(categoryId).slice(0, 25);
  const category = getCategory(categoryId);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sanction_offense_select_${categoryId}`)
      .setPlaceholder(`${category?.label || "Vergehen"} auswählen`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        items.map((item) => ({
          label: item.label.slice(0, 100),
          value: item.id,
          description: item.percent
            ? "30 % des ursprünglichen Betrags"
            : item.special
              ? item.amount > 0
                ? `${formatMoney(item.amount)} + ${item.special}`
                : item.special
              : formatMoney(item.amount),
        }))
      )
  );
}

function createOffenseSelectionEmbed(categoryId) {
  const category = getCategory(categoryId);

  return new EmbedBuilder()
    .setColor(CONFIG.embedColor)
    .setTitle(`${category.emoji} • ${category.label}`)
    .setDescription(
      [
        "Wähle das gewünschte Vergehen aus.",
        "",
        "Der Geldbetrag wird automatisch aus dem Sanktionskatalog übernommen.",
      ].join("\n")
    )
    .setFooter({
      text: `${CONFIG.shortName} • Sanktionsauswahl`,
    });
}

// =====================================================
// NEU: ZURÜCK ZUR KATEGORIEAUSWAHL
// =====================================================

function createBackToCategoriesRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sanction_back_categories")
      .setLabel("Zurück zu den Kategorien")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );
}

// =====================================================
// MODAL: EIGENE SANKTION
// =====================================================

function createCustomSanctionModal() {
  const modal = new ModalBuilder()
    .setCustomId("sanction_custom_modal")
    .setTitle("✍️ Freien Grund hinzufügen");

  const reasonInput = new TextInputBuilder()
    .setCustomId("sanction_reason")
    .setLabel("Grund / Vergehen")
    .setPlaceholder("z. B. Respektloses Verhalten")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(100)
    .setRequired(true);

  const amountInput = new TextInputBuilder()
    .setCustomId("sanction_amount")
    .setLabel("Geldbetrag ($)")
    .setPlaceholder("z. B. 150000")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(15)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId("sanction_note")
    .setLabel("Sonderstrafe / Zusatz (optional)")
    .setPlaceholder("z. B. Downrank oder Bloodout")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(reasonInput),
    new ActionRowBuilder().addComponents(amountInput),
    new ActionRowBuilder().addComponents(noteInput)
  );

  return modal;
}

// =====================================================
// MODAL: §39
// =====================================================

function createLatePaymentModal(item) {
  const modal = new ModalBuilder()
    .setCustomId(`sanction_percent_modal_${item.id}`)
    .setTitle("§39 – 30 % Zusatzsanktion");

  const baseInput = new TextInputBuilder()
    .setCustomId("sanction_base_amount")
    .setLabel("Ursprüngliche Sanktion in $")
    .setPlaceholder("z. B. 100000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(baseInput)
  );

  return modal;
}

// =====================================================
// STATUS
// =====================================================

function getSanctionStatusText(sanction) {
  if (sanction.status === "paid") return "Bezahlt";
  if (sanction.status === "cancelled") return "Storniert";
  if (sanction.status === "overdue") return "Überfällig";
  return "Offen";
}

function getSanctionStatusEmoji(sanction) {
  if (sanction.status === "paid") return "✅";
  if (sanction.status === "cancelled") return "❌";
  if (sanction.status === "overdue") return "⏰";
  return "⏳";
}

// =====================================================
// FERTIGES SANKTIONS-EMBED
// =====================================================

function createSanctionEmbed(sanction) {
  const statusText = getSanctionStatusText(sanction);
  const statusEmoji = getSanctionStatusEmoji(sanction);
  const totalAmount = getSanctionTotalAmount(sanction);

  const color =
    sanction.status === "paid"
      ? CONFIG.successColor
      : sanction.status === "cancelled"
        ? CONFIG.dangerColor
        : CONFIG.warningColor;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      `${statusEmoji === "⏳" ? "🚫" : statusEmoji} SANKTION ${
        statusEmoji === "⏳" ? "🚫" : statusEmoji
      }`
    )
    .addFields(
      {
        name: "Name",
        value: `<@${sanction.targetId}>`,
        inline: false,
      },
      {
        name: "Sanktion",
        value: formatFinalSanctionItems(sanction.items),
        inline: false,
      },
      {
        name: "Zu bezahlen",
        value: `**${formatMoney(totalAmount)}**`,
        inline: true,
      },
      {
        name: "Sonderstrafe",
        value: getSpecialPunishments(sanction.items),
        inline: true,
      },
      {
        name: "Zeitraum",
        value: [
          `Erstellt: ${formatDateTime(sanction.createdAt)}`,
          `Frist: ${formatDateTime(sanction.dueAt)}`,
          `Restzeit: <t:${getUnixTimestamp(sanction.dueAt)}:R>`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "Ausgestellt von",
        value: `<@${sanction.creatorId}>`,
        inline: true,
      },
      {
        name: "Status",
        value: `${statusEmoji} ${statusText}`,
        inline: true,
      }
    )
    .setFooter({
      text: `${CONFIG.shortName} • Sanktions-ID: ${sanction.id}`,
    });

  if (sanction.status === "paid") {
    embed.addFields({
      name: "Bezahlt",
      value: `Von <@${sanction.paidBy}> am ${formatDateTime(sanction.paidAt)}`,
      inline: false,
    });
  }

  if (sanction.status === "cancelled") {
    embed.addFields({
      name: "Storniert",
      value: `Von <@${sanction.cancelledBy}> am ${formatDateTime(sanction.cancelledAt)}`,
      inline: false,
    });
  }

  return embed;
}

function createSanctionButtons(sanction) {
  const isDone =
    sanction.status === "paid" ||
    sanction.status === "cancelled";

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sanction_paid_${sanction.id}`)
      .setLabel("Bezahlt markieren")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isDone),

    new ButtonBuilder()
      .setCustomId(`sanction_cancel_${sanction.id}`)
      .setLabel("Stornieren")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isDone)
  );
}

// =====================================================
// SANKTION POSTEN
// =====================================================

async function postSanction(client, interaction, draft) {
  const sanction = {
    id: createShortSanctionId(),
    targetId: draft.targetId,
    targetName: draft.targetName,
    creatorId: draft.creatorId,
    items: draft.items,
    totalAmount: getDraftTotal(draft),
    status: "open",
    createdAt: Date.now(),
    dueAt: getDueAt(),
    messageId: null,
    paidBy: null,
    paidAt: null,
    cancelledBy: null,
    cancelledAt: null,
    overdueNotified: false,
  };

  const message = await sendToChannel(
    client,
    CONFIG.sanctionChannelId,
    {
      content: `<@${sanction.targetId}>`,
      embeds: [createSanctionEmbed(sanction)],
      components: [createSanctionButtons(sanction)],
      allowedMentions: {
        users: [sanction.targetId],
      },
    }
  );

  if (!message) {
    return safeReply(interaction, {
      content:
        "❌ Sanktion konnte nicht gesendet werden. Bitte prüfe Channel-ID und Bot-Rechte.",
      ephemeral: true,
    });
  }

  sanction.messageId = message.id;

  const data = loadData();

  if (!data.sanctions) {
    data.sanctions = {};
  }

  data.sanctions[sanction.id] = sanction;
  saveData(data);

  sanctionDrafts.delete(interaction.user.id);

  return safeReply(interaction, {
    content:
      `✅ Sanktion wurde in <#${CONFIG.sanctionChannelId}> erstellt.\n` +
      `💵 Gesamtabgabe: **${formatMoney(sanction.totalAmount)}**`,
    ephemeral: true,
  });
}

// =====================================================
// SANKTION AKTUALISIEREN
// =====================================================

async function updateSanctionMessage(client, sanction) {
  if (!sanction.messageId) return null;

  const channel = await client.channels
    .fetch(CONFIG.sanctionChannelId)
    .catch(() => null);

  if (!channel || !channel.messages) return null;

  const message = await channel.messages
    .fetch(sanction.messageId)
    .catch(() => null);

  if (!message) return null;

  await message.edit({
    embeds: [createSanctionEmbed(sanction)],
    components: [createSanctionButtons(sanction)],
  }).catch(() => null);

  return message;
}

// =====================================================
// SLASH COMMAND HANDLER
// =====================================================

async function handleLeaderPanelCommand(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName !== "leaderpanel") {
    return false;
  }

  await sendLeaderPanel(client, interaction);
  return true;
}

// =====================================================
// LEADERPANEL: SANKTION ERSTELLEN
// =====================================================

async function handleCreateSanctionButton(client, interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId !== "leader_create_sanction") {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const draft = createNewDraft(interaction.user.id);

  await safeReply(interaction, {
    embeds: [createDraftEmbed(draft)],
    components: [createTargetSelectRow()],
    ephemeral: true,
  });

  return true;
}

// =====================================================
// PERSON AUSWÄHLEN
// =====================================================

async function handleTargetSelect(client, interaction) {
  if (!interaction.isUserSelectMenu()) return false;

  if (interaction.customId !== "sanction_target_select") {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const draft =
    getDraft(interaction.user.id) ||
    createNewDraft(interaction.user.id);

  const targetId = interaction.values?.[0];

  if (!targetId) {
    await safeReply(interaction, {
      content: "❌ Keine Person ausgewählt.",
      ephemeral: true,
    });
    return true;
  }

  const member = await interaction.guild.members
    .fetch(targetId)
    .catch(() => null);

  draft.targetId = targetId;
  draft.targetName = member
    ? getMemberDisplayName(member, member.user)
    : `<@${targetId}>`;

  sanctionDrafts.set(interaction.user.id, draft);

  await interaction.update({
    embeds: [createDraftEmbed(draft)],
    components: createDraftButtons(draft),
  });

  return true;
}

// =====================================================
// BUTTONS IM SANKTIONSENTWURF
// =====================================================

async function handleDraftButtons(client, interaction) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId;

  if (![
    "sanction_add_catalog",
    "sanction_add_custom",
    "sanction_finish",
    "sanction_abort",
  ].includes(customId)) {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const draft = getDraft(interaction.user.id);

  if (!draft) {
    await safeReply(interaction, {
      content:
        "❌ Kein aktiver Sanktionsentwurf gefunden. Bitte starte erneut über das Leaderpanel.",
      ephemeral: true,
    });
    return true;
  }

  if (customId === "sanction_abort") {
    sanctionDrafts.delete(interaction.user.id);

    await interaction.update({
      content: "❌ Sanktionsentwurf abgebrochen.",
      embeds: [],
      components: [],
    });

    return true;
  }

  if (customId === "sanction_add_catalog") {
    await interaction.update({
      embeds: [createCategorySelectionEmbed()],
      components: [createCategorySelectRow()],
    });

    return true;
  }

  if (customId === "sanction_add_custom") {
    await interaction.showModal(createCustomSanctionModal());
    return true;
  }

  if (customId === "sanction_finish") {
    if (!draft.targetId || !draft.items.length) {
      await safeReply(interaction, {
        content:
          "❌ Bitte wähle zuerst eine Person und mindestens eine Sanktion aus.",
        ephemeral: true,
      });
      return true;
    }

    await postSanction(client, interaction, draft);
    return true;
  }

  return false;
}

// =====================================================
// KATEGORIE AUSWÄHLEN
// =====================================================

async function handleCategorySelect(client, interaction) {
  if (!interaction.isStringSelectMenu()) return false;

  if (interaction.customId !== "sanction_category_select") {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const draft = getDraft(interaction.user.id);

  if (!draft?.targetId) {
    await safeReply(interaction, {
      content: "❌ Kein gültiger Sanktionsentwurf vorhanden.",
      ephemeral: true,
    });
    return true;
  }

  const categoryId = interaction.values?.[0];
  const category = getCategory(categoryId);

  if (!category) {
    await safeReply(interaction, {
      content: "❌ Kategorie wurde nicht gefunden.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.update({
    embeds: [createOffenseSelectionEmbed(categoryId)],
    components: [
      createOffenseSelectRow(categoryId),
      createBackToCategoriesRow(),
    ],
  });

  return true;
}

// =====================================================
// NEU: ZURÜCK ZU DEN KATEGORIEN
// =====================================================

async function handleBackToCategoriesButton(client, interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId !== "sanction_back_categories") {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const draft = getDraft(interaction.user.id);

  if (!draft?.targetId) {
    await safeReply(interaction, {
      content:
        "❌ Kein aktiver Sanktionsentwurf gefunden. Bitte starte erneut über das Leaderpanel.",
      ephemeral: true,
    });
    return true;
  }

  // Der vorhandene Entwurf wird NICHT gelöscht.
  // Nur die Discord-Auswahl wird zurückgesetzt.

  await interaction.update({
    embeds: [createCategorySelectionEmbed()],
    components: [createCategorySelectRow()],
  });

  return true;
}

// =====================================================
// VERGEHEN AUSWÄHLEN
// =====================================================

async function handleOffenseSelect(client, interaction) {
  if (!interaction.isStringSelectMenu()) return false;

  if (!interaction.customId.startsWith("sanction_offense_select_")) {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
      ephemeral: true,
    });
    return true;
  }

  const itemId = interaction.values?.[0];
  const catalogItem = getCatalogItem(itemId);

  if (!catalogItem) {
    await safeReply(interaction, {
      content: "❌ Dieses Vergehen wurde nicht gefunden.",
      ephemeral: true,
    });
    return true;
  }

  const draft = getDraft(interaction.user.id);

  if (!draft?.targetId) {
    await safeReply(interaction, {
      content:
        "❌ Bitte starte zunächst einen Sanktionsentwurf und wähle eine Person aus.",
      ephemeral: true,
    });
    return true;
  }

  // §39 benötigt den ursprünglichen Geldbetrag.

  if (catalogItem.percent) {
    await interaction.showModal(
      createLatePaymentModal(catalogItem)
    );
    return true;
  }

  draft.items.push({
    reason: catalogItem.label,
    amount: catalogItem.amount,
    special: catalogItem.special || null,
    note: null,
    catalogId: catalogItem.id,
  });

  sanctionDrafts.set(interaction.user.id, draft);

  await interaction.update({
    embeds: [createDraftEmbed(draft)],
    components: createDraftButtons(draft),
  });

  return true;
}

// =====================================================
// MODALS VERARBEITEN
// =====================================================

async function handleDraftModals(client, interaction) {
  if (!interaction.isModalSubmit()) return false;

  // EIGENE SANKTION

  if (interaction.customId === "sanction_custom_modal") {
    if (!hasSanctionPermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Du hast keine Berechtigung, Sanktionen zu erstellen.",
        ephemeral: true,
      });
      return true;
    }

    const draft = getDraft(interaction.user.id);

    if (!draft?.targetId) {
      await safeReply(interaction, {
        content: "❌ Kein gültiger Sanktionsentwurf gefunden.",
        ephemeral: true,
      });
      return true;
    }

    const reason = cleanText(
      interaction.fields.getTextInputValue("sanction_reason")
    );

    const amount = parseMoney(
      interaction.fields.getTextInputValue("sanction_amount")
    );

    const note = cleanText(
      interaction.fields.getTextInputValue("sanction_note"),
      ""
    );

    if (amount === null || (amount === 0 && !note)) {
      await safeReply(interaction, {
        content:
          "❌ Bitte einen gültigen Dollarbetrag eingeben. Bei einer reinen Sonderstrafe ist 0 möglich.",
        ephemeral: true,
      });
      return true;
    }

    draft.items.push({
      reason,
      amount,
      note: null,
      special: note || null,
      catalogId: null,
    });

    sanctionDrafts.set(interaction.user.id, draft);

    await safeReply(interaction, {
      embeds: [createDraftEmbed(draft)],
      components: createDraftButtons(draft),
      ephemeral: true,
    });

    return true;
  }

  // §39 – 30 % ZUSATZSANKTION

  if (interaction.customId.startsWith("sanction_percent_modal_")) {
    if (!hasSanctionPermission(interaction.member)) {
      await safeReply(interaction, {
        content: "❌ Keine Berechtigung.",
        ephemeral: true,
      });
      return true;
    }

    const itemId = interaction.customId.replace(
      "sanction_percent_modal_",
      ""
    );

    const catalogItem = getCatalogItem(itemId);
    const draft = getDraft(interaction.user.id);

    if (!catalogItem?.percent || !draft?.targetId) {
      await safeReply(interaction, {
        content: "❌ Kein gültiger Entwurf vorhanden.",
        ephemeral: true,
      });
      return true;
    }

    const baseAmount = parseMoney(
      interaction.fields.getTextInputValue("sanction_base_amount")
    );

    if (!baseAmount || baseAmount <= 0) {
      await safeReply(interaction, {
        content:
          "❌ Bitte einen gültigen ursprünglichen Betrag eingeben.",
        ephemeral: true,
      });
      return true;
    }

    draft.items.push({
      reason: catalogItem.label,
      amount: Math.round(
        (baseAmount * catalogItem.percent) / 100
      ),
      special: null,
      note: `30 % von ${formatMoney(baseAmount)}`,
      catalogId: catalogItem.id,
    });

    sanctionDrafts.set(interaction.user.id, draft);

    await safeReply(interaction, {
      embeds: [createDraftEmbed(draft)],
      components: createDraftButtons(draft),
      ephemeral: true,
    });

    return true;
  }

  return false;
}

// =====================================================
// BEZAHLT / STORNIERT
// =====================================================

async function handlePostedSanctionButtons(client, interaction) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId;

  let action = null;
  let sanctionId = null;

  if (customId.startsWith("sanction_paid_")) {
    action = "paid";
    sanctionId = customId.replace("sanction_paid_", "");
  } else if (customId.startsWith("sanction_cancel_")) {
    action = "cancel";
    sanctionId = customId.replace("sanction_cancel_", "");
  } else {
    return false;
  }

  if (!hasSanctionPermission(interaction.member)) {
    await safeReply(interaction, {
      content:
        "❌ Du hast keine Berechtigung, diese Sanktion zu bearbeiten.",
      ephemeral: true,
    });
    return true;
  }

  const data = loadData();
  const sanction = data.sanctions?.[sanctionId];

  if (!sanction) {
    await safeReply(interaction, {
      content:
        "❌ Diese Sanktion wurde nicht im Speicher gefunden.",
      ephemeral: true,
    });
    return true;
  }

  if (
    sanction.status === "paid" ||
    sanction.status === "cancelled"
  ) {
    await safeReply(interaction, {
      content: "ℹ️ Diese Sanktion ist bereits abgeschlossen.",
      ephemeral: true,
    });
    return true;
  }

  if (action === "paid") {
    sanction.status = "paid";
    sanction.paidBy = interaction.user.id;
    sanction.paidAt = Date.now();
  }

  if (action === "cancel") {
    sanction.status = "cancelled";
    sanction.cancelledBy = interaction.user.id;
    sanction.cancelledAt = Date.now();
  }

  data.sanctions[sanctionId] = sanction;
  saveData(data);

  await updateSanctionMessage(client, sanction);

  await safeReply(interaction, {
    content:
      action === "paid"
        ? "✅ Sanktion wurde als bezahlt markiert."
        : "❌ Sanktion wurde storniert.",
    ephemeral: true,
  });

  return true;
}

// =====================================================
// AUTOMATISCHER FRIST-CHECK
// =====================================================

async function checkOverdueSanctions(client) {
  const data = loadData();

  if (!data.sanctions) return;

  let changed = false;

  for (const [sanctionId, sanction] of Object.entries(data.sanctions)) {
    if (!sanction) continue;
    if (sanction.status !== "open") continue;

    if (
      !sanction.dueAt ||
      Date.now() < Number(sanction.dueAt)
    ) {
      continue;
    }

    sanction.status = "overdue";
    sanction.overdueNotified = true;

    data.sanctions[sanctionId] = sanction;
    changed = true;

    await updateSanctionMessage(client, sanction);

    await sendToChannel(client, CONFIG.sanctionChannelId, {
      content: [
        `<@${sanction.targetId}>`,
        "",
        "⏰ **SANKTION ÜBERFÄLLIG**",
        "",
        `Die Sanktion **${sanction.id}** ist überfällig.`,
        `Offene Abgabe: **${formatMoney(
          getSanctionTotalAmount(sanction)
        )}**`,
        "",
        "Bei unbegründeter verspäteter Zahlung kann die Leaderschaft §39 (30 %) zusätzlich ausstellen.",
      ].join("\n"),
      allowedMentions: {
        users: [sanction.targetId],
      },
    });
  }

  if (changed) {
    saveData(data);
  }
}

// =====================================================
// HAUPT-HANDLER
// =====================================================

async function handleSanctionsInteraction(client, interaction) {
  if (await handleLeaderPanelCommand(client, interaction)) {
    return true;
  }

  if (await handleCreateSanctionButton(client, interaction)) {
    return true;
  }

  if (await handleTargetSelect(client, interaction)) {
    return true;
  }

  if (await handleDraftButtons(client, interaction)) {
    return true;
  }

  if (await handleCategorySelect(client, interaction)) {
    return true;
  }

  // NEUER ZURÜCK-BUTTON
  if (await handleBackToCategoriesButton(client, interaction)) {
    return true;
  }

  if (await handleOffenseSelect(client, interaction)) {
    return true;
  }

  if (await handleDraftModals(client, interaction)) {
    return true;
  }

  if (await handlePostedSanctionButtons(client, interaction)) {
    return true;
  }

  return false;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  leaderPanelCommand,
  handleSanctionsInteraction,
  checkOverdueSanctions,
};