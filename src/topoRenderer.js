// topoRenderer.js — SVG network topology renderer v4
// Hierarchical layout: routers top, switches middle, PCs bottom
// Smart loopback placement, improved trunk detection

const W = 560;
const H = 400;
const BOX_W = 88;
const BOX_H = 42;
const PC_W  = 80;
const PC_H  = 36;

// ─── UTILS ───────────────────────────────────────────────────────────────────
function ipToNum(ip) {
  const p = ip.split(".");
  return ((+p[0]<<24)|(+p[1]<<16)|(+p[2]<<8)|+p[3])>>>0;
}
function getNet(cidr) {
  if (!cidr||!cidr.includes("/")) return null;
  const [ip,pfx] = cidr.split("/");
  const b = parseInt(pfx,10);
  if (isNaN(b)||b<0||b>32) return null;
  const mask = b===0?0:(0xFFFFFFFF<<(32-b))>>>0;
  return { net:(ipToNum(ip)&mask)>>>0, bits:b };
}
function sameSubnet(a,b){
  const n1=getNet(a),n2=getNet(b);
  return n1&&n2&&n1.bits===n2.bits&&n1.net===n2.net;
}
function shortIf(n){
  return n.replace(/GigabitEthernet/i,"Gi").replace(/FastEthernet/i,"Fa")
          .replace(/Ethernet/i,"E").replace(/Loopback/i,"Lo")
          .replace(/Port-channel/i,"Po").replace(/Serial/i,"Se").replace(/Vlan/i,"Vl");
}
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }

// ─── DEVICE TIERS ────────────────────────────────────────────────────────────
// Classify devices into layers: router=0, switch=1, pc=2
function getTier(dev) {
  if (dev.type==="router") return 0;
  if (dev.type==="pc" || /^pc/i.test(dev.name)) return 2;
  return 1;
}

// ─── HIERARCHICAL LAYOUT ─────────────────────────────────────────────────────
function layout(devices) {
  const tiers = [[], [], []]; // routers, switches, PCs
  devices.forEach((d,i) => tiers[getTier(d)].push(i));

  const VTOP    = 55;
  const VMID    = H/2 - 10;
  const VBOT    = H - 85;
  const MARGIN  = 55;

  // Y positions per tier
  const tierY = [VTOP, VMID, VBOT];

  // If only 2 tiers used, spread them more
  const usedTiers = tiers.filter(t=>t.length>0);
  if (usedTiers.length === 2) {
    tierY[0] = 70; tierY[1] = H/2; tierY[2] = H-80;
  }

  const pos = new Array(devices.length);

  tiers.forEach((group, tier) => {
    if (group.length === 0) return;
    const y = tierY[tier];
    const usableW = W - MARGIN*2;
    const step = group.length > 1 ? usableW / (group.length-1) : 0;
    const startX = group.length > 1 ? MARGIN : W/2;
    group.forEach((devIdx, k) => {
      pos[devIdx] = {
        x: clamp(startX + k*step, MARGIN+PC_W/2, W-MARGIN-PC_W/2),
        y
      };
    });
  });

  // Fallback: any unplaced devices
  devices.forEach((_,i) => {
    if (!pos[i]) pos[i] = { x: W/2, y: H/2 };
  });

  return pos;
}

// ─── BOX EDGE INTERSECTION ───────────────────────────────────────────────────
function boxEdge(px, py, tx, ty, isPC) {
  const hw = (isPC?PC_W:BOX_W)/2 + 1;
  const hh = (isPC?PC_H:BOX_H)/2 + 1;
  const dx=tx-px, dy=ty-py;
  if (Math.abs(dx)<0.001&&Math.abs(dy)<0.001) return {x:px,y:py};
  const sx = Math.abs(dx)>0 ? hw/Math.abs(dx) : 1e9;
  const sy = Math.abs(dy)>0 ? hh/Math.abs(dy) : 1e9;
  const s  = Math.min(sx,sy);
  return { x:px+dx*s, y:py+dy*s };
}

