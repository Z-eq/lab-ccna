import { useState, useEffect, useRef, useCallback } from "react";
import { TOPO_IMAGES } from "./topoImages";
import { LABS, LAB_DESCRIPTIONS, CATEGORIES } from "./labData";
import { THEMES } from "./themes";
import { createDeviceState, getPrompt } from "./iosHelpers";
import { processCommand } from "./iosCommands";
import { buildRunningConfig } from "./iosConfig";
import { getTaskResults } from "./taskVerification";
import { isAdmin } from "./main";
import { lookupCmd } from "./iosCmdTree";
import { renderTopologySVG } from "./topoRenderer";

// ─── URL helpers ──────────────────────────────────────────────────────────────
function getLabIdFromUrl() {
  const m = window.location.pathname.match(/^\/lab\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export default function CiscoLabSimulator() {
  const [selectedLab, setSelectedLab] = useState(() => getLabIdFromUrl());
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceStates, setDeviceStates] = useState({});
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [showHint, setShowHint] = useState({});
  const [hintLevel, setHintLevel] = useState({}); // 0=hidden, 1=command families, 2=first cmd masked
  const [completedTasks, setCompletedTasks] = useState({});
  const [sidebarTab, setSidebarTab] = useState("tasks");
  const [sidebarWidth, setSidebarWidth] = useState(400);

  // ─── CUSTOM LABS from Lab Editor (localStorage) ───
  const [customLabs, setCustomLabs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ccna_editor_labs") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    const reload = () => {
      try { setCustomLabs(JSON.parse(localStorage.getItem("ccna_editor_labs") || "[]")); } catch {}
    };
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => { window.removeEventListener("focus", reload); window.removeEventListener("storage", reload); };
  }, []);
  const allLabs = [...LABS, ...customLabs.map(cl => ({ ...cl, _custom: true }))];
  const deleteCustomLab = (id) => {
    const updated = customLabs.filter(l => l.id !== id);
    setCustomLabs(updated);
    try { localStorage.setItem("ccna_editor_labs", JSON.stringify(updated)); } catch {}
  };

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(400);

  // Resizable sidebar drag handlers
  const handleDragStart = useCallback((e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const newW = Math.max(250, Math.min(800, dragStartWidth.current + delta));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);
  const [filterCategory, setFilterCategory] = useState("All");
  const [showLabList, setShowLabList] = useState(() => !getLabIdFromUrl());
  const [darkMode, setDarkMode] = useState(true);

  // ─── URL-based navigation ──────────────────────────────────────────────────
  const navigateToLab = useCallback((labId) => {
    window.history.pushState({ labId }, "", `/lab/${labId}`);
    setSelectedLab(labId);
    setShowLabList(false);
  }, []);

  const navigateHome = useCallback(() => {
    window.history.pushState(null, "", "/");
    setSelectedLab(null);
    setShowLabList(true);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const labId = getLabIdFromUrl();
      if (labId) {
        setSelectedLab(labId);
        setShowLabList(false);
      } else {
        setSelectedLab(null);
        setShowLabList(true);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [toasts, setToasts] = useState([]);
  const [showDesc, setShowDesc] = useState(true);
  const [checkResults, setCheckResults] = useState(null);
  const [checkAnimation, setCheckAnimation] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState({});
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  // ─── Feature: Undo stack (per device) ───
  const undoStack = useRef({});
  const pushUndo = useCallback((deviceName, state) => {
    if (!undoStack.current[deviceName]) undoStack.current[deviceName] = [];
    const stack = undoStack.current[deviceName];
    if (stack.length > 50) stack.shift();
    stack.push(JSON.stringify(state));
  }, []);
  const popUndo = useCallback((deviceName) => {
    const stack = undoStack.current[deviceName];
    if (!stack || stack.length === 0) return null;
    return JSON.parse(stack.pop());
  }, []);

  // ─── Feature: Persistent lab state ───
  const saveLabState = useCallback((labId, states) => {
    try { sessionStorage.setItem(`ccna_lab_state_${labId}`, JSON.stringify(states)); } catch {}
  }, []);
  const loadLabState = useCallback((labId) => {
    try {
      const saved = sessionStorage.getItem(`ccna_lab_state_${labId}`);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  }, []);
  // Also persist completedTasks
  useEffect(() => {
    try { localStorage.setItem("ccna_completed_tasks", JSON.stringify(completedTasks)); } catch {}
  }, [completedTasks]);
  // Load completed tasks on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ccna_completed_tasks") || "{}");
      if (Object.keys(saved).length > 0) setCompletedTasks(saved);
    } catch {}
  }, []);

  const T = darkMode ? THEMES.dark : THEMES.light;
  const lab = selectedLab ? allLabs.find(l => l.id === selectedLab) : null;

  useEffect(() => {
    if (lab) {
      // Try restoring saved state first
      const savedState = loadLabState(lab.id);
      if (savedState) {
        setDeviceStates(savedState);
        setTerminalHistory([{ type: "system", text: `\n  ═══════════════════════════════════════════════\n  Cisco IOS Simulator — Lab ${lab.id}: ${lab.title}\n  ═══════════════════════════════════════════════\n\n  ⟳ Session restored. Your previous config is intact.\n  Type 'show running-config' to review.\n` }]);
      } else {
        const states = {};
        lab.devices.forEach(d => { states[d.name] = createDeviceState(d); });
        setDeviceStates(states);
        setTerminalHistory([{ type: "system", text: `\n  ═══════════════════════════════════════════════\n  Cisco IOS Simulator — Lab ${lab.id}: ${lab.title}\n  ═══════════════════════════════════════════════\n\n  Type 'enable' then 'configure terminal' to begin.\n  Type '?' for help. Use 'do <cmd>' from config mode.\n` }]);
      }
      setSelectedDevice(lab.devices[0]?.name);
      setShowHint({});
      setHintLevel({});
      setShowDesc(true);
      setCheckResults(null);
      undoStack.current = {};
      deviceHistories.current = {};
    }
  }, [selectedLab]);

  // Auto-save lab state on changes
  useEffect(() => {
    if (lab && Object.keys(deviceStates).length > 0) {
      saveLabState(lab.id, deviceStates);
    }
  }, [deviceStates, lab]);

  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [terminalHistory]);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, [selectedDevice, terminalHistory]);
  // Auto-save terminal history to per-device store
  useEffect(() => {
    if (selectedDevice && terminalHistory.length > 0) {
      deviceHistories.current[selectedDevice] = terminalHistory;
    }
  }, [terminalHistory, selectedDevice]);

  const currentState = selectedDevice ? deviceStates[selectedDevice] : null;

  
  // Remove toasts after 4s
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts(prev => prev.slice(1)), 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // ─── Per-device terminal history ───
  const deviceHistories = useRef({});
  const saveDeviceHistory = useCallback((device, history) => {
    if (device) deviceHistories.current[device] = history;
  }, []);

  const switchDevice = useCallback((deviceName) => {
    // Save current device history
    if (selectedDevice) {
      deviceHistories.current[selectedDevice] = terminalHistory;
    }
    setSelectedDevice(deviceName);
    // Restore target device history or start fresh
    const saved = deviceHistories.current[deviceName];
    if (saved && saved.length > 0) {
      setTerminalHistory(saved);
    } else {
      setTerminalHistory([{ type: "system", text: `\n--- ${deviceName} console ---\n` }]);
    }
    setCurrentInput("");
    setCmdHistoryIdx(-1);
  }, [selectedDevice, terminalHistory]);

  const handleCheckWork = useCallback(() => {
    if (!lab) return;
    setCheckAnimation(true);
    setTimeout(() => {
      const results = getTaskResults(lab, deviceStates);
      setCheckResults(results);
      // Update completedTasks for tasks that pass
      const newCompleted = { ...completedTasks };
      let newToasts = [];
      lab.tasks.forEach(task => {
        const key = `${lab.id}-${task.id}`;
        if (results[task.id] && !newCompleted[key]) {
          newCompleted[key] = true;
          newToasts.push({ id: Date.now() + task.id, text: `Task ${task.id} passed!` });
        }
      });
      setCompletedTasks(newCompleted);
      if (newToasts.length > 0) setToasts(prev => [...prev, ...newToasts]);
      setCheckAnimation(false);
    }, 600);
  }, [lab, deviceStates, completedTasks]);


  const handleCommand = useCallback((cmdOverride) => {
    const cmd = cmdOverride || currentInput;
    if (!currentState) return;
    const prompt = getPrompt(currentState);

    // ─── ? inline help ────────────────────────────────────────────────────
    if (cmd.trimEnd().endsWith("?")) {
      const partial = cmd.slice(0, -1);
      const { matches } = lookupCmd(partial, currentState.mode);
      const formatted = matches.length > 0
        ? matches.map(m => `  ${m.word.padEnd(30)} ${m.desc}`).join("\n")
        : "% Unrecognized command";
      setTerminalHistory(prev => [
        ...prev,
        { type: "input", text: `${prompt} ${cmd}` },
        { type: "output", text: formatted },
      ]);
      setCurrentInput(partial);
      return;
    }

    // Empty enter: just show prompt line (like real IOS scrolling)
    if (!cmd.trim()) {
      setTerminalHistory(prev => [...prev, { type: "input", text: `${prompt} ` }]);
      setCurrentInput("");
      return;
    }

    // Feature: Multiline paste — split and process each line
    const lines = cmd.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      let runState = JSON.parse(JSON.stringify(currentState));
      const histEntries = [];
      for (const line of lines) {
        const p = getPrompt(runState);
        pushUndo(selectedDevice, runState);
        const { output, state: newState } = processCommand(line, JSON.parse(JSON.stringify(runState)));
        histEntries.push({ type: "input", text: `${p} ${line}` });
        if (output) histEntries.push({ type: "output", text: output });
        newState.commandHistory = [...runState.commandHistory, line];
        runState = newState;
      }
      setTerminalHistory(prev => [...prev, ...histEntries]);
      setDeviceStates(prev => ({ ...prev, [selectedDevice]: runState }));
      setCurrentInput("");
      setCmdHistoryIdx(-1);
      return;
    }

    // Single command
    pushUndo(selectedDevice, currentState);
    const { output, state: newState } = processCommand(cmd, JSON.parse(JSON.stringify(currentState)));
    newState.commandHistory = [...(currentState.commandHistory || []), cmd];
    setTerminalHistory(prev => [
      ...prev,
      { type: "input", text: `${prompt} ${cmd}` },
      ...(output ? [{ type: "output", text: output }] : [])
    ]);
    setDeviceStates(prev => ({ ...prev, [selectedDevice]: newState }));
    setCurrentInput("");
    setCmdHistoryIdx(-1);
  }, [currentState, currentInput, selectedDevice, pushUndo]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") { handleCommand(); }
    // Feature: Ctrl+Z undo
    else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const prev = popUndo(selectedDevice);
      if (prev) {
        setDeviceStates(p => ({ ...p, [selectedDevice]: prev }));
        setTerminalHistory(h => [...h, { type: "system", text: "% Undo: reverted last command" }]);
      } else {
        setTerminalHistory(h => [...h, { type: "system", text: "% Nothing to undo" }]);
      }
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentState?.commandHistory.length > 0) {
        const newIdx = cmdHistoryIdx < currentState.commandHistory.length - 1 ? cmdHistoryIdx + 1 : cmdHistoryIdx;
        setCmdHistoryIdx(newIdx);
        setCurrentInput(currentState.commandHistory[currentState.commandHistory.length - 1 - newIdx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdHistoryIdx > 0) { setCmdHistoryIdx(cmdHistoryIdx - 1); setCurrentInput(currentState.commandHistory[currentState.commandHistory.length - cmdHistoryIdx] || ""); }
      else { setCmdHistoryIdx(-1); setCurrentInput(""); }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const input = currentInput;
      const mode = currentState?.mode || "user";

      // IOS tab rules: 3 chars on first word, 1 char on subsequent words
      const inputWords = input.trimEnd().split(/\s+/).filter(Boolean);
      const endsWithSpace = input.endsWith(" ");
      const currentWord = endsWithSpace ? "" : (inputWords[inputWords.length - 1] || "");
      const isFirstWord = inputWords.length <= 1 && !endsWithSpace;
      if (currentWord.length < (isFirstWord ? 3 : 1)) return;

      const { matches, partial } = lookupCmd(input, mode);
      if (matches.length === 0) return;

      // Filter out <cr> and <value> placeholders for completion
      const keywords = matches.filter(m => !m.word.startsWith("<") && m.word !== "<cr>");

      if (keywords.length === 1 && partial !== "") {
        // Exactly one keyword — complete it
        const base = input.slice(0, input.length - partial.length);
        setCurrentInput(base + keywords[0].word + " ");
      } else if (keywords.length > 1 && partial !== "") {
        // Multiple keywords — show and complete common prefix
        const prompt = getPrompt(currentState);
        const maxLen = Math.max(...matches.map(m => m.word.length));
        const formatted = matches.map(m => `  ${m.word.padEnd(maxLen + 2)} ${m.desc}`).join("\n");
        setTerminalHistory(h => [
          ...h,
          { type: "input", text: `${prompt} ${input}` },
          { type: "output", text: formatted },
        ]);
        const commonPfx = keywords.reduce((pfx, m) => {
          const s = m.word.toLowerCase();
          let i = 0;
          while (i < pfx.length && i < s.length && pfx[i] === s[i]) i++;
          return pfx.slice(0, i);
        }, keywords[0].word.toLowerCase());
        if (commonPfx.length > partial.length) {
          const base = input.slice(0, input.length - partial.length);
          setCurrentInput(base + commonPfx);
        }
      } else if (endsWithSpace && matches.length > 0) {
        // Show all options after a space
        const prompt = getPrompt(currentState);
        const maxLen = Math.max(...matches.map(m => m.word.length));
        const formatted = matches.map(m => `  ${m.word.padEnd(maxLen + 2)} ${m.desc}`).join("\n");
        setTerminalHistory(h => [
          ...h,
          { type: "input", text: `${prompt} ${input}` },
          { type: "output", text: formatted },
        ]);
      }
    }
  }, [handleCommand, cmdHistoryIdx, currentState, currentInput]);

  // ─── Progressive hint helpers ─────────────────────────────────────────────
  const getHintLevel1 = (task) => {
    if (!task.check || task.check.length === 0) return "No hint available.";
    return `💡 Commands needed:\n${task.check.map(kws => `• ${kws[0]}`).join("\n")}`;
  };

  const getHintLevel2 = (task) => {
    if (!task.hint) return "No hint available.";
    const lines = task.hint.split("\n").filter(l => l.trim() && !l.trim().startsWith("!") && !l.trim().startsWith("On "));
    const firstLine = lines[0] || "";
    const words = firstLine.trim().split(/\s+/);
    const masked = words.length > 2
      ? words.slice(0, 2).join(" ") + " " + words.slice(2).map(() => "???").join(" ")
      : firstLine;
    return `💡 First command:\n${masked}${lines.length > 1 ? `\n(+ ${lines.length - 1} more)` : ""}`;
  };

  const cycleHint = (key) => {
    setHintLevel(prev => {
      const cur = prev[key] || 0;
      return { ...prev, [key]: cur >= 2 ? 0 : cur + 1 };
    });
  };

  const toggleTaskComplete = (labId, taskId) => {
    setCompletedTasks(prev => { const key = `${labId}-${taskId}`; return { ...prev, [key]: !prev[key] }; });
  };

  const getLabProgress = (labId) => {
    const labObj = allLabs.find(l => l.id === labId);
    if (!labObj) return 0;
    const done = labObj.tasks.filter(t => completedTasks[`${labId}-${t.id}`]).length;
    return Math.round((done / labObj.tasks.length) * 100);
  };

  const filteredLabs = filterCategory === "All" ? allLabs :
    filterCategory === "Custom" ? allLabs.filter(l => l._custom) :
    allLabs.filter(l => l.category === filterCategory && !l._custom);

  const hasCustomLabs = customLabs.length > 0;
  const allCategories = hasCustomLabs ? [...CATEGORIES, "Custom"] : CATEGORIES;

  // Theme Toggle Button
  const ThemeToggle = () => (
    <button onClick={() => setDarkMode(p => !p)}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: `1px solid ${T.border}`, background: T.card, color: T.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.2s" }}
      title={darkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}>
      <span style={{ fontSize: 16 }}>{darkMode ? "☀️" : "🌙"}</span>
      <span>{darkMode ? "Light" : "Dark"}</span>
    </button>
  );

  // CSS keyframes injected once
  const styleTag = `
    @keyframes taskPulse { 0% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(0, 212, 170, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    @keyframes checkBounce { 0% { transform: scale(0); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
  `;

  // ─── LAB LIST VIEW ───
  if (showLabList || !selectedLab) {
    return (
      <div style={{ minHeight: "100vh", overflowY: "auto", background: T.bg, color: T.text, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", transition: "background 0.3s, color 0.3s" }}>
        <style>{styleTag}</style>
        <div style={{ background: T.headerGrad, borderBottom: `1px solid ${T.borderAccent}`, padding: "24px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", maxWidth: 1400, margin: "0 auto" }}>
            {/* Left: spacer to balance right side */}
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, color: T.textMuted }}>Completed:</span>
                <span style={{ fontSize: 14, color: T.accent, fontWeight: 700 }}>{Object.values(completedTasks).filter(Boolean).length}/{allLabs.reduce((a, l) => a + l.tasks.length, 0)}</span>
              </div>
            </div>
            {/* Center: logo + title */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 150, height: 56, background: `linear-gradient(135deg, ${T.accent}, ${T.accentAlt})`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: darkMode ? "#0a0e17" : "#fff", boxShadow: `0 0 20px ${T.accent}40` }}>Lab</div>
              <div style={{ textAlign: "center" }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.accent, letterSpacing: "-0.5px" }}>CCNA 200-301 Lab Simulator</h1>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textMuted }}>{allLabs.length} labs{hasCustomLabs ? ` (${customLabs.length} custom)` : ""} • Cisco IOS CLI • Auto-verify</p>
              </div>
            </div>
            {/* Right: theme toggle */}
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 32px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["All", ...allCategories].map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)}
                style={{ padding: "6px 16px", borderRadius: 20, border: filterCategory === cat ? `1px solid ${cat === "Custom" ? T.accentAlt : T.accent}` : `1px solid ${T.border}`, background: filterCategory === cat ? (cat === "Custom" ? T.accentAlt + "20" : T.accentBg) : "transparent", color: filterCategory === cat ? (cat === "Custom" ? T.accentAlt : T.accent) : T.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.2s" }}>
                {cat === "Custom" ? `⭐ Custom (${customLabs.length})` : cat}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 32px 48px" }}>
          {/* Built-in Labs */}
          {filterCategory !== "Custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {filteredLabs.filter(l => !l._custom).map(l => {
                const progress = getLabProgress(l.id);
                return (
                  <div key={l.id} onClick={() => navigateToLab(l.id)}
                    style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, cursor: "pointer", transition: "all 0.25s", position: "relative", overflow: "hidden" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "55"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.border }}>
                      <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? T.accent : T.accentAlt, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: T.accentAlt, background: T.catBg, padding: "2px 8px", borderRadius: 6 }}>{l.category}</span>
                      <span style={{ fontSize: 11, color: T.textMuted }}>Lab {l.id}</span>
                    </div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{l.title}</h3>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {l.devices.map(d => (
                        <span key={d.name} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: d.type === "router" ? T.routerBg : T.switchBg, color: d.type === "router" ? T.routerText : T.switchText, border: `1px solid ${d.type === "router" ? T.routerBorder : T.switchBorder}` }}>
                          {d.type === "router" ? "⟁" : "⊞"} {d.name}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{l.tasks.length} tasks</span>
                      <span style={{ fontSize: 11, color: progress === 100 ? T.accent : T.textMuted }}>{progress === 100 ? "✓ Complete" : `${progress}%`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom Labs Section */}
          {(filterCategory === "All" || filterCategory === "Custom") && customLabs.length > 0 && (
            <>
              {filterCategory === "All" && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "32px 0 16px", padding: "0 4px" }}>
                  <span style={{ fontSize: 18 }}>⭐</span>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.accentAlt }}>Egna Labbar</h2>
                  <span style={{ fontSize: 11, color: T.textMuted, background: T.catBg, padding: "2px 10px", borderRadius: 10 }}>{customLabs.length}</span>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {filteredLabs.filter(l => l._custom).map(l => {
                  const progress = getLabProgress(l.id);
                  return (
                    <div key={`custom-${l.id}`}
                      style={{ background: T.card, border: `1px solid ${T.accentAlt}40`, borderRadius: 12, padding: 20, cursor: "pointer", transition: "all 0.25s", position: "relative", overflow: "hidden" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentAlt + "80"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.accentAlt + "40"; e.currentTarget.style.transform = "translateY(0)"; }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.accentAlt}, ${T.accent})` }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? T.accent : T.accentAlt, transition: "width 0.3s" }} />
                      </div>
                      <div onClick={() => navigateToLab(l.id)} style={{ cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: T.accentAlt, background: T.catBg, padding: "2px 8px", borderRadius: 6 }}>{l.category}</span>
                            <span style={{ fontSize: 9, color: T.accentAlt, background: T.accentAlt + "15", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>⭐ CUSTOM</span>
                          </div>
                          <span style={{ fontSize: 11, color: T.textMuted }}>#{l.id}</span>
                        </div>
                        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{l.title || "Untitled Lab"}</h3>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                          {l.devices.map(d => (
                            <span key={d.name} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: d.type === "router" ? T.routerBg : T.switchBg, color: d.type === "router" ? T.routerText : T.switchText, border: `1px solid ${d.type === "router" ? T.routerBorder : T.switchBorder}` }}>
                              {d.type === "router" ? "⟁" : "⊞"} {d.name}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: T.textMuted }}>{l.tasks.length} tasks</span>
                          <span style={{ fontSize: 11, color: progress === 100 ? T.accent : T.textMuted }}>{progress === 100 ? "✓ Complete" : `${progress}%`}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                        <button onClick={(e) => { e.stopPropagation(); deleteCustomLab(l.id); }}
                          style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${T.warn}40`, background: "transparent", color: T.warn, cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: 600 }}>
                          🗑️ Delete
                        </button>
                        {l.source && <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto", alignSelf: "center" }}>Source: {l.source}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Empty state for custom labs */}
          {filterCategory === "Custom" && customLabs.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <span style={{ fontSize: 48, display: "block", marginBottom: 16 }}>🔧</span>
              <h3 style={{ color: T.textMuted, fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Inga egna labbar ännu</h3>
              <p style={{ color: T.textDim, fontSize: 12, margin: 0 }}>Skapa labbar i Lab Editor-fliken — de dyker upp här automatiskt!</p>
            </div>
          )}
        </div>
        {/* ─── FOOTER ─── */}
        <div style={{ borderTop: `1px solid ${T.borderAccent}`, padding: "16px 32px", background: T.headerGrad }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: T.textDim }}>
              © {new Date().getFullYear()} Z-eq — All rights reserved
            </span>
                       <a
              href="https://github.com/Z-eq/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textMuted, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.color = T.accent}
              onMouseLeave={e => e.currentTarget.style.color = T.textMuted}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/>
              </svg>
              github.com/Z-eq
            </a>
          </div>
           </div>
        </div>
      </div>
    );
  }

  // ─── LAB SIMULATOR VIEW ───
  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", overflow: "hidden", transition: "background 0.3s, color 0.3s" }}>
      <style>{styleTag}</style>

      {/* Toast notifications */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((toast, i) => (
          <div key={toast.id}
            style={{ background: T.successBg, border: `1px solid ${T.successBorder}`, borderRadius: 10, padding: "12px 16px", color: T.successText, fontSize: 12, fontFamily: "inherit", maxWidth: 380, animation: "slideIn 0.3s ease-out", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20, animation: "checkBounce 0.5s ease-out" }}>✅</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Left Sidebar - Resizable */}
      <div style={{ width: sidebarWidth, minWidth: 250, maxWidth: 800, background: T.bgAlt, borderRight: "none", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, background: T.card }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <button onClick={navigateHome} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>← Labs</button>
            <span style={{ fontSize: 11, color: T.accentAlt, background: T.catBg, padding: "2px 8px", borderRadius: 6 }}>{lab.category}</span>
            <button onClick={() => {
              if (!confirm("Reset lab? All config will be lost.")) return;
              const states = {};
              lab.devices.forEach(d => { states[d.name] = createDeviceState(d); });
              setDeviceStates(states);
              setTerminalHistory([{ type: "system", text: `\n  ⟳ Lab reset. All config cleared.\n  Type 'enable' then 'configure terminal' to begin.\n` }]);
              deviceHistories.current = {};
              setCheckResults(null);
              undoStack.current = {};
              try { sessionStorage.removeItem(`ccna_lab_state_${lab.id}`); } catch {}
              // Clear completed tasks for this lab
              const newCompleted = { ...completedTasks };
              lab.tasks.forEach(t => { delete newCompleted[`${lab.id}-${t.id}`]; });
              setCompletedTasks(newCompleted);
            }} style={{ background: "none", border: `1px solid ${T.warn}50`, color: T.warn, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>⟳ Reset</button>
            <div style={{ marginLeft: "auto" }}><ThemeToggle /></div>
          </div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.accent }}>Lab {lab.id}: {lab.title}</h2>
          {currentState?._startupSaved && <div style={{ fontSize: 10, color: T.accent, marginTop: 4 }}>💾 Startup-config saved</div>}
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${getLabProgress(lab.id)}%`, background: T.accent, borderRadius: 2, transition: "width 0.5s ease-out" }} />
            </div>
            <span style={{ fontSize: 11, color: getLabProgress(lab.id) === 100 ? T.accent : T.textMuted, fontWeight: getLabProgress(lab.id) === 100 ? 700 : 400 }}>
              {getLabProgress(lab.id) === 100 ? "✓ DONE" : `${getLabProgress(lab.id)}%`}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
          {["tasks", "topology", "config"].map(tab => (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              style={{ flex: 1, padding: "10px 8px", background: sidebarTab === tab ? T.card : "transparent", border: "none", borderBottom: sidebarTab === tab ? `2px solid ${T.accent}` : "2px solid transparent", color: sidebarTab === tab ? T.accent : T.textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1 }}>
              {tab}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {sidebarTab === "tasks" && (
            <div>
              {/* Check My Work Button */}
              <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={handleCheckWork}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `2px solid ${T.accent}`, background: checkAnimation ? T.accent : "transparent", color: checkAnimation ? (darkMode ? "#0a0e17" : "#fff") : T.accent, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", transition: "all 0.3s", letterSpacing: 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {checkAnimation ? "⏳ Checking..." : "🔍 Check My Work"}
                </button>
                {checkResults && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: Object.values(checkResults).every(Boolean) ? T.accent : T.warn }}>
                    {Object.values(checkResults).filter(Boolean).length}/{Object.values(checkResults).length}
                  </span>
                )}
              </div>
              {checkResults && (
                <div style={{ marginBottom: 12, background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Verification Results</div>
                  {lab.tasks.map((task) => {
                    const passed = checkResults[task.id];
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                        <span style={{ fontSize: 16, minWidth: 20, textAlign: "center" }}>{passed ? "✅" : "❌"}</span>
                        <span style={{ color: passed ? T.successText : T.warn }}>Task {task.id}: {task.device}</span>
                        {!passed && <span style={{ fontSize: 10, color: T.textMuted, marginLeft: "auto" }}>needs work</span>}
                      </div>
                    );
                  })}
                  {Object.values(checkResults).every(Boolean) && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: T.successBg, borderRadius: 6, border: `1px solid ${T.successBorder}`, textAlign: "center", fontSize: 13, fontWeight: 700, color: T.successText }}>
                      🎉 All tasks complete! Lab passed!
                    </div>
                  )}
                </div>
              )}

              {/* Lab Instructions */}
              {LAB_DESCRIPTIONS[lab.id] && (
                <div style={{ marginBottom: 16, background: T.card, borderRadius: 8, border: `1px solid ${T.accentAlt}33`, overflow: "hidden" }}>
                  <button onClick={() => setShowDesc(p => !p)}
                    style={{ width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", color: T.text }}>
                    <span style={{ fontSize: 14 }}>📋</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.accentAlt }}>Lab Instructions</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.textMuted }}>{showDesc ? "▲ Hide" : "▼ Show"}</span>
                  </button>
                  {showDesc && (
                    <div style={{ padding: "0 12px 12px" }}>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                        {LAB_DESCRIPTIONS[lab.id]}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {lab.tasks.map((task, idx) => {
                const key = `${lab.id}-${task.id}`;
                const isComplete = completedTasks[key];
                const checkPassed = checkResults ? checkResults[task.id] : null;
                const isRecent = recentlyCompleted[key];
                const hintVisible = showHint[key];
                return (
                  <div key={task.id} style={{
                    marginBottom: 12, background: isComplete ? T.successBg : T.card, borderRadius: 8,
                    border: `1px solid ${checkPassed === true ? T.successBorder : checkPassed === false ? '#ef4444' : isComplete ? T.successBorder : T.border}`,
                    overflow: "hidden", transition: "all 0.4s ease-out",
                    animation: isRecent ? "taskPulse 1s ease-out 2" : "none",
                  }}>
                    <div style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{
                        width: 22, height: 22, minWidth: 22, borderRadius: 6,
                        border: `2px solid ${isComplete ? T.successBorder : T.textMuted}`,
                        background: isComplete ? T.successBorder : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginTop: 1, transition: "all 0.3s",
                        cursor: "pointer",
                      }} onClick={() => toggleTaskComplete(lab.id, task.id)}>
                        {isComplete && (
                          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, animation: isRecent ? "checkBounce 0.5s ease-out" : "none" }}>✓</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: T.accentAlt }}>Task {idx + 1}</span>
                          <span style={{ color: T.textMuted }}>•</span>
                          <span style={{ color: T.switchText }}>{task.device}</span>
                          {checkPassed === true && <span style={{ color: T.successText, fontSize: 10, fontWeight: 600, background: T.successBg, padding: "1px 6px", borderRadius: 4, border: `1px solid ${T.successBorder}` }}>PASS ✓</span>}
                          {checkPassed === false && <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 600, background: darkMode ? "#1c0a0a" : "#fef2f2", padding: "1px 6px", borderRadius: 4, border: "1px solid #ef4444" }}>FAIL ✗</span>}
                        </div>
                        <div style={{ fontSize: 12, color: isComplete ? T.textMuted : T.text, lineHeight: 1.4, textDecoration: isComplete ? "line-through" : "none" }}>{task.text}</div>
                      </div>
                    </div>
                    <div style={{ padding: "0 12px 8px", display: "flex", gap: 6 }}>
                      <button onClick={() => switchDevice(task.device)}
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg, color: T.switchText, cursor: "pointer", fontFamily: "inherit" }}>
                        Open {task.device}
                      </button>
                      <button onClick={() => cycleHint(key)}
                        style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 4,
                          border: `1px solid ${(hintLevel[key] || 0) > 0 ? T.accentAlt + "80" : T.border}`,
                          background: (hintLevel[key] || 0) > 0 ? T.accentAlt + "15" : T.bg,
                          color: (hintLevel[key] || 0) > 0 ? T.accentAlt : T.textMuted,
                          cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                        }}>
                        {(hintLevel[key] || 0) === 0 && "💡 Hint"}
                        {(hintLevel[key] || 0) === 1 && "💡 Hint (1/2)"}
                        {(hintLevel[key] || 0) === 2 && "💡 Hint (2/2)"}
                      </button>
                      {isAdmin() && (
                      <button onClick={() => setShowHint(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg, color: T.warn, cursor: "pointer", fontFamily: "inherit" }}>
                        {hintVisible ? "Hide" : "Show"} Solution
                      </button>
                      )}
                    </div>
                    {(hintLevel[key] || 0) > 0 && (
                      <div style={{ padding: "8px 12px", background: T.accentAlt + "10", borderTop: `1px solid ${T.accentAlt}30` }}>
                        <pre style={{ margin: 0, fontSize: 11, color: T.accentAlt, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                          {(hintLevel[key] || 0) === 1 ? getHintLevel1(task) : getHintLevel2(task)}
                        </pre>
                      </div>
                    )}
                    {hintVisible && (
                      <div style={{ padding: "8px 12px", background: T.hintBg, borderTop: `1px solid ${T.border}` }}>
                        <pre style={{ margin: 0, fontSize: 11, color: T.routerText, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{task.hint}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {sidebarTab === "topology" && (
            <div>
              {/* ─── Image topology (original labs) — always takes priority ─── */}
              {TOPO_IMAGES[lab.id] ? (
                <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12, marginBottom: 12 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Topology Diagram</h3>
                  <img src={TOPO_IMAGES[lab.id]} alt={`Lab ${lab.id} topology`}
                    style={{ width: "100%", borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff" }} />
                </div>
              ) : (
                /* ─── SVG renderer (AI-generated & custom labs) ─── */
                <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12, marginBottom: 12, overflow: "hidden" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Network Topology</h3>
                  <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}
                    dangerouslySetInnerHTML={{ __html: renderTopologySVG(lab, darkMode ? "dark" : "light") || "<div style='color:#64748b;padding:16px;font-size:12px'>No topology data available</div>" }}
                  />
                </div>
              )}

              {/* ─── Device table ─── */}
              <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12, marginBottom: 12 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Devices</h3>
                {lab.devices.map(d => (
                  <div key={d.name} style={{ background: T.bg, borderRadius: 6, border: `1px solid ${T.border}`, padding: "8px 10px", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{d.type === "router" ? "⟁" : "⊞"}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: d.type === "router" ? T.routerText : T.switchText }}>{d.name}</span>
                      <span style={{ fontSize: 10, color: T.textMuted, background: T.border, padding: "1px 6px", borderRadius: 3 }}>{d.type}</span>
                    </div>
                    {d.interfaces && Object.entries(d.interfaces).map(([name, info]) => (
                      <div key={name} style={{ display: "flex", gap: 6, fontSize: 10, color: T.textDim, marginLeft: 22, marginBottom: 2 }}>
                        <span style={{ color: T.textMuted, minWidth: 100 }}>{name}</span>
                        <span style={{ color: info.ip ? T.accent : T.textDim }}>{info.ip || "L2"}</span>
                        <span style={{ color: info.status === "up" ? T.accent : "#ef4444" }}>[{info.status || "up"}]</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ─── Text topology (original labs with topology text) ─── */}
              {lab.topology && (
                <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Topology Notes</h3>
                  <pre style={{ margin: 0, fontSize: 10, color: T.textDim, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{lab.topology}</pre>
                </div>
              )}
            </div>
          )}

          {sidebarTab === "config" && currentState && (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Running Config — {selectedDevice}</h3>
              <div style={{ background: "#0a0e17", borderRadius: 8, border: "1px solid #1e2a3a", padding: 12, maxHeight: "60vh", overflow: "auto" }}>
                <pre style={{ margin: 0, fontSize: 11, color: "#8b9bb4", whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" }}>
                  {buildRunningConfig(currentState)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag Handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 6, cursor: "col-resize", background: T.borderAccent,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s", flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.accent + "60"}
        onMouseLeave={e => e.currentTarget.style.background = T.borderAccent}
      >
        <div style={{ width: 2, height: 40, borderRadius: 1, background: T.textMuted + "40" }} />
      </div>

      {/* Right Side - Terminal (ALWAYS DARK) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", background: "#111820", borderBottom: "1px solid #1e2a3a", padding: "0 8px", minHeight: 40 }}>
          {lab.devices.map(d => (
            <button key={d.name} onClick={() => switchDevice(d.name)}
              style={{ padding: "8px 16px", background: selectedDevice === d.name ? "#0a0e17" : "transparent", border: "none", borderBottom: selectedDevice === d.name ? "2px solid #00d4aa" : "2px solid transparent", color: selectedDevice === d.name ? "#00d4aa" : "#6b7b8d", cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10 }}>{d.type === "router" ? "⟁" : "⊞"}</span>{d.name}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, paddingRight: 8 }}>
            <button onClick={() => setTerminalHistory([])} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 4, border: "1px solid #1e2a3a", background: "transparent", color: "#6b7b8d", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
        </div>

        <div ref={terminalRef} onClick={(e) => {
            // Only focus input if clicking on empty area (not selecting text)
            const sel = window.getSelection();
            if (!sel || sel.toString().length === 0) inputRef.current?.focus();
          }}
          style={{ flex: 1, overflow: "auto", padding: "12px 16px", background: "#0a0e17", cursor: "text", userSelect: "text" }}>
          {terminalHistory.map((entry, i) => (
            <div key={i} style={{
              color: entry.type === "system" ? "#0891b2" : entry.type === "input" ? "#e0e6ed" : entry.type === "success" ? "#4ade80" : "#8b9bb4",
              fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "inherit"
            }}>{entry.text}</div>
          ))}
          {currentState && (
            <div style={{ display: "flex", alignItems: "center", fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ color: "#00d4aa", whiteSpace: "pre" }}>{currentState._pendingCrypto ? "How many bits in the modulus [512]: " : getPrompt(currentState) + " "}</span>
              <input ref={inputRef} value={currentInput} onChange={e => setCurrentInput(e.target.value)} onKeyDown={handleKeyDown}
                onPaste={e => {
                  const pasted = e.clipboardData.getData("text");
                  if (pasted.includes("\n")) {
                    e.preventDefault();
                    handleCommand(pasted);
                  }
                }}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e6ed", fontSize: 13, fontFamily: "inherit", caretColor: "#00d4aa", padding: 0, margin: 0 }}
                spellCheck={false} autoComplete="off" autoFocus />
            </div>
          )}
        </div>

        <div style={{ background: "#111820", borderTop: "1px solid #1e2a3a", padding: "6px 16px", display: "flex", alignItems: "center", gap: 16, fontSize: 10, color: "#6b7b8d" }}>
          <span>Mode: <span style={{ color: "#00d4aa" }}>{currentState?.mode || "—"}</span></span>
          {currentState?.currentInterface && <span>Int: <span style={{ color: "#f59e0b" }}>{currentState.currentInterface}</span></span>}
          {currentState?.currentVlan && <span>VLAN: <span style={{ color: "#f59e0b" }}>{currentState.currentVlan}</span></span>}
          {currentState?.currentRouter && <span>Router: <span style={{ color: "#f59e0b" }}>{currentState.currentRouter}</span></span>}
          {currentState?.currentAcl && <span>ACL: <span style={{ color: "#f59e0b" }}>{currentState.currentAcl}</span></span>}
          {currentState?.currentDhcpPool && <span>DHCP: <span style={{ color: "#f59e0b" }}>{currentState.currentDhcpPool}</span></span>}
          {currentState?.currentLine && <span>Line: <span style={{ color: "#f59e0b" }}>{currentState.currentLine}</span></span>}
          <span style={{ marginLeft: "auto" }}>Tab: complete • ↑↓: history • Ctrl+Z: undo • Paste: multi-cmd • do: exec from config</span>
        </div>
      </div>
    </div>
  );
}
