import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import useResizeObserver from "use-resize-observer";
import { AudioPlayer, type AudioPlayerHandle } from "../components/AudioPlayer";
import { getAssetUrl, loadAnnotations, nextItemId, toPrettyJson, validateAnnotationsFile } from "../lib/annotations";
import type { AnnotationItem, AnnotationsFile } from "../types/annotations";

type AnnotatePageProps = {
  slugs: string[];
};

type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normRect(a: Point, b: Point): [number, number, number, number] {
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
}

function formatMaybe(n?: number): string {
  return n === undefined ? "-" : n.toFixed(2);
}

export function AnnotatePage({ slugs }: AnnotatePageProps): JSX.Element {
  const [selectedSlug, setSelectedSlug] = useState(slugs[0] ?? "sample");
  const [annotations, setAnnotations] = useState<AnnotationsFile | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const { ref: containerRef, width = 1, height = 1 } = useResizeObserver<HTMLDivElement>();

  useEffect(() => {
    let mounted = true;
    setError(null);
    setMessage("");

    loadAnnotations(selectedSlug)
      .then((data) => {
        if (!mounted) return;
        setAnnotations(data);
        setSelectedIndex(0);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      mounted = false;
    };
  }, [selectedSlug]);

  const imageSrc = useMemo(() => (annotations ? getAssetUrl(annotations.slug, annotations.image) : ""), [annotations]);
  const audioSrc = useMemo(() => (annotations ? getAssetUrl(annotations.slug, annotations.audio) : ""), [annotations]);
  const selectedItem = annotations?.items[selectedIndex] ?? null;

  const scaleX = annotations ? width / annotations.w : 1;
  const scaleY = annotations ? height / annotations.h : 1;

  const setItems = useCallback((fn: (items: AnnotationItem[]) => AnnotationItem[]) => {
    setAnnotations((prev) => {
      if (!prev) return prev;
      return { ...prev, items: fn(prev.items) };
    });
  }, []);

  const pointerToOriginal = (event: React.MouseEvent<SVGSVGElement>): Point | null => {
    if (!annotations || !overlayRef.current) {
      return null;
    }

    const rect = overlayRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    return {
      x: nx * annotations.w,
      y: ny * annotations.h
    };
  };

  const onMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!annotations) {
      return;
    }
    const point = pointerToOriginal(event);
    if (!point) {
      return;
    }
    setDragStart(point);
    setDragCurrent(point);
  };

  const onMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!dragStart) {
      return;
    }
    const point = pointerToOriginal(event);
    if (!point) {
      return;
    }
    setDragCurrent(point);
  };

  const onMouseUp = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!annotations || !dragStart) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const end = pointerToOriginal(event) ?? dragCurrent ?? dragStart;
    const bbox = normRect(dragStart, end);

    setDragStart(null);
    setDragCurrent(null);

    if (bbox[2] - bbox[0] < 2 || bbox[3] - bbox[1] < 2) {
      return;
    }

    const nextIndex = annotations.items.length;
    setItems((items) => [...items, { id: nextItemId(items), bbox }]);
    setSelectedIndex(nextIndex);
  };

  const deleteSelected = () => {
    if (!annotations || annotations.items.length === 0) {
      return;
    }

    const nextLength = annotations.items.length - 1;
    setItems((items) => items.filter((_, i) => i !== selectedIndex));
    setSelectedIndex((prev) => Math.max(0, Math.min(prev, nextLength - 1)));
  };

  const moveSelected = (delta: -1 | 1) => {
    if (!annotations) {
      return;
    }
    const nextIndex = selectedIndex + delta;
    if (nextIndex < 0 || nextIndex >= annotations.items.length) {
      return;
    }

    setItems((items) => {
      const copy = [...items];
      [copy[selectedIndex], copy[nextIndex]] = [copy[nextIndex], copy[selectedIndex]];
      return copy;
    });

    setSelectedIndex(nextIndex);
  };

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!annotations) {
        return;
      }

      setItems((items) =>
        items.map((item, index) => {
          if (index !== selectedIndex) {
            return item;
          }
          const [x0, y0, x1, y1] = item.bbox;
          const w = x1 - x0;
          const h = y1 - y0;
          const nx0 = clamp(x0 + dx, 0, annotations.w - w);
          const ny0 = clamp(y0 + dy, 0, annotations.h - h);
          return { ...item, bbox: [nx0, ny0, nx0 + w, ny0 + h] };
        })
      );
    },
    [annotations, selectedIndex, setItems]
  );

  const adjustTime = (field: "t0" | "t1", delta: number) => {
    if (!annotations || !selectedItem) {
      return;
    }

    setItems((items) =>
      items.map((item, index) => {
        if (index !== selectedIndex) {
          return item;
        }

        const next = { ...item };

        if (field === "t0") {
          const candidate = Math.max(0, (next.t0 ?? 0) + delta);
          if (next.t1 !== undefined && candidate >= next.t1) {
            next.t0 = Math.max(0, next.t1 - 0.01);
          } else {
            next.t0 = candidate;
          }
        } else {
          const min = (next.t0 ?? 0) + 0.01;
          const base = next.t1 ?? min;
          next.t1 = Math.max(min, base + delta);
        }

        return next;
      })
    );
  };

  const captureTiming = useCallback(() => {
    if (!annotations || annotations.items.length === 0) {
      return;
    }

    const idx = clamp(selectedIndex, 0, annotations.items.length - 1);
    const now = playerRef.current?.getCurrentTime() ?? 0;

    setItems((items) =>
      items.map((item, index) => {
        if (index !== idx) {
          return item;
        }

        if (item.t0 === undefined) {
          return { ...item, t0: now };
        }

        if (item.t1 === undefined) {
          return { ...item, t1: Math.max(item.t0 + 0.01, now) };
        }

        return item;
      })
    );

    const current = annotations.items[idx];
    if (current.t0 !== undefined && current.t1 === undefined) {
      setSelectedIndex(Math.min(idx + 1, annotations.items.length - 1));
    }
  }, [annotations, selectedIndex, setItems]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        captureTiming();
      }
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        nudgeSelected(-1, 0);
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        nudgeSelected(1, 0);
      }
      if (event.code === "ArrowUp") {
        event.preventDefault();
        nudgeSelected(0, -1);
      }
      if (event.code === "ArrowDown") {
        event.preventDefault();
        nudgeSelected(0, 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureTiming, nudgeSelected]);

  const downloadJson = () => {
    if (!annotations) {
      return;
    }
    saveAs(new Blob([toPrettyJson(annotations)], { type: "application/json;charset=utf-8" }), "annotations.json");
    setMessage("Downloaded annotations.json");
  };

  const copyJson = async () => {
    if (!annotations) {
      return;
    }
    try {
      await navigator.clipboard.writeText(toPrettyJson(annotations));
      setMessage("Copied JSON to clipboard");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const parsed = validateAnnotationsFile(JSON.parse(await file.text()));
      setAnnotations(parsed);
      setSelectedSlug(parsed.slug);
      setSelectedIndex(0);
      setMessage("Imported annotations JSON successfully");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const draftRect = annotations && dragStart && dragCurrent ? normRect(dragStart, dragCurrent) : null;

  if (error) {
    return (
      <main style={{ padding: 20 }}>
        <p>Error: {error}</p>
      </main>
    );
  }

  if (!annotations) {
    return (
      <main style={{ padding: 20 }}>
        <p>Loading annotations...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, display: "grid", gap: 12 }}>
      <h1>Annotation Tool</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label htmlFor="slug">Slug</label>
        <select id="slug" value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)}>
          {slugs.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
        <button type="button" onClick={downloadJson}>
          Download annotations.json
        </button>
        <button type="button" onClick={copyJson}>
          Copy JSON to clipboard
        </button>
        <label style={{ border: "1px solid #94a3b8", padding: "4px 8px", cursor: "pointer" }}>
          Re-import JSON
          <input type="file" accept="application/json" onChange={importJson} style={{ display: "none" }} />
        </label>
      </div>

      {message ? <p style={{ margin: 0 }}>{message}</p> : null}

      <p style={{ margin: 0 }}>
        Draw mode: drag on image. Timing mode: press Space to set t0 then t1 (auto-advance). Arrow keys nudge selected bbox.
      </p>
      <p style={{ margin: 0 }}>
        currentTime={currentTime.toFixed(2)} duration={duration.toFixed(2)}
      </p>

      <div ref={containerRef} style={{ position: "relative", width: "100%", lineHeight: 0 }}>
        <img src={imageSrc} alt={annotations.slug} style={{ width: "100%", display: "block" }} />
        <svg
          ref={overlayRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          {annotations.items.map((item, index) => {
            const [x0, y0, x1, y1] = item.bbox;
            const x = x0 * scaleX;
            const y = y0 * scaleY;
            const w = (x1 - x0) * scaleX;
            const h = (y1 - y0) * scaleY;
            const selected = index === selectedIndex;

            return (
              <rect
                key={item.id}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={selected ? "rgba(14,165,233,0.2)" : "rgba(100,116,139,0.08)"}
                stroke={selected ? "#0ea5e9" : "#64748b"}
                strokeWidth={selected ? 2 : 1}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(index);
                }}
              />
            );
          })}

          {draftRect ? (
            <rect
              x={draftRect[0] * scaleX}
              y={draftRect[1] * scaleY}
              width={(draftRect[2] - draftRect[0]) * scaleX}
              height={(draftRect[3] - draftRect[1]) * scaleY}
              fill="rgba(249,115,22,0.15)"
              stroke="#f97316"
              strokeWidth={2}
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </div>

      <AudioPlayer ref={playerRef} src={audioSrc} onTimeUpdate={setCurrentTime} onDurationChange={setDuration} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={deleteSelected}>
          Delete selected
        </button>
        <button type="button" onClick={() => moveSelected(-1)}>
          Move up
        </button>
        <button type="button" onClick={() => moveSelected(1)}>
          Move down
        </button>
        <button type="button" onClick={captureTiming}>
          Tap timing (Space)
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => adjustTime("t0", -0.1)}>
          t0 -0.10
        </button>
        <button type="button" onClick={() => adjustTime("t0", -0.05)}>
          t0 -0.05
        </button>
        <button type="button" onClick={() => adjustTime("t0", 0.05)}>
          t0 +0.05
        </button>
        <button type="button" onClick={() => adjustTime("t0", 0.1)}>
          t0 +0.10
        </button>
        <button type="button" onClick={() => adjustTime("t1", -0.1)}>
          t1 -0.10
        </button>
        <button type="button" onClick={() => adjustTime("t1", -0.05)}>
          t1 -0.05
        </button>
        <button type="button" onClick={() => adjustTime("t1", 0.05)}>
          t1 +0.05
        </button>
        <button type="button" onClick={() => adjustTime("t1", 0.1)}>
          t1 +0.10
        </button>
      </div>

      <section>
        <h2 style={{ marginBottom: 4 }}>Items ({annotations.items.length})</h2>
        <ol>
          {annotations.items.map((item, index) => (
            <li key={item.id}>
              <button type="button" onClick={() => setSelectedIndex(index)}>
                {index === selectedIndex ? "* " : ""}
                {item.id} bbox=[{item.bbox.map((n) => Math.round(n)).join(", ")}] t0={formatMaybe(item.t0)} t1={formatMaybe(item.t1)}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
