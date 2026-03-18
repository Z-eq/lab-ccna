// topoRenderer.js v5 — Cisco-style SVG symbols, structural layout

const W = 580;
const H = 420;
const SYM_W = 52; // symbol width
const SYM_H = 52; // symbol height
const HIT_R = 26; // hit radius for edge calculation

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
          .replace(/Port-channel/i,"Po").replace(/Serial/i,"Se");
}
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }

function getTier(dev) {
  if (dev.type==="router") return 0;
  if (dev.type==="pc" || /^pc/i.test(dev.name)) return 2;
  return 1;
}

// ─── CIRCLE EDGE (for router) ─────────────────────────────────────────────────
function circleEdge(px, py, tx, ty) {
  const dx=tx-px, dy=ty-py;
  const d=Math.sqrt(dx*dx+dy*dy)||1;
  return { x:px+dx/d*HIT_R, y:py+dy/d*HIT_R };
}

// ─── RECT EDGE (for switch/pc) ────────────────────────────────────────────────
function rectEdge(px, py, tx, ty, hw, hh) {
  const dx=tx-px, dy=ty-py;
  if (Math.abs(dx)<0.001&&Math.abs(dy)<0.001) return {x:px,y:py};
  const sx=Math.abs(dx)>0?hw/Math.abs(dx):1e9;
  const sy=Math.abs(dy)>0?hh/Math.abs(dy):1e9;
  const s=Math.min(sx,sy);
  return { x:px+dx*s, y:py+dy*s };
}

function getEdge(dev, px, py, tx, ty) {
  if (dev.type==="router") return circleEdge(px,py,tx,ty);
  if (dev.type==="pc"||/^pc/i.test(dev.name)) return rectEdge(px,py,tx,ty,22,18);
  return rectEdge(px,py,tx,ty,26,20);
}

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
function layout(devices) {
  const tiers = [[],[],[]];
  devices.forEach((d,i)=>tiers[getTier(d)].push(i));
  const MARGIN = 60;
  const tierY = [70, H/2-10, H-80];
  const pos = new Array(devices.length);
  tiers.forEach((group,tier)=>{
    if (!group.length) return;
    const y = tierY[tier];
    const usableW = W - MARGIN*2;
    const step = group.length>1 ? usableW/(group.length-1) : 0;
    const startX = group.length>1 ? MARGIN : W/2;
    group.forEach((idx,k)=>{
      pos[idx]={ x:clamp(startX+k*step, MARGIN, W-MARGIN), y };
    });
  });
  devices.forEach((_,i)=>{ if(!pos[i]) pos[i]={x:W/2,y:H/2}; });
  return pos;
}

