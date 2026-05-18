/**
 * Small letter badge used inside provider buttons (DeepL → "D", Ollama → "Ol"…).
 * Keeps provider identity visible at small sizes without needing full brand SVG logos.
 */
export function ProviderLetterBadge({
  letter,
  color    = "#fff",
  bgColor,
  size     = 14,
}: {
  letter:   string;
  color?:   string;
  bgColor?: string;
  size?:    number;
}) {
  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          size,
        height:         size,
        borderRadius:   3,
        background:     bgColor ?? "rgba(255,255,255,0.20)",
        color,
        fontSize:       letter.length > 1 ? 7 : 9,
        fontWeight:     800,
        fontFamily:     "monospace",
        letterSpacing:  "-0.02em",
        flexShrink:     0,
        lineHeight:     1,
      }}
    >
      {letter}
    </span>
  );
}
