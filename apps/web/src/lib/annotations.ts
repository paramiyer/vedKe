import type { AnnotationItem, AnnotationsFile } from "../types/annotations";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateItem(raw: unknown): AnnotationItem {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid annotation item");
  }

  const item = raw as Record<string, unknown>;

  if (typeof item.id !== "string" || item.id.length === 0) {
    throw new Error("Annotation item id is required");
  }

  if (!Array.isArray(item.bbox) || item.bbox.length !== 4 || !item.bbox.every(isFiniteNumber)) {
    throw new Error(`Invalid bbox for ${item.id}`);
  }

  const bbox = item.bbox as [number, number, number, number];
  if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
    throw new Error(`bbox must have x1>x0 and y1>y0 for ${item.id}`);
  }

  const result: AnnotationItem = {
    id: item.id,
    bbox
  };

  if (item.t0 !== undefined) {
    if (!isFiniteNumber(item.t0) || item.t0 < 0) {
      throw new Error(`Invalid t0 for ${item.id}`);
    }
    result.t0 = item.t0;
  }

  if (item.t1 !== undefined) {
    if (!isFiniteNumber(item.t1) || item.t1 < 0) {
      throw new Error(`Invalid t1 for ${item.id}`);
    }
    result.t1 = item.t1;
  }

  if (result.t0 !== undefined && result.t1 !== undefined && result.t1 <= result.t0) {
    throw new Error(`t1 must be greater than t0 for ${item.id}`);
  }

  return result;
}

export function validateAnnotationsFile(raw: unknown): AnnotationsFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid annotations file");
  }

  const data = raw as Record<string, unknown>;

  if (typeof data.slug !== "string" || data.slug.length === 0) {
    throw new Error("slug is required");
  }
  if (typeof data.image !== "string" || data.image.length === 0) {
    throw new Error("image is required");
  }
  if (typeof data.audio !== "string" || data.audio.length === 0) {
    throw new Error("audio is required");
  }
  if (!isFiniteNumber(data.w) || data.w <= 0 || !isFiniteNumber(data.h) || data.h <= 0) {
    throw new Error("w and h must be positive numbers");
  }
  if (!Array.isArray(data.items)) {
    throw new Error("items must be an array");
  }

  const items = data.items.map((item) => validateItem(item));

  return {
    slug: data.slug,
    image: data.image,
    audio: data.audio,
    w: data.w,
    h: data.h,
    items
  };
}

export async function loadAnnotations(slug: string): Promise<AnnotationsFile> {
  const response = await fetch(`/assets/suktas/${slug}/annotations.json`);
  if (!response.ok) {
    throw new Error(`Failed to load annotations for slug ${slug}`);
  }
  return validateAnnotationsFile(await response.json());
}

export function getAssetUrl(slug: string, name: string): string {
  return `/assets/suktas/${slug}/${name}`;
}

export function nextItemId(items: AnnotationItem[]): string {
  return `w${String(items.length + 1).padStart(3, "0")}`;
}

export function toPrettyJson(value: AnnotationsFile): string {
  return JSON.stringify(value, null, 2);
}
