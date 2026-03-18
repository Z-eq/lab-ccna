import { useState, useCallback, useRef, useEffect } from "react";
import { LABS } from "./labData";

// ─── CCNA LAB EDITOR ────────────────────────────────────────────────────────
// Side app for creating/editing labs for the Cisco Lab Simulator
// Outputs JSON that can be pasted directly into the LABS array

const CATEGORIES = ["Routing", "Switching", "IP Services", "Security", "IPv6"];

// Group existing labs by category for template selection
const LABS_BY_CATEGORY = CATEGORIES.reduce((acc, cat) => {
  acc[cat] = LABS.filter(l => l.category === cat);
  return acc;
}, {});
const DEVICE_TYPES = ["router", "switch"];
const COMMON_INTERFACES = [
  "Ethernet0/0", "Ethernet0/1", "Ethernet0/2", "Ethernet0/3",
  "GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2",
  "FastEthernet0/1", "FastEthernet0/2",
  "Loopback0", "Loopback1",
  "Serial0/0/0", "Serial0/0/1",
  "Vlan1", "Vlan10", "Vlan99",
  "Port-channel1",
];

const DARK = {
  bg: "#0a0e17", card: "#111827", cardAlt: "#1a2236", border: "#1e293b",
  borderLight: "#2d3a52", text: "#e2e8f0", textMuted: "#94a3b8", textDim: "#64748b",
  accent: "#38bdf8", accentDark: "#0284c7", accentGlow: "rgba(56,189,248,0.08)",
  green: "#22c55e", greenDark: "#15803d", greenGlow: "rgba(34,197,94,0.1)",
  red: "#ef4444", redDark: "#991b1b", orange: "#f59e0b", orangeGlow: "rgba(245,158,11,0.08)",
  purple: "#a78bfa", terminal: "#0c1018",
};

const LIGHT = {
  bg: "#f8fafc", card: "#ffffff", cardAlt: "#f1f5f9", border: "#e2e8f0",
  borderLight: "#cbd5e1", text: "#1e293b", textMuted: "#64748b", textDim: "#94a3b8",
  accent: "#0284c7", accentDark: "#0369a1", accentGlow: "rgba(2,132,199,0.06)",
  green: "#16a34a", greenDark: "#15803d", greenGlow: "rgba(22,163,74,0.08)",
  red: "#dc2626", redDark: "#991b1b", orange: "#d97706", orangeGlow: "rgba(217,119,6,0.06)",
  purple: "#7c3aed", terminal: "#f1f5f9",
};

const fontMono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";
const fontSans = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

// ─── TEMPLATE LABS ──────────────────────────────────────────────────────────
const TEMPLATES = {
  routing: {
    title: "New Routing Lab", category: "Routing", source: "",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: [{ name: "Ethernet0/0", ip: "10.0.0.1/24", status: "up" }] },
      { name: "R2", type: "router", hostname: "R2", interfaces: [{ name: "Ethernet0/0", ip: "10.0.0.2/24", status: "up" }] },
    ],
    topology: "R1(E0/0) ── 10.0.0.0/24 ── (E0/0)R2",
    tasks: [{ id: 1, text: "", device: "R1", hint: "", checkRaw: "" }],
  },
  switching: {
    title: "New Switching Lab", category: "Switching", source: "",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: [{ name: "Ethernet0/0", ip: "", status: "up" }, { name: "Ethernet0/1", ip: "", status: "up" }] },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: [{ name: "Ethernet0/0", ip: "", status: "up" }, { name: "Ethernet0/1", ip: "", status: "up" }] },
    ],
    topology: "Sw1(E0/0,E0/1) ══ (E0/0,E0/1)Sw2",
    tasks: [{ id: 1, text: "", device: "Sw1", hint: "", checkRaw: "" }],
  },
  security: {
    title: "New Security Lab", category: "Security", source: "",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: [{ name: "Ethernet0/0", ip: "10.0.0.1/24", status: "up" }] },
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: [{ name: "Ethernet0/0", ip: "", status: "up" }] },
    ],
    topology: "R1 ── Sw1 ── PCs",
    tasks: [{ id: 1, text: "", device: "R1", hint: "", checkRaw: "" }],
  },
  blank: {
    title: "", category: "Routing", source: "",
    devices: [{ name: "R1", type: "router", hostname: "R1", interfaces: [{ name: "Ethernet0/0", ip: "", status: "up" }] }],
    topology: "",
    tasks: [{ id: 1, text: "", device: "R1", hint: "", checkRaw: "" }],
  },
};

// ─── STYLES (computed per theme) ─────────────────────────────────────────────
function makeStyles(T) {
  return {
    input: { width: "100%", padding: "8px 12px", background: T.terminal, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: fontMono, fontSize: 13, outline: "none", boxSizing: "border-box", transition: "border 0.2s" },
    inputFocus: { borderColor: T.accent },
    textarea: { width: "100%", padding: "10px 12px", background: T.terminal, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: fontMono, fontSize: 12, outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5, minHeight: 60 },
    label: { display: "block", fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: fontSans },
    btn: (color = T.accent) => ({ padding: "8px 16px", background: `${color}20`, color, border: `1px solid ${color}50`, borderRadius: 6, cursor: "pointer", fontFamily: fontSans, fontSize: 12, fontWeight: 600, transition: "all 0.2s" }),
    btnSmall: (color = T.accent) => ({ padding: "4px 10px", background: `${color}15`, color, border: `1px solid ${color}40`, borderRadius: 4, cursor: "pointer", fontFamily: fontSans, fontSize: 11, fontWeight: 600, transition: "all 0.2s" }),
    card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, marginBottom: 16 },
    section: { fontSize: 14, fontWeight: 700, color: T.accent, marginBottom: 12, fontFamily: fontSans, display: "flex", alignItems: "center", gap: 8 },
    select: { padding: "8px 12px", background: T.terminal, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: fontSans, fontSize: 13, outline: "none", cursor: "pointer" },
    badge: (color) => ({ display: "inline-block", padding: "2px 8px", fontSize: 10, fontWeight: 700, borderRadius: 10, background: `${color}20`, color, fontFamily: fontSans }),
    tag: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: `${T.accent}15`, color: T.accent, borderRadius: 4, fontSize: 11, fontFamily: fontMono },
  };
}

// ─── HELPER: parse check pattern text into arrays ───────────────────────────
function parseCheckPattern(raw) {
  // Format: one check per line, keywords comma-separated
  // e.g.: ip route, 192.168.0.0, 255.255.255.0, 10.10.31.1
  //        switchport mode trunk
  if (!raw.trim()) return [];
  return raw.trim().split("\n").filter(l => l.trim()).map(line =>
    line.split(",").map(k => k.trim()).filter(Boolean)
  );
}

function checkPatternToText(checkArr) {
  if (!checkArr || !checkArr.length) return "";
  return checkArr.map(inner => inner.join(", ")).join("\n");
}

