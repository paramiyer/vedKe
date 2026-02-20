import { useEffect, useMemo, useRef, useState } from "react";
import useResizeObserver from "use-resize-observer";

type VisualPageEntry = {
  page: number;
  svg: string;
  width: number;
  height: number;
};

type VisualManifest = {
  slug: string;
  pages: VisualPageEntry[];
};

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

type HighlightRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

type HighlightsFile = {
  pages: Record<string, HighlightRect[]>;
};

type Point = { x: number; y: number };

function toAbsoluteUrl(url: string): string {
  return new URL(url, window.location.origin).toString();
}

function resolveFromBase(relativeOrAbsolute: string, base: string): string {
  const absoluteBase = toAbsoluteUrl(base);
  return new URL(relativeOrAbsolute, absoluteBase).toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function validateVisualManifest(raw: unknown): VisualManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("visual.json must be an object");
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.slug !== "string") {
    throw new Error("visual.json slug must be a string");
  }
  if (!Array.isArray(data.pages)) {
    throw new Error("visual.json pages must be an array");
  }
  const pages = data.pages.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`visual.json page at index ${index} is invalid`);
    }
    const page = item as Record<string, unknown>;
    if (typeof page.page !== "number" || typeof page.svg !== "string") {
      throw new Error(`visual.json page at index ${index} must include page/svg`);
    }
    if (typeof page.width !== "number" || typeof page.height !== "number") {
      throw new Error(`visual.json page at index ${index} must include width/height`);
    }
    return {
      page: page.page,
      svg: page.svg,
      width: page.width,
      height: page.height
    };
  });
  return { slug: data.slug, pages };
}

