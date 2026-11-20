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
export const uiFontSize = signal(numberPref(KEYS.uiFont, 14, 11, 20));
export const uiFontWeight = signal(numberPref(KEYS.uiWeight, 400, 300, 700));
export const uiLineHeight = signal(numberPref(KEYS.uiLineHeight, 1.5, 1.2, 2));
export const uiIconScale = signal(numberPref(KEYS.uiIconScale, 1, 0.85, 1.25));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numberPref(key: string, fallback: number, min: number, max: number): number {
  const value = Number(readText(key, String(fallback)));
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

let fontStyle: HTMLStyleElement | null = null;

export function applyPrefs(): void {
  const root = document.documentElement;
  if (theme.value === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  root.dataset.night = night.value;
  if (fontActive.value === "hand") root.dataset.font = "hand";
  else if (fontActive.value && fontActive.value !== "hand") root.dataset.font = "user";
  else delete root.dataset.font;
  root.style.setProperty("--rfs", `${fontSize.value}px`);
  root.style.setProperty("--ui-font-size", `${uiFontSize.value}px`);
  root.style.setProperty("--ui-font-weight", String(uiFontWeight.value));
  root.style.setProperty("--ui-line-height", String(uiLineHeight.value));
  root.style.setProperty("--ui-icon-scale", String(uiIconScale.value));
  if (fontActive.value.startsWith("http")) {
    if (!fontStyle) {
      fontStyle = document.createElement("style");
      document.head.append(fontStyle);
    }
    const extension = /\.(woff2)$/i.test(fontActive.value) ? "woff2" : /\.(woff)$/i.test(fontActive.value) ? "woff" : "truetype";
    fontStyle.textContent = `@font-face{font-family:"UserFont";src:url("${fontActive.value}") format("${extension}");font-display:swap}
      html[data-font="user"] *{font-family:"UserFont",-apple-system,system-ui,sans-serif !important}`;
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

export function setReaderFontSize(value: number): void {
  fontSize.value = clamp(value, 14, 26);
  writeText(KEYS.font, String(fontSize.value));
  applyPrefs();
}

export function changeFontSize(delta: number): void {
  setReaderFontSize(fontSize.value + delta);
}

export function setUiFontSize(value: number): void {
  uiFontSize.value = clamp(value, 11, 20);
  fontSize.value = clamp(uiFontSize.value + 3, 14, 26);
  writeText(KEYS.uiFont, String(uiFontSize.value));
  writeText(KEYS.font, String(fontSize.value));
  applyPrefs();
}

export function setUiFontWeight(value: number): void {
  uiFontWeight.value = clamp(value, 300, 700);
  writeText(KEYS.uiWeight, String(uiFontWeight.value));
  applyPrefs();
}

export function setUiLineHeight(value: number): void {
  uiLineHeight.value = Math.max(1.2, Math.min(2, value));
  writeText(KEYS.uiLineHeight, String(uiLineHeight.value));
  applyPrefs();
}

export function setUiIconScale(value: number): void {
  uiIconScale.value = clamp(value, 0.85, 1.25);
  writeText(KEYS.uiIconScale, String(uiIconScale.value));
  applyPrefs();
}

export function resetTypography(): void {
  setUiFontSize(14);
  setUiFontWeight(400);
  setUiLineHeight(1.5);
  setUiIconScale(1);
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
