/**
 * BGS Translator — Centralized Icon Library
 *
 * All icons use `currentColor` and inherit from their parent's CSS color.
 * Never set a color inside an icon — use the parent element's `style={{ color: "..." }}`.
 *
 * Usage:
 *   import { IconSave, IconSearch } from "../icons";
 *   <IconSave />                    // reads set from IconSetContext
 *   <IconSave set="material" />     // explicit override
 *
 * Provider (in App.tsx):
 *   <IconSetContext.Provider value={activeIconSet}>…</IconSetContext.Provider>
 */

import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import type { IconSetId } from "./themes";

// ── Context ────────────────────────────────────────────────────────────────────

export const IconSetContext = createContext<IconSetId>("minimal");

/** Read the active icon set from context (or fall back to "minimal"). */
export function useIconSet(): IconSetId {
  return useContext(IconSetContext);
}

// ── Shared types & helpers ─────────────────────────────────────────────────────

export interface IconProps {
  /** Override the icon set from context. */
  set?:   IconSetId;
  /** Icon size in px (default 16). */
  size?:  number;
  style?: CSSProperties;
}

/** Internal: resolve set prop vs. context. */
function useSet(setProp?: IconSetId): IconSetId {
  const ctx = useIconSet();
  return setProp ?? ctx;
}

