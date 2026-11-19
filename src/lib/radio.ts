import { computed, signal } from "@preact/signals";
import { DEFAULT_RADIO, KEYS } from "./constants";
import type { RadioStation } from "./types";
import { readJSON, writeJSON } from "./storage";
import { normalizeError } from "./format";

interface RadioStore {
  custom?: RadioStation[];
  muted?: string[];
  order?: string[];
  removed?: string[];
  removedDefs?: RadioStation[];
}

const stored = readJSON<RadioStore>(KEYS.radio, {});
export const customStations = signal<RadioStation[]>(stored.custom || []);
export const mutedStations = signal<Set<string>>(new Set(stored.muted || []));
export const removedStations = signal<Set<string>>(new Set(stored.removed || []));
export const removedStationDefs = signal<RadioStation[]>(stored.removedDefs || []);
const defaultOrder = DEFAULT_RADIO.map((station) => station.name);
export const stationOrder = signal<string[]>(stored.order?.length ? stored.order : [...defaultOrder]);
export const allStations = computed(() => {
  const stations = [...DEFAULT_RADIO, ...customStations.value].filter((station) => !removedStations.value.has(station.name));
  const order = stationOrder.value;
  return stations
    .map((station, index) => ({ station, index }))
    .sort((a, b) => {
      const ai = order.indexOf(a.station.name);
      const bi = order.indexOf(b.station.name);
      return (ai < 0 ? order.length + a.index : ai) - (bi < 0 ? order.length + b.index : bi);
    })
    .map(({ station }) => station);
});
export const visibleStations = computed(() => allStations.value.filter((station) => !mutedStations.value.has(station.name)));
export const radioPlaying = signal(false);
export const radioStatus = signal("Tap play to start");
export const activeStationName = signal<string | null>(null);

export function persistRadio(): void {
  writeJSON(KEYS.radio, { custom: customStations.value, muted: [...mutedStations.value], order: stationOrder.value, removed: [...removedStations.value], removedDefs: removedStationDefs.value });
}

export function reorderStations(order: string[]): void {
  stationOrder.value = order;
  persistRadio();
}

export function normalizeStreamUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function addStation(station: RadioStation): boolean {
  const url = normalizeStreamUrl(station.url);
  if (!url) return false;
  if (allStations.value.some((item) => item.name === station.name || normalizeStreamUrl(item.url) === url)) return false;
  customStations.value = [...customStations.value, { ...station, url }];
  if (!stationOrder.value.includes(station.name)) stationOrder.value = [...stationOrder.value, station.name];
  if (removedStations.value.has(station.name)) {
    const restored = new Set(removedStations.value);
    restored.delete(station.name);
    removedStations.value = restored;
  }
  removedStationDefs.value = removedStationDefs.value.filter((item) => item.name !== station.name);
  persistRadio();
  return true;
}

export function removeStation(name: string): void {
  const def = allStations.value.find((station) => station.name === name) || customStations.value.find((station) => station.name === name) || removedStationDefs.value.find((station) => station.name === name);
  customStations.value = customStations.value.filter((station) => station.name !== name);
  if (def) removedStationDefs.value = [...removedStationDefs.value.filter((station) => station.name !== name), def];
  const muted = new Set(mutedStations.value);
  muted.delete(name);
  mutedStations.value = muted;
  const removed = new Set(removedStations.value);
  removed.add(name);
  removedStations.value = removed;
  stationOrder.value = stationOrder.value.filter((item) => item !== name);
  persistRadio();
}

export function restoreStation(name: string): void {
  const def = removedStationDefs.value.find((station) => station.name === name);
  if (!def) return;
  const custom = [...customStations.value.filter((station) => station.name !== name), def];
  customStations.value = custom;
  removedStationDefs.value = removedStationDefs.value.filter((station) => station.name !== name);
  const removed = new Set(removedStations.value);
  removed.delete(name);
  removedStations.value = removed;
  if (!stationOrder.value.includes(name)) stationOrder.value = [...stationOrder.value, name];
  persistRadio();
}

export function toggleMute(name: string): void {
  const next = new Set(mutedStations.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  mutedStations.value = next;
  persistRadio();
}

const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js";

interface HlsInstance {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  on(event: string, callback: (...args: any[]) => void): void;
  startLoad(): void;
  recoverMediaError(): void;
  destroy(): void;
}

interface HlsClassType {
  new (config: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  Events: Record<string, string>;
  ErrorTypes: Record<string, string>;
}

let audio: HTMLAudioElement | null = null;
let hls: HlsInstance | null = null;
let hlsPromise: Promise<HlsClassType | null> | null = null;
let manualPause = false;

export function bindAudio(element: HTMLAudioElement | null): void {
  audio = element;
  if (!element) return;
  element.onplay = () => {
    radioPlaying.value = true;
    radioStatus.value = "Streaming live";
  };
  element.onpause = () => {
    radioPlaying.value = false;
    radioStatus.value = manualPause ? "Paused" : "Stopped";
    manualPause = false;
  };
  element.onerror = () => {
    radioPlaying.value = false;
    radioStatus.value = "Stream error — try another station";
  };
}

function loadHls(): Promise<HlsClassType | null> {
  const global = globalThis as unknown as { Hls?: HlsClassType };
  if (global.Hls) return Promise.resolve(global.Hls);
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve) => {
    const existing = document.getElementById("hls-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(global.Hls || null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "hls-script";
    script.src = HLS_CDN;
    script.async = true;
    script.onload = () => resolve(global.Hls || null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return hlsPromise;
}

export async function playStation(station: RadioStation): Promise<void> {
  if (!audio) return;
  manualPause = false;
  stopPlayback();
  activeStationName.value = station.name;
  const isHls = station.url.includes(".m3u8");
  radioStatus.value = "Connecting…";
  try {
    if (isHls && !audio.canPlayType("application/vnd.apple.mpegurl")) {
      const HlsClass = await loadHls();
      if (!HlsClass?.isSupported()) {
        radioStatus.value = "Can't play HLS — try a non-HLS station";
        return;
      }
      radioStatus.value = "Loading player…";
      hls = new HlsClass({ enableWorker: true, lowLatencyMode: true, fragLoadingMaxRetry: 4, manifestLoadingMaxRetry: 3, levelLoadingMaxRetry: 3 });
      hls.loadSource(station.url);
      hls.attachMedia(audio);
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        radioStatus.value = "Connecting…";
        void audio?.play().catch((err: Error) => {
          if (err.name === "NotAllowedError") radioStatus.value = "Tap play to start";
        });
      });
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
          radioStatus.value = "Reconnecting…";
          hls?.startLoad();
        } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
          radioStatus.value = "Recovering…";
          hls?.recoverMediaError();
        } else {
          radioStatus.value = "Stream error — swipe to try another";
        }
      });
      return;
    }
    audio.src = station.url;
    await audio.play();
  } catch (err) {
    radioStatus.value = (err as Error).name === "NotAllowedError" ? "Tap play to start" : `Stream error — ${normalizeError(err)}`;
  }
}

function stopPlayback(): void {
  try {
    hls?.destroy();
  } catch { /* ignore */ }
  hls = null;
  try {
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  } catch { /* ignore */ }
}

export function toggleRadio(): void {
  if (!audio) return;
  if (audio.paused) {
    if (!audio.src || audio.error) return;
    void audio.play().catch(() => undefined);
  } else {
    manualPause = true;
    audio.pause();
  }
}

export function stopRadio(): void {
  manualPause = false;
  stopPlayback();
  radioPlaying.value = false;
  activeStationName.value = null;
}

export function setVolume(value: number): void {
  if (audio) audio.volume = value;
}
