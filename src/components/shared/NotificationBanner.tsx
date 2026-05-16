import { useCallback, useEffect, useState } from "react";
import { IconClose } from "../../icons";

export type NotifType = "success" | "error";

export interface Notification {
  message:   string;
  type:      NotifType;
  detail?:   string;
  key:       number;
  duration?: number; // ms, default depends on type
}

interface Props {
  notification: Notification;
  onDismiss:    () => void;
}

export function NotificationBanner({ notification, onDismiss }: Props) {
  const { message, type, detail, key: notifKey } = notification;
  const duration = notification.duration ?? (type === "success" ? 5000 : 8000);

  const [progressing, setProgressing] = useState(false);

  const stableDismiss = useCallback(onDismiss, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProgressing(false);
    const t1 = setTimeout(() => setProgressing(true), 30);
    const t2 = setTimeout(stableDismiss, duration);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [notifKey, duration, stableDismiss]);

  const isSuccess = type === "success";
  const color  = isSuccess ? "#22c55e" : "#ef4444";
  const bg     = isSuccess ? "rgba(34,197,94,0.1)"  : "rgba(239,68,68,0.1)";
  const border = isSuccess ? "rgba(34,197,94,0.2)"  : "rgba(239,68,68,0.25)";

  return (
    <div style={{
      height: "100%",
      background: bg,
      borderBottom: `1px solid ${border}`,
      position: "relative",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      <div style={{
        height: "100%",
        padding: "0 14px",
        display: "flex", alignItems: "center", gap: 10, fontSize: 12,
      }}>
        <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{message}</span>
        {detail && (
          <span style={{
            color: "var(--text-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {detail}
          </span>
        )}
        <button
          onClick={onDismiss}
          style={{
            marginLeft: "auto", flexShrink: 0,
            background: "none", border: "none",
            cursor: "pointer", color: "var(--text-3)",
            display: "flex", alignItems: "center",
          }}
        ><IconClose size={14} /></button>
      </div>

      {/* Timer bar — shrinks from right toward left */}
      <div style={{
        position: "absolute", bottom: 0, left: 0,
        height: 2,
        width: progressing ? "0%" : "100%",
        background: color,
        transition: progressing ? `width ${duration}ms linear` : "none",
        opacity: 0.65,
      }} />
    </div>
  );
}
