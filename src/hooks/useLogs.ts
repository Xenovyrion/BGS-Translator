import { useEffect, useState, useCallback } from "react";

// Stubs — @tauri-apps/plugin-log is not yet installed
const attachConsole = async () => () => {};
const onNewLog = async (_cb: (log: { level: number; message: string }) => void) => () => {};

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id:        number;
  level:     LogLevel;
  message:   string;
  timestamp: string;
}

let _counter = 0;

function levelFromNumber(n: number): LogLevel {
  if (n >= 5) return "error";
  if (n >= 4) return "warn";
  if (n >= 3) return "info";
  if (n >= 2) return "debug";
  return "trace";
}

export function useLogs(enabled: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const cleanups: Array<() => void> = [];

    // Redirige aussi vers la console du navigateur (DevTools)
    attachConsole().then((detach) => cleanups.push(detach));

    // Écoute chaque nouveau log pour l'afficher dans le panneau UI
    const unlistenPromise = onNewLog((log) => {
      const entry: LogEntry = {
        id:        ++_counter,
        level:     levelFromNumber(log.level),
        message:   log.message,
        timestamp: new Date().toLocaleTimeString("fr-FR", { hour12: false }),
      };
      setLogs((prev) => [...prev.slice(-499), entry]);
    });

    unlistenPromise.then((unlisten) => cleanups.push(unlisten));

    return () => cleanups.forEach((fn) => fn());
  }, [enabled]);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, clear };
}
