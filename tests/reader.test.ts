import { expect, test } from "bun:test";
import "./setup";
import { h, render } from "preact";
import { App } from "../src/app";
import { assistantContext, closeRadioFlow, exitReader, flow, openReader, page, readerContent, readerLoading, readerStory } from "../src/state/ui";
import type { Story } from "../src/lib/types";

Object.assign(globalThis, {
  Event: window.Event,
  PointerEvent: (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent,
  innerHeight: window.innerHeight,
  innerWidth: window.innerWidth,
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
});

const article = (slug: string, title: string): Story => ({
  title,
  src: "Test",
  link: `https://example.com/${slug}-${Date.now()}`,
  desc: "",
  date: new Date(),
});

test("successive reader opens replace the active article instead of stalling", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => "Title: Test\nMarkdown Content:\n\nThis article has enough text to render in the reader. It keeps going with enough details to satisfy the extractor and make the reader state fully populated for this regression test.",
  })) as unknown as typeof fetch;

  try {
    for (const [slug, title] of [["first", "First article"], ["second", "Second article"], ["third", "Third article"]] as const) {
      await openReader(article(slug, title));
      expect(page.value).toBe("reader");
      expect(readerStory.value?.title).toBe(title);
      expect(readerLoading.value).toBe(false);
      expect(readerContent.value?.text ?? "").toContain("enough text to render");
    }
  } finally {
    exitReader();
    globalThis.fetch = originalFetch;
  }
});

test("reader overlay resets document scroll and restores it on close", async () => {
  const originalFetch = globalThis.fetch;
  const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const originalScrollTo = Object.getOwnPropertyDescriptor(window, "scrollTo");
  const scrollCalls: number[] = [];
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => "Title: Scroll\nMarkdown Content:\n\nThis article has enough text to load while the feed behind it is scrolled down.",
  })) as unknown as typeof fetch;
  Object.defineProperty(window, "scrollY", { value: 720, writable: true, configurable: true });
  Object.defineProperty(window, "scrollTo", {
    value: (_x: number, y: number) => {
      scrollCalls.push(y);
      window.scrollY = y;
    },
    writable: true,
    configurable: true,
  });

  try {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    expect(window.scrollY).toBe(720);
    await openReader(article("scroll", "Scroll article"));
    await wait(0);
    expect(scrollCalls).toContain(0);
    expect(window.scrollY).toBe(0);
    exitReader();
    await wait(0);
    expect(scrollCalls[scrollCalls.length - 1]).toBe(720);
    expect(window.scrollY).toBe(720);
  } finally {
    exitReader();
    if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
    else Reflect.deleteProperty(window, "scrollY");
    if (originalScrollTo) Object.defineProperty(window, "scrollTo", originalScrollTo);
    else Reflect.deleteProperty(window, "scrollTo");
    globalThis.fetch = originalFetch;
  }
});

test("drag selection keeps full text until release before showing the selection toolbar", async () => {
  const originalFetch = globalThis.fetch;
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writes: string[] = [];
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => "Title: Selection\nMarkdown Content:\n\nAlpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega and more words for a long selection.",
  })) as unknown as typeof fetch;

  const root = document.createElement("div");
  document.body.append(root);
  render(h(App, {}), root);

  try {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await openReader(article("selection", "Selection article"));
    await wait(40);

    const body = document.querySelector("#readerBody")!;
    const textNode = body.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent!.length);
    const nativeSelection = document.getSelection()!;
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);

    body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10, pointerType: "touch" }));
    document.dispatchEvent(new Event("selectionchange"));
    await wait(10);
    expect(document.querySelector("#selToolbar.show")).toBeNull();

    body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 200, clientY: 10, pointerType: "touch" }));
    await wait(140);
    expect(document.querySelector("#selToolbar.show")).not.toBeNull();

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
      configurable: true,
      writable: true,
    });
    (document.querySelector("#selCopy") as HTMLElement).click();
    await wait(10);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("Alpha beta");
    expect(writes[0]).toContain("omega");

    (document.querySelector("#selNote") as HTMLElement).click();
    await wait(20);
    const quote = (document.querySelector(".ns-composer input") as HTMLInputElement).value;
    expect(quote).toContain("Alpha beta");
    expect(quote).toContain("omega");
  } finally {
    exitReader();
    root.remove();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    globalThis.fetch = originalFetch;
  }
});

test("reader exposes primary actions in a separate action row", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => "Title: Actions\nMarkdown Content:\n\nThis article has enough text to load so the primary reader actions can be clicked in this regression test.",
  })) as unknown as typeof fetch;
  const root = document.createElement("div");
  document.body.append(root);
  render(h(App, {}), root);
  try {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await openReader(article("actions", "Actions article"));
    await wait(20);
    expect(document.querySelector(".reader-nav-row #readerPrev")).not.toBeNull();
    expect(document.querySelector(".reader-action-row #readerAskButton")).not.toBeNull();
    expect(document.querySelector("#readerAskButton")?.classList.contains("primary-ask")).toBe(true);
    expect(document.querySelector("#readerSummarize")?.classList.contains("hide")).toBe(false);
    (document.querySelector("#readerAskButton") as HTMLElement).click();
    await wait(10);
    expect(page.value).toBe("assistant");
    expect(assistantContext.value?.title).toBe("Actions article");
  } finally {
    exitReader();
    root.remove();
    globalThis.fetch = originalFetch;
  }
});

test("radio tab opens the flow directly at the current or first station", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  render(h(App, {}), root);
  try {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    (document.querySelector(".radio-tab") as HTMLElement).click();
    await wait(10);
    expect(flow.value.open).toBe(true);
    expect(flow.value.mode).toBe("radio");
    expect(flow.value.radioIndex).toBe(0);
  } finally {
    closeRadioFlow(true);
    root.remove();
  }
});
