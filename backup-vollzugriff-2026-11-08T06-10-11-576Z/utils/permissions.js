const CONFIG = require("../config");

function hasAnyRole(member, roleIds = []) {
  if (!member || !member.roles || !member.roles.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasLeaderPermission(member) {
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