// ─── LINK DETECTION ──────────────────────────────────────────────────────────
function detectLinks(devices, topoText) {
  const links=[], seen=new Set();
  const addLink=(from,to,fromIf,toIf,fromIp,toIp,isTrunk)=>{
    const key=[Math.min(from,to),Math.max(from,to)].join("|");
    if(seen.has(key)) return;
    seen.add(key);
    links.push({from,to,fromIf,toIf,fromIp:fromIp||"",toIp:toIp||"",isTrunk:!!isTrunk});
  };

  // 1. IP subnet
  for(let i=0;i<devices.length;i++){
    for(let j=i+1;j<devices.length;j++){
      const ifA=Object.entries(devices[i].interfaces||{});
      const ifB=Object.entries(devices[j].interfaces||{});
      for(const [nA,iA] of ifA){
        if(!iA.ip||/loopback/i.test(nA)) continue;
        for(const [nB,iB] of ifB){
          if(!iB.ip||/loopback/i.test(nB)) continue;
          if(sameSubnet(iA.ip,iB.ip)) addLink(i,j,nA,nB,iA.ip,iB.ip,false);
        }
      }
    }
  }

  // 2. Topology text
  if(topoText){
    const nameMap={};
    devices.forEach((d,i)=>{ nameMap[d.name.toLowerCase()]=i; });
    topoText.split(/\n/).forEach(line=>{
      if(!line.trim()) return;
      const lower=line.toLowerCase();
      const isTrunk=/\btrunk\b|══|===|==|port.channel|\bpo\d/i.test(line);
      const found=[];
      devices.forEach((d,i)=>{
        const idx=lower.indexOf(d.name.toLowerCase());
        if(idx!==-1) found.push({i,idx,name:d.name});
      });
      found.sort((a,b)=>a.idx-b.idx);
      for(let k=0;k<found.length-1;k++){
        const a=found[k],b=found[k+1];
        if(a.i===b.i) continue;
        // Never link PC to PC, or PC to router
        const tA=getTier(devices[a.i]), tB=getTier(devices[b.i]);
        if(tA===2 && tB===2) continue; // PC-PC
        if(tA===2 && tB===0) continue; // PC-router
        if(tA===0 && tB===2) continue; // router-PC
        const seg=line.substring(Math.max(0,a.idx-5),b.idx+b.name.length+25);
        const ifRe=/\b([EGFe](?:thernet|igabit|ast)?|Gi?|Fa?|Po|E)(\d+\/\d+(?:\/\d+)?)/gi;
        const ifaces=[]; let fm;
        while((fm=ifRe.exec(seg))!==null) ifaces.push(fm[0]);
        addLink(a.i,b.i,ifaces[0]||"E0/0",ifaces[1]||ifaces[0]||"E0/0","","",isTrunk);
      }
    });
  }

  // 3. Structural inference — fills missing connections
  const routers=devices.map((d,i)=>({d,i})).filter(x=>getTier(x.d)===0);
  const switches=devices.map((d,i)=>({d,i})).filter(x=>getTier(x.d)===1);
  const pcs=devices.map((d,i)=>({d,i})).filter(x=>getTier(x.d)===2);
  const isLinked=idx=>links.some(lk=>lk.from===idx||lk.to===idx);
  const usedIfs=idx=>new Set(links.filter(lk=>lk.from===idx||lk.to===idx).map(lk=>lk.from===idx?lk.fromIf:lk.toIf));
  const freeIf=(dev,used)=>Object.keys(dev.interfaces||{}).find(n=>!/loopback/i.test(n)&&!used.has(n))||"E0/0";

  routers.forEach(r=>{
    if(isLinked(r.i)||!switches.length) return;
    const sw=switches[0];
    addLink(r.i,sw.i,freeIf(r.d,usedIfs(r.i)),freeIf(sw.d,usedIfs(sw.i)),"","",true);
  });
  for(let k=0;k<switches.length-1;k++){
    const a=switches[k],b=switches[k+1];
    if(links.some(lk=>(lk.from===a.i&&lk.to===b.i)||(lk.from===b.i&&lk.to===a.i))) continue;
    addLink(a.i,b.i,freeIf(a.d,usedIfs(a.i)),freeIf(b.d,usedIfs(b.i)),"","",true);
  }
  pcs.forEach((pc,k)=>{
    if(isLinked(pc.i)) return;
    // Assign to switch by index, cycling: PC0→SW0, PC1→SW1, PC2→SW0, PC3→SW1...
    const sw=switches[k % switches.length];
    if(!sw) return;
    // Only connect PC to switch, never PC to PC
    if(getTier(devices[sw.i])!==1) return;
    addLink(pc.i,sw.i,freeIf(pc.d,usedIfs(pc.i)),freeIf(sw.d,usedIfs(sw.i)),"","",false);
  });

  // 4. Auto-promote to trunk
  links.forEach(lk=>{
    if(lk.isTrunk) return;
    const tA=getTier(devices[lk.from]),tB=getTier(devices[lk.to]);
    if(!lk.fromIp&&((tA===0&&tB===1)||(tA===1&&tB===0))) lk.isTrunk=true;
    if(!lk.fromIp&&tA===1&&tB===1) lk.isTrunk=true;
  });

  return links;
}

