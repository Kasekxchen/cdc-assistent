const CONFIG = require("../config");

function hasAnyRole(member, roleIds = []) {
  if (!member || !member.roles || !member.roles.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasLeaderPermission(member) {
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

  return hasAnyRole(member, CONFIG.leaderRoleIds);
}

function hasFootballCreatorPermission(member) {
  return hasAnyRole(member, CONFIG.footballCreatorRoleIds);
}

function hasSanctionCreatorPermission(member) {
  return (
    hasLeaderPermission(member) ||
    hasAnyRole(member, CONFIG.sanctionCreatorRoleIds)
  );
}

function hasStorageDepositPermission(member) {
  return (
    hasLeaderPermission(member) ||
    hasAnyRole(member, CONFIG.storageDepositRoleIds)
  );
}

function hasStorageWithdrawPermission(member) {
  return (
    hasLeaderPermission(member) ||
    hasAnyRole(member, CONFIG.storageWithdrawRoleIds)
  );
}

function hasStorageManagePermission(member) {
  return (
    hasLeaderPermission(member) ||
    hasAnyRole(member, CONFIG.storageManageRoleIds)
  );
}

function hasStoragePanelPermission(member) {
  return hasStorageManagePermission(member);
}

function canUseAbsenceDecisionButtons(member) {
  return hasLeaderPermission(member);
}

function canUseLineupManagement(member) {
  return hasLeaderPermission(member);
}

function canUseWeeklyPaymentManagement(member) {

  // CC_WEEKLY_PERMISSION_EXTRA_ACCESS
  // Zusätzliche CC-Verwaltungsrollen.
  const extraRoles = ["1569147990080487434", "1568850050312831118"];

  if (
    extraRoles.some(roleId =>
      member?.roles?.cache?.has(roleId) ||
      (
        Array.isArray(member?.roles) &&
        member.roles.includes(roleId)
      )
    )
  ) {
    return true;
  }

  return hasLeaderPermission(member);
}

function canUseBackupManagement(member) {
  return hasLeaderPermission(member);
}

module.exports = {
  hasAnyRole,
  hasLeaderPermission,
  hasFootballCreatorPermission,
  hasSanctionCreatorPermission,
  hasStorageDepositPermission,
  hasStorageWithdrawPermission,
  hasStorageManagePermission,
  hasStoragePanelPermission,
  canUseAbsenceDecisionButtons,
  canUseLineupManagement,
  canUseWeeklyPaymentManagement,
  canUseBackupManagement,
};
