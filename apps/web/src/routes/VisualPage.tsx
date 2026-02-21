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
  kind: "word" | "punct";
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

type HighlightsFile = {
  pages: Record<string, HighlightRect[]>;
};

type TimingToken = {
  i: number;
  t: string;
  norm: string;
  s: number;
  e: number;
  c: number;
};

type TimingsFile = {
  audio: {
    source: string;
    url: string;
    file: string;
    duration_ms: number;
  };
  tokens: TimingToken[];
  meta: {
    method: string;
    created_at: string;
  };
};

type AnchorPoint = {
  token_index: number;
  audio_time_ms: number;
};

type Point = { x: number; y: number };
type CapturedClick = {
  clientX: number;
  clientY: number;
  svgX: number;
  svgY: number;
};

const PIN_OFFSET_MIN_PX = 72;
const PIN_OFFSET_RATIO = 0.35;

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

function validateTimings(raw: unknown): TimingsFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("timings.json must be an object");
  }
  const data = raw as Record<string, unknown>;
  const audio = data.audio as Record<string, unknown>;
  if (!audio || typeof audio !== "object") {
    throw new Error("timings.json missing audio");
  }
  if (!Array.isArray(data.tokens)) {
    throw new Error("timings.json missing tokens[]");
  }
  const tokens: TimingToken[] = data.tokens.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`timings token at index ${index} invalid`);
    }
    const item = row as Record<string, unknown>;
    return {
      i: typeof item.i === "number" ? item.i : index,
      t: typeof item.t === "string" ? item.t : "",
      norm: typeof item.norm === "string" ? item.norm : "",
      s: typeof item.s === "number" ? item.s : 0,
      e: typeof item.e === "number" ? item.e : 0,
      c: typeof item.c === "number" ? item.c : 0
    };
  });
  return {
    audio: {
      source: typeof audio.source === "string" ? audio.source : "",
      url: typeof audio.url === "string" ? audio.url : "",
      file: typeof audio.file === "string" ? audio.file : "",
      duration_ms: typeof audio.duration_ms === "number" ? audio.duration_ms : 0
    },
    tokens,
    meta: {
      method: typeof (data.meta as Record<string, unknown> | undefined)?.method === "string" ? String((data.meta as Record<string, unknown>).method) : "",
      created_at:
        typeof (data.meta as Record<string, unknown> | undefined)?.created_at === "string"
          ? String((data.meta as Record<string, unknown>).created_at)
          : ""
    }
  };
}

function findActiveTokenByTime(tokens: TimingToken[], tMs: number): number {
  if (tokens.length === 0) {
    return -1;
  }
  const t = Math.floor(tMs);
  let low = 0;
  let high = tokens.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const token = tokens[mid];
    if (t < token.s) {
      high = mid - 1;
    } else if (t > token.e) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return clamp(low, 0, tokens.length - 1);
}

