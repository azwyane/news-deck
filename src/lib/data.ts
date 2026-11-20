import { BUILTIN_SOURCES } from "./constants";
import type { AIConfig, Note, RadioStation, Source, Story } from "./types";

export interface Backup {
  version: number;
  app: string;
  exportedAt: string;
  settings: { aiServer: AIConfig | null; theme: string | null; muted: string[]; refreshMode?: string; unreadOnly?: boolean; typography?: { uiFont?: number; fontWeight?: number; lineHeight?: number; iconScale?: number; readerFont?: number; fontActive?: string; fontUrl?: string } };
  sources: { customFeeds: Source[]; order: string[]; removed: string[]; removedFeeds?: Source[] };
  liked: Story[];
  read: Story[];
  archived: Story[];
  readTimes?: Record<string, number>;
  annotations?: Record<string, Note[]>;
}

export function makeBackup(data: Omit<Backup, "version" | "app" | "exportedAt">): string {
  return JSON.stringify({ version: 1, app: "Aussie News Deck", exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Backup;
  if (!data || typeof data !== "object") throw new Error("Invalid backup file");
  return data;
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function makeOpml(sources: Source[], removed: Set<string>): string {
  const lines = [...BUILTIN_SOURCES.filter((source) => !removed.has(source.name)), ...sources].map((source) =>
    `  <outline type="rss" text="${escapeXml(source.name)}" title="${escapeXml(source.name)}" xmlUrl="${escapeXml(source.url || "")}"${source.kind === "hn" ? ' category="hacker-news"' : ""}/>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>News Deck Feeds</title></head>
<body>
${lines.join("\n")}
</body>
</opml>`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] as string);
}

export function parseOpml(text: string, existingUrls: string[]): RadioStation[] {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const outlines = doc.querySelectorAll("outline[xmlUrl]");
  const found: RadioStation[] = [];
  outlines.forEach((outline) => {
    const url = outline.getAttribute("xmlUrl") || "";
    if (!url || existingUrls.includes(url)) return;
    found.push({
      name: outline.getAttribute("text") || outline.getAttribute("title") || "Imported feed",
      url,
    });
  });
  return found;
}
