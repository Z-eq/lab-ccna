// topoRenderer.js — Programmatic SVG topology renderer v2
// Handles routers (IP-based link detection) AND switches (topology-text + heuristic detection)

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const W = 540;
const H = 380;
const BOX_W = 88;
const BOX_H = 42;
const MARGIN = 44; // keep boxes away from edge

// ─── UTILS ────────────────────────────────────────────────────────────────────
function ipToNum(ip) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}
function getNetwork(cidr) {
  if (!cidr || !cidr.includes("/")) return null;
  const [ip, pfx] = cidr.split("/");
  const bits = parseInt(pfx, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  const net = (ipToNum(ip) & mask) >>> 0;
  return { net, prefix: bits };
}
function sameSubnet(a, b) {
  const n1 = getNetwork(a), n2 = getNetwork(b);
  if (!n1 || !n2 || n1.prefix !== n2.prefix) return false;
  return n1.net === n2.net;
}
function shortIf(name) {
  return name
    .replace(/GigabitEthernet/i, "Gi")
    .replace(/FastEthernet/i, "Fa")
    .replace(/Ethernet/i, "E")
    .replace(/Loopback/i, "Lo")
    .replace(/Port-channel/i, "Po")
    .replace(/Serial/i, "Se")
    .replace(/Vlan/i, "Vl");
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── LINK DETECTION ───────────────────────────────────────────────────────────
function detectLinks(devices, topoText) {
  const links = [];
  const seen = new Set();

  // ── 1. IP-subnet matching (routers / L3 switches) ────────────────────────
  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const ifA = Object.entries(devices[i].interfaces || {});
      const ifB = Object.entries(devices[j].interfaces || {});
      for (const [nA, iA] of ifA) {
        for (const [nB, iB] of ifB) {
          if (!iA.ip || !iB.ip) continue;
          if (/loopback/i.test(nA) || /loopback/i.test(nB)) continue;
          if (sameSubnet(iA.ip, iB.ip)) {
            const key = [i, j, nA, nB].join("|");
            if (!seen.has(key)) {
              seen.add(key);
              links.push({ from: i, to: j, fromIf: nA, toIf: nB, fromIp: iA.ip, toIp: iB.ip, type: "l3" });
            }
          }
        }
      }
    }
  }

  // ── 2. Topology-text parsing (catches L2 switch connections) ─────────────
  // Looks for patterns: SW1(E0/0) ── SW2, or SW1 -- SW2, or device names next to each other
  if (topoText) {
    const nameMap = {};
    devices.forEach((d, i) => { nameMap[d.name.toLowerCase()] = i; });
    const namePattern = devices.map(d => d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    if (namePattern) {
      const re = new RegExp(`(${namePattern})[^\\n]{0,40}?(${namePattern})`, "gi");
      let m;
      while ((m = re.exec(topoText)) !== null) {
        const a = nameMap[m[1].toLowerCase()];
        const b = nameMap[m[2].toLowerCase()];
        if (a !== undefined && b !== undefined && a !== b) {
          const key = [Math.min(a,b), Math.max(a,b)].join("|");
          if (!seen.has(key)) {
            seen.add(key);
            // Try to extract interface names from surrounding text
            const seg = m[0];
            const ifRe = /[EGFeSe](?:thernet|igabit|ast)?(\d+\/\d+(?:\/\d+)?)/gi;
            const ifaces = [];
            let fm;
            while ((fm = ifRe.exec(seg)) !== null) ifaces.push(fm[0]);
            links.push({
              from: Math.min(a,b), to: Math.max(a,b),
              fromIf: ifaces[0] || "E0/0", toIf: ifaces[1] || ifaces[0] || "E0/0",
              fromIp: "", toIp: "", type: "l2"
            });
          }
        }
      }
    }
  }

  // ── 3. Heuristic: if still no links found, connect sequential devices ─────
  if (links.length === 0 && devices.length >= 2) {
    for (let i = 0; i < devices.length - 1; i++) {
      const key = [i, i + 1].join("|");
      if (!seen.has(key)) {
        seen.add(key);
        // Find first non-loopback interface on each side
        const ifA = Object.keys(devices[i].interfaces || {}).find(n => !/loopback/i.test(n)) || "E0/0";
        const ifB = Object.keys(devices[i+1].interfaces || {}).find(n => !/loopback/i.test(n)) || "E0/0";
        links.push({ from: i, to: i+1, fromIf: ifA, toIf: ifB, fromIp: "", toIp: "", type: "heuristic" });
      }
    }
  }

  // ── 4. Mark trunks / port-channels ───────────────────────────────────────
  links.forEach(lk => {
    lk.isTrunk = /port.channel|trunk/i.test(lk.fromIf) || /port.channel|trunk/i.test(lk.toIf);
  });

  return links;
}

// ─── VLAN EXTRACTION ──────────────────────────────────────────────────────────
function extractVlans(devices) {
  // Returns [{id, name, devices:[]}]
  const vlanMap = {};
  devices.forEach(dev => {
    // From vlanCfg if available
    const vlans = dev.vlans || dev.vlanCfg || {};
    Object.entries(vlans).forEach(([id, name]) => {
      if (id === "1") return;
      if (!vlanMap[id]) vlanMap[id] = { id, name: typeof name === "string" ? name : "", devs: [] };
      if (!vlanMap[id].devs.includes(dev.name)) vlanMap[id].devs.push(dev.name);
    });
    // Also scan interfaces for switchport access vlan hints
    Object.entries(dev.interfaces || {}).forEach(([, info]) => {
      if (info.vlan) {
        const id = String(info.vlan);
        if (!vlanMap[id]) vlanMap[id] = { id, name: "", devs: [] };
        if (!vlanMap[id].devs.includes(dev.name)) vlanMap[id].devs.push(dev.name);
      }
    });
  });
  return Object.values(vlanMap).sort((a, b) => parseInt(a.id) - parseInt(b.id)).slice(0, 8);
}

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
function computeLayout(n) {
  const cx = W / 2, cy = H / 2 - 10;
  const pos = [];
  if (n === 1) {
    pos.push({ x: cx, y: cy });
  } else if (n === 2) {
    pos.push({ x: cx - 150, y: cy });
    pos.push({ x: cx + 150, y: cy });
  } else if (n === 3) {
    // top + bottom-left + bottom-right
    pos.push({ x: cx,        y: cy - 100 });
    pos.push({ x: cx - 140,  y: cy + 65  });
    pos.push({ x: cx + 140,  y: cy + 65  });
  } else if (n === 4) {
    pos.push({ x: cx - 150,  y: cy - 90  });
    pos.push({ x: cx + 150,  y: cy - 90  });
    pos.push({ x: cx - 150,  y: cy + 80  });
    pos.push({ x: cx + 150,  y: cy + 80  });
  } else if (n === 5) {
    const r = 130;
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
      pos.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  } else {
    const r = Math.min(W, H) * 0.34;
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI / n) - Math.PI / 2;
      pos.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  }
  // Clamp to canvas
  return pos.map(p => ({
    x: clamp(p.x, MARGIN + BOX_W / 2, W - MARGIN - BOX_W / 2),
    y: clamp(p.y, MARGIN + BOX_H / 2, H - MARGIN - BOX_H / 2),
  }));
}

