import { describe, expect, test } from "bun:test";
import "./setup";
import { dedupeStories, parseFeedXml, storyKey } from "../src/lib/feeds";
import { sanitizeHtml, stripTags } from "../src/lib/sanitize";
import { makeOpml, parseOpml } from "../src/lib/data";
import type { Story } from "../src/lib/types";

describe("feed parsing", () => {
  test("parses RSS items and strips description markup", () => {
    const xml = `<rss><channel><item><title>Test Story</title><link>https://example.com/story</link><description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description><pubDate>Thu, 19 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    const [item] = parseFeedXml(xml, "ABC News");
    expect(item.title).toBe("Test Story");
    expect(item.link).toBe("https://example.com/story");
    expect(item.desc).toBe("Hello world");
    expect(item.src).toBe("ABC News");
  });
  test("parses Atom links", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom Story</title><link rel="alternate" href="https://example.com/atom"/><summary>Text</summary><updated>2026-11-19T10:00:00Z</updated></entry></feed>`;
    const [item] = parseFeedXml(xml, "The Conversation");
    expect(item.link).toBe("https://example.com/atom");
  });
  test("deduplicates by HN discussion or link", () => {
    const items = [
      { title: "A", link: "https://example.com/a?utm=1", desc: "", date: new Date(), src: "X" },
      { title: "B", link: "https://example.com/a?utm=2", desc: "", date: new Date(), src: "X" },
    ] as Story[];
    expect(storyKey(items[0])).toBe("https://example.com/a");
    expect(dedupeStories(items)).toHaveLength(1);
  });
});

describe("sanitizer", () => {
  test("removes scripts, event handlers and unsafe URLs", () => {
    const fragment = sanitizeHtml(`<p onclick="alert(1)">Hello<a href="javascript:alert(1)">bad</a><script>alert(2)</script></p>`);
    const div = document.createElement("div");
    div.append(fragment);
    expect(div.querySelector("script")).toBeNull();
    expect(div.querySelector("p")?.getAttribute("onclick")).toBeNull();
    expect(div.querySelector("a")?.getAttribute("href")).toBeNull();
    expect(stripTags("<p>Safe text</p>")).toBe("Safe text");
  });
});

describe("OPML", () => {
  test("exports and imports feeds", () => {
    const xml = makeOpml([{ name: "Custom", url: "https://example.com/rss" }], new Set(["Crikey"]));
    expect(xml).toContain("Custom");
    expect(xml).not.toContain("Crikey");
    const feeds = parseOpml(xml, []);
    expect(feeds.some((feed) => feed.name === "Custom")).toBe(true);
  });
});
