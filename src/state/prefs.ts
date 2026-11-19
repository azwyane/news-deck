import { signal } from "@preact/signals";
import { KEYS } from "../lib/constants";
import { readText, removeKey, writeText } from "../lib/storage";

export type Theme = "dark" | "light";
export type Night = "off" | "auto" | "on";

export const theme = signal<Theme>(readText(KEYS.theme, "") === "light" ? "light" : "dark");
export const fontActive = signal(readText(KEYS.fontActive, ""));
export const fontUrl = signal(readText(KEYS.fontUrl, ""));
export const night = signal<Night>((readText(KEYS.night, "off") as Night) || "off");
export const fontSize = signal(Number(readText(KEYS.font, "17")) || 17);

let fontStyle: HTMLStyleElement | null = null;

export function applyPrefs(): void {
  const root = document.documentElement;
  if (theme.value === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  root.dataset.night = night.value === "off" ? "auto" : night.value;
  if (fontActive.value === "hand") root.dataset.font = "hand";
  else if (fontActive.value && fontActive.value !== "hand") root.dataset.font = "user";
  else delete root.dataset.font;
  root.style.setProperty("--rfs", `${fontSize.value}px`);
  if (fontActive.value.startsWith("http")) {
    if (!fontStyle) {
      fontStyle = document.createElement("style");
      document.head.append(fontStyle);
    }
    const extension = /\.(woff2)$/i.test(fontActive.value) ? "woff2" : /\.(woff)$/i.test(fontActive.value) ? "woff" : "truetype";
    fontStyle.textContent = `@font-face{font-family:"UserFont";src:url("${fontActive.value}") format("${extension}");font-display:swap}
      html[data-font="user"] body,html[data-font="user"] .reader-body,html[data-font="user"] .card,html[data-font="user"] .card a.title,html[data-font="user"] .card .desc,html[data-font="user"] .reader-article h1,html[data-font="user"] .modal,html[data-font="user"] .sidebar-item,html[data-font="user"] #assistantChat,html[data-font="user"] #wrappedContent{font-family:"UserFont",-apple-system,system-ui,sans-serif !important}
      html[data-font="user"] .reader-body{line-height:1.85}`;
  } else {
    fontStyle?.remove();
    fontStyle = null;
  }
}

export function toggleTheme(): void {
  theme.value = theme.value === "light" ? "dark" : "light";
  writeText(KEYS.theme, theme.value);
  applyPrefs();
}

export function setFont(value: string): void {
  fontActive.value = value;
  writeText(KEYS.fontActive, value);
  applyPrefs();
}

export function setFontUrl(value: string): void {
  fontUrl.value = value;
  writeText(KEYS.fontUrl, value);
}

export function cycleNight(): Night {
  night.value = night.value === "off" ? "auto" : night.value === "auto" ? "on" : "off";
  writeText(KEYS.night, night.value);
  applyPrefs();
  return night.value;
}

export function changeFontSize(delta: number): void {
  fontSize.value = Math.max(14, Math.min(26, fontSize.value + delta));
  writeText(KEYS.font, String(fontSize.value));
  applyPrefs();
}

export function dismissInstall(): void {
  writeText(KEYS.installDismissed, "1");
}

export function clearInstallDismiss(): void {
  removeKey(KEYS.installDismissed);
}

export function installDismissed(): boolean {
  return !!readText(KEYS.installDismissed, "");
}
