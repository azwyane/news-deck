import { signal } from "@preact/signals";
import { KEYS } from "./constants";
import { readJSON, writeJSON } from "./storage";
import type { ReadingStats, Story } from "./types";
import { classifyTopic, TOPIC_COLORS } from "./topics";

const empty: ReadingStats = { totalRead: 0, totalTime: 0, bySource: {}, byDate: {}, streak: 0, lastReadDate: null };
export const stats = signal<ReadingStats>({ ...empty, ...readJSON<Partial<ReadingStats>>(KEYS.stats, {}) });

let startedAt = 0;

export function startReading(): void {
  startedAt = Date.now();
}

export function finishReading(source: string): void {
  if (!startedAt) return;
  const elapsed = Date.now() - startedAt;
  startedAt = 0;
  if (elapsed < 5000) return;
  const current = stats.value;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const streak = current.lastReadDate === yesterday ? current.streak + 1 : current.lastReadDate !== today ? 1 : current.streak;
  stats.value = {
    ...current,
    totalRead: current.totalRead + 1,
    totalTime: current.totalTime + elapsed,
    bySource: { ...current.bySource, [source]: (current.bySource[source] || 0) + 1 },
    byDate: { ...current.byDate, [today]: (current.byDate[today] || 0) + 1 },
    streak,
    lastReadDate: today,
  };
  writeJSON(KEYS.stats, stats.value);
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return `${hours > 0 ? `${hours}h ` : ""}${minutes % 60}m`;
}

export interface WrappedData {
  totalRead: number;
  monthRead: number;
  duration: string;
  hours: number;
  streak: number;
  liked: number;
  topTopic?: { name: string; count: number; color: string };
  sourcesExplored: number;
  topSources: [string, number][];
  suggestion?: string;
}

export function wrappedData(readStories: Story[], liked: Story[], sources: string[], muted: Set<string>, removed: Set<string>): WrappedData {
  const current = stats.value;
  const minutes = Math.floor(current.totalTime / 60000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthRead = Object.entries(current.byDate).filter(([date]) => new Date(date) >= monthStart).reduce((sum, [, count]) => sum + count, 0);
  const topics: Record<string, number> = {};
  readStories.forEach((story) => {
    const topic = classifyTopic(story.title, story.desc);
    if (topic) topics[topic] = (topics[topic] || 0) + 1;
  });
  const top = Object.entries(topics).sort((a, b) => b[1] - a[1])[0];
  const explored = new Set(Object.keys(current.bySource));
  const suggestionPool = sources.filter((source) => !explored.has(source) && !muted.has(source) && !removed.has(source));
  return {
    totalRead: current.totalRead,
    monthRead,
    duration: formatDuration(current.totalTime),
    hours: Math.round((minutes / 60) * 10) / 10,
    streak: current.streak,
    liked: liked.length,
    topTopic: top ? { name: top[0], count: top[1], color: TOPIC_COLORS[top[0]] || "var(--accent)" } : undefined,
    sourcesExplored: explored.size,
    topSources: Object.entries(current.bySource).sort((a, b) => b[1] - a[1]).slice(0, 3),
    suggestion: suggestionPool.length ? suggestionPool[Math.floor(Math.random() * suggestionPool.length)] : undefined,
  };
}