// ─── LINK DETECTION ──────────────────────────────────────────────────────────
function detectLinks(devices, topoText) {
  const links = [];
  const seen  = new Set();

  const addLink = (from, to, fromIf, toIf, fromIp, toIp, isTrunk) => {
    const key = [Math.min(from,to), Math.max(from,to)].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ from, to, fromIf, toIf, fromIp:fromIp||"", toIp:toIp||"", isTrunk:!!isTrunk });
  };

  // ── 1. IP subnet matching ─────────────────────────────────────────────────
  for (let i=0;i<devices.length;i++) {
    for (let j=i+1;j<devices.length;j++) {
      const ifA=Object.entries(devices[i].interfaces||{});
      const ifB=Object.entries(devices[j].interfaces||{});
      for (const [nA,iA] of ifA) {
        if (!iA.ip||/loopback/i.test(nA)) continue;
        for (const [nB,iB] of ifB) {
          if (!iB.ip||/loopback/i.test(nB)) continue;
          if (sameSubnet(iA.ip,iB.ip)) {
            addLink(i,j,nA,nB,iA.ip,iB.ip,false);
          }
        }
      }
    }
  }

  // ── 2. Topology text — line-by-line device-pair detection ─────────────────
  if (topoText) {
    const nameMap = {};
    devices.forEach((d,i) => { nameMap[d.name.toLowerCase()] = i; });

    topoText.split(/\n/).forEach(line => {
      if (!line.trim()) return;
      const lower = line.toLowerCase();
      // Trunk if line contains trunk keyword or double-line symbols
      const isTrunk = /\btrunk\b|══|===|==|port.channel|\bpo\d/i.test(line);

      // Find device name positions in this line
      const found = [];
      devices.forEach((d,i) => {
        let searchFrom = 0;
        const name = d.name.toLowerCase();
        let idx = lower.indexOf(name, searchFrom);
        if (idx !== -1) found.push({ i, idx, name: d.name });
      });
      found.sort((a,b) => a.idx-b.idx);

      for (let k=0; k<found.length-1; k++) {
        const a=found[k], b=found[k+1];
        if (a.i===b.i) continue;
        // Extract interface names from segment between devices
        const seg = line.substring(a.idx, b.idx+b.name.length+30);
        const ifRe = /\b([EGFe](?:thernet|igabit|ast)?|Gi?|Fa?|Po|E)(\d+\/\d+(?:\/\d+)?)/gi;
        const ifaces = [];
        let fm;
        while ((fm=ifRe.exec(seg))!==null) ifaces.push(fm[0]);
        addLink(a.i,b.i,
          ifaces[0]||"E0/0",
          ifaces[1]||ifaces[0]||"E0/0",
          "","",isTrunk);
      }
    });
  }

  // ── 3. Smart structural inference ────────────────────────────────────────
  // Runs always — fills in missing links based on device roles
  const routers  = devices.map((d,i)=>({d,i})).filter(x=>getTier(x.d)===0);
  const switches = devices.map((d,i)=>({d,i})).filter(x=>getTier(x.d)===1);
  const pcs      = devices.map((d,i)=>({d,i})).filter(x=>getTier(x.d)===2);

  // a) Router → first switch (trunk) if not already linked
  routers.forEach(r => {
    const alreadyLinked = links.some(lk=>lk.from===r.i||lk.to===r.i);
    if (!alreadyLinked && switches.length>0) {
      const sw = switches[0];
      const rIf = Object.keys(r.d.interfaces||{}).find(n=>!/loopback/i.test(n))||"E0/0";
      const sIf = Object.keys(sw.d.interfaces||{}).find(n=>!/loopback/i.test(n))||"E0/0";
      addLink(r.i, sw.i, rIf, sIf, "", "", true); // trunk
    }
  });

  // b) Switch ↔ switch (trunk) — connect sequentially if not linked
  for (let k=0; k<switches.length-1; k++) {
    const swA = switches[k], swB = switches[k+1];
    const linked = links.some(lk=>(lk.from===swA.i&&lk.to===swB.i)||(lk.from===swB.i&&lk.to===swA.i));
    if (!linked) {
      // Find free interfaces (not already used in a link)
      const usedA = new Set(links.filter(lk=>lk.from===swA.i||lk.to===swA.i).map(lk=>lk.from===swA.i?lk.fromIf:lk.toIf));
      const usedB = new Set(links.filter(lk=>lk.from===swB.i||lk.to===swB.i).map(lk=>lk.from===swB.i?lk.fromIf:lk.toIf));
      const freeA = Object.keys(swA.d.interfaces||{}).find(n=>!/loopback/i.test(n)&&!usedA.has(n))||"E0/1";
      const freeB = Object.keys(swB.d.interfaces||{}).find(n=>!/loopback/i.test(n)&&!usedB.has(n))||"E0/0";
      addLink(swA.i, swB.i, freeA, freeB, "", "", true); // trunk between switches
    }
  }

  // c) PCs → switches: PC1→SW1, PC2→SW2 etc. by index
  pcs.forEach((pc, k) => {
    const alreadyLinked = links.some(lk=>lk.from===pc.i||lk.to===pc.i);
    if (!alreadyLinked) {
      const sw = switches[Math.min(k, switches.length-1)];
      if (!sw) return;
      const pcIf = Object.keys(pc.d.interfaces||{})[0]||"E0/0";
      const usedSw = new Set(links.filter(lk=>lk.from===sw.i||lk.to===sw.i).map(lk=>lk.from===sw.i?lk.fromIf:lk.toIf));
      const swIf = Object.keys(sw.d.interfaces||{}).filter(n=>!/loopback/i.test(n)&&!usedSw.has(n))[0]||"E0/2";
      addLink(pc.i, sw.i, pcIf, swIf, "", "", false); // access link
    }
  });

  // ── 4. Auto-promote to Trunk ──────────────────────────────────────────────
  links.forEach(lk => {
    if (lk.isTrunk) return;
    const tA = getTier(devices[lk.from]);
    const tB = getTier(devices[lk.to]);
    if (!lk.fromIp && ((tA===0&&tB===1)||(tA===1&&tB===0))) lk.isTrunk = true;
    if (!lk.fromIp && tA===1&&tB===1) lk.isTrunk = true; // switch↔switch = trunk
  });

  return links;
}

