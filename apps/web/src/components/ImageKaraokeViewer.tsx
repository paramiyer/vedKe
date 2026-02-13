import useResizeObserver from "use-resize-observer";
import type { AnnotationItem, AnnotationsFile } from "../types/annotations";

type ImageKaraokeViewerProps = {
  imageSrc: string;
  annotations: AnnotationsFile;
  currentTime: number;
  onSeek: (time: number) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

function isActive(item: AnnotationItem, currentTime: number): boolean {
  return item.t0 !== undefined && item.t1 !== undefined && item.t0 <= currentTime && currentTime < item.t1;
}

function isCompleted(item: AnnotationItem, currentTime: number): boolean {
  return item.t1 !== undefined && currentTime >= item.t1;
}

export function ImageKaraokeViewer({
  imageSrc,
  annotations,
  currentTime,
  onSeek,
  selectedId,
  onSelect
}: ImageKaraokeViewerProps): JSX.Element {
  const { ref, width = 1, height = 1 } = useResizeObserver<HTMLDivElement>();

  const scaleX = width / annotations.w;
  const scaleY = height / annotations.h;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", lineHeight: 0 }}>
      <img src={imageSrc} alt={annotations.slug} style={{ width: "100%", height: "auto", display: "block" }} />
      <svg viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {annotations.items.map((item) => {
          const [x0, y0, x1, y1] = item.bbox;
          const x = x0 * scaleX;
          const y = y0 * scaleY;
          const w = (x1 - x0) * scaleX;
          const h = (y1 - y0) * scaleY;

          const active = isActive(item, currentTime);
          const completed = !active && isCompleted(item, currentTime);
          const selected = selectedId === item.id;

          const stroke = active ? "#f97316" : selected ? "#0ea5e9" : completed ? "#22c55e" : "#64748b";
          const fill = active ? "rgba(249,115,22,0.25)" : completed ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.08)";

          return (
            <rect
              key={item.id}
              x={x}
              y={y}
              width={w}
              height={h}
              stroke={stroke}
              strokeWidth={active || selected ? 2 : 1}
              fill={fill}
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (item.t0 !== undefined) {
                  onSeek(item.t0);
                }
                onSelect?.(item.id);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
