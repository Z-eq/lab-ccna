// taskVerification.js — Task completion checking engine

// ─── TASK VERIFICATION ENGINE ───────────────────────────────────────────────
export function checkTaskCompletion(task, deviceStates) {
  const ds = deviceStates[task.device];
  if (!ds || !task.check) return false;

  // Collect ALL current config commands on this device (lowercased, no dupes)
  const allCmds = new Set();

  // ─── 1. Command arrays (already stored as strings) ───
  ds.globalCmds.forEach(c => allCmds.add(c));
  Object.entries(ds.interfaceCfg).forEach(([iface, arr]) => {
    arr.forEach(c => allCmds.add(c));
    // Also add with interface prefix for interface-specific matching
    arr.forEach(c => allCmds.add(`interface ${iface.toLowerCase()} ${c}`));
  });
  Object.entries(ds.lineCfg).forEach(([line, arr]) => {
    arr.forEach(c => allCmds.add(c));
    arr.forEach(c => allCmds.add(`line ${line} ${c}`));
  });
  Object.entries(ds.routerCfg).forEach(([proc, arr]) => {
    arr.forEach(c => allCmds.add(c));
    allCmds.add(`router ${proc}`);
    arr.forEach(c => allCmds.add(`router ${proc} ${c}`));
  });
  Object.entries(ds.aclCfg).forEach(([name, arr]) => {
    arr.forEach(c => allCmds.add(c));
    const aclDef = ds.globalCmds.find(gc => gc.includes("access-list") && gc.includes(name));
    if (aclDef) allCmds.add(aclDef);
  });
  Object.entries(ds.dhcpCfg).forEach(([name, arr]) => {
    arr.forEach(c => allCmds.add(c));
    allCmds.add(`ip dhcp pool ${name.toLowerCase()}`);
  });
  ds.staticRoutes.forEach(c => allCmds.add(c));
  (ds.staticRoutesV6 || []).forEach(c => allCmds.add(c));
  ds.natRules.forEach(c => allCmds.add(c));
  ds.dhcpExcluded.forEach(c => allCmds.add(c));

  // ─── 2. Synthesize VLAN commands from structured state ───
  if (ds.vlans) {
    Object.entries(ds.vlans).forEach(([vid, name]) => {
      if (vid === "1") return;
      allCmds.add(`vlan ${vid}`);
      if (name) allCmds.add(`name ${name.toLowerCase()}`);
    });
  }
  if (ds.vlanCfg) {
    Object.entries(ds.vlanCfg).forEach(([vid, name]) => {
      allCmds.add(`vlan ${vid}`);
      if (name) allCmds.add(`name ${name.toLowerCase()}`);
    });
  }

  // ─── 3. Synthesize hostname ───
  if (ds.hostname) {
    allCmds.add(`hostname ${ds.hostname.toLowerCase()}`);
  }

  // ─── 4. Synthesize CDP/LLDP global state ───
  if (ds.cdpGlobal === true) allCmds.add("cdp run");
  if (ds.cdpGlobal === false) allCmds.add("no cdp run");
  if (ds.lldpGlobal === true) allCmds.add("lldp run");
  if (ds.lldpGlobal === false) allCmds.add("no lldp run");

  // ─── 5. Synthesize DHCP snooping state ───
  if (ds.dhcpSnooping) {
    if (ds.dhcpSnooping.enabled) allCmds.add("ip dhcp snooping");
    (ds.dhcpSnooping.vlans || []).forEach(v => allCmds.add(`ip dhcp snooping vlan ${v}`));
    if (ds.dhcpSnooping.options) {
      Object.entries(ds.dhcpSnooping.options).forEach(([k, v]) => {
        if (v === false) allCmds.add(`no ip dhcp snooping ${k}`);
        else allCmds.add(`ip dhcp snooping ${k}`);
      });
    }
    (ds.dhcpSnooping.trusted || []).forEach(iface => {
      allCmds.add("ip dhcp snooping trust");
      allCmds.add(`interface ${iface.toLowerCase()} ip dhcp snooping trust`);
    });
  }

  // ─── 6. Synthesize DAI state ───
  if (ds.daiConfig) {
    (ds.daiConfig.vlans || []).forEach(v => allCmds.add(`ip arp inspection vlan ${v}`));
    if (ds.daiConfig.validate && ds.daiConfig.validate.length > 0) {
      allCmds.add(`ip arp inspection validate ${ds.daiConfig.validate.join(" ")}`);
      ds.daiConfig.validate.forEach(v => allCmds.add(`ip arp inspection validate ${v}`));
    }
    (ds.daiConfig.trusted || []).forEach(iface => {
      allCmds.add("ip arp inspection trust");
      allCmds.add(`interface ${iface.toLowerCase()} ip arp inspection trust`);
    });
  }

  // ─── 7. Synthesize port-security state ───
  if (ds.portSecurity) {
    Object.entries(ds.portSecurity).forEach(([iface, cfg]) => {
      if (cfg.enabled) {
        allCmds.add("switchport port-security");
        allCmds.add(`interface ${iface.toLowerCase()} switchport port-security`);
      }
      if (cfg.max) {
        allCmds.add(`switchport port-security maximum ${cfg.max}`);
      }
      if (cfg.violation) {
        allCmds.add(`switchport port-security violation ${cfg.violation}`);
      }
      if (cfg.sticky) {
        allCmds.add("switchport port-security mac-address sticky");
      }
    });
  }

  // ─── 8. Synthesize NTP state ───
  if (ds.ntpConfig) {
    Object.keys(ds.ntpConfig).forEach(k => allCmds.add(`ntp ${k}`));
  }

  // ─── 9. Synthesize SSH state ───
  if (ds.sshConfigured) {
    allCmds.add("crypto key generate rsa");
  }

  // ─── 10. Synthesize OSPF state ───
  if (ds.ospfConfig && ds.ospfConfig.routerId) {
    allCmds.add(`router-id ${ds.ospfConfig.routerId}`);
  }

  // ─── 11. Users ───
  if (ds.users) {
    ds.users.forEach(u => { if (u.cmd) allCmds.add(u.cmd); });
  }

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