function validateKaraokeFile(raw: unknown): KaraokeFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("karaoke.json must be an object");
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.slug !== "string" || data.slug.length === 0) {
    throw new Error("karaoke.json slug must be a non-empty string");
  }
  if (!Array.isArray(data.lines)) {
    throw new Error("karaoke.json lines must be an array");
  }
  const lines: KaraokeLine[] = data.lines.map((line, lineIndex) => {
    if (!line || typeof line !== "object") {
      throw new Error(`karaoke line at index ${lineIndex} is invalid`);
    }
    const rawLine = line as Record<string, unknown>;
    if (typeof rawLine.lineId !== "string" || rawLine.lineId.length === 0) {
      throw new Error(`karaoke lineId missing at index ${lineIndex}`);
    }
    if (!Array.isArray(rawLine.tokens)) {
      throw new Error(`karaoke tokens missing for line ${rawLine.lineId}`);
    }
    const tokens: KaraokeToken[] = rawLine.tokens.map((token, tokenIndex) => {
      if (!token || typeof token !== "object") {
        throw new Error(`karaoke token at ${rawLine.lineId}[${tokenIndex}] is invalid`);
      }
      const rawToken = token as Record<string, unknown>;
      if (typeof rawToken.id !== "string" || rawToken.id.length === 0) {
        throw new Error(`karaoke token id missing at ${rawLine.lineId}[${tokenIndex}]`);
      }
      if (typeof rawToken.deva !== "string") {
        throw new Error(`karaoke token deva missing at ${rawLine.lineId}[${tokenIndex}]`);
      }
      if (rawToken.kind !== "word" && rawToken.kind !== "punct") {
        throw new Error(`karaoke token kind invalid at ${rawLine.lineId}[${tokenIndex}]`);
      }
      if (typeof rawToken.joinToNext !== "boolean") {
        throw new Error(`karaoke joinToNext missing at ${rawLine.lineId}[${tokenIndex}]`);
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

function validateHighlights(raw: unknown): HighlightsFile {
  if (!raw || typeof raw !== "object") {
    return { pages: {} };
  }
  const data = raw as Record<string, unknown>;
  if (!data.pages || typeof data.pages !== "object") {
    return { pages: {} };
  }
  const pagesRaw = data.pages as Record<string, unknown>;
  const pages: Record<string, HighlightRect[]> = {};
  Object.entries(pagesRaw).forEach(([page, entries]) => {
    if (!Array.isArray(entries)) {
      return;
    }
    const rects: HighlightRect[] = [];
    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const item = entry as Record<string, unknown>;
      if (
        typeof item.id !== "string" ||
        typeof item.x !== "number" ||
        typeof item.y !== "number" ||
        typeof item.w !== "number" ||
        typeof item.h !== "number"
      ) {
        return;
      }
      rects.push({
        id: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        label: typeof item.label === "string" ? item.label : undefined
      });
    });
    pages[page] = rects;
  });
  return { pages };
}

function highlightCount(data: HighlightsFile): number {
  return Object.values(data.pages).reduce((sum, rects) => sum + rects.length, 0);
}

async function loadFirstJson(urls: string[], slug: string): Promise<{ data: unknown; sourceUrl: string }> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      if (contentType.includes("application/json")) {
        try {
          return { data: JSON.parse(text), sourceUrl: url };
        } catch (err) {
          errors.push(`${url} -> invalid JSON (${err instanceof Error ? err.message : String(err)})`);
          continue;
        }
      }
      const leading = text.trimStart().slice(0, 20).replace(/\s+/g, " ");
      errors.push(`${url} -> expected JSON, got ${contentType || "unknown content-type"} (${JSON.stringify(leading)}...)`);
    } catch (err) {
      errors.push(`${url} -> ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(
    `Could not load visual assets.\n${errors.join("\n")}\n\n` +
      `Generate + sync visual assets:\n` +
      `python -m services.itx_pipeline build-visual --slug ${slug} --itx <path.itx> --out build/${slug}\n` +
      `python -m services.itx_pipeline sync-web --slug ${slug} --build build/${slug} --web apps/web/public/suktas/${slug}`
  );
}

function nextHighlightId(highlights: HighlightsFile): string {
  let maxId = 0;
  Object.values(highlights.pages).forEach((list) => {
    list.forEach((item) => {
      const match = /^seg-(\d+)$/.exec(item.id);
      if (!match) {
        return;
      }
      maxId = Math.max(maxId, Number.parseInt(match[1], 10));
    });
  });
  return `seg-${String(maxId + 1).padStart(4, "0")}`;
}

function normRect(a: Point, b: Point): HighlightRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return { id: "", x, y, w: right - x, h: bottom - y };
}

function getInitialPageIndex(pages: VisualPageEntry[]): number {
  if (pages.length === 0) {
    return 0;
  }
  const pageTwoIndex = pages.findIndex((entry) => entry.page === 2);
  if (pageTwoIndex >= 0) {
    return pageTwoIndex;
  }
  return pages.length > 1 ? 1 : 0;
}

export function VisualPage({ slug }: { slug: string }): JSX.Element {
  const [manifest, setManifest] = useState<VisualManifest | null>(null);
  const [karaoke, setKaraoke] = useState<KaraokeFile | null>(null);
  const [manifestUrl, setManifestUrl] = useState<string>("");
  const [highlights, setHighlights] = useState<HighlightsFile>({ pages: {} });
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeTokenIndex, setActiveTokenIndex] = useState(0);
  const [activeTokenReveal, setActiveTokenReveal] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speedTps, setSpeedTps] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [debugVisible, setDebugVisible] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [mouseSvg, setMouseSvg] = useState<Point | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const { ref: containerRef, width: containerWidth = 0 } = useResizeObserver<HTMLDivElement>();

  const storageKey = `veda.visual.highlights.${slug}`;

  useEffect(() => {
    let mounted = true;
    setManifest(null);
    setKaraoke(null);
    setManifestUrl("");
    setError(null);
    setPageIndex(0);
    setActiveTokenIndex(0);
    setPlaying(false);
    setZoom(1);

    const manifestCandidates = [`/suktas/${slug}/visual/visual.json`, `/suktas/${slug}/visual.json`, `/build/${slug}/visual/visual.json`];
    loadFirstJson(manifestCandidates, slug)
      .then(({ data, sourceUrl }) => {
        if (!mounted) {
          return;
        }
        const parsed = validateVisualManifest(data);
        setManifest(parsed);
        setManifestUrl(sourceUrl);
        setPageIndex(getInitialPageIndex(parsed.pages));
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      });

    fetch(`/suktas/${slug}/karaoke.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} while loading /suktas/${slug}/karaoke.json`);
        }
        return response.json();
      })
      .then((raw) => validateKaraokeFile(raw))
      .then((data) => {
        if (!mounted) {
          return;
        }
        setKaraoke(data);
        setActiveTokenIndex(0);
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    let localRaw: string | null = null;
    let localParsed: HighlightsFile | null = null;
    try {
      localRaw = window.localStorage.getItem(storageKey);
    } catch {
      localRaw = null;
    }
    if (localRaw) {
      try {
        localParsed = validateHighlights(JSON.parse(localRaw));
      } catch {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Ignore storage access failures.
        }
      }
    }

    if (!manifestUrl) {
      setHighlights(localParsed ?? { pages: {} });
      return;
    }
    const highlightsUrl = resolveFromBase("highlights.json", manifestUrl);
    fetch(highlightsUrl)
      .then((response) => {
        if (!response.ok) {
          return { pages: {} } as HighlightsFile;
        }
        return response.json();
      })
      .then((data) => {
        const remoteParsed = validateHighlights(data);
        if (localParsed && highlightCount(localParsed) > 0) {
          setHighlights(localParsed);
          return;
        }
        setHighlights(remoteParsed);
      })
      .catch(() => setHighlights(localParsed ?? { pages: {} }));
  }, [manifestUrl, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(highlights));
    } catch {
      // Ignore storage quota/private mode restrictions.
    }
  }, [highlights, storageKey]);

  const page = manifest?.pages[pageIndex] ?? null;
  const pageKey = page ? String(page.page) : "";
  const pageHighlights = useMemo(() => (page ? highlights.pages[String(page.page)] ?? [] : []), [highlights.pages, page]);
  const allTokens = useMemo(() => karaoke?.lines.flatMap((line) => line.tokens) ?? [], [karaoke]);
  const activeToken = allTokens[activeTokenIndex] ?? null;
  const tokenIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    allTokens.forEach((token, idx) => {
      indexById.set(token.id, idx);
    });
    return indexById;
  }, [allTokens]);
  const tokenToPageIndex = useMemo(() => {
    if (!manifest) {
      return new Map<string, number>();
    }
    const mapping = new Map<string, number>();
    manifest.pages.forEach((entry, idx) => {
      const rects = highlights.pages[String(entry.page)] ?? [];
      rects.forEach((rect) => {
        if (!mapping.has(rect.id)) {
          mapping.set(rect.id, idx);
        }
      });
    });
    return mapping;
  }, [highlights.pages, manifest]);
  const highlightedTokenIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(highlights.pages).forEach((rects) => {
      rects.forEach((rect) => ids.add(rect.id));
    });
    return ids;
  }, [highlights.pages]);

  useEffect(() => {
    if (!activeToken) {
      return;
    }
    const matchedPage = tokenToPageIndex.get(activeToken.id);
    if (matchedPage === undefined || matchedPage === pageIndex) {
      return;
    }
    setPageIndex(matchedPage);
  }, [activeToken, pageIndex, tokenToPageIndex]);

  useEffect(() => {
    if (!playing || allTokens.length === 0) {
      setActiveTokenReveal(1);
      return;
    }
    let rafId = 0;
    let tokenStartMs = performance.now();
    const tokenDurationMs = Math.max(50, 1000 / Math.max(0.1, speedTps));

    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - tokenStartMs) / tokenDurationMs));
      setActiveTokenReveal(progress);

      if (progress >= 1) {
        let reachedEnd = false;
        setActiveTokenIndex((current) => {
          if (current >= allTokens.length - 1) {
            reachedEnd = true;
            return current;
          }
          return current + 1;
        });
        if (reachedEnd) {
          setPlaying(false);
          setActiveTokenReveal(1);
          return;
        }
        tokenStartMs = now;
        setActiveTokenReveal(0);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    setActiveTokenReveal(0);
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [allTokens.length, playing, speedTps]);

  const fitScale = useMemo(() => {
    if (!page || containerWidth <= 0) {
      return 1;
    }
    return containerWidth / page.width;
  }, [containerWidth, page]);
  const displayScale = fitScale * zoom;

  const stageWidth = page ? page.width * displayScale : 0;
  const stageHeight = page ? page.height * displayScale : 0;
  const pageSvgUrl = page && manifestUrl ? resolveFromBase(page.svg, manifestUrl) : "";

  const pointerToSvg = (event: React.MouseEvent<HTMLDivElement>): Point | null => {
    if (!page || !stageRef.current || displayScale <= 0) {
      return null;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / displayScale, 0, page.width);
    const y = clamp((event.clientY - rect.top) / displayScale, 0, page.height);
    return { x, y };
  };

  const draftRect = dragStart && dragCurrent ? normRect(dragStart, dragCurrent) : null;

  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas || !page || !pageSvgUrl || stageWidth <= 0 || stageHeight <= 0) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) {
        return;
      }

      const width = Math.max(1, Math.round(stageWidth));
      const height = Math.max(1, Math.round(stageHeight));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${stageWidth}px`;
      canvas.style.height = `${stageHeight}px`;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Colorize glyph pixels inside token boxes so highlight follows the text shape, not a rectangle.
      pageHighlights.forEach((rect) => {
        const tokenIdx = tokenIndexById.get(rect.id);
        if (tokenIdx === undefined || tokenIdx > activeTokenIndex) {
          return;
        }
        const padX = Math.max(2, rect.w * displayScale * 0.08);
        const padY = Math.max(2, rect.h * displayScale * 0.12);
        const left = clamp(Math.floor(rect.x * displayScale - padX), 0, width - 1);
        const top = clamp(Math.floor(rect.y * displayScale - padY), 0, height - 1);
        const right = clamp(Math.ceil((rect.x + rect.w) * displayScale + padX), left + 1, width);
        const bottom = clamp(Math.ceil((rect.y + rect.h) * displayScale + padY), top + 1, height);
        const rectWidth = right - left;
        const rectHeight = bottom - top;
        if (rectWidth <= 0 || rectHeight <= 0) {
          return;
        }

        const isActive = rect.id === activeToken?.id;
        const isCompleted = tokenIdx < activeTokenIndex;
        const isCurrent = tokenIdx === activeTokenIndex;
        if (!isCompleted && !isCurrent) {
          return;
        }

        const tint = isCurrent ? { r: 15, g: 92, b: 42 } : { r: 35, g: 140, b: 68 };
        const maxStrength = isCurrent ? 0.98 : 0.82;
        const data = ctx.getImageData(left, top, rectWidth, rectHeight);
        const pixels = data.data;
        const revealColumns = Math.floor(rectWidth * (isCurrent ? activeTokenReveal : 1));

        for (let i = 0; i < pixels.length; i += 4) {
          const column = Math.floor((i / 4) % rectWidth);
          if (column > revealColumns) {
            continue;
          }
          const alpha = pixels[i + 3];
          if (alpha < 20) {
            continue;
          }
          const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
          if (lum > 195) {
            continue;
          }
          const strength = ((195 - lum) / 195) * maxStrength;
          pixels[i] = Math.round(pixels[i] * (1 - strength) + tint.r * strength);
          pixels[i + 1] = Math.round(pixels[i + 1] * (1 - strength) + tint.g * strength);
          pixels[i + 2] = Math.round(pixels[i + 2] * (1 - strength) + tint.b * strength);
        }

        ctx.putImageData(data, left, top);
      });
    };
    img.src = pageSvgUrl;

    return () => {
      cancelled = true;
    };
  }, [activeToken?.id, activeTokenIndex, activeTokenReveal, displayScale, page, pageHighlights, pageSvgUrl, stageHeight, stageWidth, tokenIndexById]);

  const onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode || !page || event.button !== 0) {
      return;
    }
    const point = pointerToSvg(event);
    if (!point) {
      return;
    }
    setDragStart(point);
    setDragCurrent(point);
  };

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = pointerToSvg(event);
    setMouseSvg(point);
    if (!dragStart || !point) {
      return;
    }
    setDragCurrent(point);
  };

  const onMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!page || !dragStart) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }
    const end = pointerToSvg(event) ?? dragCurrent ?? dragStart;
    const rect = normRect(dragStart, end);
    setDragStart(null);
    setDragCurrent(null);

    if (rect.w < 2 || rect.h < 2) {
      return;
    }
    const label = window.prompt("Optional label", "")?.trim() ?? "";
    const tokenId = activeToken?.id;
    const highlightId = tokenId ?? nextHighlightId(highlights);
    const next: HighlightRect = {
      id: highlightId,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      label: label || undefined
    };
    setHighlights((prev) => {
      const nextPages: Record<string, HighlightRect[]> = {};
      Object.entries(prev.pages).forEach(([existingPage, items]) => {
        nextPages[existingPage] = items.filter((item) => item.id !== highlightId);
      });
      nextPages[pageKey] = [...(nextPages[pageKey] ?? []), next];
      return { pages: nextPages };
    });

    if (tokenId && activeTokenIndex < allTokens.length - 1) {
      setActiveTokenIndex(activeTokenIndex + 1);
    }
  };

  const downloadHighlights = () => {
    const pretty = JSON.stringify(highlights, null, 2);
    const blob = new Blob([`${pretty}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug}-highlights.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const goToToken = (nextIndex: number) => {
    if (allTokens.length === 0) {
      return;
    }
    const clamped = clamp(nextIndex, 0, allTokens.length - 1);
    setActiveTokenIndex(clamped);
    setActiveTokenReveal(playing ? 0 : 1);
  };

  if (error) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Visual Preview: {slug}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
      </main>
    );
  }

  if (manifest && manifest.pages.length === 0) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Visual Preview: {slug}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          visual.json loaded but has no pages.
          {"\n"}
          Rebuild visual assets and sync again:
          {"\n"}
          python -m services.itx_pipeline build-visual --slug {slug} --itx &lt;path.itx&gt; --out build/{slug}
          {"\n"}
          python -m services.itx_pipeline sync-web --slug {slug} --build build/{slug} --web apps/web/public/suktas/{slug}
        </pre>
      </main>
    );
  }

  if (!manifest || !page) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Visual Preview: {slug}</h1>
        <p>Loading visual assets...</p>
      </main>
    );
  }

  return (
    <main style={{ display: "grid", gap: 12, padding: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Visual Preview: {slug}</h1>
        <p style={{ margin: "6px 0 0 0" }}>Exact PDF-derived SVG rendering with scalable highlight overlays.</p>
      </header>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label>
          Page{" "}
          <select value={pageIndex} onChange={(e) => setPageIndex(Number.parseInt(e.target.value, 10))}>
            {manifest.pages.map((item, idx) => (
              <option key={item.page} value={idx}>
                {item.page}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zoom{" "}
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
          />
          {" "}
          {zoom.toFixed(2)}x
        </label>
        <label>
          <input type="checkbox" checked={annotateMode} onChange={(e) => setAnnotateMode(e.target.checked)} /> Annotate mode
        </label>
        <button type="button" onClick={() => goToToken(activeTokenIndex - 1)} disabled={allTokens.length === 0 || activeTokenIndex <= 0}>
          Prev token
        </button>
        <button
          type="button"
          onClick={() => goToToken(activeTokenIndex + 1)}
          disabled={allTokens.length === 0 || activeTokenIndex >= allTokens.length - 1}
        >
          Next token
        </button>
        <button
          type="button"
          onClick={() => {
            if (!playing && activeTokenIndex >= allTokens.length - 1 && allTokens.length > 0) {
              setActiveTokenIndex(0);
            }
            setPlaying((value) => !value);
          }}
          disabled={allTokens.length === 0}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <label>
          Speed (tokens/s){" "}
          <input
            type="number"
            min={0.1}
            max={20}
            step={0.1}
            value={speedTps}
            onChange={(e) => {
              const parsed = Number.parseFloat(e.target.value);
              if (Number.isFinite(parsed)) {
                setSpeedTps(clamp(parsed, 0.1, 20));
              }
            }}
            style={{ width: 80 }}
          />
        </label>
        <button type="button" onClick={downloadHighlights}>
          Export highlights.json
        </button>
        <button type="button" onClick={() => setDebugVisible((v) => !v)}>
          {debugVisible ? "Hide debug" : "Show debug"}
        </button>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, display: "grid", gap: 6 }}>
        <strong>Karaoke token focus</strong>
        {activeToken ? (
          <>
            <div style={{ fontSize: 24, lineHeight: 1.5 }}>{activeToken.deva}</div>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>
              {activeToken.id} ({activeTokenIndex + 1}/{allTokens.length}){" "}
              {highlightedTokenIds.has(activeToken.id) ? "mapped" : "unmapped"}
            </div>
            <div style={{ fontSize: 12, color: "#555" }}>In annotate mode, new box binds to current token and advances automatically.</div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#555" }}>No karaoke tokens found.</div>
        )}
      </section>

      {debugVisible ? (
        <section
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            background: "#f7f7f7",
            border: "1px solid #ddd",
            padding: 8,
            borderRadius: 4
          }}
        >
          <div>page: {page.page}</div>
          <div>
            svg-size: {page.width.toFixed(2)} x {page.height.toFixed(2)}
          </div>
          <div>
            rendered-size: {stageWidth.toFixed(2)} x {stageHeight.toFixed(2)}
          </div>
          <div>fit-scale: {fitScale.toFixed(4)}</div>
          <div>zoom: {zoom.toFixed(2)}</div>
          <div>display-scale: {displayScale.toFixed(4)}</div>
          <div>
            mouse(svg): {mouseSvg ? `${mouseSvg.x.toFixed(2)}, ${mouseSvg.y.toFixed(2)}` : "-"}
          </div>
        </section>
      ) : null}

      <div ref={containerRef} style={{ width: "100%", overflow: "auto", border: "1px solid #ddd", padding: 8 }}>
        <div
          ref={stageRef}
          style={{
            position: "relative",
            width: stageWidth,
            height: stageHeight,
            margin: "0 auto",
            userSelect: "none"
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => setMouseSvg(null)}
        >
          <canvas
            ref={imageCanvasRef}
            aria-label={`Visual page ${page.page}`}
            style={{ width: stageWidth, height: stageHeight, display: "block" }}
          />

          <div style={{ position: "absolute", inset: 0 }}>
            {annotateMode || debugVisible
              ? pageHighlights.map((rect) => (
                  <div
                    key={rect.id}
                    title={rect.label ?? rect.id}
                    style={{
                      position: "absolute",
                      left: rect.x * displayScale,
                      top: rect.y * displayScale,
                      width: rect.w * displayScale,
                      height: rect.h * displayScale,
                      boxSizing: "border-box",
                      border: rect.id === activeToken?.id ? "2px solid rgba(0, 140, 255, 0.95)" : "1px solid rgba(255, 180, 0, 0.85)",
                      background: "transparent"
                    }}
                  />
                ))
              : null}

            {draftRect ? (
              <div
                style={{
                  position: "absolute",
                  left: draftRect.x * displayScale,
                  top: draftRect.y * displayScale,
                  width: draftRect.w * displayScale,
                  height: draftRect.h * displayScale,
                  boxSizing: "border-box",
                  border: "2px dashed rgba(0, 100, 255, 0.95)",
                  background: "rgba(0, 100, 255, 0.12)"
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
