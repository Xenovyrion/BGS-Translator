// Renders text with <Variable=Value> game tokens highlighted in --color-tag.
export function TaggedText({ text }: { text: string }) {
  const parts = text.split(/(<[^>]*>)/g);
  if (parts.length <= 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        /^<[^>]+>$/.test(part) ? (
          <span key={i} style={{ color: "var(--color-tag)" }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