// ─── VLAN EXTRACTION ─────────────────────────────────────────────────────────
function extractVlans(devices){
  const map={};
  devices.forEach(dev=>{
    Object.entries(dev.vlans||dev.vlanCfg||{}).forEach(([id,name])=>{
      if(id==="1") return;
      if(!map[id]) map[id]={id,name:typeof name==="string"?name:""};
    });
  });
  return Object.values(map).sort((a,b)=>parseInt(a.id)-parseInt(b.id)).slice(0,8);
}

// ─── SVG SYMBOL DEFINITIONS ──────────────────────────────────────────────────
function buildDefs(isDark) {
  const c = isDark;
  // Colors
  const rFill   = c ? "#0d2240" : "#dbeafe";
  const rStroke = c ? "#38bdf8" : "#2563eb";
  const swFill  = c ? "#0b2614" : "#dcfce7";
  const swStroke= c ? "#4ade80" : "#16a34a";
  const pcFill  = c ? "#1a1a2a" : "#f1f5f9";
  const pcStroke= c ? "#64748b" : "#94a3b8";

  return `
  <!-- Router: Cisco-style circle with 4 directional arrows -->
  <symbol id="sym-router" viewBox="0 0 52 52">
    <circle cx="26" cy="26" r="24" fill="${rFill}" stroke="${rStroke}" stroke-width="1.5"/>
    <!-- Cross lines -->
    <line x1="26" y1="6"  x2="26" y2="46" stroke="${rStroke}" stroke-width="1" opacity="0.4"/>
    <line x1="6"  y1="26" x2="46" y2="26" stroke="${rStroke}" stroke-width="1" opacity="0.4"/>
    <!-- 4 arrows pointing outward from center -->
    <polygon points="26,7  22,15 26,12 30,15" fill="${rStroke}"/>
    <polygon points="26,45 22,37 26,40 30,37" fill="${rStroke}"/>
    <polygon points="7,26  15,22 12,26 15,30" fill="${rStroke}"/>
    <polygon points="45,26 37,22 40,26 37,30" fill="${rStroke}"/>
  </symbol>

  <!-- Switch: Cisco-style box with bidirectional port arrows -->
  <symbol id="sym-switch" viewBox="0 0 56 40">
    <rect x="1" y="1" width="54" height="38" rx="5" fill="${swFill}" stroke="${swStroke}" stroke-width="1.5"/>
    <!-- Port arrows: alternating up/down -->
    <line x1="12" y1="28" x2="12" y2="12" stroke="${swStroke}" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="12,10 9,15 15,15" fill="${swStroke}"/>
    <line x1="22" y1="12" x2="22" y2="28" stroke="${swStroke}" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="22,30 19,25 25,25" fill="${swStroke}"/>
    <line x1="34" y1="28" x2="34" y2="12" stroke="${swStroke}" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="34,10 31,15 37,15" fill="${swStroke}"/>
    <line x1="44" y1="12" x2="44" y2="28" stroke="${swStroke}" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="44,30 41,25 47,25" fill="${swStroke}"/>
  </symbol>

  <!-- PC: Monitor + keyboard base -->
  <symbol id="sym-pc" viewBox="0 0 48 42">
    <!-- Monitor screen -->
    <rect x="3" y="2"  width="42" height="28" rx="3" fill="${pcFill}" stroke="${pcStroke}" stroke-width="1.2"/>
    <rect x="7" y="6"  width="34" height="20" rx="1" fill="${pcFill}" stroke="${pcStroke}" stroke-width="0.5" opacity="0.5"/>
    <!-- Stand -->
    <line x1="24" y1="30" x2="24" y2="36" stroke="${pcStroke}" stroke-width="2" stroke-linecap="round"/>
    <!-- Base -->
    <rect x="14" y="36" width="20" height="4" rx="2" fill="${pcFill}" stroke="${pcStroke}" stroke-width="1.2"/>
  </symbol>`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function renderTopologySVG(lab, theme="dark") {
  const devices=lab.devices||[];
  if(!devices.length) return null;

  const isDark=theme==="dark";
  const C={
    bg:       isDark?"#0c1118":"#f8fafc",
    rText:    isDark?"#7dd3fc":"#1d4ed8",
    swText:   isDark?"#86efac":"#15803d",
    pcText:   isDark?"#94a3b8":"#475569",
    link:     isDark?"#3d5068":"#94a3b8",
    trunk:    isDark?"#f59e0b":"#d97706",
    ifLabel:  isDark?"#94a3b8":"#475569",
    ifBg:     isDark?"rgba(12,17,24,0.85)":"rgba(248,250,252,0.9)",
    midBg:    isDark?"#1a2535":"#e2e8f0",
    midText:  isDark?"#64748b":"#64748b",
    loFill:   isDark?"#1e1040":"#ede9fe",
    loBorder: isDark?"#7c3aed":"#7c3aed",
    loText:   isDark?"#c4b5fd":"#6d28d9",
    vlanFill: isDark?"#1a1506":"#fef9c3",
    vlanBord: isDark?"#ca8a04":"#ca8a04",
    vlanText: isDark?"#fbbf24":"#92400e",
    legText:  isDark?"#4b5563":"#9ca3af",
  };

  const topoText=lab.topology||"";
  const positions=layout(devices);
  const links=detectLinks(devices,topoText);
  const vlans=extractVlans(devices);

  let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">`;
  svg+=`<rect width="${W}" height="${H}" fill="${C.bg}" rx="8"/>`;
  svg+=`<defs>${buildDefs(isDark)}</defs>`;

  // ─── LINKS ──────────────────────────────────────────────────────────────────
  links.forEach(lk=>{
    const p1=positions[lk.from],p2=positions[lk.to];
    if(!p1||!p2) return;
    const e1=getEdge(devices[lk.from],p1.x,p1.y,p2.x,p2.y);
    const e2=getEdge(devices[lk.to],p2.x,p2.y,p1.x,p1.y);
    const mx=(e1.x+e2.x)/2,my=(e1.y+e2.y)/2;
    const dx=e2.x-e1.x,dy=e2.y-e1.y;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const ux=dx/len,uy=dy/len;
    const px=-uy,py=ux;
    const sc=lk.isTrunk?C.trunk:C.link;
    const sw=lk.isTrunk?2.5:1.5;

    if(lk.isTrunk){
      const off=2.5;
      svg+=`<line x1="${(e1.x+px*off).toFixed(1)}" y1="${(e1.y+py*off).toFixed(1)}" x2="${(e2.x+px*off).toFixed(1)}" y2="${(e2.y+py*off).toFixed(1)}" stroke="${sc}" stroke-width="1.2" opacity="0.5"/>`;
      svg+=`<line x1="${(e1.x-px*off).toFixed(1)}" y1="${(e1.y-py*off).toFixed(1)}" x2="${(e2.x-px*off).toFixed(1)}" y2="${(e2.y-py*off).toFixed(1)}" stroke="${sc}" stroke-width="1.2" opacity="0.5"/>`;
    }
    svg+=`<line x1="${e1.x.toFixed(1)}" y1="${e1.y.toFixed(1)}" x2="${e2.x.toFixed(1)}" y2="${e2.y.toFixed(1)}" stroke="${sc}" stroke-width="${sw}"/>`;

    // Interface labels at 22% and 78% along link
    if(len>55){
      const PERP=9;
      const lx1=e1.x+ux*len*0.22+px*PERP, ly1=e1.y+uy*len*0.22+py*PERP;
      const lx2=e1.x+ux*len*0.78+px*PERP, ly2=e1.y+uy*len*0.78+py*PERP;
      const lbw=28,lbh=11;
      svg+=`<rect x="${(lx1-lbw/2).toFixed(1)}" y="${(ly1-lbh/2).toFixed(1)}" width="${lbw}" height="${lbh}" fill="${C.ifBg}" rx="2"/>`;
      svg+=`<text x="${lx1.toFixed(1)}" y="${ly1.toFixed(1)}" fill="${C.ifLabel}" font-size="7" text-anchor="middle" dominant-baseline="middle" font-family="monospace">${esc(shortIf(lk.fromIf))}</text>`;
      svg+=`<rect x="${(lx2-lbw/2).toFixed(1)}" y="${(ly2-lbh/2).toFixed(1)}" width="${lbw}" height="${lbh}" fill="${C.ifBg}" rx="2"/>`;
      svg+=`<text x="${lx2.toFixed(1)}" y="${ly2.toFixed(1)}" fill="${C.ifLabel}" font-size="7" text-anchor="middle" dominant-baseline="middle" font-family="monospace">${esc(shortIf(lk.toIf))}</text>`;
    }

    // Mid label
    const bw=lk.fromIp?62:44,bh=13;
    svg+=`<rect x="${(mx-bw/2).toFixed(1)}" y="${(my-bh/2).toFixed(1)}" width="${bw}" height="${bh}" fill="${C.midBg}" rx="3" opacity="0.95"/>`;
    if(lk.fromIp){
      const n=getNet(lk.fromIp);
      const o=lk.fromIp.split("/")[0].split(".");
      svg+=`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${C.midText}" font-size="7" text-anchor="middle" dominant-baseline="middle" font-family="monospace">${esc(`${o[0]}.${o[1]}.${o[2]}.0/${n?n.bits:"?"}`)}</text>`;
    } else {
      const label=lk.isTrunk?"Trunk":"Link";
      svg+=`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="${lk.isTrunk?C.trunk:C.midText}" font-size="7.5" font-weight="${lk.isTrunk?"bold":"normal"}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${label}</text>`;
    }
  });

  // ─── DEVICE SYMBOLS ─────────────────────────────────────────────────────────
  devices.forEach((dev,i)=>{
    const p=positions[i];
    if(!p) return;
    const tier=getTier(dev);
    const isR=tier===0, isPC=tier===2;
    const symId=isR?"sym-router":isPC?"sym-pc":"sym-switch";
    const sw=isR?SYM_W:isPC?48:56;
    const sh=isR?SYM_H:isPC?42:40;
    const sx=(p.x-sw/2).toFixed(1);
    const sy=(p.y-sh/2).toFixed(1);
    const nameColor=isR?C.rText:isPC?C.pcText:C.swText;

    svg+=`<use href="#${symId}" x="${sx}" y="${sy}" width="${sw}" height="${sh}"/>`;

    // Device name below symbol
    const nameY=(p.y+sh/2+13).toFixed(1);
    svg+=`<text x="${p.x.toFixed(1)}" y="${nameY}" fill="${nameColor}" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif">${esc(dev.name)}</text>`;

    // Loopback pill — routers only, placed to the side with least links
    if(isR){
      const loopbacks=Object.entries(dev.interfaces||{})
        .filter(([n,inf])=>/loopback/i.test(n)&&inf.ip)
        .map(([n,inf])=>`${shortIf(n)}: ${inf.ip}`);
      if(loopbacks.length>0){
        const linkedPos=links.filter(lk=>lk.from===i||lk.to===i).map(lk=>lk.from===i?lk.to:lk.from);
        // Find side with no links
        let right=0,left=0;
        linkedPos.forEach(idx=>{ const op=positions[idx]; if(!op) return; if(op.x>p.x) right++; else left++; });
        const goRight=left>=right;
        const pilW=Math.max(...loopbacks.map(l=>l.length))*5.3+12;
        const pilH=loopbacks.length*12+6;
        const pilX=goRight?p.x+sw/2+8:p.x-sw/2-pilW-8;
        const pilY=clamp(p.y-pilH/2,4,H-pilH-4);
        svg+=`<rect x="${pilX.toFixed(1)}" y="${pilY.toFixed(1)}" width="${pilW.toFixed(1)}" height="${pilH.toFixed(1)}" fill="${C.loFill}" stroke="${C.loBorder}" stroke-width="0.8" rx="3"/>`;
        loopbacks.forEach((label,li)=>{
          svg+=`<text x="${(pilX+pilW/2).toFixed(1)}" y="${(pilY+9+li*12).toFixed(1)}" fill="${C.loText}" font-size="7" text-anchor="middle" dominant-baseline="middle" font-family="monospace">${esc(label)}</text>`;
        });
      }
    }

    // PC VLAN label below name
    if(isPC){
      const vk=Object.keys(dev.vlans||{});
      if(vk.length>0){
        const vname=dev.vlans[vk[0]]||"";
        const vlabel=vname?`VLAN ${vk[0]} — ${vname}`:`VLAN ${vk[0]}`;
        svg+=`<text x="${p.x.toFixed(1)}" y="${(parseFloat(nameY)+12).toFixed(1)}" fill="${C.vlanText}" font-size="7" text-anchor="middle" font-family="sans-serif">${esc(vlabel)}</text>`;
      }
    }
  });

  // ─── VLAN TABLE ─────────────────────────────────────────────────────────────
  if(vlans.length>0){
    const tableY=H-36;
    const maxC=Math.min(vlans.length,9);
    const cellW=Math.min(72,(W-20)/maxC);
    const startX=(W-cellW*maxC)/2;
    svg+=`<text x="${W/2}" y="${tableY-7}" fill="${C.vlanText}" font-size="7" text-anchor="middle" font-weight="bold" font-family="sans-serif" opacity="0.7">VLANs</text>`;
    vlans.slice(0,maxC).forEach((vl,vi)=>{
      const vx=startX+vi*cellW+1,vw=cellW-2;
      svg+=`<rect x="${vx.toFixed(1)}" y="${tableY}" width="${vw.toFixed(1)}" height="26" fill="${C.vlanFill}" stroke="${C.vlanBord}" stroke-width="0.8" rx="3"/>`;
      svg+=`<text x="${(vx+vw/2).toFixed(1)}" y="${tableY+9}" fill="${C.vlanText}" font-size="8" font-weight="bold" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${esc(vl.id)}</text>`;
      if(vl.name){
        const ns=vl.name.length>8?vl.name.slice(0,7)+"…":vl.name;
        svg+=`<text x="${(vx+vw/2).toFixed(1)}" y="${tableY+20}" fill="${C.vlanText}" font-size="6" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" opacity="0.85">${esc(ns)}</text>`;
      }
    });
  }

  // ─── LEGEND ─────────────────────────────────────────────────────────────────
  const ly=vlans.length>0?H-48:H-14;
  svg+=`<line x1="8" y1="${ly}" x2="22" y2="${ly}" stroke="${C.link}" stroke-width="1.5"/>`;
  svg+=`<text x="26" y="${ly}" fill="${C.legText}" font-size="7" dominant-baseline="middle" font-family="sans-serif">Link</text>`;
  svg+=`<line x1="54" y1="${ly}" x2="68" y2="${ly}" stroke="${C.trunk}" stroke-width="2.5"/>`;
  svg+=`<text x="72" y="${ly}" fill="${C.legText}" font-size="7" dominant-baseline="middle" font-family="sans-serif">Trunk</text>`;
  if(vlans.length>0){
    svg+=`<rect x="108" y="${ly-4}" width="8" height="8" fill="${C.vlanFill}" stroke="${C.vlanBord}" stroke-width="0.8" rx="1"/>`;
    svg+=`<text x="120" y="${ly}" fill="${C.legText}" font-size="7" dominant-baseline="middle" font-family="sans-serif">VLAN</text>`;
  }

  svg+=`</svg>`;
  return svg;
}