/** Internal: shared SVG wrapper. */
function Svg({
  size = 16,
  fill = "none",
  stroke,
  strokeWidth,
  strokeLinecap,
  strokeLinejoin,
  style,
  children,
}: {
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: string | number;
  strokeLinecap?: "round" | "square" | "butt";
  strokeLinejoin?: "round" | "miter" | "bevel";
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap={strokeLinecap}
      strokeLinejoin={strokeLinejoin}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Shorthand builders for each style family
const M  = (size: number, style?: CSSProperties) => ({ size, fill: "currentColor" as const, style });
const Mn = (size: number, style?: CSSProperties) => ({ size, fill: "none" as const, stroke: "currentColor" as const, strokeWidth: 1.8 as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style });
const Cl = (size: number, style?: CSSProperties) => ({ size, fill: "none" as const, stroke: "currentColor" as const, strokeWidth: 1.4 as const, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const, style });

// ── OPEN FOLDER ───────────────────────────────────────────────────────────────

export function IconFolder({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <rect x="2" y="8" width="20" height="13" rx="1" fill="currentColor" fillOpacity="0.18"/>
      <rect x="2" y="8" width="20" height="13" rx="1"/>
      <path d="M2 8l2-4h7l2 4" fill="currentColor" fillOpacity="0.28"/>
      <path d="M2 8l2-4h7l2 4"/>
      <line x1="6" y1="13" x2="18" y2="13" strokeOpacity="0.4"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </Svg>
  );
}

// ── SESSION / DOCUMENT ────────────────────────────────────────────────────────

export function IconSession({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-4 6l3 3 3-3h-2v-3h-2v3H8z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fillOpacity="0.15"/>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <polyline points="9 15 12 18 15 15"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <polyline points="9 15 12 18 15 15"/>
    </Svg>
  );
}

// ── SAVE (FLOPPY) ─────────────────────────────────────────────────────────────

export function IconSave({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor" fillOpacity="0.18"/>
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <rect x="6" y="3" width="12" height="8" rx="0.5" fill="currentColor" fillOpacity="0.3"/>
      <rect x="6" y="3" width="12" height="8" rx="0.5"/>
      <rect x="9" y="14" width="6" height="5" rx="0.5" fill="currentColor" fillOpacity="0.2"/>
      <rect x="9" y="14" width="6" height="5" rx="0.5"/>
      <rect x="13" y="4" width="3" height="6" rx="0.3" fill="currentColor" fillOpacity="0.5"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </Svg>
  );
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export function IconExport({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <rect x="3" y="14" width="18" height="7" rx="1" fill="currentColor" fillOpacity="0.18"/>
      <rect x="3" y="14" width="18" height="7" rx="1"/>
      <line x1="12" y1="3" x2="12" y2="13" strokeWidth="1.6" strokeLinecap="round"/>
      <polyline points="8 9 12 14 16 9" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </Svg>
  );
}

// ── SETTINGS (GEAR) ───────────────────────────────────────────────────────────

export function IconSettings({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity="0.2"/>
      <circle cx="12" cy="12" r="3.5"/>
      <rect x="10.5" y="2"  width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
      <rect x="10.5" y="19" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
      <rect x="2"  y="10.5" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
      <rect x="19" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
      <rect x="4.5" y="4.5"  width="2.5" height="2.5" rx="0.5" transform="rotate(45 5.75 5.75)"   fill="currentColor" fillOpacity="0.4"/>
      <rect x="17"  y="4.5"  width="2.5" height="2.5" rx="0.5" transform="rotate(45 18.25 5.75)"  fill="currentColor" fillOpacity="0.4"/>
      <rect x="4.5" y="17"   width="2.5" height="2.5" rx="0.5" transform="rotate(45 5.75 18.25)"  fill="currentColor" fillOpacity="0.4"/>
      <rect x="17"  y="17"   width="2.5" height="2.5" rx="0.5" transform="rotate(45 18.25 18.25)" fill="currentColor" fillOpacity="0.4"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </Svg>
  );
}

// ── TRASH ─────────────────────────────────────────────────────────────────────

export function IconTrash({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M8 6V4h8v2"/>
      <rect x="4" y="7" width="16" height="14" rx="1" fill="currentColor" fillOpacity="0.12"/>
      <rect x="4" y="7" width="16" height="14" rx="1"/>
      <line x1="9"  y1="11" x2="9"  y2="17"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="15" y1="11" x2="15" y2="17"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </Svg>
  );
}

// ── SEARCH / FIND ─────────────────────────────────────────────────────────────

export function IconSearch({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <circle cx="11" cy="11" r="7" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="11" cy="11" r="7"/>
      <line x1="16.5" y1="16.5" x2="21" y2="21"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </Svg>
  );
}

// ── COPY ──────────────────────────────────────────────────────────────────────

export function IconCopy({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <rect x="8" y="8" width="13" height="13" rx="1" fill="currentColor" fillOpacity="0.15"/>
      <rect x="8" y="8" width="13" height="13" rx="1"/>
      <path d="M4 16H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1" fill="currentColor" fillOpacity="0.12"/>
      <path d="M4 16H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </Svg>
  );
}

// ── DATABASE / DB ─────────────────────────────────────────────────────────────

export function IconDatabase({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M20 6c0-2.21-3.58-4-8-4S4 3.79 4 6v2c0 2.21 3.58 4 8 4s8-1.79 8-4V6zm-8 14c-4.42 0-8-1.79-8-4V8c0 2.21 3.58 4 8 4s8-1.79 8-4v8c0 2.21-3.58 4-8 4z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <ellipse cx="12" cy="5" rx="9" ry="3" fill="currentColor" fillOpacity="0.2"/>
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" fill="currentColor" fillOpacity="0.1"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </Svg>
  );
}

// ── CLOSE / X ─────────────────────────────────────────────────────────────────

export function IconClose({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </Svg>
  );
}

// ── CHECK / VALIDATE ──────────────────────────────────────────────────────────

export function IconCheck({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <polyline points="20 6 9 17 4 12"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <polyline points="20 6 9 17 4 12"/>
    </Svg>
  );
}

// ── WARNING / TRIANGLE ────────────────────────────────────────────────────────

export function IconWarning({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="currentColor" fillOpacity="0.1"/>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9"  x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12" y2="17.01"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9"  x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12" y2="17.01"/>
    </Svg>
  );
}

// ── INFO ──────────────────────────────────────────────────────────────────────

export function IconInfo({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8"  x2="12" y2="8.01"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8"  x2="12" y2="8.01"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
    </Svg>
  );
}

// ── CHEVRON DOWN ──────────────────────────────────────────────────────────────

export function IconChevronDown({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <polyline points="6 9 12 15 18 9"/>
    </Svg>
  );
}

// ── CHEVRON UP ────────────────────────────────────────────────────────────────

export function IconChevronUp({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <polyline points="6 15 12 9 18 15"/>
    </Svg>
  );
}

// ── CHEVRON RIGHT ─────────────────────────────────────────────────────────────

export function IconChevronRight({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <polyline points="9 6 15 12 9 18"/>
    </Svg>
  );
}

// ── CHEVRON LEFT ──────────────────────────────────────────────────────────────

export function IconChevronLeft({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <polyline points="15 6 9 12 15 18"/>
    </Svg>
  );
}

// ── REFRESH / RELOAD ──────────────────────────────────────────────────────────

export function IconRefresh({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
    </Svg>
  );
}

// ── REPLACE / EXCHANGE ────────────────────────────────────────────────────────

export function IconReplace({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M9.01 14H2v2h7.01v3L13 15l-3.99-4v3zm5.98-1v-3H22V8h-7.01V5L11 9l3.99 4z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </Svg>
  );
}

// ── SORT ──────────────────────────────────────────────────────────────────────

export function IconSort({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <path d="M3 9l4-4 4 4M7 5v14"/>
      <path d="M21 15l-4 4-4-4M17 19V5"/>
    </Svg>
  );
}

// ── PLAY / LOAD ───────────────────────────────────────────────────────────────

export function IconPlay({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <polygon points="5 3 19 12 5 21" fill="currentColor" fillOpacity="0.5"/>
      <polygon points="5 3 19 12 5 21"/>
    </Svg>
  );
  // minimal + material: filled triangle
  return (
    <Svg fill="currentColor" size={size} style={style}>
      <polygon points="5 3 19 12 5 21"/>
    </Svg>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────

export function IconHome({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" fillOpacity="0.15"/>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </Svg>
  );
}

// ── SPARKLE / RECOVERY ────────────────────────────────────────────────────────

export function IconSparkle({ set: _set, size = 16, style }: IconProps) {
  // Same shape for all sets — decorative icon
  return (
    <Svg fill="currentColor" size={size} style={style}>
      <path d="M12 2l1.8 5.5H19l-4.5 3.3 1.7 5.2L12 13l-4.2 3 1.7-5.2L5 7.5h5.2L12 2z"/>
    </Svg>
  );
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────

export function IconDownload({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <rect x="3" y="15" width="18" height="6" rx="1" fill="currentColor" fillOpacity="0.18"/>
      <rect x="3" y="15" width="18" height="6" rx="1"/>
      <line x1="12" y1="3" x2="12" y2="14"/>
      <polyline points="8 10 12 15 16 10"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </Svg>
  );
}

// ── PLUS ──────────────────────────────────────────────────────────────────────

export function IconPlus({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5"  y1="12" x2="19" y2="12"/>
    </Svg>
  );
}

// ── ARROW UP (navigation within a list) ──────────────────────────────────────

export function IconArrowUp({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </Svg>
  );
}

// ── ARROW DOWN ────────────────────────────────────────────────────────────────

export function IconArrowDown({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </Svg>
  );
  return (
    <Svg {...(s === "classic" ? Cl(size, style) : Mn(size, style))}>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <polyline points="19 12 12 19 5 12"/>
    </Svg>
  );
}

// ── FILTER / FUNNEL ───────────────────────────────────────────────────────────

export function IconFilter({ set, size = 16, style }: IconProps) {
  const s = useSet(set);
  if (s === "material") return (
    <Svg {...M(size, style)}>
      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
    </Svg>
  );
  if (s === "classic") return (
    <Svg {...Cl(size, style)}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" fill="currentColor" fillOpacity="0.15"/>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </Svg>
  );
  return (
    <Svg {...Mn(size, style)}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </Svg>
  );
}

// ── CASE SENSITIVE (Aa) ───────────────────────────────────────────────────────

/** Text-based icon — inherits font. No SVG variant needed. */
export function IconCaseSensitive({ style }: Pick<IconProps, "style">) {
  return (
    <span style={{ fontWeight: 600, fontSize: "0.85em", letterSpacing: "-0.5px", lineHeight: 1, ...style }}>
      Aa
    </span>
  );
}

// ── SPELL CHECK (abc) ─────────────────────────────────────────────────────────

export function IconSpellCheck({ style }: Pick<IconProps, "style">) {
  return (
    <span style={{ fontFamily: "monospace", fontSize: "0.8em", fontWeight: 700, textDecoration: "underline wavy", textDecorationColor: "var(--danger, red)", textUnderlineOffset: 2, lineHeight: 1, ...style }}>
      abc
    </span>
  );
}

// ── SPINNER ───────────────────────────────────────────────────────────────────

/** Animated spinner — same for all icon sets. */
export function IconSpinner({ size = 16, style }: Pick<IconProps, "size" | "style">) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: "spin 1s linear infinite", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}
