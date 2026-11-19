import { signal } from "@preact/signals";
import { KEYS } from "./constants";
import { readText, writeText } from "./storage";

export class TTSController {
  playing = signal(false);
  paused = signal(false);
  progress = signal(0);
  title = signal("Article");
  onSegment?: (element: HTMLElement | null) => void;

  private segments: string[] = [];
  private elements: (HTMLElement | null)[] = [];
  private index = 0;
  private stopping = false;
  private token = 0;
  private current: SpeechSynthesisUtterance | null = null;

  get rate(): number {
    return parseFloat(readText(KEYS.ttsRate, "1")) || 1;
  }

  set rate(value: number) {
    writeText(KEYS.ttsRate, String(value));
  }

  setContent(elements: HTMLElement[], title = "Article"): void {
    this.segments = [];
    this.elements = [];
    this.title.value = title;
    for (const element of elements) {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 3) continue;
      if (text.length > 200) {
        for (const sentence of text.match(/[^.!?]+[.!?]*/g) || []) {
          if (sentence.trim().length <= 3) continue;
          this.segments.push(sentence.trim());
          this.elements.push(element);
        }
      } else {
        this.segments.push(text);
        this.elements.push(element);
      }
    }
  }

  private highlight(paused: boolean): void {
    this.onSegment?.(null);
    document.querySelectorAll(".tts-active,.tts-paused").forEach((node) => node.classList.remove("tts-active", "tts-paused"));
    const element = this.elements[this.index];
    if (element) {
      element.classList.add(paused ? "tts-paused" : "tts-active");
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      this.onSegment?.(element);
    }
  }

  private speak(token = this.token): void {
    if (this.stopping || this.paused.value) return;
    if (this.index >= this.segments.length) {
      this.stop();
      return;
    }
    this.highlight(false);
    this.progress.value = this.segments.length ? Math.round((this.index / this.segments.length) * 100) : 0;
    const utterance = new SpeechSynthesisUtterance(this.segments[this.index]);
    this.current = utterance;
    utterance.rate = this.rate;
    utterance.lang = "en-AU";
    try {
      const voices = speechSynthesis.getVoices() || [];
      const voice = voices.find((item) => item.lang === "en-AU") || voices.find((item) => item.lang.startsWith("en"));
      if (voice) utterance.voice = voice;
    } catch { /* no voices available */ }
    utterance.onend = () => {
      if (this.stopping || token !== this.token) return;
      this.index++;
      this.speak(token);
    };
    utterance.onerror = () => {
      if (!this.stopping) this.stop();
    };
    try {
      speechSynthesis.speak(utterance);
    } catch {
      this.stop();
    }
  }

  private cancel(callback?: () => void): void {
    this.stopping = true;
    try {
      speechSynthesis.cancel();
    } catch { /* ignore */ }
    this.current = null;
    setTimeout(() => {
      this.stopping = false;
      callback?.();
    }, 60);
  }

  play(): void {
    if (!this.segments.length) return;
    this.cancel(() => {
      const token = ++this.token;
      this.index = 0;
      this.playing.value = true;
      this.paused.value = false;
      this.speak(token);
    });
  }

  pause(): void {
    if (!this.playing.value || this.paused.value) return;
    this.token++;
    this.stopping = true;
    try {
      speechSynthesis.cancel();
    } catch { /* ignore */ }
    this.stopping = false;
    this.paused.value = true;
    this.highlight(true);
  }

  resume(): void {
    if (!this.paused.value) return;
    const token = ++this.token;
    this.paused.value = false;
    this.playing.value = true;
    this.speak(token);
  }

  toggle(): void {
    if (this.playing.value && !this.paused.value) this.pause();
    else if (this.paused.value) this.resume();
    else this.play();
  }

  stop(): void {
    this.cancel(() => {
      this.token++;
      this.playing.value = false;
      this.paused.value = false;
      this.index = 0;
      this.progress.value = 0;
      this.current = null;
      this.onSegment?.(null);
      document.querySelectorAll(".tts-active,.tts-paused").forEach((node) => node.classList.remove("tts-active", "tts-paused"));
    });
  }
}

export const tts = new TTSController();
