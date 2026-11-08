// =============================================================
// CC-ASSISTENT: VOLLER BOT-ZUGRIFF FÜR EINE ROLLE
// Einmal ausführen: node setup-vollzugriff.js
// Fügt Berechtigungen hinzu, ersetzt keine bestehenden Rollen.
// =============================================================

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const FULL_ROLE = "1568850050312831118";

const backupDir = path.join(
  ROOT,
  `backup-vollzugriff-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`
);

// =====================================================
// ROLLE ZU BESTEHENDEN ROLLENLISTEN HINZUFÜGEN
// =====================================================

function addRoleToArray(source, name, mode = "property") {
  const namePattern = name.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const pattern =
    mode === "const"
      ? new RegExp(
          `(\\bconst\\s+${namePattern}\\s*=\\s*\\[)([\\s\\S]*?)(\\])`,
          "m"
        )
      : new RegExp(
          `(\\b${namePattern}\\s*:\\s*\\[)([\\s\\S]*?)(\\])`,
          "m"
        );

  const match = pattern.exec(source);

  if (!match) {
    return {
      source,
      found: false,
      changed: false,
    };
  }

  if (match[2].includes(FULL_ROLE)) {
    return {
      source,
      found: true,
      changed: false,
    };
  }

  const inner = match[2];
  const whitespace = inner.match(/\n([ \t]*)\S/);
  const indent = whitespace ? whitespace[1] : "    ";

  const inserted = inner.includes("\n")
    ? `\n${indent}"${FULL_ROLE}",${
        inner.startsWith("\n") ? "" : " "
      }${inner}`
    : `"${FULL_ROLE}", ${inner}`;

  return {
    source:
      source.slice(0, match.index) +
      match[1] +
      inserted +
      match[3] +
      source.slice(match.index + match[0].length),

    found: true,
    changed: true,
  };
}

// =====================================================
// SUPERADMIN-PRÜFUNG VORHANDENEN FUNKTIONEN HINZUFÜGEN
// =====================================================

function addGuard(source, functionName) {
  const pattern = new RegExp(
    `(function\\s+${functionName}\\s*\\(\\s*member\\s*\\)\\s*\\{)`,
    "m"
  );

  const match = pattern.exec(source);

  if (!match) {
    return {
      source,
      found: false,
      changed: false,
    };
  }

  const next = source.slice(
    match.index + match[0].length,
    match.index + match[0].length + 400
  );

  if (
    next.includes("CC_SUPERADMIN") ||
    next.includes("CONFIG.fullAccessRoleId")
  ) {
    return {
      source,
      found: true,
      changed: false,
    };
  }

  const guard = `
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
`;

  return {
    source:
      source.slice(0, match.index + match[0].length) +
      guard +
      source.slice(match.index + match[0].length),

    found: true,
    changed: true,
  };
}

// =====================================================
// DATEIEN LADEN
// =====================================================

function checkFile(relativePath) {
  const file = path.join(ROOT, relativePath);

  if (!fs.existsSync(file)) {
    throw new Error(
      `Datei fehlt: ${relativePath}. ` +
      "Bitte im Projekt-Hauptordner ausführen."
    );
  }

  return fs.readFileSync(file, "utf8");
}

// =====================================================
// ÄNDERUNGEN VORBEREITEN
// =====================================================

