import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AudioPlayer, type AudioPlayerHandle } from "../components/AudioPlayer";
import { ImageKaraokeViewer } from "../components/ImageKaraokeViewer";
import { getAssetUrl, loadAnnotations } from "../lib/annotations";
import type { AnnotationsFile } from "../types/annotations";

export function SuktaKaraokePage(): JSX.Element {
  const { slug = "sample" } = useParams();
  const [annotations, setAnnotations] = useState<AnnotationsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<AudioPlayerHandle | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    setAnnotations(null);

    loadAnnotations(slug)
      .then((data) => {
        if (mounted) {
          setAnnotations(data);
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

  const imageSrc = useMemo(() => (annotations ? getAssetUrl(annotations.slug, annotations.image) : ""), [annotations]);
  const audioSrc = useMemo(() => (annotations ? getAssetUrl(annotations.slug, annotations.audio) : ""), [annotations]);

  if (error) {
    return <p>Could not load annotations: {error}</p>;
  }

  if (!annotations) {
    return <p>Loading...</p>;
  }

  return (
    <main style={{ display: "grid", gap: 16, padding: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>Sukta: {annotations.slug}</h1>
        <p style={{ marginTop: 6 }}>
          {currentTime.toFixed(2)} / {duration.toFixed(2)} seconds {isPlaying ? "(playing)" : "(paused)"}
        </p>
      </header>

      <ImageKaraokeViewer
        imageSrc={imageSrc}
        annotations={annotations}
        currentTime={currentTime}
        onSeek={(time) => playerRef.current?.seek(time)}
      />

      <AudioPlayer
        ref={playerRef}
        src={audioSrc}
        onTimeUpdate={setCurrentTime}
        onDurationChange={setDuration}
        onPlayingChange={setIsPlaying}
      />
    </main>
  );
}
