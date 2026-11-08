const {
  checkDailyLineup,
  checkLineupReminders,
  checkLineupClosures,
} = require("./systems/lineup");

const {
  checkOverdueSanctions,
} = require("./systems/sanctions");

const {
  cleanupExpiredAbsences,
  scanOldBotAbsences,
} = require("./systems/absences");

// =====================================================
// CC SCHEDULER
// =====================================================

let schedulerInterval = null;
let initialRunDone = false;
let schedulerRunning = false;

// =====================================================
// REGELMÄSSIGE PRÜFUNGEN
// =====================================================

async function runSchedulerOnce(
  client,
  reason = "interval"
) {
  if (schedulerRunning) {
    console.log(
      `ℹ️ Scheduler-Prüfung (${reason}) übersprungen: vorherige Prüfung läuft noch.`
    );
    return;
  }

  schedulerRunning = true;

  try {
    // =================================================
    // TÄGLICHE AUFSTELLUNG
    // =================================================

    // Nach 12 Uhr fehlende Aufstellung erstellen.
    // Auch nach Neustart oder Railway-Deploy.
    try {
      await checkDailyLineup(client);
    } catch (error) {
      console.error(
        `❌ Scheduler: Aufstellung (${reason}):`,
        error
      );
    }

    // =================================================
    // AUFSTELLUNGS-ERINNERUNGEN
    // =================================================

    try {
      await checkLineupReminders(client);
    } catch (error) {
      console.error(
        `❌ Scheduler: Erinnerung (${reason}):`,
        error
      );
    }

    // =================================================
    // AUFSTELLUNGEN SCHLIESSEN
    // =================================================

    try {
      await checkLineupClosures(client);
    } catch (error) {
      console.error(
        `❌ Scheduler: Schließcheck (${reason}):`,
        error
      );
    }

    // =================================================
    // OFFENE SANKTIONEN PRÜFEN
    // =================================================

    try {
      await checkOverdueSanctions(client);
    } catch (error) {
      console.error(
        `❌ Scheduler: Sanktionen (${reason}):`,
        error
      );
    }

    // =================================================
    // ABGELAUFENE ABMELDUNGEN
    // =================================================

    try {
      await cleanupExpiredAbsences(
        client,
        {
          scanFirst: false,
        }
      );
    } catch (error) {
      console.error(
        `❌ Scheduler: Abmeldungen (${reason}):`,
        error
      );
    }

  } finally {
    schedulerRunning = false;
  }
}

// =====================================================
// STARTPRÜFUNGEN
// =====================================================

async function runInitialChecks(client) {
  if (initialRunDone) {
    return;
  }

  initialRunDone = true;

  console.log(
    "🔄 Starte initiale CC-Bot-Prüfungen ..."
  );

  // Die heutige Aufstellung wird bereits durch
  // runSchedulerOnce beim Start geprüft.
  // Keine zweite parallele Aufstellung erstellen.

  // ===================================================
  // ALTE ABMELDUNGEN SCANNEN
  // ===================================================

  try {
    const result = await scanOldBotAbsences(
      client,
      1000
    );

    console.log(
      `✅ Abmeldungs-Scan: ` +
      `${result.scanned} geprüft, ` +
      `${result.added} übernommen.`
    );

  } catch (error) {
    console.error(
      "❌ Initialer Abmeldungs-Scan:",
      error
    );
  }

  // ===================================================
  // ABMELDUNGEN BEREINIGEN
  // ===================================================

  try {
    const result = await cleanupExpiredAbsences(
      client,
      {
        scanFirst: false,
      }
    );

    console.log(
      `✅ Abmeldungs-Bereinigung: ` +
      `${result.checked} geprüft, ` +
      `${result.deleted} gelöscht, ` +
      `${result.missingCleaned} bereinigt, ` +
      `${result.failed} fehlgeschlagen.`
    );

  } catch (error) {
    console.error(
      "❌ Initiale Abmeldungs-Bereinigung:",
      error
    );
  }

  // ===================================================
  // SCHLIESSCHECK
  // ===================================================

  try {
    await checkLineupClosures(client);
  } catch (error) {
    console.error(
      "❌ Initialer Aufstellungs-Schließcheck:",
      error
    );
  }

  // ===================================================
  // SANKTIONSCHECK
  // ===================================================

  try {
    await checkOverdueSanctions(client);
  } catch (error) {
    console.error(
      "❌ Initialer Sanktionscheck:",
      error
    );
  }

  console.log(
    "✅ Initiale CC-Bot-Prüfungen abgeschlossen."
  );
}

// =====================================================
// SCHEDULER STARTEN
// =====================================================

function startScheduler(client) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  // SOFORT beim Start prüfen:
  // - Ist es nach 12 Uhr?
  // - Existiert die heutige Aufstellung?
  // - Falls nicht, erstellen.
  void runSchedulerOnce(
    client,
    "start"
  ).catch(error => {
    console.error(
      "❌ Sofortige Scheduler-Prüfung:",
      error
    );
  });

  // Anschließend jede Minute nachprüfen.
  schedulerInterval = setInterval(() => {
    void runSchedulerOnce(
      client,
      "interval"
    ).catch(error => {
      console.error(
        "❌ Scheduler-Intervall:",
        error
      );
    });
  }, 60 * 1000);

  // Alte Abmeldungen separat prüfen.
  void runInitialChecks(client).catch(error => {
    console.error(
      "❌ Initiale CC-Prüfungen:",
      error
    );
  });

  console.log(
    "✅ CC-Scheduler gestartet."
  );

  console.log(
    "✅ Tägliche Aufstellung: Prüfung ab 12:00 Uhr."
  );

  console.log(
    "✅ Verpasste Aufstellungen werden beim Botstart nachgeholt."
  );
}

// =====================================================
// SCHEDULER STOPPEN
// =====================================================

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  console.log(
    "🛑 CC-Scheduler gestoppt."
  );
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  startScheduler,
  stopScheduler,
  runSchedulerOnce,
  runInitialChecks,
};
