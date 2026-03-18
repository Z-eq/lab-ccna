// topoRenderer.js — Programmatic SVG topology renderer
// Reads lab.devices and auto-generates a professional network diagram

// ─── SUBNET UTILITIES ─────────────────────────────────────────────────────────
function ipToNum(ip) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
}

function getNetwork(cidr) {
  if (!cidr || !cidr.includes("/")) return null;
  const [ip, prefix] = cidr.split("/");
  const bits = parseInt(prefix);
  if (isNaN(bits)) return null;
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  const net = (ipToNum(ip) & mask) >>> 0;
  return { net, mask, prefix: bits, ip };
}

function sameSubnet(cidr1, cidr2) {
  const n1 = getNetwork(cidr1);
  const n2 = getNetwork(cidr2);
  if (!n1 || !n2) return false;
  if (n1.prefix !== n2.prefix) return false;
  return n1.net === n2.net;
}

// ─── LINK DETECTION ───────────────────────────────────────────────────────────
function detectLinks(devices) {
  const links = [];
  const seen = new Set();

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const devA = devices[i];
      const devB = devices[j];

      const ifacesA = Object.entries(devA.interfaces || {});
      const ifacesB = Object.entries(devB.interfaces || {});

      for (const [nameA, infoA] of ifacesA) {
        for (const [nameB, infoB] of ifacesB) {
          const ipA = infoA.ip || "";
          const ipB = infoB.ip || "";
          if (!ipA || !ipB) continue;

          // Skip loopback matching with non-loopback
          const isLoopA = nameA.toLowerCase().includes("loopback") || ipA.startsWith("127.");
          const isLoopB = nameB.toLowerCase().includes("loopback") || ipB.startsWith("127.");
          if (isLoopA || isLoopB) continue;

          if (sameSubnet(ipA, ipB)) {
            const key = `${i}-${j}-${nameA}-${nameB}`;
            if (!seen.has(key)) {
              seen.add(key);
              links.push({
                from: i, to: j,
                fromDev: devA.name, toDev: devB.name,
                fromIface: nameA, toIface: nameB,
                fromIp: ipA, toIp: ipB,
                isTrunk: nameA.toLowerCase().includes("port-channel") || nameB.toLowerCase().includes("port-channel"),
              });
            }
          }
        }
      }
    }
  }
  return links;
}

// ─── LAYOUT ENGINE ────────────────────────────────────────────────────────────
function computeLayout(devices, width, height) {
  const n = devices.length;
  const cx = width / 2;
  const cy = height / 2;
  const positions = [];

  if (n === 1) {
    positions.push({ x: cx, y: cy });
  } else if (n === 2) {
    positions.push({ x: cx - 140, y: cy });
    positions.push({ x: cx + 140, y: cy });
  } else if (n === 3) {
    // Triangle
    const r = 110;
    positions.push({ x: cx, y: cy - r });
    positions.push({ x: cx - r * 0.9, y: cy + r * 0.5 });
    positions.push({ x: cx + r * 0.9, y: cy + r * 0.5 });
  } else if (n === 4) {
    // Square
    const r = 115;
    positions.push({ x: cx - r, y: cy - r * 0.7 });
    positions.push({ x: cx + r, y: cy - r * 0.7 });
    positions.push({ x: cx - r, y: cy + r * 0.7 });
    positions.push({ x: cx + r, y: cy + r * 0.7 });
  } else if (n === 5) {
    // Pentagon
    const r = 115;
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      positions.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
  } else {
    // Circle for 6+
    const r = Math.min(width, height) * 0.35;
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
      positions.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
  }

  return positions;
}

// ─── LOOPBACK HELPER ──────────────────────────────────────────────────────────
function getLoopbacks(device) {
  return Object.entries(device.interfaces || {})
    .filter(([name]) => name.toLowerCase().includes("loopback"))
    .map(([name, info]) => ({ name, ip: info.ip || "" }));
}

// ─── INTERFACE LABEL SHORTENER ────────────────────────────────────────────────
function shortIface(name) {
  return name
    .replace(/GigabitEthernet/i, "Gi")
    .replace(/FastEthernet/i, "Fa")
    .replace(/Ethernet/i, "E")
    .replace(/Loopback/i, "Lo")
    .replace(/Port-channel/i, "Po")
    .replace(/Serial/i, "Se");
}