function warpTimeWithAnchors(tMs: number, anchors: AnchorPoint[], tokenStarts: number[]): number {
  if (anchors.length === 0 || tokenStarts.length === 0) {
    return tMs;
  }
  const points = anchors
    .filter((anchor) => anchor.token_index >= 0 && anchor.token_index < tokenStarts.length)
    .map((anchor) => ({
      base: tokenStarts[anchor.token_index],
      audio: anchor.audio_time_ms
    }))
    .sort((a, b) => a.audio - b.audio);
  if (points.length === 0) {
    return tMs;
  }

  if (tMs <= points[0].audio) {
    return points[0].base + (tMs - points[0].audio);
  }
  const last = points[points.length - 1];
  if (tMs >= last.audio) {
    return last.base + (tMs - last.audio);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (tMs >= a.audio && tMs <= b.audio) {
      const span = Math.max(1, b.audio - a.audio);
      const ratio = (tMs - a.audio) / span;
      return a.base + (b.base - a.base) * ratio;
    }
  }
  return tMs;
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
        (item.kind !== "word" && item.kind !== "punct") ||
        typeof item.x !== "number" ||
        typeof item.y !== "number" ||
        typeof item.w !== "number" ||
        typeof item.h !== "number"
      ) {
        return;
      }
      rects.push({
        id: item.id,
        kind: item.kind,
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
  return { id: "", kind: "word", x, y, w: right - x, h: bottom - y };
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
  const [timings, setTimings] = useState<TimingsFile | null>(null);
  const [manifestUrl, setManifestUrl] = useState<string>("");
  const [highlights, setHighlights] = useState<HighlightsFile>({ pages: {} });
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeTokenIndex, setActiveTokenIndex] = useState(0);
  const [activeTokenReveal, setActiveTokenReveal] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [audioCurrentMs, setAudioCurrentMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [anchors, setAnchors] = useState<AnchorPoint[]>([]);
  const [zoom, setZoom] = useState(1);
  const [debugVisible, setDebugVisible] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [mouseSvg, setMouseSvg] = useState<Point | null>(null);
  const [capturedClick, setCapturedClick] = useState<CapturedClick | null>(null);
  const [scrollPausedByUser, setScrollPausedByUser] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioRafRef = useRef<number | null>(null);
  const visualScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPauseTimerRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const prevActiveTokenIndexRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const { ref: containerRef, width: containerWidth = 0 } = useResizeObserver<HTMLDivElement>();

  const storageKey = `veda.visual.highlights.${slug}`;
  const anchorsStorageKey = useMemo(() => {
    const audioKey = timings?.audio.url || timings?.audio.file || slug;
    return `veda.visual.anchors.${slug}.${audioKey}`;
  }, [slug, timings?.audio.file, timings?.audio.url]);

  useEffect(() => {
    let mounted = true;
    setManifest(null);
    setKaraoke(null);
    setManifestUrl("");
    setError(null);
    setPageIndex(0);
    setActiveTokenIndex(0);
    setCapturedClick(null);
    setScrollPausedByUser(false);
    setPlaying(false);
    setAudioCurrentMs(0);
    setAudioDurationMs(0);
    setAnchors([]);
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

    const timingCandidates = [`/suktas/${slug}/timings.json`, `/alignment/timings.json`, `/data/alignment/timings.json`];
    loadFirstJson(timingCandidates, slug)
      .then(({ data }) => {
        if (!mounted) {
          return;
        }
        setTimings(validateTimings(data));
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setTimings(null);
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

  useEffect(() => {
    let parsed: AnchorPoint[] = [];
    try {
      const raw = window.localStorage.getItem(anchorsStorageKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          parsed = data
            .filter((item) => item && typeof item === "object")
            .map((item) => {
              const row = item as Record<string, unknown>;
              return {
                token_index: typeof row.token_index === "number" ? row.token_index : -1,
                audio_time_ms: typeof row.audio_time_ms === "number" ? row.audio_time_ms : 0
              };
            })
            .filter((item) => item.token_index >= 0 && item.audio_time_ms >= 0);
        }
      }
    } catch {
      parsed = [];
    }
    setAnchors(parsed);
  }, [anchorsStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(anchorsStorageKey, JSON.stringify(anchors));
    } catch {
      // Ignore storage quota/private mode restrictions.
    }
  }, [anchors, anchorsStorageKey]);

  const page = manifest?.pages[pageIndex] ?? null;
  const pageKey = page ? String(page.page) : "";
  const pageHighlights = useMemo(() => (page ? highlights.pages[String(page.page)] ?? [] : []), [highlights.pages, page]);
  const allTokens = useMemo(() => karaoke?.lines.flatMap((line) => line.tokens) ?? [], [karaoke]);
  const activeToken = allTokens[activeTokenIndex] ?? null;
  const tokenToLineIndex = useMemo(() => {
    const mapping = new Map<string, number>();
    (karaoke?.lines ?? []).forEach((line, lineIndex) => {
      line.tokens.forEach((token) => mapping.set(token.id, lineIndex));
    });
    return mapping;
  }, [karaoke]);
  const activeLineIndex = activeToken ? tokenToLineIndex.get(activeToken.id) ?? 0 : 0;
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
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const stopRaf = () => {
      if (audioRafRef.current !== null) {
        window.cancelAnimationFrame(audioRafRef.current);
        audioRafRef.current = null;
      }
    };
    const tick = () => {
      setAudioCurrentMs(audio.currentTime * 1000);
      audioRafRef.current = window.requestAnimationFrame(tick);
    };
    const onLoadedMetadata = () => {
      setAudioDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
    };
    const onPlay = () => {
      setPlaying(true);
      if (audioRafRef.current === null) {
        audioRafRef.current = window.requestAnimationFrame(tick);
      }
    };
    const onPause = () => {
      setPlaying(false);
      setAudioCurrentMs(audio.currentTime * 1000);
      stopRaf();
    };
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      stopRaf();
    };
  }, [timings?.audio.file]);

  useEffect(() => {
    if (!timings || timings.tokens.length === 0 || allTokens.length === 0) {
      return;
    }
    const tokenStarts = timings.tokens.map((token) => token.s);
    const warpedTimeMs = warpTimeWithAnchors(audioCurrentMs, anchors, tokenStarts);
    const nextIndex = findActiveTokenByTime(timings.tokens, warpedTimeMs);
    if (nextIndex < 0) {
      return;
    }
    setActiveTokenIndex(clamp(nextIndex, 0, allTokens.length - 1));

    const row = timings.tokens[nextIndex];
    const span = Math.max(1, row.e - row.s);
    const reveal = clamp((warpedTimeMs - row.s) / span, 0, 1);
    setActiveTokenReveal(reveal);
  }, [allTokens.length, anchors, audioCurrentMs, timings]);

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
  const audioSrc = useMemo(() => {
    if (!timings?.audio.file) {
      return `/suktas/${slug}/audio.mp3`;
    }
    const file = timings.audio.file.trim();
    if (!file) {
      return `/suktas/${slug}/audio.mp3`;
    }
    return file.startsWith("/") ? file : `/${file}`;
  }, [slug, timings?.audio.file]);

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
  const activeLineRect = useMemo(() => {
    const rects = pageHighlights.filter(
      (rect) => rect.kind === "word" && tokenToLineIndex.get(rect.id) === activeLineIndex
    );
    if (rects.length === 0) {
      return null;
    }
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxBottom = Math.max(...rects.map((rect) => rect.y + rect.h));
    return { y: minY, h: maxBottom - minY };
  }, [activeLineIndex, pageHighlights, tokenToLineIndex]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      prefersReducedMotionRef.current = media.matches;
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollPauseTimerRef.current !== null) {
        window.clearTimeout(scrollPauseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas || !page || !pageSvgUrl || stageWidth <= 0 || stageHeight <= 0) {
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
        if (rect.kind === "punct") {
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

  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = pointerToSvg(event);
    if (!point) {
      return;
    }
    setCapturedClick({
      clientX: event.clientX,
      clientY: event.clientY,
      svgX: point.x,
      svgY: point.y
    });

    const clicked = pageHighlights.find(
      (rect) => point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
    );
    if (!clicked) {
      return;
    }
    const tokenIdx = tokenIndexById.get(clicked.id);
    if (tokenIdx === undefined) {
      return;
    }
    const nowMs = audioRef.current ? audioRef.current.currentTime * 1000 : audioCurrentMs;
    setAnchors((prev) => {
      const filtered = prev.filter((anchor) => anchor.token_index !== tokenIdx);
      return [...filtered, { token_index: tokenIdx, audio_time_ms: nowMs }].sort((a, b) => a.audio_time_ms - b.audio_time_ms);
    });
  };

  const markUserScrollInteraction = () => {
    if (programmaticScrollRef.current) {
      return;
    }
    setScrollPausedByUser(true);
    if (scrollPauseTimerRef.current !== null) {
      window.clearTimeout(scrollPauseTimerRef.current);
    }
    scrollPauseTimerRef.current = window.setTimeout(() => {
      setScrollPausedByUser(false);
      scrollPauseTimerRef.current = null;
    }, 2500);
  };

  const recenterPinnedLine = () => {
    const container = visualScrollRef.current;
    if (!container || !page || !activeLineRect) {
      return;
    }
    const pinOffsetPx = Math.max(PIN_OFFSET_MIN_PX, container.clientHeight * PIN_OFFSET_RATIO);
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const target = clamp(activeLineRect.y * displayScale - pinOffsetPx, 0, maxScroll);
    setScrollPausedByUser(false);
    if (scrollPauseTimerRef.current !== null) {
      window.clearTimeout(scrollPauseTimerRef.current);
      scrollPauseTimerRef.current = null;
    }
    programmaticScrollRef.current = true;
    container.scrollTo({ top: target, behavior: prefersReducedMotionRef.current ? "auto" : "smooth" });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 140);
  };

  useEffect(() => {
    const container = visualScrollRef.current;
    if (!container || !page || !activeLineRect || scrollPausedByUser) {
      prevActiveTokenIndexRef.current = activeLineIndex;
      return;
    }
    const pinOffsetPx = Math.max(PIN_OFFSET_MIN_PX, container.clientHeight * PIN_OFFSET_RATIO);
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const target = clamp(activeLineRect.y * displayScale - pinOffsetPx, 0, maxScroll);
    const delta = Math.abs(activeLineIndex - prevActiveTokenIndexRef.current);
    prevActiveTokenIndexRef.current = activeLineIndex;
    const behavior: ScrollBehavior = prefersReducedMotionRef.current || delta > 1 ? "auto" : "smooth";
    programmaticScrollRef.current = true;
    container.scrollTo({ top: target, behavior });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 140);
  }, [activeLineIndex, activeLineRect, displayScale, page, scrollPausedByUser]);

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
      kind: activeToken?.kind ?? "word",
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
    if (timings?.tokens[clamped]) {
      const seekMs = timings.tokens[clamped].s;
      if (audioRef.current) {
        audioRef.current.currentTime = seekMs / 1000;
      }
      setAudioCurrentMs(seekMs);
      setActiveTokenReveal(0);
      return;
    }
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
          onClick={async () => {
            const audio = audioRef.current;
            if (!audio) {
              return;
            }
            if (!playing && activeTokenIndex >= allTokens.length - 1 && allTokens.length > 0 && timings?.tokens[0]) {
              audio.currentTime = timings.tokens[0].s / 1000;
              setAudioCurrentMs(timings.tokens[0].s);
            }
            if (audio.paused) {
              await audio.play().catch(() => undefined);
            } else {
              audio.pause();
            }
          }}
          disabled={allTokens.length === 0}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={recenterPinnedLine} disabled={!activeToken}>
          Recenter line
        </button>
        <label>
          Playback{" "}
          <select value={playbackRate} onChange={(e) => setPlaybackRate(Number.parseFloat(e.target.value))}>
            {[0.75, 0.85, 1, 1.15, 1.25].map((value) => (
              <option key={value} value={value}>
                {value.toFixed(2)}x
              </option>
            ))}
          </select>
        </label>
        <label>
          Seek{" "}
          <input
            type="range"
            min={0}
            max={Math.max(1, audioDurationMs)}
            value={Math.min(audioCurrentMs, Math.max(1, audioDurationMs))}
            onChange={(e) => {
              const nextMs = Number.parseFloat(e.target.value);
              if (audioRef.current && Number.isFinite(nextMs)) {
                audioRef.current.currentTime = nextMs / 1000;
                setAudioCurrentMs(nextMs);
              }
            }}
            style={{ width: 220 }}
          />
        </label>
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {Math.round(audioCurrentMs)}ms / {Math.round(audioDurationMs)}ms
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>active #{activeTokenIndex}</span>
        <button
          type="button"
          onClick={() => {
            if (!audioRef.current) {
              return;
            }
            setAnchors((prev) => {
              const filtered = prev.filter((item) => item.token_index !== activeTokenIndex);
              return [...filtered, { token_index: activeTokenIndex, audio_time_ms: audioRef.current!.currentTime * 1000 }].sort(
                (a, b) => a.audio_time_ms - b.audio_time_ms
              );
            });
          }}
          disabled={!timings}
        >
          Anchor active token
        </button>
        <button type="button" onClick={() => setAnchors([])} disabled={anchors.length === 0}>
          Clear anchors ({anchors.length})
        </button>
        <button type="button" onClick={downloadHighlights}>
          Export highlights.json
        </button>
        <button type="button" onClick={() => setDebugVisible((v) => !v)}>
          {debugVisible ? "Hide debug" : "Show debug"}
        </button>
      </section>

      <audio ref={audioRef} src={audioSrc} preload="metadata" />

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

      <section style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, display: "grid", gap: 6 }}>
        <strong>Click Coordinates</strong>
        {capturedClick ? (
          <>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>
              client: {capturedClick.clientX.toFixed(1)}, {capturedClick.clientY.toFixed(1)}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>
              svg: {capturedClick.svgX.toFixed(2)}, {capturedClick.svgY.toFixed(2)}
            </div>
            <button
              type="button"
              style={{ width: "fit-content" }}
              onClick={() => {
                const text = JSON.stringify(capturedClick);
                navigator.clipboard?.writeText(text).catch(() => undefined);
              }}
            >
              Copy coords JSON
            </button>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#555" }}>Click on the rendered page to capture coordinates.</div>
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

      <div
        ref={(el) => {
          containerRef(el);
          visualScrollRef.current = el;
        }}
        onWheel={markUserScrollInteraction}
        onTouchStart={markUserScrollInteraction}
        style={{ width: "100%", overflow: "auto", maxHeight: "72vh", border: "1px solid #ddd", padding: 8 }}
      >
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
          onClick={onStageClick}
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
