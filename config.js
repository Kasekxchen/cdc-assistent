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

  // Registrierung / Blood-In / Bloodout
  welcomeChannelId: "1550974593316163664",
  registrationChannelId: "1568665954089701596",
  leaveChannelId: "1568632175006589028",
  registeredRoleIds: ["1542602740771983553"],

  // Leaderschaft und Familienmitglieder
  leaderRoleIds: ["1568850050312831118", "1542602740784562234"],
  familyMemberRoleId: "1542602740771983553",
  lineupMentionRoleId: "1542602740771983553",

  // Aufstellung: JEDEN TAG 20:00 Uhr
  lineupChannelId: "1568666480478781600",
  lineupStartTimeText: "20:00 - 20:30",
  lineupAnnouncementHour: 12,
  lineupAnnouncementMinute: 0,
  lineupSpecialStartTimes: {},
  lineupEventStartText: "Täglich um 20:00 Uhr",

  // Panels
  leaderPanelChannelId: "1568632545027821618",
  familyPanelChannelId: "1568666410282913863",

  // Sanktionen
  sanctionChannelId: "1568665056118571130",
  sanctionLogChannelId: "",
  sanctionDueDays: 7,
  sanctionCreatorRoleIds: ["1568850050312831118", "1542602740771983551"],

  // Abmeldungen
  absenceChannelId: "1568666531573928106",
  absenceDeleteLogChannelId: "",

  // Lager
  storageChannelId: "1568669446413877369",
  storageDepositLogChannelId: "1568681071015370823",
  storageWithdrawLogChannelId: "1568681116007931975",
  storageLogChannelId: "",
  storageDepositRoleIds: ["1568850050312831118", "1542602740784562234", "1568682333899460719"],
  storageWithdrawRoleIds: ["1568850050312831118", "1542602740784562234", "1568682333899460719"],
  storageManageRoleIds: ["1568850050312831118", "1542602740784562234", "1568682333899460719"],

  // Fußball
  footballEventChannelId: "1568685374904209499",
  footballCreatorRoleIds: ["1568850050312831118", "1542602740784562234", "1542602740771983552"],
  footballManageRoleIds: ["1568850050312831118", "1542602740784562234", "1542602740771983552"],

  // Kampftraining (Funktion wird später implementiert)
  combatTrainingChannelId: "1550983582691098624",
  combatTrainerRoleIds: ["1568850050312831118", "1542602740784562234", "1542602740771983554"],

  // Wochenabgaben: Noch nicht auf CC umgestellt
  weeklyPaymentChannelId: "",
  weeklyPaymentAnnouncementChannelId: "",
  payerRoleId: "",
  payerExcludedUserIds: [],
  payerExemptRoleIds: [],

  // Systemlogs: IDs für CC stehen noch aus
  dailyReportChannelId: "",
  errorLogChannelId: "",
  backupLogChannelId: "",
};