// ─── VLAN EXTRACTION ─────────────────────────────────────────────────────────
function extractVlans(devices) {
  const map = {};
  devices.forEach(dev => {
    Object.entries(dev.vlans||dev.vlanCfg||{}).forEach(([id,name]) => {
      if (id==="1") return;
      if (!map[id]) map[id] = { id, name: typeof name==="string" ? name : "" };
    });
  });
  return Object.values(map).sort((a,b)=>parseInt(a.id)-parseInt(b.id)).slice(0,8);
}

// ─── SMART LOOPBACK POSITION ─────────────────────────────────────────────────
// Given a router's position and all its links, find the side with least traffic
function loopbackSide(routerPos, allLinks, positions) {
  // Score each side: penalise sides that links go towards
  let left=0, right=0, above=0, below=0;
  allLinks.forEach(lk => {
    const other = positions[lk];
    if (!other) return;
    const dx = other.x - routerPos.x;
    const dy = other.y - routerPos.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx>0) right++; else left++;
    } else {
      if (dy>0) below++; else above++;
    }
  });
  // Pick side with lowest score — prefer above or sides
  const scores = [{side:"right",s:right},{side:"left",s:left},{side:"above",s:above},{side:"below",s:below}];
  scores.sort((a,b)=>a.s-b.s);
  return scores[0].side;
}

