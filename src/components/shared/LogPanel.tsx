import type { LogEntry, LogLevel } from "../../hooks/useLogs";

interface Props {
  logs:    LogEntry[];
  onClear: () => void;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "var(--text-3)",
  debug: "var(--text-2)",
  info:  "var(--info)",
  warn:  "var(--warning)",
  error: "var(--danger)",
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info:  "INFO ",
  warn:  "WARN ",
  error: "ERROR",
};

export default function LogPanel({ logs, onClear }: Props) {
  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 220,   // largeur de la sidebar
      right: 0,
      height: 220,
      background: "#0a0a0f",
      borderTop: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      zIndex: 50,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.06em" }}>
          LOGS DEBUG
        </span>
        <span style={{
          fontSize: 10,
          background: "var(--accent-dim)",
          color: "var(--accent)",
          padding: "1px 6px",
          borderRadius: 3,
        }}>
          {logs.length}
        </span>
        <button
          onClick={onClear}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-3)",
            fontSize: 11,
            padding: "2px 8px",
          }}
        >
          Effacer
        </button>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {logs.length === 0 ? (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-3)" }}>
            En attente de logs…
          </div>
        ) : (
          [...logs].reverse().map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                gap: 10,
                padding: "2px 12px",
                fontSize: 11,
                lineHeight: 1.6,
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{entry.timestamp}</span>
              <span style={{
                color: LEVEL_COLORS[entry.level],
                fontWeight: entry.level === "error" || entry.level === "warn" ? 700 : 400,
                flexShrink: 0,
                minWidth: 38,
              }}>
                {LEVEL_LABELS[entry.level]}
              </span>
              <span style={{
                color: entry.level === "error" ? "var(--danger)"
                     : entry.level === "warn"  ? "var(--warning)"
                     : "var(--text-1)",
                wordBreak: "break-all",
              }}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
