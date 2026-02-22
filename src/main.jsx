import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import CiscoLabSimulator from './CiscoLabSimulator'
import LabEditor from './LabEditor'

function App() {
  const [view, setView] = useState("simulator");

  return (
    <div>
      {/* Global nav bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: "#0a0e17", borderBottom: "1px solid #1e293b",
        position: "sticky", top: 0, zIndex: 10000,
      }}>
        <button onClick={() => setView("simulator")}
          style={{
            padding: "10px 20px", border: "none", cursor: "pointer",
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
            background: view === "simulator" ? "#111827" : "transparent",
            color: view === "simulator" ? "#38bdf8" : "#64748b",
            borderBottom: view === "simulator" ? "2px solid #38bdf8" : "2px solid transparent",
            transition: "all 0.2s",
          }}>
          🖥️ Simulator
        </button>
        <button onClick={() => setView("editor")}
          style={{
            padding: "10px 20px", border: "none", cursor: "pointer",
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
            background: view === "editor" ? "#111827" : "transparent",
            color: view === "editor" ? "#f59e0b" : "#64748b",
            borderBottom: view === "editor" ? "2px solid #f59e0b" : "2px solid transparent",
            transition: "all 0.2s",
          }}>
          🔧 Lab Editor
        </button>
      </div>

      {view === "simulator" ? <CiscoLabSimulator /> : <LabEditor />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
