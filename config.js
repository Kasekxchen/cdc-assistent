
module.exports = {
  // =====================================================
  // CDC – ALLGEMEIN
  // =====================================================

  botName: "CDC-Assistent",
  familyName: "Cartel del Caido",
  shortName: "CDC",
  nicknamePrefix: "CDC I",

  embedColor: 0x2b2d31,
  dangerColor: 0xff3b30,
  successColor: 0x2ecc71,
  warningColor: 0xf1c40f,

  timezone: "Europe/Berlin",

  // =====================================================
  // REGISTRIERUNG / WILLKOMMEN / BLOODOUT
  // =====================================================

  welcomeChannelId: "1550974593316163664",
  registrationChannelId: "1568665954089701596",
  leaveChannelId: "1568632175006589028",

  registeredRoleIds: [
    "1542602740771983553",
  ],

  // =====================================================
  // LEADERSCHAFT
  // =====================================================

  leaderRoleIds: [
    "1542602740784562234",
  ],

  // =====================================================
  // FAMILIENMITGLIEDER
  // =====================================================

  familyMemberRoleId: "1542602740771983553",
  lineupMentionRoleId: "1542602740771983553",

  // =====================================================
  // AUFSTELLUNG
  // =====================================================

  lineupChannelId: "1568666480478781600",

  // Dienstag, Donnerstag und Samstag
  lineupStartTimeText: "20:00 - 20:30",

  // Automatische Ankündigung
  lineupAnnouncementHour: 12,
  lineupAnnouncementMinute: 0,

  // Mittwoch und Sonntag
  lineupSpecialStartTimes: {
    Mittwoch: "19:30 - 20:00",
    Sonntag: "19:30 - 20:00",
  },

  lineupEventStartText:
    "Mi. & So. um 19:30 Uhr, sonst um 20:00 Uhr",

  // =====================================================
  // LEADERPANEL
  // =====================================================

  leaderPanelChannelId: "1568632545027821618",

  // =====================================================
  // FAMILIENPANEL
  // =====================================================

  familyPanelChannelId: "1568666410282913863",

  // =====================================================
  // SANKTIONEN
  // =====================================================

  sanctionChannelId: "1568665056118571130",

  sanctionCreatorRoleIds: [
    "1542602740771983551",
  ],

  sanctionDueDays: 7,

  sanctionLogChannelId: "",

  // =====================================================
  // ABMELDUNGEN
  // =====================================================

  absenceChannelId: "1568666531573928106",

  absenceDeleteLogChannelId: "",

  // =====================================================
  // LAGERSYSTEM
  // =====================================================

  storageChannelId: "1568669446413877369",

  storageDepositLogChannelId: "1568681071015370823",
  storageWithdrawLogChannelId: "1568681116007931975",

  storageLogChannelId: "",

  // Einlagern
  storageDepositRoleIds: [
    "1542602740784562234",
    "1568682333899460719",
  ],

  // Auslagern
  storageWithdrawRoleIds: [
    "1542602740784562234",
    "1568682333899460719",
  ],

  // Lager verwalten
  storageManageRoleIds: [
    "1542602740784562234",
    "1568682333899460719",
  ],

  // =====================================================
  // FUSSBALL
  // =====================================================

  footballEventChannelId: "",

  footballCreatorRoleIds: [
    "1542602740784562234",
    "1542602740771983552",
  ],

  footballManageRoleIds: [
    "1542602740784562234",
    "1542602740771983552",
  ],

  // =====================================================
  // KAMPFAUSBILDER
  // =====================================================

  combatTrainerRoleIds: [
    "1542602740784562234",
    "1542602740771983554",
  ],

  // =====================================================
  // WOCHENABGABEN
  // Neues CDC-System folgt später
  // =====================================================

  weeklyPaymentChannelId: "",
  weeklyPaymentAnnouncementChannelId: "",

  payerRoleId: "",
  payerExcludedUserIds: [],
  payerExemptRoleIds: [],

  // =====================================================
  // LOGS / SYSTEM
  // =====================================================

  dailyReportChannelId: "",
  errorLogChannelId: "",
  backupLogChannelId: "",
};
