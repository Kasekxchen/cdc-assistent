const {
  storagePanelCommand,
  storageRescueCommand,
} = require("../systems/storage");

const {
  familyPanelCommand,
} = require("../systems/familyPanel");

const {
  registrationPanelCommand,
} = require("../systems/registration");

const {
  leaderPanelCommand,
} = require("../systems/sanctions");

const {
  lineupTomorrowCommand,
  lineupForceTodayCommand,
} = require("../systems/lineup");

const {
  weeklyPanelCommand,
} = require("../systems/weeklyPayments");

const {
  infoPanelCommand,
  editInfoCommand,
  inviteInfoCommand,
  roleCounterCommand,
} = require("../systems/serverInfo");

// =====================================================
// ALLE SLASH COMMANDS
// =====================================================

function getSlashCommands() {
  return [
    storagePanelCommand,
    storageRescueCommand,

    familyPanelCommand,
    registrationPanelCommand,
    leaderPanelCommand,

    lineupTomorrowCommand,
    lineupForceTodayCommand,

    weeklyPanelCommand,

    infoPanelCommand,
    editInfoCommand,
    inviteInfoCommand,
    roleCounterCommand,
  ];
}

// =====================================================
// DISCORD JSON
// =====================================================

function getSlashCommandJson() {
  return getSlashCommands().map(
    (command) => command.toJSON()
  );
}

module.exports = {
  getSlashCommands,
  getSlashCommandJson,
};