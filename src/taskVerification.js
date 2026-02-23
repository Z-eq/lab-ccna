// taskVerification.js — Task completion checking engine

// ─── TASK VERIFICATION ENGINE ───────────────────────────────────────────────
export function checkTaskCompletion(task, deviceStates) {
  const ds = deviceStates[task.device];
  if (!ds || !task.check) return false;

  // Collect ALL current config commands on this device (lowercased, no dupes)
  const allCmds = new Set();
  // Global commands
  ds.globalCmds.forEach(c => allCmds.add(c));
  // Interface config
  Object.values(ds.interfaceCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // Line config
  Object.values(ds.lineCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // Router config
  Object.values(ds.routerCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // ACL config
  Object.values(ds.aclCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // DHCP config
  Object.values(ds.dhcpCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // Static routes
  ds.staticRoutes.forEach(c => allCmds.add(c));
  (ds.staticRoutesV6 || []).forEach(c => allCmds.add(c));
  // NAT rules
  ds.natRules.forEach(c => allCmds.add(c));
  // DHCP excluded
  ds.dhcpExcluded.forEach(c => allCmds.add(c));

  const cmdArr = Array.from(allCmds);

  // For each required check pattern, find if any current command matches ALL keywords
  for (const keywords of task.check) {
    const found = cmdArr.some(cmd => {
      return keywords.every(kw => cmd.includes(kw.toLowerCase()));
    });
    if (!found) return false;
  }
  return true;
}

export function getTaskResults(lab, deviceStates) {
  if (!lab) return {};
  const results = {};
  lab.tasks.forEach(task => {
    const key = task.id;
    results[key] = checkTaskCompletion(task, deviceStates);
  });
  return results;
}


