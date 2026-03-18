// topoRenderer.js — SVG network topology renderer v3
// Handles routers (IP-based link detection), switches (text-based), and mixed topologies

const W = 540;
const H = 390;
const BOX_W = 90;
const BOX_H = 44;

// ─── UTILS ────────────────────────────────────────────────────────────────────
function ipToNum(ip) {
  const p = ip.split(".");
  return ((parseInt(p[0],10)<<24)|(parseInt(p[1],10)<<16)|(parseInt(p[2],10)<<8)|parseInt(p[3],10))>>>0;
}
function getNet(cidr) {
  if (!cidr || !cidr.includes("/")) return null;
  const [ip, pfx] = cidr.split("/");
  const bits = parseInt(pfx, 10);
  if (isNaN(bits)||bits<0||bits>32) return null;
  const mask = bits===0 ? 0 : (0xFFFFFFFF<<(32-bits))>>>0;
  return { net:(ipToNum(ip)&mask)>>>0, bits, ipStr:ip };
}
function sameSubnet(a, b) {
  const n1=getNet(a), n2=getNet(b);
  return n1&&n2&&n1.bits===n2.bits&&n1.net===n2.net;
}
function shortIf(n) {
  return n.replace(/GigabitEthernet/i,"Gi").replace(/FastEthernet/i,"Fa")
          .replace(/Ethernet/i,"E").replace(/Loopback/i,"Lo")
          .replace(/Port-channel/i,"Po").replace(/Serial/i,"Se")
          .replace(/Vlan/i,"Vl");
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }

// ─── BOX EDGE ─────────────────────────────────────────────────────────────────
// Returns the point on the box edge in the direction of (tx,ty)
function boxEdge(px, py, tx, ty) {
  const dx = tx-px, dy = ty-py;
  if (Math.abs(dx)<0.001 && Math.abs(dy)<0.001) return {x:px,y:py};
  const hw = BOX_W/2+1, hh = BOX_H/2+1;
  const sx = Math.abs(dx)>0.001 ? hw/Math.abs(dx) : 1e9;
  const sy = Math.abs(dy)>0.001 ? hh/Math.abs(dy) : 1e9;
  const s  = Math.min(sx,sy);
  return { x: px+dx*s, y: py+dy*s };
}

