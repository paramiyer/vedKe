const DEVTOOLS_KEY = "veda.devtools";

export function isDevToolsEnabled(): boolean {
  const envEnabled = import.meta.env.VITE_DEV_TOOLS === "true";
  const localEnabled = typeof window !== "undefined" && localStorage.getItem(DEVTOOLS_KEY) === "1";
  return envEnabled || localEnabled;
}

export function getDevtoolsKey(): string {
  return DEVTOOLS_KEY;
}
