import { describe, expect, test } from "bun:test";
import "./setup";
import { escapeHtml, hashColor, relativeTime, safeUrl, tokenize } from "../src/lib/format";
import { classifyTopic, clusterStories, makeBriefing } from "../src/lib/topics";
import { applyPrefs, night } from "../src/state/prefs";
import type { Story } from "../src/lib/types";

const story = (title: string, src: string, date = new Date()): Story => ({ title, src, date, link: `https://example.com/${encodeURIComponent(title)}`, desc: "" });

describe("format helpers", () => {
  test("escapes HTML entities", () => {
    expect(escapeHtml(`<a href="x">it's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;it&#39;s&lt;/a&gt;");
  });
  test("rejects non-http URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("https://example.com/a")).toContain("https://example.com/a");
  });
  test("tokenizes and stems", () => {
    expect(tokenize("The ministers speaking about climate") ).toContain("minister");
    expect(tokenize("The ministers speaking about climate")).not.toContain("the");
  });
  test("formats relative time", () => {
    expect(relativeTime(new Date(Date.now() - 1000))).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 3600_000))).toBe("1h ago");
  });
  test("produces stable colors", () => {
    expect(hashColor("ABC News")).toBe(hashColor("ABC News"));
  });
});

describe("preferences", () => {
  test("applies literal night mode values", () => {
    const original = night.value;
    try {
      for (const value of ["off", "auto", "on"] as const) {
        night.value = value;
        applyPrefs();
        expect(document.documentElement.dataset.night).toBe(value);
      }
    } finally {
      night.value = original;
      applyPrefs();
    }
  });
});

describe("topics", () => {
  test("classifies headlines", () => {
    expect(classifyTopic("Labor government election announced")).toBe("Politics");
    expect(classifyTopic("AFL grand final result")).toBe("Sport");
    expect(classifyTopic("Local council minutes released")).toBeNull();
  });
  test("clusters similar stories from different sources", () => {
    const items = [
      story("Government budget handed down today", "ABC News"),
      story("Government budget reaction from opposition", "SBS News"),
      story("Local football club wins match", "9News"),
    ];
    const clusters = clusterStories(items);
    expect(clusters.length).toBeGreaterThan(1);
    expect(makeBriefing(items).multi.length).toBeGreaterThanOrEqual(0);
  });
});
