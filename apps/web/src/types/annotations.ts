export type BBox = [number, number, number, number];

export type AnnotationItem = {
  id: string;
  bbox: BBox;
  t0?: number;
  t1?: number;
};

export type AnnotationsFile = {
  slug: string;
  image: string;
  audio: string;
  w: number;
  h: number;
  items: AnnotationItem[];
};

export type PlayerState = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
};