// ─── MAIN SVG FUNCTION ───────────────────────────────────────────────────────
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
    pcFill:       isDark?"#1a1a2a":"#f1f5f9",
    pcBorder:     isDark?"#64748b":"#94a3b8",
    pcText:       isDark?"#94a3b8":"#475569",
    link:         isDark?"#3d5068":"#94a3b8",
    trunk:        isDark?"#f59e0b":"#d97706",
    ifLabel:      isDark?"#94a3b8":"#475569",
    ifBg:         isDark?"#0c1118":"#f8fafc",
    subnetFill:   isDark?"#1a2535":"#e2e8f0",
    subnetText:   isDark?"#64748b":"#64748b",
    loFill:       isDark?"#1e1040":"#ede9fe",
    loBorder:     isDark?"#7c3aed":"#7c3aed",
    loText:       isDark?"#c4b5fd":"#6d28d9",
    vlanFill:     isDark?"#1a1506":"#fef9c3",
    vlanBorder:   isDark?"#ca8a04":"#ca8a04",
    vlanText:     isDark?"#fbbf24":"#92400e",
    legendText:   isDark?"#4b5563":"#9ca3af",
    shadow:       "rgba(0,0,0,0.3)",
  };

  const topoText = lab.topology||"";
  const positions = layout(devices);
  const links = detectLinks(devices, topoText);
  const vlans = extractVlans(devices);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block" font-family="'JetBrains Mono',monospace">`;
  svg += `<rect width="${W}" height="${H}" fill="${C.bg}" rx="8"/>`;

  // ─── LINKS ─────────────────────────────────────────────────────────────────
  links.forEach(lk => {
    const p1=positions[lk.from], p2=positions[lk.to];
    if (!p1||!p2) return;
    const pc1 = getTier(devices[lk.from])===2;
    const pc2 = getTier(devices[lk.to])===2;
    const e1=boxEdge(p1.x,p1.y,p2.x,p2.y,pc1);
    const e2=boxEdge(p2.x,p2.y,p1.x,p1.y,pc2);
    const mx=(e1.x+e2.x)/2, my=(e1.y+e2.y)/2;
    const dx=e2.x-e1.x, dy=e2.y-e1.y;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const ux=dx/len, uy=dy/len;
    const px=-uy, py=ux; // perpendicular

    const sc=lk.isTrunk?C.trunk:C.link;
    const sw=lk.isTrunk?2.5:1.5;

    if (lk.isTrunk) {
      const off=2.5;
      svg+=`<line x1="${(e1.x+px*off).toFixed(1)}" y1="${(e1.y+py*off).toFixed(1)}" x2="${(e2.x+px*off).toFixed(1)}" y2="${(e2.y+py*off).toFixed(1)}" stroke="${sc}" stroke-width="1.2" opacity="0.55"/>`;
      svg+=`<line x1="${(e1.x-px*off).toFixed(1)}" y1="${(e1.y-py*off).toFixed(1)}" x2="${(e2.x-px*off).toFixed(1)}" y2="${(e2.y-py*off).toFixed(1)}" stroke="${sc}" stroke-width="1.2" opacity="0.55"/>`;
    }
    svg+=`<line x1="${e1.x.toFixed(1)}" y1="${e1.y.toFixed(1)}" x2="${e2.x.toFixed(1)}" y2="${e2.y.toFixed(1)}" stroke="${sc}" stroke-width="${sw}"/>`;

    // Interface labels at 20% and 80% along the link, offset perpendicular
    if (len > 60) {
      const PERP=9;
      const P1=0.2, P2=0.8; // positions along link
      const lx1=e1.x+ux*len*P1+px*PERP, ly1=e1.y+uy*len*P1+py*PERP;
      const lx2=e1.x+ux*len*P2+px*PERP, ly2=e1.y+uy*len*P2+py*PERP;
      const lbw=28, lbh=12;
      // Label 1
      svg+=`<rect x="${(lx1-lbw/2).toFixed(1)}" y="${(ly1-lbh/2).toFixed(1)}" width="${lbw}" height="${lbh}" fill="${C.ifBg}" rx="2" opacity="0.8"/>`;
      svg+=`<text x="${lx1.toFixed(1)}" y="${ly1.toFixed(1)}" fill="${C.ifLabel}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(shortIf(lk.fromIf))}</text>`;
      // Label 2
      svg+=`<rect x="${(lx2-lbw/2).toFixed(1)}" y="${(ly2-lbh/2).toFixed(1)}" width="${lbw}" height="${lbh}" fill="${C.ifBg}" rx="2" opacity="0.8"/>`;
      svg+=`<text x="${lx2.toFixed(1)}" y="${ly2.toFixed(1)}" fill="${C.ifLabel}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(shortIf(lk.toIf))}</text>`;
    }

    // Mid label: subnet or Trunk/Link
    const bw=lk.fromIp?60:46, bh=13;
    svg+=`<rect x="${(mx-bw/2).toFixed(1)}" y="${(my-bh/2).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.subnetFill}" rx="3" opacity="0.92"/>`;
    if (lk.fromIp) {
      const n=getNet(lk.fromIp);
      const octs=lk.fromIp.split("/")[0].split(".");
      const label=`${octs[0]}.${octs[1]}.${octs[2]}.0/${n?n.bits:"?"}`;
      svg+=`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${C.subnetText}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`;
    } else {
      const label=lk.isTrunk?"Trunk":"Link";
      svg+=`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${lk.isTrunk?C.trunk:C.subnetText}" font-size="7.5" font-weight="${lk.isTrunk?"bold":"normal"}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    }
  });

  // ─── DEVICES ───────────────────────────────────────────────────────────────
  devices.forEach((dev,i) => {
    const p=positions[i];
    if (!p) return;
    const tier = getTier(dev);
    const isR  = tier===0;
    const isPC = tier===2;
    const bw   = isPC?PC_W:BOX_W;
    const bh   = isPC?PC_H:BOX_H;
    const fill   = isPC?C.pcFill   : isR?C.routerFill  :C.switchFill;
    const border = isPC?C.pcBorder : isR?C.routerBorder:C.switchBorder;
    const tclr   = isPC?C.pcText   : isR?C.routerText  :C.switchText;
    const bx=(p.x-bw/2).toFixed(1), by=(p.y-bh/2).toFixed(1);

    if (isPC) {
      // PC: dashed border, monitor emoji, VLAN label
      svg+=`<rect x="${(p.x-bw/2+2).toFixed(1)}" y="${(p.y-bh/2+2).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.shadow}" rx="5"/>`;
      svg+=`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${fill}" stroke="${border}" stroke-width="1" rx="5" stroke-dasharray="4,2"/>`;
      svg+=`<text x="${(p.x-bw/2+7).toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${border}" font-size="10">💻</text>`;
      svg+=`<text x="${(p.x+8).toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${tclr}" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(dev.name)}</text>`;
      // VLAN info if available
      const vlanKeys = Object.keys(dev.vlans||{});
      if (vlanKeys.length>0) {
        svg+=`<text x="${p.x.toFixed(1)}" y="${(p.y+bh/2+10).toFixed(1)}" fill="${C.vlanText}" font-size="7" text-anchor="middle" opacity="0.85">VLAN ${vlanKeys[0]}</text>`;
      }
      return;
    }

    // Shadow + box
    svg+=`<rect x="${(p.x-bw/2+2).toFixed(1)}" y="${(p.y-bh/2+3).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.shadow}" rx="7"/>`;
    svg+=`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${fill}" stroke="${border}" stroke-width="1.5" rx="7"/>`;
    // Accent top strip
    svg+=`<rect x="${bx}" y="${by}" width="${bw}" height="6" fill="${border}" rx="7"/>`;
    svg+=`<rect x="${bx}" y="${(p.y-bh/2+4).toFixed(1)}" width="${bw}" height="2" fill="${fill}"/>`;
    // Type badge
    svg+=`<text x="${(p.x-bw/2+7).toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${border}" font-size="7.5" font-weight="bold" opacity="0.5">${isR?"R":"SW"}</text>`;
    // Name
    svg+=`<text x="${p.x.toFixed(1)}" y="${(p.y+1).toFixed(1)}" fill="${tclr}" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(dev.name)}</text>`;
    // Sub-type label
    svg+=`<text x="${p.x.toFixed(1)}" y="${(p.y+14).toFixed(1)}" fill="${tclr}" font-size="6.5" text-anchor="middle" opacity="0.6">${isR?"router":"switch"}</text>`;

    // ── Loopback: ONLY on routers, smart side placement ─────────────────────
    if (isR) {
      const loopbacks = Object.entries(dev.interfaces||{})
        .filter(([n,inf]) => /loopback/i.test(n) && inf.ip)
        .map(([n,inf]) => `${shortIf(n)}: ${inf.ip}`);

      if (loopbacks.length > 0) {
        // Find link targets from this router
        const linkedPositions = links
          .filter(lk => lk.from===i || lk.to===i)
          .map(lk => lk.from===i ? lk.to : lk.from);

        const side = loopbackSide(p, linkedPositions, positions);
        const pilW = Math.max(...loopbacks.map(l=>l.length))*5.3+12;
        const pilH = loopbacks.length*12+6;

        let pilX, pilY;
        if (side==="right")       { pilX=p.x+bw/2+5;    pilY=p.y-pilH/2; }
        else if (side==="left")   { pilX=p.x-bw/2-pilW-5; pilY=p.y-pilH/2; }
        else if (side==="above")  { pilX=p.x-pilW/2;    pilY=p.y-bh/2-pilH-5; }
        else /* below */          { pilX=p.x-pilW/2;    pilY=p.y+bh/2+5; }

        // Clamp pill to canvas
        pilX=clamp(pilX,4,W-pilW-4);
        pilY=clamp(pilY,4,H-pilH-4);

        svg+=`<rect x="${pilX.toFixed(1)}" y="${pilY.toFixed(1)}" width="${pilW.toFixed(1)}" height="${pilH.toFixed(1)}" fill="${C.loFill}" stroke="${C.loBorder}" stroke-width="0.8" rx="3"/>`;
        loopbacks.forEach((label,li) => {
          const ty=pilY+9+li*12;
          svg+=`<text x="${(pilX+pilW/2).toFixed(1)}" y="${ty.toFixed(1)}" fill="${C.loText}" font-size="7" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`;
        });
      }
    }
  });

  // ─── VLAN TABLE ────────────────────────────────────────────────────────────
  if (vlans.length > 0) {
    const tableY = H-38;
    const maxCells = Math.min(vlans.length,8);
    const cellW = Math.min(74,(W-20)/maxCells);
    const startX = (W-cellW*maxCells)/2;
    svg+=`<text x="${W/2}" y="${tableY-6}" fill="${C.vlanText}" font-size="7" text-anchor="middle" font-weight="bold" opacity="0.75">VLANs</text>`;
    vlans.slice(0,maxCells).forEach((vl,vi) => {
      const vx=startX+vi*cellW+1, vw=cellW-2;
      svg+=`<rect x="${vx.toFixed(1)}" y="${tableY}" width="${vw.toFixed(1)}" height="26" fill="${C.vlanFill}" stroke="${C.vlanBorder}" stroke-width="0.8" rx="3"/>`;
      svg+=`<text x="${(vx+vw/2).toFixed(1)}" y="${tableY+9}" fill="${C.vlanText}" font-size="8" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(vl.id)}</text>`;
      if (vl.name) {
        const ns=vl.name.length>8?vl.name.slice(0,7)+"…":vl.name;
        svg+=`<text x="${(vx+vw/2).toFixed(1)}" y="${tableY+20}" fill="${C.vlanText}" font-size="6" text-anchor="middle" dominant-baseline="middle" opacity="0.85">${esc(ns)}</text>`;
      }
    });
  }

  // ─── LEGEND ────────────────────────────────────────────────────────────────
  const ly = vlans.length>0 ? H-50 : H-14;
  svg+=`<line x1="8" y1="${ly}" x2="22" y2="${ly}" stroke="${C.link}" stroke-width="1.5"/>`;
  svg+=`<text x="26" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Link</text>`;
  svg+=`<line x1="52" y1="${ly}" x2="66" y2="${ly}" stroke="${C.trunk}" stroke-width="2.5"/>`;
  svg+=`<text x="70" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Trunk</text>`;
  svg+=`<rect x="104" y="${ly-4}" width="8" height="8" fill="${C.loFill}" stroke="${C.loBorder}" stroke-width="0.8" rx="1"/>`;
  svg+=`<text x="116" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">Loopback</text>`;
  if (vlans.length>0){
    svg+=`<rect x="168" y="${ly-4}" width="8" height="8" fill="${C.vlanFill}" stroke="${C.vlanBorder}" stroke-width="0.8" rx="1"/>`;
    svg+=`<text x="180" y="${ly}" fill="${C.legendText}" font-size="7" dominant-baseline="middle">VLAN</text>`;
  }

  svg+=`</svg>`;
  return svg;
}
