const fs = require("fs");
const path = require("path");

const {
  handleStorageInteraction,
} = require("../systems/storage");

const {
  handleAbsenceInteraction,
} = require("../systems/absences");

const {
  handleFamilyPanelInteraction,
} = require("../systems/familyPanel");

const {
  handleFootballInteraction,
} = require("../systems/football");

const {
  handleRegistrationInteraction,
} = require("../systems/registration");

const {
  handleSanctionsInteraction,
} = require("../systems/sanctions");

const {
  handleLineupInteraction,
} = require("../systems/lineup");

const {
  handleWeeklyPaymentInteraction,
} = require("../systems/weeklyPayments");

const {
  handleServerInfoInteraction,
} = require("../systems/serverInfo");

const {
  safeReply,
} = require("../utils/discord");

// =====================================================
// KAMPFTRAINING BERECHTIGUNGEN
// =====================================================

const COMBAT_MANAGEMENT_ROLE_IDS = [
  "1568850050312831118", 
  "1542602740784562234",
  "1542602740771983554",
];

function canManageCombat(interaction) {
  const roles = interaction.member?.roles;

  if (!roles) {
    return false;
  }

  return COMBAT_MANAGEMENT_ROLE_IDS.some((roleId) => {
    if (
      typeof roles.cache?.has === "function"
    ) {
      return roles.cache.has(roleId);
    }

    if (Array.isArray(roles)) {
      return roles.includes(roleId);
    }

    return false;
  });
}

function isCombatTrainingMessage(interaction) {
  return Boolean(
    interaction.message?.embeds?.some((embed) =>
      /CC\s*KAMPFTRAINING|KAMPFTRAINING/i.test(
        String(embed.title || "")
      )
    )
  );
}

function getClickedButton(interaction) {
  if (!interaction.isButton?.()) {
    return null;
  }

  for (
    const [rowIndex, row] of (
      interaction.message?.components || []
    ).entries()
  ) {
    for (const component of row.components || []) {
      const id =
        component.customId ||
        component.data?.custom_id;

      if (id === interaction.customId) {
        return {
          rowIndex,

          label: String(
            component.label ||
            component.data?.label ||
            ""
          ),
        };
      }
    }
  }

  return null;
}

function isCombatManagementAction(interaction) {
  const id = String(
    interaction.customId || ""
  );

  if (id === "leader_create_combat") {
    return true;
  }

  if (
    isCombatTrainingMessage(interaction) &&
    interaction.isButton?.()
  ) {
    const button = getClickedButton(interaction);

    if (button) {
      if (button.rowIndex > 0) {
        return true;
      }

      if (
        /^(bearbeiten|absagen|schlie(?:ß|ss)en|wieder(?:ö|oe)ffnen)$/i.test(
          button.label.trim()
        )
      ) {
        return true;
      }
    }
  }

  const isCombatId =
    /(?:^|[_:\-])(?:combat|kampf(?:training)?|training|ct)(?:[_:\-]|$)/i.test(
      id
    );

  if (!isCombatId) {
    return false;
  }

  if (
    /(?:^|[_:\-])(?:vote|join|yes|no|maybe|unsure|dabei|nichtdabei|ungewiss)(?:[_:\-]|$)/i.test(
      id
    )
  ) {
    return false;
  }

  if (
    interaction.isModalSubmit?.() ||
    interaction.isAnySelectMenu?.()
  ) {
    return true;
  }

  return /(?:edit|bearbeit|cancel|absag|close|schliess|schließ|reopen|wieder|create|erstell|manage|admin|delete|loesch|lösch|save|speicher|update)/i.test(
    id
  );
}

// =====================================================
// KAMPFTRAINING EINBINDEN
// =====================================================

const combatPath = path.join(
  __dirname,
  "../systems/combatTraining.js"
);

const handleCombatTrainingInteraction =
  fs.existsSync(combatPath)
    ? require(combatPath)
        .handleCombatTrainingInteraction
    : null;

// =====================================================
// HAUPT-HANDLER
// =====================================================

async function handleInteraction(
  client,
  interaction
) {
  try {

    // KAMPFTRAINING: ROLLENKONTROLLE

    if (
      isCombatManagementAction(interaction) &&
      !canManageCombat(interaction)
    ) {
      await safeReply(interaction, {
        content:
          "❌ Nur die Leaderschaft und die Kampfausbilder dürfen Kampftrainings erstellen oder verwalten.",
        ephemeral: true,
      });

      return;
    }

    // KAMPFTRAINING

    if (
      handleCombatTrainingInteraction &&
      await handleCombatTrainingInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // FUSSBALL

    if (
      await handleFootballInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // LAGER

    if (
      await handleStorageInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // ABMELDUNGEN

    if (
      await handleAbsenceInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // FAMILIENPANEL

    if (
      await handleFamilyPanelInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // REGISTRIERUNG

    if (
      await handleRegistrationInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // SANKTIONEN

    if (
      await handleSanctionsInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // AUFSTELLUNG

    if (
      await handleLineupInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // WOCHENABGABE

    if (
      await handleWeeklyPaymentInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

    // SERVER-INFOS UND ROLLENZÄHLER

    if (
      await handleServerInfoInteraction(
        client,
        interaction
      )
    ) {
      return;
    }

  } catch (error) {
    console.error(
      "❌ Fehler bei interactionCreate:",
      error
    );

    try {
      const payload = {
        content:
          "❌ Es ist ein Fehler aufgetreten. Bitte melde es der Leaderschaft.",
        ephemeral: true,
      };

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }

    } catch (replyError) {
      console.error(
        "❌ Fehlerantwort konnte nicht gesendet werden:",
        replyError
      );
    }
  }
}

module.exports = {
  handleInteraction,
};