// ─── HELPER: convert editor format to simulator format ──────────────────────
function editorToSimulator(lab, labId) {
  return {
    id: labId,
    title: lab.title,
    category: lab.category,
    source: lab.source || "",
    devices: lab.devices.map(d => ({
      name: d.name,
      type: d.type,
      hostname: d.hostname,
      interfaces: Object.fromEntries(
        d.interfaces.filter(i => i.name).map(i => [
          i.name,
          { ...(i.ip ? { ip: i.ip } : {}), status: i.status || "up" }
        ])
      ),
    })),
    topology: lab.topology,
    tasks: lab.tasks.map(t => ({
      id: t.id,
      text: t.text,
      device: t.device,
      hint: t.hint,
      check: parseCheckPattern(t.checkRaw),
    })),
  };
}

// ─── HELPER: convert simulator format to editor format ──────────────────────
function simulatorToEditor(simLab) {
  return {
    title: simLab.title,
    category: simLab.category,
    source: simLab.source || "",
    devices: simLab.devices.map(d => ({
      name: d.name,
      type: d.type,
      hostname: d.hostname,
      interfaces: Object.entries(d.interfaces).map(([name, info]) => ({
        name, ip: info.ip || "", status: info.status || "up",
      })),
    })),
    topology: simLab.topology,
    tasks: simLab.tasks.map(t => ({
      id: t.id,
      text: t.text,
      device: t.device,
      hint: t.hint,
      checkRaw: checkPatternToText(t.check),
    })),
  };
}

