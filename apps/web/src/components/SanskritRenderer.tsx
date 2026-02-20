import { useEffect, useMemo, useRef, useState } from "react";

type KaraokeToken = {
  id: string;
  deva: string;
  kind: "word" | "punct";
  joinToNext: boolean;
};

type KaraokeLine = {
  lineId: string;
  tokens: KaraokeToken[];
};

type KaraokeFile = {
  slug: string;
  lines: KaraokeLine[];
};

type FontGlyphCheck = {
  label: string;
  codepoint: string;
  missingLikely: boolean;
};

type SanskritRendererProps = {
  karaoke: KaraokeFile;
};

function tokenToCodepoints(text: string): string {
  return Array.from(text)
    .map((char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

function detectMissingGlyph(fontFamily: string, char: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }

  ctx.font = `40px ${fontFamily}`;
  const target = ctx.measureText(char).width;
  const replacement = ctx.measureText("\uFFFD").width;
  const tofu = ctx.measureText("\u25A1").width;

  return Math.abs(target - replacement) < 0.01 || Math.abs(target - tofu) < 0.01;
}

function buildGlyphChecks(fontFamily: string): FontGlyphCheck[] {
  const checks: Array<{ label: string; char: string }> = [
    { label: "udatta", char: "॑" },
    { label: "anudatta", char: "॒" },
    { label: "svarita", char: "᳚" },
    { label: "grave accent", char: "᳘" },
    { label: "double svarita", char: "᳙" }
  ];

  return checks.map(({ label, char }) => {
    const codepoint = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "????";
    return {
      label,
      codepoint: `U+${codepoint}`,
      missingLikely: detectMissingGlyph(fontFamily, char)
    };
  });
}

export function SanskritRenderer({ karaoke }: SanskritRendererProps): JSX.Element {
  const [showCodepoints, setShowCodepoints] = useState(false);
  const [showFontUsed, setShowFontUsed] = useState(false);
  const [resolvedFontFamily, setResolvedFontFamily] = useState("(detecting...)");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      return;
    }
    const computed = getComputedStyle(target).fontFamily;
    setResolvedFontFamily(computed || "(unknown)");
  }, [showFontUsed, karaoke.slug]);

  const glyphChecks = useMemo(() => buildGlyphChecks(resolvedFontFamily), [resolvedFontFamily]);
  const testString = "अ॒ग्निमी॑ळे पु॒रोहि॑तं ᳚स्वाहा᳘ ॥10॥";

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showCodepoints}
            onChange={(event) => setShowCodepoints(event.currentTarget.checked)}
          />
          Show codepoints
        </label>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={showFontUsed} onChange={(event) => setShowFontUsed(event.currentTarget.checked)} />
          Show font used
        </label>
      </div>

      {showFontUsed ? (
        <p style={{ margin: 0 }}>
          <strong>Computed font-family:</strong> <code>{resolvedFontFamily}</code>
        </p>
      ) : null}

      <div
        style={{ border: "1px solid #d6d6d6", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}
        className="vedicText"
      >
        <strong>Font support self-test</strong>
        <div lang="sa" style={{ fontSize: 30, lineHeight: 1.7 }}>
          {testString}
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {glyphChecks.map((check) => (
            <div key={check.codepoint} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}>
              {check.label} ({check.codepoint}): {check.missingLikely ? "missing-likely" : "present-likely"}
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="vedicText" lang="sa" style={{ display: "grid", gap: 10 }}>
        {karaoke.lines.map((line) => (
          <div key={line.lineId} style={{ margin: 0, fontSize: 34, lineHeight: 1.7 }}>
            {line.tokens.map((token, index) => {
              const suffix = !token.joinToNext && index < line.tokens.length - 1 ? " " : "";
              return (
                <span key={token.id} className="vedicTokenWrap">
                  <span>{token.deva}</span>
                  <span>{suffix}</span>
                  {showCodepoints ? <small className="tokenCodepoints">{tokenToCodepoints(token.deva)}</small> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
