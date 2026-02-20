const FALLBACK_SLUGS = ["sample"] as const;

type SuktaManifest = {
  slugs?: unknown;
};

export function fallbackSlugs(): string[] {
  return [...FALLBACK_SLUGS];
}

export async function loadSuktaSlugs(): Promise<string[]> {
  try {
    const response = await fetch("/suktas/manifest.json", { cache: "no-store" });
    if (!response.ok) {
      return fallbackSlugs();
    }

    const data = (await response.json()) as SuktaManifest;
    if (!Array.isArray(data.slugs)) {
      return fallbackSlugs();
    }

    const slugs = data.slugs.filter((v): v is string => typeof v === "string" && v.length > 0);
    return slugs.length > 0 ? slugs : fallbackSlugs();
  } catch {
    return fallbackSlugs();
  }
}

type VisualManifestProbe = {
  pages?: unknown;
};

export async function hasVisualAssets(slug: string): Promise<boolean> {
  try {
    const response = await fetch(`/suktas/${slug}/visual/visual.json`, { cache: "no-store" });
    if (!response.ok) {
      return false;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return false;
    }
    const data = (await response.json()) as VisualManifestProbe;
    return Array.isArray(data.pages);
  } catch {
    return false;
  }
}
