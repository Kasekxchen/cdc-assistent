
module.exports = {
  botName: "SMV-Assistent",
  familyName: "Sedoij Medved",
  shortName: "SMV",
  nicknamePrefix: "SMV I",

  embedColor: 0x2b2d31,
  dangerColor: 0xff3b30,
  successColor: 0x2ecc71,
  warningColor: 0xf1c40f,

  // Registrierung / Join / Leave
  welcomeChannelId: "1434318022683922543",
  registrationChannelId: "1508266444390010890",
  leaveChannelId: "1451317175900962898",

  // Aufstellung
  lineupChannelId: "1451318638601830550",
  timezone: "Europe/Berlin",

  // Dienstag, Donnerstag, Samstag: 20:00–20:30 Uhr
  lineupStartTimeText: "20:00 - 20:30",

  // Ankündigung um 12:00 Uhr
  lineupAnnouncementHour: 12,
  lineupAnnouncementMinute: 0,

  // Mittwoch und Sonntag unverändert
  lineupSpecialStartTimes: {
    Mittwoch: "19:30 - 20:00",
    Sonntag: "19:30 - 20:00",
  },

  lineupEventStartText: "Mi. & So. um 19:30 Uhr, sonst um 20:00 Uhr",

  // Leaderpanel
  leaderPanelChannelId: "1508284451858153562",

  // Sanktionen
  sanctionChannelId: "1434318024646856758",
  sanctionLogChannelId: "1508286380403589131",
  dailyReportChannelId: "1524251646664900658",
  errorLogChannelId: "1524252653922816102",
  backupLogChannelId: "1524252653922816102",
  sanctionDueDays: 7,

  // Familienpanel
  familyPanelChannelId: "1508301797700403340",

  // Fußball-Event-Channel
  footballEventChannelId: "1451331983459356836",

  // Lagersystem
  storageChannelId: "1557521371695939644",

  // Lager-Logs
  storageDepositLogChannelId: "1557424128439484427",
  storageWithdrawLogChannelId: "1557424160001761340",
  storageLogChannelId: "1557493683446611968",

  storageDepositRoleIds: [
    "1451315550394515516",
    "1434318021412786317",
    "1451629804221894868",
    "1537919333240545370",
  ],

  storageWithdrawRoleIds: [
    "1451315550394515516",
    "1434318021412786317",
    "1451629804221894868",
    "1537919333240545370",
  ],

  storageManageRoleIds: [
    "1451315550394515516",
    "1434318021412786317",
    "1451629804221894868",
    "1537919333240545370",
  ],

  // Abmeldungen
  absenceChannelId: "1522813672244908135",
  absenceDeleteLogChannelId: "1527182554640420904",

  // Wochenabgabe / Zahlende/r Rollenautomatik
  familyMemberRoleId: "1451314176004984912",
  lineupMentionRoleId: "1451314176004984912",
  payerRoleId: "1508303859385372812",

  // Wochenabgabe-Log und Übersicht
  weeklyPaymentChannelId: "1508307008389124246",
  weeklyPaymentAnnouncementChannelId: "1522805016128262155",

  // Diese User bekommen keine Zahlende/r-Rolle
  payerExcludedUserIds: [
    "150268856105959424",
    "526066059258626049",
    "1418628359054688530",
  ],

  // Sobald ein User eine dieser Rollen hat,
  // wird Zahlende/r entfernt
  payerExemptRoleIds: [
    "1434318021467439198",
    "1434318021467439196",
    "1451315550394515516",
    "1434318021412786317",
  ],

  // Rollen nach Registrierung
  registeredRoleIds: [
    "1451314176004984912",
    "1434318021412786308",
    "1508303859385372812",
  ],

  // Leaderschaft
  leaderRoleIds: [
    "1451315550394515516",
    "1434318021412786317",
    "1451629804221894868",
  ],

  // Zusatzrollen für Sanktionen
  sanctionCreatorRoleIds: [
    "1455642939131691141",
  ],

  // Fußball-Events erstellen
  footballCreatorRoleIds: [
    "1455643015820480582",
    "1451315550394515516",
  ],

  // Fußball-Events verwalten
  footballManageRoleIds: [
    "1455643015820480582",
    "1451315550394515516",
  ],
};
