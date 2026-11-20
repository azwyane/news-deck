import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { tts } from "../lib/tts";
import { refresh } from "../state/store";
import { closePages, flow, installPrompt, notify, openReader, page, showShortcuts, sidebarOpen, toast, ttsStoryLink } from "../state/ui";
import { dismissInstall, installDismissed } from "../state/prefs";

export function Toast() {
  const current = toast.value;
  if (!current) return <div id="toast" role="status" aria-live="polite" />;
  return (
    <div id="toast" role="status" aria-live="polite" class="show">
      <span id="toastMsg">{current.message}</span>
      {current.undo && <button type="button" id="toastUndo" onClick={() => { current.undo?.(); toast.value = null; }}>Undo</button>}
    </div>
  );
}

export function MiniPlayer() {
  if (!tts.playing.value) return null;
  return (
    <div id="miniPlayer" class="show" role="status" aria-live="polite">
      <span class="mp-icon">♫</span>
      <span class="mp-title" title={tts.title.value} onClick={() => { const link = ttsStoryLink.value; if (link) void openReader(link); }}>{tts.title.value}</span>
      <button type="button" class="mp-btn" aria-label="Pause/Resume" onClick={() => tts.toggle()}>{tts.paused.value ? "▶" : "❚❚"}</button>
      <button type="button" class="mp-btn mp-stop" aria-label="Stop" onClick={() => tts.stop()}>×</button>
      <div class="mp-progress" style={{ width: `${tts.progress.value}%` }} />
    </div>
  );
}

export function InstallPromptBar() {
  const visible = useSignal(false);
  useEffect(() => {
    if (installDismissed()) return;
    const timer = setTimeout(() => { visible.value = true; }, 2200);
    return () => clearTimeout(timer);
  }, []);
  const accept = async () => {
    const event = installPrompt.value;
    if (!event) { visible.value = false; page.value = "install"; return; }
    await event.prompt();
    const result = await event.userChoice;
    if (result.outcome === "accepted") notify("Installing News Deck…");
    installPrompt.value = null;
    dismissInstall();
    visible.value = false;
  };
  return (
    <div id="installBar" class={visible.value ? "show" : ""}>
      <div class="grow"><b>Install News Deck</b><div class="faint">Fullscreen reading &amp; offline cache</div></div>
      <button type="button" class="btn-primary" id="installYes" onClick={() => void accept()}>Install</button>
      <button type="button" class="btn-secondary" id="installNo" onClick={() => { dismissInstall(); visible.value = false; }}>Not now</button>
    </div>
  );
}

export function Footer() {
  return <footer>Click any headline to read the full article in the app. The last deck is cached on this device, so stories still show when feeds are unreachable. · <button type="button" id="footInstall" class="linkish" onClick={() => { page.value = "install"; }}>Install as app</button></footer>;
}

export function PullToRefresh() {
  const distance = useSignal(0);
  useEffect(() => {
    let start = 0;
    const blocked = () => !!page.value || flow.value.open || sidebarOpen.value;
    const onStart = (event: TouchEvent) => { if (!blocked() && scrollY < 10) start = event.touches[0].clientY; };
    const onMove = (event: TouchEvent) => { if (start && !blocked()) distance.value = Math.max(0, event.touches[0].clientY - start); };
    const onEnd = () => { if (!blocked() && distance.value > 80) void refresh(true); start = 0; distance.value = 0; };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);
  return <div id="ptrIndicator" style={{ opacity: distance.value ? 1 : 0, transform: `translate(-50%, ${Math.max(0, distance.value - 50)}px)` }}>◌</div>;
}

export function PasteRead() {
  const url = useSignal("");
  if (page.value !== "paste") return null;
  const read = () => {
    let value = url.value.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    closePages();
    void openReader({ title: "Article", link: value, src: "Pasted", desc: "", date: new Date() });
  };
  return (
    <div id="pasteReadOverlay" class="overlay on" role="dialog" aria-label="Read any URL">
      <div class="modal" style={{ "max-width": "440px" }}>
        <div class="modal-header"><h2>Read any article</h2><button class="modal-close" id="pasteReadClose" onClick={closePages}>×</button></div>
        <div class="modal-body">
          <p style={{ "font-size": "var(--ui-font-size)", color: "var(--text-2)", "margin-bottom": "12px" }}>Paste any article URL — News Deck will fetch and display it in the reader, just like a feed story.</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input id="pasteReadUrl" placeholder="https://example.com/article" style={{ flex: 1, "min-width": 0 }} autocapitalize="off" autocomplete="off" spellcheck={false} value={url.value} onInput={(event) => { url.value = (event.target as HTMLInputElement).value; }} onKeyDown={(event) => { if (event.key === "Enter") read(); }} />
            <button type="button" id="pasteReadGo" class="btn-primary" onClick={read}>Read</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Shortcuts() {
  if (!showShortcuts.value) return null;
  return (
    <div id="shortcutsOverlay" class="overlay on" role="dialog" aria-label="Keyboard shortcuts">
      <div class="modal" style={{ "max-width": "420px" }}>
        <div class="modal-header"><h2>Keyboard shortcuts</h2><button class="modal-close" id="shortcutsClose" onClick={() => { showShortcuts.value = false; }}>×</button></div>
        <div class="modal-body" style={{ "font-size": "var(--ui-font-size)", "line-height": "var(--ui-line-height)" }}>
          <div style={{ display: "grid", "grid-template-columns": "auto 1fr", gap: "4px 16px" }}>
            <kbd>/</kbd><span>Focus search</span>
            <kbd>j / →</kbd><span>Next article in reader</span>
            <kbd>k / ←</kbd><span>Previous article in reader</span>
            <kbd>n / p</kbd><span>Next / previous article</span>
            <kbd>Esc</kbd><span>Close reader / overlays</span>
            <kbd>?</kbd><span>Show this help</span>
          </div>
          <p style={{ "margin-top": "12px", "font-size": "calc(var(--ui-font-size)*.8)", color: "var(--text-3)" }}>Swipe a card left or right to archive. Long-press or right-click for context menu.</p>
        </div>
      </div>
    </div>
  );
}

export function InstallBar() {
  if (page.value !== "install") return null;
  return (
    <div class="install-overlay overlay on">
      <div class="modal">
        <div class="modal-header"><h2>Install News Deck</h2><button class="modal-close" onClick={() => { dismissInstall(); closePages(); }}>×</button></div>
        <div class="modal-body">
          <p style={{ "font-size": "var(--ui-font-size)", color: "var(--text-2)" }}>{installPrompt.value ? "Install News Deck on this device for fullscreen reading and your cached deck." : "Open this page in Chrome or Safari, use the browser menu, then choose Add to Home screen or Install app."}</p>
          {installPrompt.value && <button type="button" class="btn-primary" onClick={() => { const event = installPrompt.value; if (!event) return; void event.prompt(); void event.userChoice.then((result) => { if (result.outcome === "accepted") notify("Installing News Deck…"); installPrompt.value = null; dismissInstall(); closePages(); }); }}>Install app</button>}
          <button type="button" class="btn-secondary" onClick={() => { dismissInstall(); closePages(); }}>Not now</button>
        </div>
      </div>
    </div>
  );
}
