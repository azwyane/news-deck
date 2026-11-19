import { marked } from "marked";
import { sanitizeHtml } from "./sanitize";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(markdown: string): string {
  return marked.parse(String(markdown), { async: false }) as string;
}

export function renderMarkdownSafe(markdown: string): DocumentFragment {
  return sanitizeHtml(renderMarkdown(markdown));
}

export function estimateReadTime(text: string): string {
  const words = (text.match(/\S+/g) || []).length;
  return words > 60 ? `${Math.max(1, Math.round(words / 230))} min read` : "";
}