// ─── BOX EDGE INTERSECTION ────────────────────────────────────────────────────
function boxEdge(px, py, tx, ty) {
  const dx = tx - px, dy = ty - py;
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  const hw = BOX_W / 2 + 1, hh = BOX_H / 2 + 1;
  if (absDx === 0 && absDy === 0) return { x: px, y: py };
  const scaleX = absDx > 0 ? hw / absDx : Infinity;
  const scaleY = absDy > 0 ? hh / absDy : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: px + dx * scale, y: py + dy * scale };
}

// ─── MAIN SVG FUNCTION ────────────────────────────────────────────────────────
export function renderTopologySVG(lab, theme = "dark") {
  const devices = lab.devices || [];
  if (devices.length === 0) return null;

  const isDark = theme === "dark";
  const C = {
    bg:           isDark ? "#0c1118" : "#f8fafc",
    routerFill:   isDark ? "#0d2240" : "#dbeafe",
    routerBorder: isDark ? "#38bdf8" : "#2563eb",
    routerText:   isDark ? "#7dd3fc" : "#1d4ed8",
    switchFill:   isDark ? "#0a2a14" : "#dcfce7",
    switchBorder: isDark ? "#4ade80" : "#16a34a",
    switchText:   isDark ? "#86efac" : "#15803d",
    link:         isDark ? "#334155" : "#94a3b8",
    trunk:        isDark ? "#f59e0b" : "#d97706",
    ifLabel:      isDark ? "#94a3b8" : "#475569",
    subnetFill:   isDark ? "#1e293b" : "#e2e8f0",
    subnetText:   isDark ? "#64748b" : "#64748b",
    ipText:       isDark ? "#94a3b8" : "#64748b",
    loFill:       isDark ? "#1e1040" : "#ede9fe",
    loText:       isDark ? "#a78bfa" : "#7c3aed",
    vlanFill:     isDark ? "#1a1a2e" : "#fef9c3",
    vlanBorder:   isDark ? "#f59e0b" : "#ca8a04",
    vlanText:     isDark ? "#fbbf24" : "#92400e",
    legendBg:     isDark ? "#111827" : "#f1f5f9",
    legendText:   isDark ? "#64748b" : "#64748b",
  };

  const topoText = lab.topology || "";
  const positions = computeLayout(devices.length);
  const links = detectLinks(devices, topoText);
  const vlans = extractVlans(devices);
  const hasVlans = vlans.length > 0;

  // Shrink canvas height if VLANs need space at bottom
  const vlanH = hasVlans ? 28 : 0;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;font-family:'JetBrains Mono',monospace">`;
  svg += `<rect width="${W}" height="${H}" fill="${C.bg}" rx="8"/>`;

  // ─── LINKS ────────────────────────────────────────────────────────────────
  links.forEach(lk => {
    const p1 = positions[lk.from];
    const p2 = positions[lk.to];
    if (!p1 || !p2) return;

    const e1 = boxEdge(p1.x, p1.y, p2.x, p2.y);
    const e2 = boxEdge(p2.x, p2.y, p1.x, p1.y);
    const mx = (e1.x + e2.x) / 2;
    const my = (e1.y + e2.y) / 2;
    const dx = e2.x - e1.x, dy = e2.y - e1.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/len, uy = dy/len;
    const px = -uy, py = ux; // perpendicular

    const strokeC = lk.isTrunk ? C.trunk : C.link;
    const sw = lk.isTrunk ? 2.5 : 1.5;

    // Double line for trunk
    if (lk.isTrunk) {
      svg += `<line x1="${(e1.x+px*2).toFixed(1)}" y1="${(e1.y+py*2).toFixed(1)}" x2="${(e2.x+px*2).toFixed(1)}" y2="${(e2.y+py*2).toFixed(1)}" stroke="${strokeC}" stroke-width="1.5" opacity="0.7"/>`;
      svg += `<line x1="${(e1.x-px*2).toFixed(1)}" y1="${(e1.y-py*2).toFixed(1)}" x2="${(e2.x-px*2).toFixed(1)}" y2="${(e2.y-py*2).toFixed(1)}" stroke="${strokeC}" stroke-width="1.5" opacity="0.7"/>`;
    }
    svg += `<line x1="${e1.x.toFixed(1)}" y1="${e1.y.toFixed(1)}" x2="${e2.x.toFixed(1)}" y2="${e2.y.toFixed(1)}" stroke="${strokeC}" stroke-width="${sw}"/>`;

    // Interface labels — placed ALONG the line, offset perpendicular 9px, positioned 22px from box edge
    const IFOFF = 22;
    const PERP = 9;

    const f1x = (e1.x + ux*IFOFF + px*PERP).toFixed(1);
    const f1y = (e1.y + uy*IFOFF + py*PERP).toFixed(1);
    svg += `<text x="${f1x}" y="${f1y}" fill="${C.ifLabel}" font-size="7.5" text-anchor="middle" dominant-baseline="middle">${esc(shortIf(lk.fromIf))}</text>`;

    const f2x = (e2.x - ux*IFOFF + px*PERP).toFixed(1);
    const f2y = (e2.y - uy*IFOFF + py*PERP).toFixed(1);
    svg += `<text x="${f2x}" y="${f2y}" fill="${C.ifLabel}" font-size="7.5" text-anchor="middle" dominant-baseline="middle">${esc(shortIf(lk.toIf))}</text>`;

    // Subnet / IP label at midpoint
    if (lk.fromIp) {
      const net = getNetwork(lk.fromIp);
      const oct = lk.fromIp.split("/")[0].split(".");
      const label = `${oct[0]}.${oct[1]}.${oct[2]}.0/${net ? net.prefix : "?"}`;
      const bw = 62, bh = 13;
      svg += `<rect x="${(mx - bw/2).toFixed(1)}" y="${(my - bh/2).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.subnetFill}" rx="3" opacity="0.9"/>`;
      svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${C.subnetText}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`;
    } else if (lk.type === "l2") {
      // L2 link — show "Trunk" or "Link" label
      const label = lk.isTrunk ? "Trunk" : "Link";
      const bw = 32, bh = 12;
      svg += `<rect x="${(mx - bw/2).toFixed(1)}" y="${(my - bh/2).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.subnetFill}" rx="3" opacity="0.85"/>`;
      svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${lk.isTrunk ? C.trunk : C.subnetText}" font-size="7" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    }
  });

  // ─── DEVICES ──────────────────────────────────────────────────────────────
  devices.forEach((dev, i) => {
    const p = positions[i];
    if (!p) return;
    const isR = dev.type === "router";
    const fill   = isR ? C.routerFill   : C.switchFill;
    const border = isR ? C.routerBorder : C.switchBorder;
    const tcolor = isR ? C.routerText   : C.switchText;
    const bx = (p.x - BOX_W/2).toFixed(1);
    const by = (p.y - BOX_H/2).toFixed(1);

    // Shadow
    svg += `<rect x="${(p.x - BOX_W/2 + 2).toFixed(1)}" y="${(p.y - BOX_H/2 + 2).toFixed(1)}" width="${BOX_W}" height="${BOX_H}" fill="rgba(0,0,0,0.25)" rx="6"/>`;

    // Main box
    svg += `<rect x="${bx}" y="${by}" width="${BOX_W}" height="${BOX_H}" fill="${fill}" stroke="${border}" stroke-width="1.5" rx="6"/>`;

    // Accent top bar
    svg += `<rect x="${bx}" y="${by}" width="${BOX_W}" height="5" fill="${border}" rx="6"/>`;
    svg += `<rect x="${bx}" y="${(p.y - BOX_H/2 + 3).toFixed(1)}" width="${BOX_W}" height="2" fill="${fill}" rx="0"/>`;

    // Icon + name side by side
    const icon = isR ? "R" : "SW";
    svg += `<text x="${(p.x - BOX_W/2 + 8).toFixed(1)}" y="${(p.y - 2).toFixed(1)}" fill="${border}" font-size="8" font-weight="bold" opacity="0.6">${icon}</text>`;
    svg += `<text x="${(p.x + 2).toFixed(1)}" y="${(p.y - 1).toFixed(1)}" fill="${tcolor}" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(dev.name)}</text>`;

    // Type label
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y + 12).toFixed(1)}" fill="${tcolor}" font-size="7" text-anchor="middle" dominant-baseline="middle" opacity="0.65">${isR ? "router" : "switch"}</text>`;

    // ── Loopback addresses — shown in a pill to the RIGHT of the box ────────
    const loopbacks = Object.entries(dev.interfaces || {})
      .filter(([n]) => /loopback/i.test(n))
      .map(([n, info]) => `${shortIf(n)}: ${info.ip || ""}`);

    if (loopbacks.length > 0) {
      const lox = p.x + BOX_W/2 + 4;
      const loy = p.y - ((loopbacks.length - 1) * 10) / 2;
      const maxW = Math.max(...loopbacks.map(l => l.length)) * 5 + 8;
      svg += `<rect x="${lox.toFixed(1)}" y="${(loy - loopbacks.length * 10 / 2 - 2).toFixed(1)}" width="${maxW}" height="${(loopbacks.length * 11 + 4).toFixed(1)}" fill="${C.loFill}" rx="3" opacity="0.9"/>`;
      loopbacks.forEach((label, li) => {
        svg += `<text x="${(lox + 4).toFixed(1)}" y="${(loy - (loopbacks.length-1)*5 + li*11).toFixed(1)}" fill="${C.loText}" font-size="7" dominant-baseline="middle">${esc(label)}</text>`;
      });
    }
  });

  // ─── VLAN TABLE ───────────────────────────────────────────────────────────
  if (hasVlans) {
    const tableY = H - vlanH - 6;
    const cellW = Math.min(80, (W - 20) / vlans.length);
    const startX = (W - cellW * vlans.length) / 2;

    svg += `<text x="${W/2}" y="${tableY - 4}" fill="${C.vlanText}" font-size="7.5" text-anchor="middle" opacity="0.8">VLANs</text>`;

    vlans.forEach((vl, vi) => {
      const vx = startX + vi * cellW;
      svg += `<rect x="${vx.toFixed(1)}" y="${tableY.toFixed(1)}" width="${(cellW-2).toFixed(1)}" height="22" fill="${C.vlanFill}" stroke="${C.vlanBorder}" stroke-width="0.8" rx="3" opacity="0.9"/>`;
      svg += `<text x="${(vx + cellW/2 - 1).toFixed(1)}" y="${(tableY + 8).toFixed(1)}" fill="${C.vlanText}" font-size="8" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(vl.id)}</text>`;
      const nameShort = vl.name ? vl.name.slice(0, 9) : "";
      if (nameShort) {
        svg += `<text x="${(vx + cellW/2 - 1).toFixed(1)}" y="${(tableY + 18).toFixed(1)}" fill="${C.vlanText}" font-size="6.5" text-anchor="middle" dominant-baseline="middle" opacity="0.8">${esc(nameShort)}</text>`;
      }
    });
  }

  // ─── LEGEND ───────────────────────────────────────────────────────────────
  const ly = hasVlans ? H - vlanH - 34 : H - 18;
  svg += `<line x1="10" y1="${ly}" x2="22" y2="${ly}" stroke="${C.link}" stroke-width="1.5"/>`;
  svg += `<text x="26" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Link</text>`;
  svg += `<line x1="52" y1="${ly}" x2="64" y2="${ly}" stroke="${C.trunk}" stroke-width="2.5"/>`;
  svg += `<text x="68" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Trunk</text>`;
  svg += `<rect x="100" y="${(ly-4).toFixed(1)}" width="8" height="8" fill="${C.loFill}" stroke="${C.loText}" stroke-width="0.8" rx="1"/>`;
  svg += `<text x="112" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Loopback</text>`;
  if (hasVlans) {
    svg += `<rect x="162" y="${(ly-4).toFixed(1)}" width="8" height="8" fill="${C.vlanFill}" stroke="${C.vlanBorder}" stroke-width="0.8" rx="1"/>`;
    svg += `<text x="174" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">VLAN</text>`;
  }

  svg += `</svg>`;
  return svg;
}