// ─── LINK DETECTION ───────────────────────────────────────────────────────────
function detectLinks(devices, topoText) {
  const links = [];
  const seen  = new Set();

  const addLink = (from, to, fromIf, toIf, fromIp, toIp, isTrunk) => {
    const key = [Math.min(from,to), Math.max(from,to)].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ from, to, fromIf, toIf, fromIp:fromIp||"", toIp:toIp||"", isTrunk:!!isTrunk });
  };

  // ── 1. IP subnet matching (routers / L3) ─────────────────────────────────
  for (let i=0; i<devices.length; i++) {
    for (let j=i+1; j<devices.length; j++) {
      const ifA = Object.entries(devices[i].interfaces||{});
      const ifB = Object.entries(devices[j].interfaces||{});
      for (const [nA,iA] of ifA) {
        if (!iA.ip || /loopback/i.test(nA)) continue;
        for (const [nB,iB] of ifB) {
          if (!iB.ip || /loopback/i.test(nB)) continue;
          if (sameSubnet(iA.ip, iB.ip)) {
            addLink(i, j, nA, nB, iA.ip, iB.ip, false);
          }
        }
      }
    }
  }

  // ── 2. Topology text — find device pairs and interface names ─────────────
  if (topoText && devices.length >= 2) {
    const nameMap = {};
    devices.forEach((d,i) => { nameMap[d.name.toLowerCase()] = i; });

    // Split into lines, parse each line for device pairs
    topoText.split(/\n/).forEach(line => {
      const lower = line.toLowerCase();
      // Trunk if line contains trunk keyword OR double-line symbols OR port-channel
      const isTrunk = /trunk|══|===|==|port.channel|\bpo\d/i.test(line);

      // Find all device name occurrences in this line
      const found = [];
      devices.forEach((d,i) => {
        const idx = lower.indexOf(d.name.toLowerCase());
        if (idx !== -1) found.push({ i, idx, name: d.name });
      });

      // Sort by position in line
      found.sort((a,b) => a.idx-b.idx);

      // Create links between consecutive device pairs in same line
      for (let k=0; k<found.length-1; k++) {
        const a = found[k], b = found[k+1];
        if (a.i === b.i) continue;

        // Extract interface names from the segment around the devices
        const seg = line.substring(Math.max(0, a.idx-5), b.idx + b.name.length + 25);
        const ifaceRe = /\b([EGFe](?:thernet|igabit|ast)?|E|Gi?|Fa?|Po)\d+\/\d+(?:\/\d+)?/gi;
        const ifaces = [];
        let fm;
        while ((fm = ifaceRe.exec(seg)) !== null) ifaces.push(fm[0]);

        addLink(a.i, b.i,
          ifaces[0] || "E0/0",
          ifaces[1] || ifaces[0] || "E0/0",
          "", "",
          isTrunk
        );
      }
    });
  }

  // ── 3. Heuristic: if still no links, connect sequentially ────────────────
  if (links.length === 0 && devices.length >= 2) {
    for (let i=0; i<devices.length-1; i++) {
      const getFirstNonLoop = (d) =>
        Object.keys(d.interfaces||{}).find(n => !/loopback/i.test(n)) || "E0/0";
      addLink(i, i+1,
        getFirstNonLoop(devices[i]),
        getFirstNonLoop(devices[i+1]),
        "", "", false);
    }
  }

  return links;
}

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
function layout(n) {
  const cx = W/2, cy = (H-55)/2 + 12; // shift up a bit for VLAN table at bottom
  const pos = [];
  const MARGIN = 50;
  const maxX = W - MARGIN - BOX_W/2;
  const maxY = H - 80 - BOX_H/2;
  const minX = MARGIN + BOX_W/2;
  const minY = MARGIN + BOX_H/2;

  if (n===1) {
    pos.push({x:cx, y:cy});
  } else if (n===2) {
    pos.push({x:cx-155, y:cy}, {x:cx+155, y:cy});
  } else if (n===3) {
    pos.push({x:cx, y:minY+10}, {x:cx-150, y:maxY-20}, {x:cx+150, y:maxY-20});
  } else if (n===4) {
    pos.push(
      {x:cx-150, y:minY+10}, {x:cx+150, y:minY+10},
      {x:cx-150, y:maxY-20}, {x:cx+150, y:maxY-20}
    );
  } else {
    const r = Math.min(W,H-80)*0.34;
    for (let i=0;i<n;i++) {
      const a = (i*2*Math.PI/n)-Math.PI/2;
      pos.push({x:cx+r*Math.cos(a), y:cy+r*Math.sin(a)});
    }
  }
  return pos.map(p=>({
    x: clamp(p.x, minX, maxX),
    y: clamp(p.y, minY, maxY)
  }));
}

