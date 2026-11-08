const fs = require("fs");
const path = require("path");

// =====================================================
// CC DATENSPEICHER
// =====================================================
//
// Lokal:
//   data/smv-data.json
//
// Railway:
//   DATA_DIR=/data
//   Volume auf /data mounten
//
// Der technische Dateiname bleibt erhalten.
// Vorhandene Daten werden nicht absichtlich gelöscht.
// =====================================================

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");

const DATA_FILE = path.join(
  DATA_DIR,
  "smv-data.json"
);

const BACKUP_DIR = path.join(
  DATA_DIR,
  "backups"
);

// =====================================================
// STANDARDDATEN
// =====================================================

function getDefaultData() {
  return {
    postedDates: {},
    lineups: {},
    sanctions: {},
    footballEvents: {},
    weeklyPayments: {},
    weeklySummaries: {},
    weeklyPaymentPauses: {},
    lineupReminders: {},
    dailyReports: {},
    healthChecks: {},
    backups: {},
    absences: {},

    storage: {
      categories: {},
      panelMessageId: null,
      logs: [],
    },
  };
}

// =====================================================
// DATEIEN ERSTELLEN
// =====================================================

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
      DATA_DIR,
      { recursive: true }
    );
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(
      BACKUP_DIR,
      { recursive: true }
    );
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        getDefaultData(),
        null,
        2
      )
    );
  }
}

// =====================================================
// ALTE LAGERDATEN KOMPATIBEL HALTEN
// =====================================================

function normalizeStorageCategories(data = {}) {
  const categories =
    data.storage?.categories || {};

  if (
    categories.kurzwafen &&
    categories.kurzwaffen &&
    categories.kurzwafen.id ===
      categories.kurzwaffen.id
  ) {
    delete categories.kurzwafen;
  }

  for (
    const category
    of Object.values(categories)
  ) {
    if (!category.items) {
      category.items = {};
    }
  }

  return categories;
}

// =====================================================
// DATEN NORMALISIEREN
// =====================================================

function normalizeData(data = {}) {
  const defaults = getDefaultData();

  return {
    ...defaults,
    ...data,

    postedDates:
      data.postedDates || {},

    lineups:
      data.lineups || {},

    sanctions:
      data.sanctions || {},

    footballEvents:
      data.footballEvents || {},

    weeklyPayments:
      data.weeklyPayments || {},

    weeklySummaries:
      data.weeklySummaries || {},

    weeklyPaymentPauses:
      data.weeklyPaymentPauses || {},

    lineupReminders:
      data.lineupReminders || {},

    dailyReports:
      data.dailyReports || {},

    healthChecks:
      data.healthChecks || {},

    backups:
      data.backups || {},

    absences:
      data.absences || {},

    storage: {
      ...defaults.storage,
      ...(data.storage || {}),

      categories:
        normalizeStorageCategories(data),

      logs:
        data.storage?.logs || [],

      panelMessageId:
        data.storage?.panelMessageId || null,
    },
  };
}

// =====================================================
// DATEN LADEN
// =====================================================

function loadData() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    const parsed = JSON.parse(raw);

    return normalizeData(parsed);

  } catch (error) {
    console.error(
      "❌ smv-data.json konnte nicht gelesen werden:",
      error
    );

    return getDefaultData();
  }
}

// =====================================================
// SPEICHERBENACHRICHTIGUNGEN
// =====================================================

const dataSavedListeners = new Set();

function onDataSaved(listener) {
  if (typeof listener !== "function") {
    throw new TypeError(
      "Listener muss eine Funktion sein."
    );
  }

  dataSavedListeners.add(listener);

  return () =>
    dataSavedListeners.delete(listener);
}

// =====================================================
// DATEN SPEICHERN
// =====================================================

function saveData(data) {
  ensureDataFile();

  const normalized =
    normalizeData(data);

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      normalized,
      null,
      2
    )
  );

  // Nach jedem erfolgreichen Speichern prüfen
  // die registrierten Listener Änderungen.
  for (const listener of dataSavedListeners) {
    try {
      Promise.resolve(
        listener(normalized)
      ).catch((error) => {
        console.error(
          "❌ Daten-Log Listener:",
          error
        );
      });

    } catch (error) {
      console.error(
        "❌ Daten-Log Listener:",
        error
      );
    }
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  DATA_DIR,
  DATA_FILE,
  BACKUP_DIR,

  getDefaultData,
  ensureDataFile,

  loadData,
  saveData,

  onDataSaved,
};