// ─── FOCUSABLE INPUT ────────────────────────────────────────────────────────
function FInput({ style, inputStyle, focusStyle, ...props }) {
  const [focused, setFocused] = useState(false);
  return <input {...props} style={{ ...inputStyle, ...style, ...(focused ? focusStyle : {}) }}
    onFocus={e => { setFocused(true); props.onFocus?.(e); }}
    onBlur={e => { setFocused(false); props.onBlur?.(e); }} />;
}
function FTextarea({ style, inputStyle, focusStyle, ...props }) {
  const [focused, setFocused] = useState(false);
  return <textarea {...props} style={{ ...inputStyle, ...style, ...(focused ? focusStyle : {}) }}
    onFocus={e => { setFocused(true); props.onFocus?.(e); }}
    onBlur={e => { setFocused(false); props.onBlur?.(e); }} />;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function LabEditor() {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("ccna_editor_dark") !== "false"; } catch { return true; }
  });
  const T = darkMode ? DARK : LIGHT;
  const S = makeStyles(T);

  useEffect(() => {
    try { localStorage.setItem("ccna_editor_dark", darkMode); } catch {}
  }, [darkMode]);

  const [lab, setLab] = useState(JSON.parse(JSON.stringify(TEMPLATES.blank)));
  const [labId, setLabId] = useState(28);
  const [showJson, setShowJson] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedLabs, setSavedLabs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ccna_editor_labs") || "[]"); } catch { return []; }
  });
  const [notification, setNotification] = useState(null);
  const jsonRef = useRef(null);

  // ─── AI GENERATOR STATE ────────────────────────────────────
  const [showAi, setShowAi] = useState(false);
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("ccna_ai_provider") || "claude");
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem("ccna_ai_key") || "");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiLog, setAiLog] = useState([]);
  const [showApiKey, setShowApiKey] = useState(false);

  // Persist AI settings
  useEffect(() => {
    try { localStorage.setItem("ccna_ai_provider", aiProvider); } catch {}
  }, [aiProvider]);
  useEffect(() => {
    try { localStorage.setItem("ccna_ai_key", aiApiKey); } catch {}
  }, [aiApiKey]);

  // Auto-save to localStorage
  useEffect(() => {
    try { localStorage.setItem("ccna_editor_labs", JSON.stringify(savedLabs)); } catch {}
  }, [savedLabs]);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ─── AI GENERATION ─────────────────────────────────────────
  const AI_SYSTEM_PROMPT = `You are an expert CCNA 200-301 lab generator for a Cisco IOS CLI simulator. Your job is to create realistic, high-quality hands-on labs.

OUTPUT FORMAT: Return ONLY a valid JSON object. No markdown, no backticks, no explanation, no text before or after.

SCHEMA:
{
  "title": "Lab Title",
  "category": "Routing|Switching|IP Services|Security|IPv6",
  "source": "AI-Generated",
  "devices": [
    {
      "name": "R1",
      "type": "router",
      "hostname": "R1",
      "interfaces": {
        "Ethernet0/0": { "ip": "10.0.0.1/24", "status": "up" },
        "Loopback0": { "ip": "1.1.1.1/32", "status": "up" }
      }
    },
    {
      "name": "SW1",
      "type": "switch",
      "hostname": "SW1",
      "interfaces": {
        "Ethernet0/0": { "status": "up" },
        "Ethernet0/1": { "status": "up" }
      }
    }
  ],
  "topology": "Multi-line ASCII art showing devices, connections, IPs, and subnets",
  "tasks": [
    {
      "id": 1,
      "text": "Clear task description telling the student exactly what to configure",
      "device": "R1",
      "hint": "exact IOS commands, one per line, no comments",
      "check": [["keyword1", "keyword2"], ["keyword3", "keyword4"]]
    }
  ]
}

══════════════════════════════════════════════════════════
CHECK ARRAY RULES — THIS IS CRITICAL, READ CAREFULLY
══════════════════════════════════════════════════════════
The "check" array verifies the running-config. Each inner array = one required config line.
ALL keywords in an inner array must appear on the SAME config line.
Each inner array = a separate config line requirement.

CORRECT examples by technology:

STATIC ROUTES:
check: [["ip route","192.168.1.0","255.255.255.0","10.0.0.2"]]
check: [["ip route","0.0.0.0","0.0.0.0"],["ip route","192.168.0.0","255.255.255.0"]]
Floating static (AD): [["ip route","10.0.0.0","255.0.0.0","10.0.0.2","2"]]

IPv6 STATIC:
check: [["ipv6 route","::/0"],["ipv6 unicast-routing"]]

OSPF:
check: [["router ospf"],["network","10.0.0.0","0.0.0.255","area 0"],["router-id","1.1.1.1"]]
check: [["passive-interface","Ethernet0/1"]]
check: [["ip ospf","1","area 0"]] — for interface-level OSPF

VLANs — EACH LINE IS SEPARATE:
check: [["vlan 10"],["name","sales"],["vlan 20"],["name","engineering"]]
NEVER: [["vlan 10","name","Sales"]] — this will NEVER match

VLAN INTERFACES (switchport):
check: [["switchport mode","access"],["switchport access vlan","10"]]
check: [["switchport mode","trunk"]]
check: [["switchport trunk allowed vlan","10,20"]]
check: [["switchport trunk native vlan","99"]]
check: [["switchport voice vlan","20"]]
check: [["switchport nonegotiate"]]

TRUNKING WITH ENCAPSULATION:
check: [["switchport trunk encapsulation","dot1q"],["switchport mode","trunk"]]

PORT-SECURITY:
check: [["switchport port-security"],["switchport port-security maximum","2"],["switchport port-security violation","shutdown"]]
check: [["switchport port-security mac-address sticky"]]

SPANNING-TREE:
check: [["spanning-tree mode","rapid-pvst"]]
check: [["spanning-tree vlan","10","priority","0"]]
check: [["spanning-tree portfast"]]
check: [["spanning-tree bpduguard","enable"]]

ETHERCHANNEL / LACP / PAGP:
check: [["channel-group","1","mode","active"]]  — LACP active
check: [["channel-group","1","mode","passive"]] — LACP passive
check: [["channel-group","1","mode","desirable"]] — PAgP
check: [["channel-group","1","mode","auto"]] — PAgP auto
check: [["channel-group","1","mode","on"]] — static
Port-channel interface: [["interface port-channel","1"],["switchport mode","trunk"]]

HSRP:
check: [["standby","1","ip","192.168.1.1"],["standby","1","priority","110"],["standby","1","preempt"]]

NAT:
PAT: [["ip nat inside source list","ACL_NAME","interface","Ethernet0/0","overload"]]
Static: [["ip nat inside source static","192.168.1.10","203.0.113.10"]]
Pool: [["ip nat pool","POOLNAME"],["ip nat inside source list","ACL_NAME","pool","POOLNAME"]]
Inside: [["ip nat inside"]]
Outside: [["ip nat outside"]]

DHCP:
check: [["ip dhcp pool","NETPOOL"],["network","10.0.1.0","255.255.255.0"],["default-router","10.0.1.1"],["dns-server"],["ip dhcp excluded-address","10.0.1.1","10.0.1.10"]]

DHCP SNOOPING:
check: [["ip dhcp snooping"],["ip dhcp snooping vlan","10"],["no ip dhcp snooping information option"],["ip dhcp snooping trust"]]

DAI (Dynamic ARP Inspection):
check: [["ip arp inspection vlan","10"],["ip arp inspection validate","src-mac","dst-mac","ip"],["ip arp inspection trust"]]

NTP:
check: [["ntp master"],["ntp server","10.0.0.1"]]

SSH:
check: [["ip domain-name"],["crypto key generate rsa"],["username","privilege 15"],["transport input","ssh"],["login local"]]

ACLs — NAMED EXTENDED:
check: [["ip access-list extended","ACL_NAME"],["permit tcp","10.0.0.0","0.0.0.255","any","eq 80"],["deny ip","any","any"],["ip access-group","ACL_NAME","in"]]

ACLs — NAMED STANDARD:
check: [["ip access-list standard","ACL_NAME"],["permit","10.0.0.0","0.0.255.255"]]

ACLs — NUMBERED:
check: [["access-list","10","permit","10.0.0.0","0.0.0.255"]]

CDP/LLDP:
check: [["no cdp enable"]] — disabled on interface
check: [["lldp run"]] — enabled globally
check: [["no lldp transmit"]] — disabled on interface

USERS AND PRIVILEGE:
check: [["username","wheel","privilege","15","algorithm-type","scrypt"]]
check: [["username","admin","secret"]]

VTP:
check: [["vtp mode","client"],["vtp domain","COMPANY"]]

IP ADDRESSING:
check: [["ip address","192.168.1.1","255.255.255.0"]]
check: [["ipv6 address","2001:db8::1/64"]]

OSPF AREA TYPES:
check: [["area","1","stub"],["area","1","authentication"]]

REDISTRIBUTE:
check: [["redistribute","connected","subnets"],["redistribute","static","subnets"]]

══════════════════════════════════════════════════════════
DEVICE AND INTERFACE RULES
══════════════════════════════════════════════════════════
- Routers: use Ethernet0/0-3, Loopback0-1, Serial0/0/0
- Switches: use Ethernet0/0-3 (no IP unless L3 switch or SVI)
- L3 switch SVI: interface Vlan10 with ip address
- Always use realistic subnets and IPs
- Pre-configure IPs that are NOT part of student tasks in the interfaces block
- Leave interfaces unconfigured if the student must configure them

══════════════════════════════════════════════════════════
LAB DESIGN RULES
══════════════════════════════════════════════════════════
- 3-6 tasks per lab, ordered from basic to complex
- Hint = exact IOS commands needed (full solution), one command per line, no "!" or comments
- Task text = clear instruction from student perspective
- Tasks should build on each other logically
- Include realistic scenario context in task descriptions
- For multi-device tasks, create separate tasks per device
- Topology ASCII art must show: device names, interface names, IP addresses, subnet info

══════════════════════════════════════════════════════════
TOPOLOGY FORMAT — MANDATORY RULES
══════════════════════════════════════════════════════════
ALWAYS draw a detailed ASCII topology using box-drawing characters: ┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼
Use ══ for trunk links, ── for regular links, arrows ▼ ▲ ► ◄ for direction.
ALWAYS show: device boxes, interface names, IP addresses, VLAN info, subnet info.
The topology must be self-explanatory — a student should understand the full network from it.

ROUTER-TO-ROUTER EXAMPLE:
"topology": "         ┌──────────────────────┐         ┌──────────────────────┐\\n         │          R1          │         │          R2          │\\n         │  Lo0: 1.1.1.1/32     │         │  Lo0: 2.2.2.2/32     │\\n         └──────────┬───────────┘         └──────────┬───────────┘\\n                    │ E0/0                            │ E0/0\\n                    │ 10.0.12.1/30                    │ 10.0.12.2/30\\n                    └────────────────────────────────┘\\n                              10.0.12.0/30"

ROUTER-SWITCH-PC EXAMPLE:
"topology": "┌────────────────┐\\n│      R1        │\\n│ E0/0:10.0.0.1  │\\n└───────┬────────┘\\n        │ 10.0.0.0/24\\n        │ E0/0\\n┌───────┴────────┐\\n│      SW1       │\\n│  E0/1   E0/2   │\\n└──┬──────────┬──┘\\n   │          │\\n   │VLAN 10   │VLAN 20\\n┌──┴───┐   ┌──┴───┐\\n│ PC1  │   │ PC2  │\\n└──────┘   └──────┘"

THREE-ROUTER OSPF EXAMPLE:
"topology": "    ┌──────────────┐       ┌──────────────┐\\n    │      R1      │       │      R2      │\\n    │ Lo0:1.1.1.1  ├───────┤ Lo0:2.2.2.2  │\\n    │ E0/0:10.1.12.1│  /30 │ E0/0:10.1.12.2│\\n    └──────┬───────┘       └──────┬───────┘\\n           │E0/1                   │E0/1\\n           │10.1.13.1/30           │10.1.23.1/30\\n           │                       │\\n    ┌──────┴───────┐               │\\n    │      R3      ├───────────────┘\\n    │ Lo0:3.3.3.3  │ E0/2: 10.1.23.2/30\\n    │ E0/0:10.1.13.2│\\n    └──────────────┘"

SWITCHING/VLAN EXAMPLE:
"topology": "              ┌──────────────────┐\\n              │       SW1        │\\n              │  E0/0(Trunk)     │\\n              └───────┬──────────┘\\n           ═══════════╪═══════════ Trunk (VLAN 10,20,99)\\n              ┌───────┴──────────┐\\n              │       SW2        │\\n         ┌───┤E0/1         E0/2  ├───┐\\n         │   └──────────────────┘   │\\n         │ Access                   │ Access\\n         │ VLAN 10                  │ VLAN 20\\n    ┌────┴────┐                ┌────┴────┐\\n    │   PC1   │                │   PC2   │\\n    │VLAN 10  │                │VLAN 20  │\\n    └─────────┘                └─────────┘"

Always adapt the style to the lab type. More complex labs = more detailed topology.
RETURN ONLY THE JSON OBJECT. NOTHING ELSE.`;

  const AI_PROVIDERS = {
    claude: {
      name: "Claude (Anthropic)",
      icon: "🟣",
      url: "https://api.minimax.io/anthropic",
      buildRequest: (prompt, key) => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2024-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "MiniMax M2.5",
          max_tokens: 4096,
          system: AI_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
      }),
      extractText: (data) => {
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return data.content?.map(b => b.text || "").join("") || "";
      },
    },
    openai: {
      name: "ChatGPT (OpenAI)",
      icon: "🟢",
      url: "https://api.openai.com/v1/chat/completions",
      buildRequest: (prompt, key) => ({
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 4096,
          messages: [
            { role: "system", content: AI_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      }),
      extractText: (data) => {
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return data.choices?.[0]?.message?.content || "";
      },
    },
    gemini: {
      name: "Gemini (Google)",
      icon: "🔵",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      buildRequest: (prompt, key) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Gemini uses query param for key
        _url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
        }),
      }),
      extractText: (data) => {
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      },
    },
    
   minimax: {
  name: "MiniMax M2.5",
  icon: "⚡",
  url: "https://api.minimax.io/v1/chat/completions",
  buildRequest: (prompt, key) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "MiniMax-M2.5",
      max_tokens: 4096,
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user",   content: prompt },
      ],
    }),
  }),
  extractText: (data) => {
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || "";
  },
},
  };  
  const aiGenerate = async () => {
    if (!aiApiKey.trim()) { setAiError("Ange API-nyckel först"); return; }
    if (!aiPrompt.trim()) { setAiError("Skriv en prompt"); return; }

    setAiLoading(true);
    setAiError(null);
    setAiLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: `Genererar med ${AI_PROVIDERS[aiProvider].name}...`, type: "info" }]);

    try {
      const provider = AI_PROVIDERS[aiProvider];
      const reqInit = provider.buildRequest(aiPrompt, aiApiKey);
      const url = reqInit._url || provider.url;
      delete reqInit._url;

      const response = await fetch(url, reqInit);
      const data = await response.json();
      const text = provider.extractText(data);

      setAiLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: "Svar mottaget, parsar JSON...", type: "info" }]);

      // Extract JSON from response (handle markdown fences)
      let jsonStr = text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      // Also try to find first { to last }
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      const labData = JSON.parse(jsonStr);

      // Convert to editor format
      const editorLab = simulatorToEditor(labData);
      setLab(editorLab);
      setLabId(labData.id || Math.max(28, ...savedLabs.map(l => l.id), labId) + 1);

      setAiLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: `✅ Lab "${labData.title}" genererad! ${labData.tasks?.length || 0} tasks, ${labData.devices?.length || 0} enheter`, type: "success" }]);
      notify(`Lab "${labData.title}" genererad av AI!`);
    } catch (e) {
      const errMsg = e.message || "Okänt fel";
      setAiError(errMsg);
      setAiLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: `❌ Fel: ${errMsg}`, type: "error" }]);
    } finally {
      setAiLoading(false);
    }
  };

  const AI_EXAMPLE_PROMPTS = [
    "Create an OSPF lab with 3 routers where students configure area 0 adjacencies and verify with show commands",
    "Create a VLAN lab with 2 switches: configure VLANs 10,20,99, assign ports, and set up a trunk between switches",
    "Create a security lab: configure port-security on a switch with max 2 MAC addresses and violation shutdown",
    "Create a NAT lab: R1 has inside network 192.168.1.0/24, R2 is the ISP. Configure PAT on R1",
    "Create an EtherChannel lab with 2 switches using LACP on ports E0/0-1",
    "Create a DHCP and NTP lab with 2 routers: R1 is DHCP server and NTP master, R2 gets IP via DHCP",
    "Create an IPv6 lab with static routing between 3 routers using link-local next-hops",
    "Create a comprehensive switching lab: VLANs, trunks, native VLAN, voice VLAN, and portfast on access ports",
  ];

  // ─── LAB METADATA ──────────────────────────────────────────
  const updateLab = (field, value) => setLab(prev => ({ ...prev, [field]: value }));

  // ─── DEVICES ───────────────────────────────────────────────
  const addDevice = () => {
    const num = lab.devices.length + 1;
    const isSwitch = lab.category === "Switching" || lab.category === "Security";
    setLab(prev => ({
      ...prev,
      devices: [...prev.devices, {
        name: isSwitch ? `Sw${num}` : `R${num}`,
        type: isSwitch ? "switch" : "router",
        hostname: isSwitch ? `Sw${num}` : `R${num}`,
        interfaces: [{ name: "Ethernet0/0", ip: "", status: "up" }],
      }]
    }));
  };

  const removeDevice = (idx) => {
    if (lab.devices.length <= 1) return;
    setLab(prev => ({ ...prev, devices: prev.devices.filter((_, i) => i !== idx) }));
  };

  const updateDevice = (idx, field, value) => {
    setLab(prev => {
      const devs = [...prev.devices];
      devs[idx] = { ...devs[idx], [field]: value };
      if (field === "name") devs[idx].hostname = value;
      return { ...prev, devices: devs };
    });
  };

  const addInterface = (devIdx) => {
    setLab(prev => {
      const devs = [...prev.devices];
      const existing = devs[devIdx].interfaces.map(i => i.name);
      const next = COMMON_INTERFACES.find(i => !existing.includes(i)) || `Ethernet0/${existing.length}`;
      devs[devIdx] = { ...devs[devIdx], interfaces: [...devs[devIdx].interfaces, { name: next, ip: "", status: "up" }] };
      return { ...prev, devices: devs };
    });
  };

  const removeInterface = (devIdx, ifIdx) => {
    setLab(prev => {
      const devs = [...prev.devices];
      devs[devIdx] = { ...devs[devIdx], interfaces: devs[devIdx].interfaces.filter((_, i) => i !== ifIdx) };
      return { ...prev, devices: devs };
    });
  };

  const updateInterface = (devIdx, ifIdx, field, value) => {
    setLab(prev => {
      const devs = [...prev.devices];
      const ifs = [...devs[devIdx].interfaces];
      ifs[ifIdx] = { ...ifs[ifIdx], [field]: value };
      devs[devIdx] = { ...devs[devIdx], interfaces: ifs };
      return { ...prev, devices: devs };
    });
  };

  // ─── TASKS ─────────────────────────────────────────────────
  const addTask = () => {
    setLab(prev => ({
      ...prev,
      tasks: [...prev.tasks, {
        id: prev.tasks.length + 1,
        text: "", device: prev.devices[0]?.name || "R1",
        hint: "", checkRaw: "",
      }]
    }));
  };

  const removeTask = (idx) => {
    if (lab.tasks.length <= 1) return;
    setLab(prev => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== idx).map((t, i) => ({ ...t, id: i + 1 }))
    }));
  };

  const updateTask = (idx, field, value) => {
    setLab(prev => {
      const tasks = [...prev.tasks];
      tasks[idx] = { ...tasks[idx], [field]: value };
      return { ...prev, tasks };
    });
  };

  const moveTask = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= lab.tasks.length) return;
    setLab(prev => {
      const tasks = [...prev.tasks];
      [tasks[idx], tasks[newIdx]] = [tasks[newIdx], tasks[idx]];
      return { ...prev, tasks: tasks.map((t, i) => ({ ...t, id: i + 1 })) };
    });
  };

  // ─── IMPORT / EXPORT ──────────────────────────────────────
  const getOutputJson = () => {
    const sim = editorToSimulator(lab, labId);
    return JSON.stringify(sim, null, 2);
  };

  const handleImport = () => {
    try {
      let parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) parsed = parsed[0];
      setLab(simulatorToEditor(parsed));
      setLabId(parsed.id || 28);
      setShowImport(false);
      setImportText("");
      notify("Lab importerad!");
    } catch (e) {
      notify("JSON-parse-fel: " + e.message, "error");
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(getOutputJson());
      setCopied(true);
      notify("JSON kopierad till urklipp!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      jsonRef.current?.select();
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveLab = () => {
    const sim = editorToSimulator(lab, labId);
    setSavedLabs(prev => {
      const existing = prev.findIndex(l => l.id === labId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = sim;
        return updated;
      }
      return [...prev, sim];
    });
    notify(`Lab "${lab.title || "Untitled"}" sparad lokalt!`);
  };

  const handleLoadLab = (savedLab) => {
    setLab(simulatorToEditor(savedLab));
    setLabId(savedLab.id);
    notify(`Laddade "${savedLab.title}"`);
  };

  const handleDeleteSaved = (id) => {
    setSavedLabs(prev => prev.filter(l => l.id !== id));
    notify("Lab borttagen", "error");
  };

  const handleExportAll = () => {
    const all = savedLabs.map(l => JSON.stringify(l, null, 2)).join(",\n");
    const blob = new Blob([`[\n${all}\n]`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "custom-labs.json"; a.click();
    URL.revokeObjectURL(url);
    notify("Alla labbar exporterade!");
  };

  const handleTemplate = (key) => {
    setLab(JSON.parse(JSON.stringify(TEMPLATES[key])));
    setLabId(Math.max(28, ...savedLabs.map(l => l.id), labId) + 1);
    notify(`Mall "${key}" laddad`);
  };

  // ─── VALIDATION ────────────────────────────────────────────
  const issues = [];
  if (!lab.title) issues.push("Lab saknar titel");
  if (lab.devices.length === 0) issues.push("Minst en enhet krävs");
  lab.tasks.forEach((t, i) => {
    if (!t.text) issues.push(`Task ${i + 1}: saknar beskrivning`);
    if (!t.device) issues.push(`Task ${i + 1}: saknar enhet`);
    if (!t.checkRaw.trim()) issues.push(`Task ${i + 1}: saknar check-pattern`);
  });

  const deviceNames = lab.devices.map(d => d.name);

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: fontSans }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* NOTIFICATION */}
      {notification && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 20px",
          background: notification.type === "error" ? T.redDark : T.greenDark,
          color: "white", borderRadius: 8, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)", animation: "slideIn 0.3s ease",
        }}>
          {notification.type === "error" ? "❌" : "✅"} {notification.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: T.card }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>🔧</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.accent, letterSpacing: "-0.02em" }}>CCNA Lab Editor</div>
            <div style={{ fontSize: 11, color: T.textDim }}>Skapa och redigera labbar för Cisco Lab Simulator</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setDarkMode(p => !p)}
            style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${T.border}`, background: T.card, color: T.textMuted, cursor: "pointer", fontSize: 11, fontFamily: fontSans, transition: "all 0.2s" }}>
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
          <button style={{
            ...S.btn(T.purple),
            background: showAi ? `${T.purple}30` : `${T.purple}15`,
            boxShadow: aiLoading ? `0 0 12px ${T.purple}40` : "none",
            animation: aiLoading ? "pulse 1.5s infinite" : "none",
          }} onClick={() => setShowAi(!showAi)}>
            {aiLoading ? "⏳ Genererar..." : showAi ? "✏️ Manual Editor" : "🤖 AI Generator"}
          </button>
          <button style={S.btn(T.green)} onClick={handleSaveLab}>💾 Spara lokalt</button>
          <button style={S.btn(T.orange)} onClick={() => setShowImport(!showImport)}>📥 Importera JSON</button>
          <button style={S.btn(T.accent)} onClick={() => setShowJson(!showJson)}>
            {showJson ? "✏️ Editor" : "📄 Visa JSON"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1400, margin: "0 auto", gap: 0, minHeight: "calc(100vh - 60px)" }}>
        {/* ─── LEFT SIDEBAR: Saved Labs ─── */}
        <div style={{ width: 260, borderRight: `1px solid ${T.border}`, padding: 16, background: T.card, flexShrink: 0, overflowY: "auto", maxHeight: "calc(100vh - 60px)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>📚 Tomma mallar</div>
          {[["routing", "🛣️ Routing"], ["switching", "🔀 Switching"], ["security", "🔒 Security"], ["blank", "📄 Blank"]].map(([k, label]) => (
            <button key={k} onClick={() => handleTemplate(k)}
              style={{ ...S.btnSmall(T.textMuted), width: "100%", marginBottom: 6, textAlign: "left", padding: "8px 10px" }}>
              {label}
            </button>
          ))}

          {/* Use existing lab as template */}
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 8px" }}>
            📋 Utgå från befintlig lab
          </div>
          <div style={{ fontSize: 10, color: T.textDim, marginBottom: 8 }}>Ladda en befintlig lab som bas, redigera fritt</div>
          {CATEGORIES.map(cat => {
            const catLabs = LABS_BY_CATEGORY[cat] || [];
            if (catLabs.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 4, opacity: 0.7 }}>{cat}</div>
                <select
                  value=""
                  onChange={e => {
                    const srcLab = catLabs.find(l => l.id === parseInt(e.target.value));
                    if (!srcLab) return;
                    const editorLab = simulatorToEditor(srcLab);
                    editorLab.title = srcLab.title + " (kopia)";
                    editorLab.source = "Based on Lab " + srcLab.id;
                    setLab(editorLab);
                    setLabId(Math.max(28, ...savedLabs.map(l => l.id), labId) + 1);
                    notify(`Laddade "${srcLab.title}" som mall`);
                  }}
                  style={{ ...S.select, width: "100%", fontSize: 10, padding: "5px 6px" }}
                >
                  <option value="">Välj lab...</option>
                  {catLabs.map(l => (
                    <option key={l.id} value={l.id}>#{l.id} {l.title}</option>
                  ))}
                </select>
              </div>
            );
          })}

          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 12px" }}>
            💾 Sparade ({savedLabs.length})
          </div>
          {savedLabs.length === 0 && <div style={{ fontSize: 11, color: T.textDim, padding: "8px 0" }}>Inga sparade labbar</div>}
          {savedLabs.map(sl => (
            <div key={sl.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
              <button onClick={() => handleLoadLab(sl)}
                style={{ ...S.btnSmall(T.accent), flex: 1, textAlign: "left", padding: "6px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                #{sl.id} {sl.title || "Untitled"}
              </button>
              <button onClick={() => handleDeleteSaved(sl.id)}
                style={{ ...S.btnSmall(T.red), padding: "6px 8px", flexShrink: 0 }}>✕</button>
            </div>
          ))}
          {savedLabs.length > 0 && (
            <button onClick={handleExportAll} style={{ ...S.btn(T.purple), width: "100%", marginTop: 12 }}>
              📦 Exportera alla
            </button>
          )}
        </div>

        {/* ─── MAIN EDITOR ─── */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto", maxHeight: "calc(100vh - 60px)" }}>
          {showImport && (
            <div style={{ ...S.card, borderColor: T.orange }}>
              <div style={S.section}>📥 Importera lab från JSON</div>
              <FTextarea inputStyle={S.textarea} focusStyle={S.inputFocus} value={importText} onChange={e => setImportText(e.target.value)}
                placeholder='Klistra in JSON-objekt här, t.ex. { "id": 28, "title": "My Lab", ... }'
                style={{ minHeight: 120, marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btn(T.green)} onClick={handleImport}>✅ Importera</button>
                <button style={S.btn(T.textMuted)} onClick={() => setShowImport(false)}>Avbryt</button>
              </div>
            </div>
          )}

          {/* ─── AI GENERATOR PANEL ─── */}
          {showAi && (
            <div style={{ ...S.card, borderColor: `${T.purple}60`, background: `linear-gradient(135deg, ${T.card} 0%, ${T.cardAlt} 100%)` }}>
              <div style={{ ...S.section, color: T.purple }}>🤖 AI-driven Labbgenerator</div>

              {/* Provider + API Key */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={S.label}>AI-provider</label>
                  <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={{ ...S.select, width: "100%" }}>
                    {Object.entries(AI_PROVIDERS).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.label}>
                    API-nyckel ({AI_PROVIDERS[aiProvider].name})
                    <button onClick={() => setShowApiKey(!showApiKey)}
                      style={{ marginLeft: 8, background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 10 }}>
                      {showApiKey ? "🙈 Dölj" : "👁️ Visa"}
                    </button>
                  </label>
                 <FInput 
  inputStyle={S.input} 
  focusStyle={S.inputFocus}
  type={showApiKey ? "text" : "password"}
  value={aiApiKey}
  onChange={e => setAiApiKey(e.target.value)}
  placeholder={
    aiProvider === "claude" ? "sk-ant-..." : 
    aiProvider === "openai" ? "sk-..." : 
    aiProvider === "gemini" ? "AIzaSy..." : 
    aiProvider === "minimax" ? "eyJhbGci..." : "Klistra in nyckel..."
  }
  style={{ fontFamily: fontMono, fontSize: 11 }}
                  />
                </div>
              </div>

              {/* Prompt */}
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>📝 Beskriv labben du vill skapa</label>
                <FTextarea inputStyle={S.textarea} focusStyle={S.inputFocus}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="T.ex: Skapa en labb för OSPF-prioritering med tre routrar där studenterna ska konfigurera router-id, nätverksbeskrivningar och verifiera adjacencies"
                  style={{ minHeight: 80 }}
                />
              </div>

              {/* Example prompts */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...S.label, marginBottom: 8 }}>💡 Exempelpromptar (klicka för att använda)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {AI_EXAMPLE_PROMPTS.map((p, i) => (
                    <button key={i} onClick={() => setAiPrompt(p)}
                      style={{
                        padding: "5px 10px", fontSize: 10, fontFamily: fontSans,
                        background: aiPrompt === p ? `${T.purple}25` : `${T.terminal}`,
                        color: aiPrompt === p ? T.purple : T.textDim,
                        border: `1px solid ${aiPrompt === p ? T.purple + "50" : T.border}`,
                        borderRadius: 4, cursor: "pointer", textAlign: "left",
                        maxWidth: "100%", transition: "all 0.2s",
                      }}>
                      {p.length > 80 ? p.slice(0, 80) + "..." : p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <button
                  onClick={aiGenerate}
                  disabled={aiLoading}
                  style={{
                    ...S.btn(T.purple),
                    padding: "10px 24px", fontSize: 13,
                    opacity: aiLoading ? 0.6 : 1,
                    cursor: aiLoading ? "not-allowed" : "pointer",
                  }}>
                  {aiLoading ? "⏳ Genererar..." : "🚀 Generera Lab"}
                </button>
                {aiLoading && (
                  <span style={{ fontSize: 11, color: T.textDim }}>
                    AI:n skapar topologi, enheter, tasks och verifiering...
                  </span>
                )}
              </div>

              {/* Error */}
              {aiError && (
                <div style={{
                  background: `${T.red}15`, border: `1px solid ${T.red}40`,
                  borderRadius: 6, padding: "10px 14px", marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>❌ {aiError}</div>
                </div>
              )}

              {/* Log */}
              {aiLog.length > 0 && (
                <div style={{ background: T.terminal, borderRadius: 6, padding: 10, maxHeight: 120, overflowY: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", fontWeight: 700 }}>Logg</span>
                    <button onClick={() => setAiLog([])} style={{ ...S.btnSmall(T.textDim), padding: "2px 6px" }}>Rensa</button>
                  </div>
                  {aiLog.map((entry, i) => (
                    <div key={i} style={{
                      fontSize: 10, fontFamily: fontMono, marginBottom: 2,
                      color: entry.type === "error" ? T.red : entry.type === "success" ? T.green : T.textMuted,
                    }}>
                      <span style={{ color: T.textDim }}>[{entry.time}]</span> {entry.msg}
                    </div>
                  ))}
                </div>
              )}

              {/* Info box */}
              <div style={{
                marginTop: 12, padding: "10px 14px", background: `${T.purple}08`,
                border: `1px solid ${T.purple}20`, borderRadius: 6,
              }}>
                <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.5 }}>
                  <strong style={{ color: T.purple }}>Hur det fungerar:</strong> AI:n genererar en komplett lab med topologi, enheter, interfaces,
                  task-beskrivningar, lösningskommandon (hints) och check-patterns för automatisk verifiering.
                  Resultatet laddas direkt in i editorn där du kan finjustera innan du sparar.
                  <br /><br />
                  <strong style={{ color: T.purple }}>API-nycklar:</strong> Nycklar lagras lokalt i din webbläsare och skickas direkt till respektive API.
                  Hämta din nyckel från{" "}
                  <span style={{ color: T.accent }}>console.anthropic.com</span>,{" "}
                  <span style={{ color: T.accent }}>platform.openai.com</span> eller{" "}
                  <span style={{ color: T.accent }}>aistudio.google.com</span>.
                </div>
              </div>
            </div>
          )}

          {showJson ? (
            /* ─── JSON VIEW ─── */
            <div style={S.card}>
              <div style={{ ...S.section, justifyContent: "space-between" }}>
                <span>📄 Genererad JSON</span>
                <button style={S.btn(copied ? T.green : T.accent)} onClick={handleCopyJson}>
                  {copied ? "✅ Kopierad!" : "📋 Kopiera"}
                </button>
              </div>
              {issues.length > 0 && (
                <div style={{ background: `${T.red}15`, border: `1px solid ${T.red}40`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 4 }}>⚠️ Varningar:</div>
                  {issues.map((iss, i) => <div key={i} style={{ fontSize: 11, color: T.red, opacity: 0.8 }}>• {iss}</div>)}
                </div>
              )}
              <textarea ref={jsonRef} value={getOutputJson()} readOnly
                style={{ ...S.textarea, minHeight: 500, fontSize: 11, lineHeight: 1.4 }} />
              <div style={{ marginTop: 12, fontSize: 11, color: T.textDim }}>
                💡 Kopiera och klistra in i <code style={{ color: T.accent }}>LABS</code>-arrayen i <code style={{ color: T.accent }}>CiscoLabSimulator.jsx</code>
              </div>
            </div>
          ) : (
            /* ─── EDITOR FORM ─── */
            <>
              {/* Lab Metadata */}
              <div style={S.card}>
                <div style={S.section}>⚙️ Lab Info</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px", gap: 12 }}>
                  <div>
                    <label style={S.label}>Titel</label>
                    <FInput inputStyle={S.input} focusStyle={S.inputFocus} value={lab.title} onChange={e => updateLab("title", e.target.value)} placeholder="t.ex. Static Routes & OSPF" />
                  </div>
                  <div>
                    <label style={S.label}>Källa / Referens</label>
                    <FInput inputStyle={S.input} focusStyle={S.inputFocus} value={lab.source} onChange={e => updateLab("source", e.target.value)} placeholder="t.ex. Q214s" />
                  </div>
                  <div>
                    <label style={S.label}>Lab ID</label>
                    <FInput inputStyle={S.input} focusStyle={S.inputFocus} type="number" value={labId} onChange={e => setLabId(parseInt(e.target.value) || 1)} style={{ textAlign: "center" }} />
                  </div>
                  <div>
                    <label style={S.label}>Kategori</label>
                    <select value={lab.category} onChange={e => updateLab("category", e.target.value)} style={S.select}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Topology */}
              <div style={S.card}>
                <div style={S.section}>🗺️ Topologi</div>
                <label style={S.label}>ASCII-topologi (visas i simulatorn)</label>
                <FTextarea inputStyle={S.textarea} focusStyle={S.inputFocus} value={lab.topology} onChange={e => updateLab("topology", e.target.value)}
                  placeholder="R1(E0/0) ── 10.0.0.0/24 ── (E0/0)R2" style={{ minHeight: 80, whiteSpace: "pre" }} />
              </div>

              {/* Devices */}
              <div style={S.card}>
                <div style={{ ...S.section, justifyContent: "space-between" }}>
                  <span>🖥️ Enheter ({lab.devices.length})</span>
                  <button style={S.btnSmall(T.green)} onClick={addDevice}>+ Lägg till enhet</button>
                </div>

                {lab.devices.map((dev, di) => (
                  <div key={di} style={{ background: T.cardAlt, border: `1px solid ${T.borderLight}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 18 }}>{dev.type === "switch" ? "🔀" : "🛣️"}</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 8, flex: 1 }}>
                        <div>
                          <label style={S.label}>Namn</label>
                          <FInput inputStyle={S.input} focusStyle={S.inputFocus} value={dev.name} onChange={e => updateDevice(di, "name", e.target.value)} />
                        </div>
                        <div>
                          <label style={S.label}>Hostname</label>
                          <FInput inputStyle={S.input} focusStyle={S.inputFocus} value={dev.hostname} onChange={e => updateDevice(di, "hostname", e.target.value)} />
                        </div>
                        <div>
                          <label style={S.label}>Typ</label>
                          <select value={dev.type} onChange={e => updateDevice(di, "type", e.target.value)} style={{ ...S.select, width: "100%" }}>
                            {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <button style={S.btnSmall(T.red)} onClick={() => removeDevice(di)} title="Ta bort enhet">✕</button>
                    </div>

                    {/* Interfaces */}
                    <div style={{ marginLeft: 30 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim, textTransform: "uppercase" }}>Interface</span>
                        <button style={S.btnSmall(T.accent)} onClick={() => addInterface(di)}>+ Interface</button>
                      </div>
                      {dev.interfaces.map((iface, ii) => (
                        <div key={ii} style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px 28px", gap: 6, marginBottom: 4, alignItems: "center" }}>
                          <select value={iface.name} onChange={e => updateInterface(di, ii, "name", e.target.value)}
                            style={{ ...S.select, fontSize: 11, padding: "5px 8px" }}>
                            {COMMON_INTERFACES.map(ci => <option key={ci} value={ci}>{ci}</option>)}
                            {!COMMON_INTERFACES.includes(iface.name) && <option value={iface.name}>{iface.name}</option>}
                          </select>
                          <FInput inputStyle={S.input} focusStyle={S.inputFocus} value={iface.ip} onChange={e => updateInterface(di, ii, "ip", e.target.value)}
                            placeholder="IP-adress (t.ex. 10.0.0.1/24)" style={{ fontSize: 11, padding: "5px 8px" }} />
                          <select value={iface.status} onChange={e => updateInterface(di, ii, "status", e.target.value)}
                            style={{ ...S.select, fontSize: 10, padding: "5px 6px" }}>
                            <option value="up">up</option>
                            <option value="down">down</option>
                          </select>
                          <button style={{ ...S.btnSmall(T.red), padding: "3px 6px" }} onClick={() => removeInterface(di, ii)}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tasks */}
              <div style={S.card}>
                <div style={{ ...S.section, justifyContent: "space-between" }}>
                  <span>✅ Tasks ({lab.tasks.length})</span>
                  <button style={S.btnSmall(T.green)} onClick={addTask}>+ Lägg till task</button>
                </div>

                {lab.tasks.map((task, ti) => (
                  <div key={ti} style={{ background: T.cardAlt, border: `1px solid ${T.borderLight}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={S.badge(T.accent)}>Task {task.id}</span>
                      <select value={task.device} onChange={e => updateTask(ti, "device", e.target.value)} style={{ ...S.select, fontSize: 11, padding: "4px 8px" }}>
                        {deviceNames.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button style={S.btnSmall(T.textMuted)} onClick={() => moveTask(ti, -1)} disabled={ti === 0}>↑</button>
                        <button style={S.btnSmall(T.textMuted)} onClick={() => moveTask(ti, 1)} disabled={ti === lab.tasks.length - 1}>↓</button>
                        <button style={S.btnSmall(T.red)} onClick={() => removeTask(ti)}>✕</button>
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={S.label}>Uppgiftsbeskrivning</label>
                      <FTextarea inputStyle={S.textarea} focusStyle={S.inputFocus} value={task.text} onChange={e => updateTask(ti, "text", e.target.value)}
                        placeholder="Beskriv vad studenten ska göra..." style={{ minHeight: 50 }} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={S.label}>💡 Hint (lösningskommandon)</label>
                        <FTextarea inputStyle={S.textarea} focusStyle={S.inputFocus} value={task.hint} onChange={e => updateTask(ti, "hint", e.target.value)}
                          placeholder={"ip route 192.168.0.0 255.255.255.0 10.10.31.1\nip route 0.0.0.0 0.0.0.0 10.10.13.3"}
                          style={{ minHeight: 70 }} />
                      </div>
                      <div>
                        <label style={S.label}>🔍 Check-pattern (verifiering)</label>
                        <FTextarea inputStyle={S.textarea} focusStyle={S.inputFocus} value={task.checkRaw} onChange={e => updateTask(ti, "checkRaw", e.target.value)}
                          placeholder={"ip route, 192.168.0.0, 255.255.255.0, 10.10.31.1\nswitchport mode trunk"}
                          style={{ minHeight: 70 }} />
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                          En rad per krav. Nyckelord komma-separerade. Alla rader måste matcha.
                        </div>
                      </div>
                    </div>

                    {/* Preview parsed check */}
                    {task.checkRaw.trim() && (
                      <div style={{ marginTop: 8, padding: "8px 10px", background: T.terminal, borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Parsed check:</div>
                        {parseCheckPattern(task.checkRaw).map((kws, ci) => (
                          <div key={ci} style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: T.green, marginRight: 4 }}>✓</span>
                            {kws.map((kw, ki) => <span key={ki} style={S.tag}>{kw}</span>)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Auto-generate check from hint */}
                    {task.hint.trim() && !task.checkRaw.trim() && (
                      <button style={{ ...S.btnSmall(T.orange), marginTop: 8 }}
                        onClick={() => {
                          const lines = task.hint.split("\n").filter(l => {
                            const t = l.trim();
                            return t && !t.startsWith("!") && !t.startsWith("On ") && !t.startsWith("#");
                          });
                          const checkLines = lines.map(l => {
                            const parts = l.trim().split(/\s+/);
                            // For vlan/name lines keep them simple — they match separately
                            if (parts[0] === "vlan" && parts.length === 2) return `vlan ${parts[1]}`;
                            if (parts[0] === "name" && parts.length === 2) return `name, ${parts[1]}`;
                            // For ip route, include all parts as keywords
                            if (parts[0] === "ip" && parts[1] === "route") return parts.join(", ");
                            // For channel-group, include mode
                            if (parts[0] === "channel-group") return parts.join(", ");
                            // For standby (HSRP), include all parts
                            if (parts[0] === "standby") return parts.join(", ");
                            // For switchport, keep first 3-4 meaningful words
                            if (parts[0] === "switchport") return parts.slice(0, 4).join(", ");
                            // Default: first 3 words as keywords
                            return parts.slice(0, 3).join(", ");
                          });
                          updateTask(ti, "checkRaw", checkLines.join("\n"));
                        }}>
                        🪄 Auto-generera check från hint
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Validation Summary */}
              {issues.length > 0 && (
                <div style={{ ...S.card, borderColor: `${T.orange}60` }}>
                  <div style={{ ...S.section, color: T.orange }}>⚠️ Validering</div>
                  {issues.map((iss, i) => (
                    <div key={i} style={{ fontSize: 12, color: T.orange, marginBottom: 4, paddingLeft: 12 }}>• {iss}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── RIGHT SIDEBAR: Quick Preview ─── */}
        <div style={{ width: 280, borderLeft: `1px solid ${T.border}`, padding: 16, background: T.card, flexShrink: 0, overflowY: "auto", maxHeight: "calc(100vh - 60px)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>👁️ Förhandsvisning</div>

          <div style={{ background: T.cardAlt, borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{lab.title || "—"}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={S.badge(T.accent)}>{lab.category}</span>
              <span style={S.badge(T.textMuted)}>ID: {labId}</span>
              {lab.source && <span style={S.badge(T.purple)}>{lab.source}</span>}
            </div>
          </div>

          {/* Devices preview */}
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 6, textTransform: "uppercase" }}>Enheter</div>
          {lab.devices.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: T.terminal, borderRadius: 4, marginBottom: 4, fontSize: 11 }}>
              <span>{d.type === "switch" ? "🔀" : "🛣️"}</span>
              <span style={{ color: T.accent, fontWeight: 600 }}>{d.name}</span>
              <span style={{ color: T.textDim }}>({d.interfaces.length} intf)</span>
            </div>
          ))}

          {/* Tasks preview */}
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 6, marginTop: 12, textTransform: "uppercase" }}>Tasks</div>
          {lab.tasks.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 6, padding: "6px 8px", background: T.terminal, borderRadius: 4, marginBottom: 4, fontSize: 11 }}>
              <span style={S.badge(t.checkRaw.trim() ? T.green : T.red)}>{t.id}</span>
              <span style={{ color: T.textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.text || "—"}
              </span>
              <span style={{ color: T.accent, fontWeight: 600, flexShrink: 0 }}>{t.device}</span>
            </div>
          ))}

          {/* Topology preview */}
          {lab.topology && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 6, marginTop: 12, textTransform: "uppercase" }}>Topologi</div>
              <pre style={{ background: T.terminal, padding: 10, borderRadius: 6, fontSize: 9, fontFamily: fontMono, color: T.textMuted, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 150 }}>
                {lab.topology}
              </pre>
            </>
          )}

          {/* Stats */}
          <div style={{ marginTop: 16, padding: "10px 12px", background: T.accentGlow, borderRadius: 6, border: `1px solid ${T.accent}30` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 6 }}>📊 Stats</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>
              {lab.devices.length} enheter • {lab.tasks.length} tasks • {lab.tasks.filter(t => t.checkRaw.trim()).length} verifierbara
            </div>
            <div style={{ fontSize: 11, color: T.textMuted }}>
              {lab.tasks.reduce((acc, t) => acc + parseCheckPattern(t.checkRaw).length, 0)} check-patterns totalt
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${T.bg}; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.borderLight}; }
        button:hover { filter: brightness(1.2); }
        select { appearance: auto; }
      `}</style>
    </div>
  );
}
