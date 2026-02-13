type TimelineScrubberProps = {
  value: number;
  max: number;
  onSeek: (time: number) => void;
};

export function TimelineScrubber({ value, max, onSeek }: TimelineScrubberProps): JSX.Element {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Math.min(Math.max(value, 0), safeMax);

  return (
    <input
      type="range"
      min={0}
      max={safeMax}
      step={0.01}
      value={safeValue}
      onChange={(event) => onSeek(Number(event.target.value))}
      style={{ width: "100%" }}
    />
  );
}