// ─── VLAN EXTRACTION ──────────────────────────────────────────────────────────
function extractVlans(devices) {
  const map = {};
  devices.forEach(dev => {
    const src = dev.vlans || dev.vlanCfg || {};
    Object.entries(src).forEach(([id, name]) => {
      if (id==="1") return;
      if (!map[id]) map[id] = { id, name: typeof name==="string" ? name : "" };
    });
  });
  return Object.values(map).sort((a,b)=>parseInt(a.id)-parseInt(b.id)).slice(0,8);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function renderTopologySVG(lab, theme="dark") {
  const devices = lab.devices||[];
  if (!devices.length) return null;

  const isDark = theme==="dark";
  const C = {
    bg:           isDark?"#0c1118":"#f8fafc",
    routerFill:   isDark?"#0d2240":"#dbeafe",
    routerBorder: isDark?"#38bdf8":"#2563eb",
    routerText:   isDark?"#7dd3fc":"#1d4ed8",
    switchFill:   isDark?"#0b2614":"#dcfce7",
    switchBorder: isDark?"#4ade80":"#16a34a",
    switchText:   isDark?"#86efac":"#15803d",
    link:         isDark?"#3d5068":"#94a3b8",
    trunk:        isDark?"#f59e0b":"#d97706",
    ifLabel:      isDark?"#94a3b8":"#475569",
    subnetFill:   isDark?"#1a2535":"#e2e8f0",
    subnetText:   isDark?"#64748b":"#64748b",
    loFill:       isDark?"#1e1040":"#ede9fe",
    loBorder:     isDark?"#7c3aed":"#7c3aed",
    loText:       isDark?"#c4b5fd":"#6d28d9",
    vlanFill:     isDark?"#1a1506":"#fef9c3",
    vlanBorder:   isDark?"#ca8a04":"#ca8a04",
    vlanText:     isDark?"#fbbf24":"#92400e",
    pcFill:       isDark?"#1a1a1a":"#f1f5f9",
    pcBorder:     isDark?"#64748b":"#94a3b8",
    pcText:       isDark?"#94a3b8":"#475569",
    legendText:   isDark?"#4b5563":"#9ca3af",
    shadow:       "rgba(0,0,0,0.3)",
  };

  const topoText = lab.topology||"";
  const positions = layout(devices.length);
  const links = detectLinks(devices, topoText);
  const vlans = extractVlans(devices);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block" font-family="'JetBrains Mono',monospace">`;
  svg += `<rect width="${W}" height="${H}" fill="${C.bg}" rx="8"/>`;

  // ─── LINKS ──────────────────────────────────────────────────────────────────
  links.forEach(lk => {
    const p1=positions[lk.from], p2=positions[lk.to];
    if (!p1||!p2) return;

    const e1=boxEdge(p1.x,p1.y,p2.x,p2.y);
    const e2=boxEdge(p2.x,p2.y,p1.x,p1.y);
    const mx=(e1.x+e2.x)/2, my=(e1.y+e2.y)/2;
    const dx=e2.x-e1.x, dy=e2.y-e1.y;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const ux=dx/len, uy=dy/len;
    const px=-uy, py=ux; // perpendicular unit

    const sc = lk.isTrunk ? C.trunk : C.link;
    const sw = lk.isTrunk ? 2.5 : 1.5;

    if (lk.isTrunk) {
      const off=2.5;
      svg += `<line x1="${(e1.x+px*off).toFixed(1)}" y1="${(e1.y+py*off).toFixed(1)}" x2="${(e2.x+px*off).toFixed(1)}" y2="${(e2.y+py*off).toFixed(1)}" stroke="${sc}" stroke-width="1.2" opacity="0.6"/>`;
      svg += `<line x1="${(e1.x-px*off).toFixed(1)}" y1="${(e1.y-py*off).toFixed(1)}" x2="${(e2.x-px*off).toFixed(1)}" y2="${(e2.y-py*off).toFixed(1)}" stroke="${sc}" stroke-width="1.2" opacity="0.6"/>`;
    }
    svg += `<line x1="${e1.x.toFixed(1)}" y1="${e1.y.toFixed(1)}" x2="${e2.x.toFixed(1)}" y2="${e2.y.toFixed(1)}" stroke="${sc}" stroke-width="${sw}"/>`;

    // Interface labels — placed 1/4 and 3/4 along the link, small perpendicular offset
    // This keeps them close to their respective box without drifting to wrong areas
    if (len > 55) {
      const PERP = 8; // perpendicular offset (pixels)
      // From-side: 1/4 of the way from e1 to e2
      const f1x = e1.x + ux*(len*0.22) + px*PERP;
      const f1y = e1.y + uy*(len*0.22) + py*PERP;
      // To-side: 3/4 of the way (1/4 from e2)
      const f2x = e2.x - ux*(len*0.22) + px*PERP;
      const f2y = e2.y - uy*(len*0.22) + py*PERP;

      // Background pill for readability
      const lbw=28, lbh=12;
      svg += `<rect x="${(f1x-lbw/2).toFixed(1)}" y="${(f1y-lbh/2).toFixed(1)}" width="${lbw}" height="${lbh}" fill="${C.bg}" rx="2" opacity="0.75"/>`;
      svg += `<text x="${f1x.toFixed(1)}" y="${f1y.toFixed(1)}" fill="${C.ifLabel}" font-size="7.5" text-anchor="middle" dominant-baseline="middle">${esc(shortIf(lk.fromIf))}</text>`;

      svg += `<rect x="${(f2x-lbw/2).toFixed(1)}" y="${(f2y-lbh/2).toFixed(1)}" width="${lbw}" height="${lbh}" fill="${C.bg}" rx="2" opacity="0.75"/>`;
      svg += `<text x="${f2x.toFixed(1)}" y="${f2y.toFixed(1)}" fill="${C.ifLabel}" font-size="7.5" text-anchor="middle" dominant-baseline="middle">${esc(shortIf(lk.toIf))}</text>`;
    }

    // Midpoint label: subnet (L3) or Trunk/Link (L2)
    const bw=58, bh=13;
    svg += `<rect x="${(mx-bw/2).toFixed(1)}" y="${(my-bh/2).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.subnetFill}" rx="3" opacity="0.92"/>`;
    if (lk.fromIp) {
      const n=getNet(lk.fromIp);
      const octs=lk.fromIp.split("/")[0].split(".");
      const label=`${octs[0]}.${octs[1]}.${octs[2]}.0/${n?n.bits:"?"}`;
      svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${C.subnetText}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`;
    } else {
      const label = lk.isTrunk ? "Trunk" : "Link";
      svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${lk.isTrunk?C.trunk:C.subnetText}" font-size="7.5" font-weight="${lk.isTrunk?'bold':'normal'}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    }
  });

  // ─── DEVICES ────────────────────────────────────────────────────────────────
  devices.forEach((dev,i) => {
    const p=positions[i];
    if (!p) return;
    const isR  = dev.type==="router";
    const isPC = dev.type==="pc" || dev.name.toUpperCase().startsWith("PC");
    const fill   = isPC?C.pcFill   : isR?C.routerFill  :C.switchFill;
    const border = isPC?C.pcBorder : isR?C.routerBorder:C.switchBorder;
    const tclr   = isPC?C.pcText   : isR?C.routerText  :C.switchText;
    const bx=(p.x-BOX_W/2).toFixed(1), by=(p.y-BOX_H/2).toFixed(1);

    if (isPC) {
      // PC: simple rounded box with monitor icon
      svg += `<rect x="${(p.x-BOX_W/2+2).toFixed(1)}" y="${(p.y-BOX_H/2+3).toFixed(1)}" width="${BOX_W}" height="${BOX_H}" fill="${C.shadow}" rx="5"/>`;
      svg += `<rect x="${bx}" y="${by}" width="${BOX_W}" height="${BOX_H}" fill="${fill}" stroke="${border}" stroke-width="1" rx="5" stroke-dasharray="3,2"/>`;
      svg += `<text x="${(p.x-BOX_W/2+8).toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${border}" font-size="9">💻</text>`;
      svg += `<text x="${(p.x+8).toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${tclr}" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(dev.name)}</text>`;
      // Show VLAN if available
      const vlanInfo = dev.vlan || dev.vlans;
      if (vlanInfo) {
        const vlanStr = typeof vlanInfo === "object" ? Object.keys(vlanInfo)[0] : String(vlanInfo);
        svg += `<text x="${p.x.toFixed(1)}" y="${(p.y+14).toFixed(1)}" fill="${tclr}" font-size="6.5" text-anchor="middle" opacity="0.7">VLAN ${vlanStr}</text>`;
      }
      return;
    }

    // Drop shadow
    svg += `<rect x="${(p.x-BOX_W/2+2).toFixed(1)}" y="${(p.y-BOX_H/2+3).toFixed(1)}" width="${BOX_W}" height="${BOX_H}" fill="${C.shadow}" rx="7"/>`;
    // Box
    svg += `<rect x="${bx}" y="${by}" width="${BOX_W}" height="${BOX_H}" fill="${fill}" stroke="${border}" stroke-width="1.5" rx="7"/>`;
    // Accent top strip
    svg += `<rect x="${bx}" y="${by}" width="${BOX_W}" height="6" fill="${border}" rx="7"/>`;
    svg += `<rect x="${bx}" y="${(p.y-BOX_H/2+4).toFixed(1)}" width="${BOX_W}" height="2" fill="${fill}"/>`;

    // Type indicator (small, top-left inside box)
    svg += `<text x="${(p.x-BOX_W/2+7).toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${border}" font-size="7.5" font-weight="bold" opacity="0.55">${isR?"R":"SW"}</text>`;

    // Device name — centred
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${tclr}" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(dev.name)}</text>`;

    // Sub-label (router/switch)
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y+14).toFixed(1)}" fill="${tclr}" font-size="6.5" text-anchor="middle" opacity="0.6">${isR?"router":"switch"}</text>`;

    // ── Loopbacks: ONLY on routers, shown BELOW the box (not right, avoids link overlap) ─
    if (isR) {
      const loopbacks = Object.entries(dev.interfaces||{})
        .filter(([n,info]) => /loopback/i.test(n) && info.ip)
        .map(([n,info]) => `${shortIf(n)}: ${info.ip}`);

      if (loopbacks.length > 0) {
        // Place below the box so it doesn't interfere with interface labels on links
        const pilW = Math.max(...loopbacks.map(l=>l.length)) * 5.2 + 12;
        const pilH = loopbacks.length * 12 + 6;
        const pilX = p.x - pilW/2;
        const pilY = p.y + BOX_H/2 + 5;

        svg += `<rect x="${pilX.toFixed(1)}" y="${pilY.toFixed(1)}" width="${pilW.toFixed(1)}" height="${pilH.toFixed(1)}" fill="${C.loFill}" stroke="${C.loBorder}" stroke-width="0.7" rx="3"/>`;
        loopbacks.forEach((label,li) => {
          const ty = pilY + 9 + li*12;
          svg += `<text x="${(pilX+pilW/2).toFixed(1)}" y="${ty.toFixed(1)}" fill="${C.loText}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`;
        });
      }
    }
  });

  // ─── VLAN TABLE ─────────────────────────────────────────────────────────────
  if (vlans.length > 0) {
    const tableY = H - 38;
    const maxCells = Math.min(vlans.length, 8);
    const cellW = Math.min(72, (W-20)/maxCells);
    const startX = (W - cellW*maxCells) / 2;

    svg += `<text x="${W/2}" y="${tableY-6}" fill="${C.vlanText}" font-size="7" text-anchor="middle" opacity="0.7" font-weight="bold">VLANs</text>`;

    vlans.slice(0,maxCells).forEach((vl,vi) => {
      const vx = startX + vi*cellW + 1;
      const vw = cellW - 2;
      svg += `<rect x="${vx.toFixed(1)}" y="${tableY.toFixed(1)}" width="${vw.toFixed(1)}" height="26" fill="${C.vlanFill}" stroke="${C.vlanBorder}" stroke-width="0.8" rx="3"/>`;
      // VLAN ID
      svg += `<text x="${(vx+vw/2).toFixed(1)}" y="${(tableY+9).toFixed(1)}" fill="${C.vlanText}" font-size="8" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(vl.id)}</text>`;
      // VLAN name (truncated)
      if (vl.name) {
        const nameShort = vl.name.length>8 ? vl.name.slice(0,7)+"…" : vl.name;
        svg += `<text x="${(vx+vw/2).toFixed(1)}" y="${(tableY+20).toFixed(1)}" fill="${C.vlanText}" font-size="6" text-anchor="middle" dominant-baseline="middle" opacity="0.85">${esc(nameShort)}</text>`;
      }
    });
  }

  // ─── LEGEND ─────────────────────────────────────────────────────────────────
  const ly = vlans.length>0 ? H-50 : H-14;
  svg += `<line x1="8" y1="${ly}" x2="22" y2="${ly}" stroke="${C.link}" stroke-width="1.5"/>`;
  svg += `<text x="26" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Link</text>`;
  svg += `<line x1="54" y1="${ly}" x2="68" y2="${ly}" stroke="${C.trunk}" stroke-width="2.5"/>`;
  svg += `<text x="72" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Trunk</text>`;
  svg += `<rect x="106" y="${(ly-4).toFixed(1)}" width="8" height="8" fill="${C.loFill}" stroke="${C.loBorder}" stroke-width="0.7" rx="1"/>`;
  svg += `<text x="118" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Loopback</text>`;
  if (vlans.length>0) {
    svg += `<rect x="170" y="${(ly-4).toFixed(1)}" width="8" height="8" fill="${C.vlanFill}" stroke="${C.vlanBorder}" stroke-width="0.7" rx="1"/>`;
    svg += `<text x="182" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">VLAN</text>`;
  }

  svg += `</svg>`;
  return svg;
}