// ─── MAIN SVG GENERATOR ───────────────────────────────────────────────────────
export function renderTopologySVG(lab, theme = "dark") {
  const devices = lab.devices || [];
  if (devices.length === 0) return null;

  const W = 520;
  const H = 340;
  const BOX_W = 82;
  const BOX_H = 36;

  const isDark = theme === "dark";
  const colors = {
    bg:         isDark ? "#0c1118" : "#f8fafc",
    router:     isDark ? "#0f2744" : "#dbeafe",
    routerBorder: isDark ? "#38bdf8" : "#2563eb",
    routerText: isDark ? "#38bdf8" : "#1d4ed8",
    switch:     isDark ? "#0f2d1a" : "#dcfce7",
    switchBorder: isDark ? "#22c55e" : "#16a34a",
    switchText: isDark ? "#22c55e" : "#15803d",
    link:       isDark ? "#334155" : "#94a3b8",
    trunkLink:  isDark ? "#f59e0b" : "#d97706",
    linkLabel:  isDark ? "#64748b" : "#64748b",
    ipText:     isDark ? "#94a3b8" : "#475569",
    loopback:   isDark ? "#a78bfa" : "#7c3aed",
    subnetBg:   isDark ? "#1e293b" : "#f1f5f9",
    subnetText: isDark ? "#475569" : "#64748b",
  };

  const positions = computeLayout(devices, W, H);
  const links = detectLinks(devices);

  // ─── Build SVG ───────────────────────────────────────────────────────────
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;font-family:monospace">`;

  // Background
  svg += `<rect width="${W}" height="${H}" fill="${colors.bg}" rx="8"/>`;

  // ─── Draw links ──────────────────────────────────────────────────────────
  links.forEach(link => {
    const p1 = positions[link.from];
    const p2 = positions[link.to];
    if (!p1 || !p2) return;

    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    // Offset line ends to box edge
    const startX = p1.x + ux * (BOX_W / 2 + 2);
    const startY = p1.y + uy * (BOX_H / 2 + 2);
    const endX = p2.x - ux * (BOX_W / 2 + 2);
    const endY = p2.y - uy * (BOX_H / 2 + 2);

    const stroke = link.isTrunk ? colors.trunkLink : colors.link;
    const sw = link.isTrunk ? 2.5 : 1.5;
    const dash = link.isTrunk ? "" : "";

    svg += `<line x1="${startX.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`;

    // ─── Interface labels near the endpoints ─────────────────────────────
    const labelOffset = 18;
    const perpX = -uy;
    const perpY = ux;

    // From-side label
    const fLx = (startX + ux * labelOffset + perpX * 10).toFixed(1);
    const fLy = (startY + uy * labelOffset + perpY * 10).toFixed(1);
    svg += `<text x="${fLx}" y="${fLy}" fill="${colors.linkLabel}" font-size="7" text-anchor="middle">${shortIface(link.fromIface)}</text>`;

    // To-side label
    const tLx = (endX - ux * labelOffset + perpX * 10).toFixed(1);
    const tLy = (endY - uy * labelOffset + perpY * 10).toFixed(1);
    svg += `<text x="${tLx}" y="${tLy}" fill="${colors.linkLabel}" font-size="7" text-anchor="middle">${shortIface(link.toIface)}</text>`;

    // ─── Subnet label at midpoint ─────────────────────────────────────────
    const net = getNetwork(link.fromIp);
    if (net) {
      const subnet = link.fromIp.split("/")[0].split(".").slice(0, 3).join(".") + `.0/${net.prefix}`;
      const bgX = (mx - 28).toFixed(1);
      const bgY = (my - 8).toFixed(1);
      svg += `<rect x="${bgX}" y="${bgY}" width="56" height="11" fill="${colors.subnetBg}" rx="3" opacity="0.85"/>`;
      svg += `<text x="${mx.toFixed(1)}" y="${(my + 1).toFixed(1)}" fill="${colors.subnetText}" font-size="7" text-anchor="middle">${subnet}</text>`;
    }
  });

  // ─── Draw devices ─────────────────────────────────────────────────────────
  devices.forEach((dev, i) => {
    const p = positions[i];
    if (!p) return;
    const isRouter = dev.type === "router";
    const bg = isRouter ? colors.router : colors.switch;
    const border = isRouter ? colors.routerBorder : colors.switchBorder;
    const textColor = isRouter ? colors.routerText : colors.switchText;

    const x = (p.x - BOX_W / 2).toFixed(1);
    const y = (p.y - BOX_H / 2).toFixed(1);

    // Device box
    if (isRouter) {
      // Router: rounded rect with top accent line
      svg += `<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" fill="${bg}" stroke="${border}" stroke-width="1.5" rx="6"/>`;
      svg += `<rect x="${x}" y="${y}" width="${BOX_W}" height="4" fill="${border}" rx="6"/>`;
    } else {
      // Switch: rect with double-line top to suggest switching
      svg += `<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" fill="${bg}" stroke="${border}" stroke-width="1.5" rx="4"/>`;
      svg += `<rect x="${x}" y="${y}" width="${BOX_W}" height="3" fill="${border}" rx="4"/>`;
      svg += `<rect x="${x}" y="${(parseFloat(y) + 4).toFixed(1)}" width="${BOX_W}" height="1" fill="${border}" opacity="0.5"/>`;
    }

    // Icon
    const icon = isRouter ? "⟁" : "⊞";
    svg += `<text x="${(p.x - BOX_W / 2 + 10).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" fill="${textColor}" font-size="11">${icon}</text>`;

    // Hostname
    svg += `<text x="${(p.x + 4).toFixed(1)}" y="${(p.y + 5).toFixed(1)}" fill="${textColor}" font-size="10" font-weight="bold" text-anchor="middle">${dev.name}</text>`;

    // Type label
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y + 15).toFixed(1)}" fill="${textColor}" font-size="7" text-anchor="middle" opacity="0.7">${isRouter ? "Router" : "Switch"}</text>`;

    // ─── Loopback addresses below box ──────────────────────────────────────
    const loopbacks = getLoopbacks(dev);
    loopbacks.forEach((lo, li) => {
      const ly = (p.y + BOX_H / 2 + 10 + li * 11).toFixed(1);
      svg += `<text x="${p.x.toFixed(1)}" y="${ly}" fill="${colors.loopback}" font-size="7" text-anchor="middle">${shortIface(lo.name)}: ${lo.ip}</text>`;
    });

    // ─── Non-loopback IPs shown inside box if only one link ────────────────
    const nonLoopIfaces = Object.entries(dev.interfaces || {})
      .filter(([n]) => !n.toLowerCase().includes("loopback"))
      .filter(([, info]) => info.ip);

    // If device has exactly one non-loop IP and no link was found, show it
    if (nonLoopIfaces.length === 1) {
      const linkedIfaces = links
        .filter(l => l.from === i || l.to === i)
        .map(l => l.from === i ? l.fromIface : l.toIface);
      if (!linkedIfaces.includes(nonLoopIfaces[0][0])) {
        const ipY = (p.y + BOX_H / 2 + 9).toFixed(1);
        svg += `<text x="${p.x.toFixed(1)}" y="${ipY}" fill="${colors.ipText}" font-size="7" text-anchor="middle">${nonLoopIfaces[0][1].ip}</text>`;
      }
    }
  });

  // ─── Legend ───────────────────────────────────────────────────────────────
  svg += `<rect x="8" y="${H - 22}" width="160" height="16" fill="${colors.subnetBg}" rx="3" opacity="0.7"/>`;
  svg += `<line x1="14" y1="${H - 14}" x2="26" y2="${H - 14}" stroke="${colors.link}" stroke-width="1.5"/>`;
  svg += `<text x="30" y="${H - 10}" fill="${colors.linkLabel}" font-size="7">Link</text>`;
  svg += `<line x1="55" y1="${H - 14}" x2="67" y2="${H - 14}" stroke="${colors.trunkLink}" stroke-width="2.5"/>`;
  svg += `<text x="71" y="${H - 10}" fill="${colors.linkLabel}" font-size="7">Trunk/PO</text>`;
  svg += `<text x="114" y="${H - 10}" fill="${colors.loopback}" font-size="7">Lo = Loopback</text>`;

  svg += `</svg>`;
  return svg;
}
