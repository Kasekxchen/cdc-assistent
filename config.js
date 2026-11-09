module.exports = {
  // Globale CC-Vollzugriffsrolle
  fullAccessRoleId: "1568850050312831118",

  // =====================================================
  // CC – ALLGEMEIN
  // =====================================================

  botName: "CC-Assistent",
  familyName: "Cartel del Caido",
  shortName: "CC",
  nicknamePrefix: "CC I",

  embedColor: 0x2b2d31,
  dangerColor: 0xff3b30,
  successColor: 0x2ecc71,
  warningColor: 0xf1c40f,

  timezone: "Europe/Berlin",

  // =====================================================
  // REGISTRIERUNG / BLOOD-IN / BLOODOUT
  // =====================================================

  welcomeChannelId: "1550974593316163664",
  registrationChannelId: "1568665954089701596",
  leaveChannelId: "1568632175006589028",

  registeredRoleIds: [
    "1542602740771983553",
  ],

  // =====================================================
  // LEADERSCHAFT UND FAMILIENMITGLIEDER
  // =====================================================

  leaderRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
  ],

  familyMemberRoleId: "1542602740771983553",
  lineupMentionRoleId: "1542602740771983553",

  // =====================================================
  // AUFSTELLUNG – JEDEN TAG UM 21:00 UHR
  // =====================================================

  lineupChannelId: "1568666480478781600",

  // Aufstellung beginnt und Anmeldung endet um 21:00 Uhr.
  lineupStartTimeText: "21:00 Uhr",

  // Automatische Ankündigung um 12:00 Uhr.
  lineupAnnouncementHour: 12,
  lineupAnnouncementMinute: 0,

  // Keine speziellen Wochentage.
  lineupSpecialStartTimes: {},

  // Erinnerung automatisch 30 Minuten vorher:
  // 20:30 Uhr.
  lineupEventStartText: "Täglich um 21:00 Uhr",

  // =====================================================
  // PANELS
  // =====================================================

  leaderPanelChannelId: "1568632545027821618",
  familyPanelChannelId: "1568666410282913863",

  // =====================================================
  // SANKTIONEN
  // =====================================================

  sanctionChannelId: "1568665056118571130",
  sanctionLogChannelId: "1568702067311251597",
  sanctionDueDays: 7,

  sanctionCreatorRoleIds: [
    "1568850050312831118",
    "1542602740771983551",
  ],

  // =====================================================
  // ABMELDUNGEN
  // =====================================================

  absenceChannelId: "1568666531573928106",
  absenceDeleteLogChannelId: "1568702225654747167",

  // =====================================================
  // LAGER
  // =====================================================

  storageChannelId: "1568669446413877369",
  storageDepositLogChannelId: "1568681071015370823",
  storageWithdrawLogChannelId: "1568681116001761340",
  storageLogChannelId: "1568702391555985478",

  storageDepositRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
    "1568682333899460719",
  ],

  storageWithdrawRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
    "1568682333899460719",
  ],

  storageManageRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
    "1568682333899460719",
  ],

  // =====================================================
  // FUSSBALL – VORERST NICHT IM FAMILIENPANEL
  // =====================================================

  footballEventChannelId: "1568685374904209499",

  footballCreatorRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
    "1542602740771983552",
  ],

  footballManageRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
    "1542602740771983552",
  ],

  // =====================================================
  // KAMPFTRAINING
  // =====================================================

  combatTrainingChannelId: "1550983582691098624",

  combatTrainerRoleIds: [
    "1568850050312831118",
    "1542602740784562234",
    "1542602740771983554",
  ],

  // =====================================================
  // WOCHENABGABEN
  // =====================================================

  weeklyPaymentChannelId: "",
  weeklyPaymentAnnouncementChannelId: "",

  payerRoleId: "",
  payerExcludedUserIds: [],
  payerExemptRoleIds: [],

  // =====================================================
  // SYSTEMLOGS
  // =====================================================

  dailyReportChannelId: "1568702320974241933",
  errorLogChannelId: "1568702361088827473",
  backupLogChannelId: "1568702320974241933",
};