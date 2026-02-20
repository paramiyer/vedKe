import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SanskritRenderer } from "../components/SanskritRenderer";

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

function validateKaraokeFile(raw: unknown): KaraokeFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid karaoke payload");
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.slug !== "string" || data.slug.length === 0) {
    throw new Error("slug is required");
  }
  if (!Array.isArray(data.lines)) {
    throw new Error("lines must be an array");
  }

  const lines: KaraokeLine[] = data.lines.map((line, lineIndex) => {
    if (!line || typeof line !== "object") {
      throw new Error(`Invalid line at index ${lineIndex}`);
    }
    const rawLine = line as Record<string, unknown>;
    if (typeof rawLine.lineId !== "string" || rawLine.lineId.length === 0) {
      throw new Error(`lineId missing at index ${lineIndex}`);
    }
    if (!Array.isArray(rawLine.tokens)) {
      throw new Error(`tokens missing for ${rawLine.lineId}`);
    }
    const tokens: KaraokeToken[] = rawLine.tokens.map((token, tokenIndex) => {
      if (!token || typeof token !== "object") {
        throw new Error(`Invalid token at ${rawLine.lineId}[${tokenIndex}]`);
      }
      const rawToken = token as Record<string, unknown>;
      if (typeof rawToken.id !== "string" || rawToken.id.length === 0) {
        throw new Error(`token id missing at ${rawLine.lineId}[${tokenIndex}]`);
      }
      if (typeof rawToken.deva !== "string") {
        throw new Error(`token deva missing at ${rawLine.lineId}[${tokenIndex}]`);
      }
      if (rawToken.kind !== "word" && rawToken.kind !== "punct") {
        throw new Error(`token kind invalid at ${rawLine.lineId}[${tokenIndex}]`);
      }
      if (typeof rawToken.joinToNext !== "boolean") {
        throw new Error(`joinToNext missing at ${rawLine.lineId}[${tokenIndex}]`);
      }
      return {
        id: rawToken.id,
        deva: rawToken.deva,
        kind: rawToken.kind,
        joinToNext: rawToken.joinToNext
      };
    });

    return {
      lineId: rawLine.lineId,
      tokens
    };
  });

  return {
    slug: data.slug,
    lines
  };
}

export function SuktaKaraokePage(): JSX.Element {
  const { slug = "sample" } = useParams();
  const [karaoke, setKaraoke] = useState<KaraokeFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    setKaraoke(null);

    fetch(`/suktas/${slug}/karaoke.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} while loading /suktas/${slug}/karaoke.json`);
        }
        return response.json();
      })
      .then((raw) => validateKaraokeFile(raw))
      .then((data) => {
        if (mounted) {
          setKaraoke(data);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  if (error) {
    return <p>Could not load karaoke text: {error}</p>;
  }

  if (!karaoke) {
    return <p>Loading...</p>;
  }

  return (
    <main style={{ display: "grid", gap: 16, padding: 20, maxWidth: 1000 }}>
      <header>
        <h1 style={{ margin: 0 }}>Sukta: {karaoke.slug}</h1>
        <p style={{ marginTop: 6 }}>HTML text preview from karaoke.json for font and svara validation.</p>
      </header>
      <SanskritRenderer karaoke={karaoke} />
    </main>
  );
}