function prepare() {
  const files = new Map();
  const reports = [];

  // ===================================================
  // CONFIG.JS
  // ===================================================

  let configUpdated = checkFile("config.js");

  if (!/\bfullAccessRoleId\s*:/.test(configUpdated)) {
    configUpdated = configUpdated.replace(
      /(\bmodule\.exports\s*=\s*\{)/,
      `$1
  // Globale CC-Vollzugriffsrolle
  fullAccessRoleId: "${FULL_ROLE}",`
    );
  } else {
    configUpdated = configUpdated.replace(
      /(\bfullAccessRoleId\s*:\s*)["'][^"']+["']/,
      `$1"${FULL_ROLE}"`
    );
  }

  if (
    !configUpdated.includes(
      `fullAccessRoleId: "${FULL_ROLE}"`
    )
  ) {
    throw new Error(
      "config.js: Vollzugriffsrolle konnte nicht eingetragen werden."
    );
  }

  // Die bestehenden Rollen bleiben alle erhalten.
  const roleLists = [
    "leaderRoleIds",
    "sanctionCreatorRoleIds",
    "storageDepositRoleIds",
    "storageWithdrawRoleIds",
    "storageManageRoleIds",
    "footballCreatorRoleIds",
    "footballManageRoleIds",
    "combatTrainerRoleIds",
  ];

  for (const roleList of roleLists) {
    const result = addRoleToArray(
      configUpdated,
      roleList
    );

    if (!result.found) {
      throw new Error(
        `config.js: ${roleList} nicht gefunden. ` +
        "Keine Dateien verändert."
      );
    }

    configUpdated = result.source;
  }

  files.set("config.js", configUpdated);

  reports.push(
    "config.js: Vollzugriffsrolle in allen Verwaltungsrollen"
  );

  // ===================================================
  // ZENTRALE BERECHTIGUNGEN
  // ===================================================

  let permissions = checkFile(
    "utils/permissions.js"
  );

  const guardPermissions = addGuard(
    permissions,
    "hasLeaderPermission"
  );

  if (!guardPermissions.found) {
    throw new Error(
      "utils/permissions.js: " +
      "hasLeaderPermission() nicht gefunden."
    );
  }

  permissions = guardPermissions.source;

  files.set(
    "utils/permissions.js",
    permissions
  );

  reports.push(
    "Zentrale Berechtigungen: Aufstellung, Abmeldung, Sanktionen, Lager"
  );

  // ===================================================
  // WOCHENABGABEN UND SERVERINFOS
  // ===================================================

  for (
    const [file, functionName] of [
      ["systems/weeklyPayments.js", "isLeader"],
      ["systems/serverInfo.js", "isLeader"],
    ]
  ) {
    let content = checkFile(file);

    const result = addGuard(
      content,
      functionName
    );

    if (!result.found) {
      throw new Error(
        `${file}: ${functionName}() fehlt. ` +
        "Keine Dateien verändert."
      );
    }

    content = result.source;

    files.set(file, content);

    reports.push(
      `${file}: Vollzugriff aktiviert`
    );
  }

  // ===================================================
  // KAMPFTRAINING
  // ===================================================

  let combat = checkFile(
    "systems/combatTraining.js"
  );

  if (
    /\bconst\s+MANAGEMENT_ROLE_IDS\s*=/.test(combat)
  ) {
    const result = addRoleToArray(
      combat,
      "MANAGEMENT_ROLE_IDS",
      "const"
    );

    if (!result.found) {
      throw new Error(
        "combatTraining.js: Rollenliste nicht erkannt."
      );
    }

    combat = result.source;
  } else if (
    /\bfunction\s+canManage\s*\(\s*member\s*\)/.test(
      combat
    )
  ) {
    const result = addGuard(
      combat,
      "canManage"
    );

    combat = result.source;
  } else {
    throw new Error(
      "combatTraining.js: Berechtigungsprüfung nicht gefunden."
    );
  }

  files.set(
    "systems/combatTraining.js",
    combat
  );

  reports.push(
    "Kampftraining: Erstellen, Bearbeiten, Absagen, Schließen, Wiederöffnen"
  );

  // ===================================================
  // INTERACTION-HANDLER
  // ===================================================

  let interactions = checkFile(
    "handlers/interactions.js"
  );

  if (
    /\bconst\s+COMBAT_MANAGEMENT_ROLE_IDS\s*=/.test(
      interactions
    )
  ) {
    const result = addRoleToArray(
      interactions,
      "COMBAT_MANAGEMENT_ROLE_IDS",
      "const"
    );

    if (!result.found) {
      throw new Error(
        "interactions.js: Rollenliste nicht erkannt."
      );
    }

    interactions = result.source;

    files.set(
      "handlers/interactions.js",
      interactions
    );

    reports.push(
      "Interaction-Handler: Kampftraining-Verwaltung freigegeben"
    );
  }

  return {
    files,
    reports,
  };
}

// =====================================================
// ÄNDERUNGEN MIT BACKUPS DURCHFÜHREN
// =====================================================

function main() {
  const { files, reports } = prepare();

  const changed = [];

  for (const [file, content] of files) {
    if (checkFile(file) !== content) {
      changed.push([file, content]);
    }
  }

  if (!changed.length) {
    console.log(
      `✅ Rolle ${FULL_ROLE} hat bereits Vollzugriff.`
    );

    return;
  }

  // Backup erstellen
  fs.mkdirSync(
    backupDir,
    { recursive: true }
  );

  for (const [file] of changed) {
    const backupPath = path.join(
      backupDir,
      file
    );

    fs.mkdirSync(
      path.dirname(backupPath),
      { recursive: true }
    );

    fs.copyFileSync(
      path.join(ROOT, file),
      backupPath
    );
  }

  try {
    // Änderungen einfügen
    for (const [file, content] of changed) {
      fs.writeFileSync(
        path.join(ROOT, file),
        content,
        "utf8"
      );
    }

    // JavaScript-Syntax prüfen
    for (const [file] of changed) {
      const check = spawnSync(
        process.execPath,
        [
          "--check",
          path.join(ROOT, file),
        ],
        {
          encoding: "utf8",
        }
      );

      if (check.status !== 0) {
        throw new Error(
          `${file}: Syntaxfehler:\n${check.stderr}`
        );
      }
    }

    // Berechtigungen mit der neuen Rolle testen
    const permissions = require(
      path.join(ROOT, "utils/permissions.js")
    );

    const testMember = {
      roles: {
        cache: new Map([
          [FULL_ROLE, true],
        ]),
      },
    };

    const checks = [
      "hasLeaderPermission",
      "hasSanctionCreatorPermission",
      "hasStorageDepositPermission",
      "hasStorageWithdrawPermission",
      "hasStorageManagePermission",
      "canUseAbsenceDecisionButtons",
      "canUseLineupManagement",
      "canUseWeeklyPaymentManagement",
    ];

    for (const name of checks) {
      if (
        typeof permissions[name] === "function" &&
        !permissions[name](testMember)
      ) {
        throw new Error(
          `Berechtigungstest fehlgeschlagen: ${name}`
        );
      }
    }
  } catch (error) {
    // Bei einem Fehler alles wiederherstellen
    for (const [file] of changed) {
      fs.copyFileSync(
        path.join(backupDir, file),
        path.join(ROOT, file)
      );
    }

    throw error;
  }

  // ===================================================
  // ERFOLG
  // ===================================================

  console.log(
    "✅ CC-Vollzugriff wurde eingerichtet:\n"
  );

  reports.forEach((entry) => {
    console.log("   • " + entry);
  });

  console.log(
    `\n👑 Vollzugriffsrolle: ${FULL_ROLE}`
  );

  console.log(
    `📁 Backups: ${backupDir}`
  );

  console.log(
    "✅ Alle geänderten Dateien geprüft."
  );

  console.log(
    "➡️ Bot jetzt neu starten: node index.js"
  );
}

// =====================================================
// AUSFÜHRUNG
// =====================================================

try {
  main();
} catch (error) {
  console.error(
    "❌ Vollzugriff konnte nicht eingerichtet werden:",
    error.message
  );

  process.exitCode = 1;
}