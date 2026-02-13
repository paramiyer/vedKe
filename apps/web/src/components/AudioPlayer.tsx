import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TimelineScrubber } from "./TimelineScrubber";

export type AudioPlayerHandle = {
  seek: (time: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  getCurrentTime: () => number;
};

type AudioPlayerProps = {
  src: string;
  onTimeUpdate: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayingChange?: (playing: boolean) => void;
};

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const n = Math.floor(seconds);
  const mm = Math.floor(n / 60);
  const ss = n % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  { src, onTimeUpdate, onDurationChange, onPlayingChange },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      seek(time: number) {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.max(0, Math.min(time, duration || time));
        setCurrentTime(audio.currentTime);
        onTimeUpdate(audio.currentTime);
      },
      async play() {
        const audio = audioRef.current;
        if (!audio) return;
        await audio.play();
      },
      pause() {
        audioRef.current?.pause();
      },
      getCurrentTime() {
        return audioRef.current?.currentTime ?? 0;
      }
    }),
    [duration, onTimeUpdate]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const stopRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const tick = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      onTimeUpdate(t);
      rafRef.current = requestAnimationFrame(tick);
    };

    const onLoadedMetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(d);
      onDurationChange?.(d);
    };

    const onPlay = () => {
      setPlaying(true);
      onPlayingChange?.(true);
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const onPause = () => {
      setPlaying(false);
      onPlayingChange?.(false);
      stopRaf();
      const t = audio.currentTime;
      setCurrentTime(t);
      onTimeUpdate(t);
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
  }, [onDurationChange, onPlayingChange, onTimeUpdate]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const onSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = Math.max(0, Math.min(time, duration || time));
    setCurrentTime(audio.currentTime);
    onTimeUpdate(audio.currentTime);
  };

  return (
    <div>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button type="button" onClick={togglePlayback}>
          {playing ? "Pause" : "Play"}
        </button>
        <span>
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
      <TimelineScrubber value={currentTime} max={duration} onSeek={onSeek} />
    </div>
  );
});
