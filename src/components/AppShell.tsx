import { useEffect, useRef } from "preact/hooks";
import { copyText } from "../lib/clipboard";
import { safeUrl } from "../lib/format";
import { bindAudio } from "../lib/radio";
import { archiveStory, cacheNote, cacheSavedAt, findStory, isArchived, isLiked, isRead, markRead, markUnread, refreshMode, refresh, toggleLike, unarchiveStory, updateStatus, visibleStories } from "../state/store";
import { applyPrefs } from "../state/prefs";
import { cardMenu, closeCardMenu, closePages, deckCursor, exitRadioFlow, exitReadFlow, exitReader, flow, installPrompt, navigateReader, notesOpen, notify, openReader, overflowOpen, page, showShortcuts, sidebarOpen, type InstallPromptEvent } from "../state/ui";
import { Header } from "./Header";
import { TabsBar } from "./TabsBar";
import { Feed } from "./Feed";
import { Sidebar } from "./Sidebar";
import { Footer, InstallBar, InstallPromptBar, MiniPlayer, PasteRead, PullToRefresh, Shortcuts, Toast } from "./Extras";
import { Assistant, RadioFlow, ReadFlow, Reader, Settings, Wrapped } from "./Overlays";

export function AppShell() {
  const radioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    bindAudio(radioRef.current);
    const onPrompt = (event: Event) => { event.preventDefault(); installPrompt.value = event as InstallPromptEvent; };
    const onInstalled = () => { installPrompt.value = null; };
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => {
      bindAudio(null);
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    applyPrefs();
    const readUrl = new URLSearchParams(location.search).get("read");
    if (readUrl && safeUrl(readUrl)) {
      history.replaceState(null, "", location.pathname);
      void openReader({ title: "Article", link: readUrl, src: "Pasted", desc: "", date: new Date() });
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (refreshMode.value === "manual") {
      cacheNote.value = "manual mode — tap ↻ to refresh";
      updateStatus();
    } else if (refreshMode.value === "interval") {
      const age = Date.now() - cacheSavedAt.value;
      if (cacheSavedAt.value && age < 30 * 60_000) { cacheNote.value = `cached deck from ${Math.round(age / 60000)}m ago`; updateStatus(); }
      else void refresh();
      interval = setInterval(() => void refresh(true), 30 * 60_000);
    } else {
      void refresh();
    }
    return () => { if (interval) clearInterval(interval); };
  }, [refreshMode.value]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && typeof target.matches === "function" && target.matches("input, select, textarea")) return;
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) { event.preventDefault(); showShortcuts.value = !showShortcuts.value; return; }
      if (event.key === "/") { event.preventDefault(); document.getElementById("search")?.focus(); return; }
      if (event.key === "Escape") {
        if (cardMenu.value) closeCardMenu();
        else if (showShortcuts.value) showShortcuts.value = false;
        else if (page.value === "reader") {
          if (notesOpen.value) notesOpen.value = false;
          else if (overflowOpen.value) overflowOpen.value = false;
          else exitReader();
        }
        else if (page.value) closePages();
        else if (sidebarOpen.value) sidebarOpen.value = false;
        else if (flow.value.open) { if (flow.value.mode === "read") exitReadFlow(); else exitRadioFlow(); }
        return;
      }
      if (page.value === "reader") {
        if (notesOpen.value || overflowOpen.value) return;
        if (event.key === "j" || event.key === "ArrowRight") { event.preventDefault(); navigateReader(1); }
        else if (event.key === "k" || event.key === "ArrowLeft") { event.preventDefault(); navigateReader(-1); }
      } else if (!page.value && !flow.value.open && !sidebarOpen.value && !showShortcuts.value && (event.key === "n" || event.key === "p")) {
        const list = visibleStories.value;
        if (!list.length) return;
        event.preventDefault();
        const next = Math.max(0, Math.min(list.length - 1, deckCursor.value + (event.key === "n" ? 1 : -1)));
        deckCursor.value = next;
        void openReader(list[next]);
      }
    };
    const onDocClick = () => closeCardMenu();
    addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick);
    return () => {
      removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    };
  }, []);

  const menuStory = cardMenu.value ? findStory(cardMenu.value.link) : undefined;
  const summarizeMenuStory = async () => {
    if (!menuStory) return;
    const link = menuStory.link;
    closeCardMenu();
    void openReader(link).then(() => { document.getElementById("readerSummarize")?.click(); });
  };

  const shareMenuStory = async () => {
    if (!menuStory) return;
    const link = menuStory.link;
    const title = menuStory.title;
    closeCardMenu();
    if (navigator.share) {
      try { await navigator.share({ title, url: link }); return; } catch { /* fall back to clipboard */ }
    }
    const copied = await copyText(link);
    notify(copied ? "Link copied" : "Couldn't copy — use Open original");
  };

  return (
    <>
      <Header />
      <TabsBar />
      <Feed />
      <Footer />
      <PullToRefresh />
      <Sidebar />
      <Reader />
      <ReadFlow />
      <RadioFlow />
      <Settings />
      <Assistant />
      <Wrapped />
      <PasteRead />
      <InstallBar />
      <InstallPromptBar />
      <Shortcuts />
      <Toast />
      <MiniPlayer />
      {cardMenu.value && menuStory && <div id="cardMenu" class="show" role="menu" style={{ left: `${cardMenu.value.x}px`, top: `${cardMenu.value.y}px` }} onClick={(event) => event.stopPropagation()}>
        <button type="button" data-act="ctx-read" role="menuitem" onClick={() => { if (isRead(menuStory.link)) markUnread(menuStory.link); else markRead(menuStory.link); closeCardMenu(); }}>{isRead(menuStory.link) ? "Mark unread" : "Mark read"}</button>
        <button type="button" data-act="ctx-star" role="menuitem" onClick={() => { toggleLike(menuStory.link); closeCardMenu(); }}>{isLiked(menuStory.link) ? "Unstar" : "Star"}</button>
        {!isArchived(menuStory.link) && <button type="button" data-act="ctx-archive" role="menuitem" onClick={() => { archiveStory(menuStory.link); notify("Archived", () => unarchiveStory(menuStory.link)); closeCardMenu(); }}>Archive</button>}
        <hr />
        <button type="button" data-act="ctx-summarize" role="menuitem" onClick={() => void summarizeMenuStory()}>Summarize</button>
        <button type="button" data-act="ctx-share" role="menuitem" onClick={() => void shareMenuStory()}>Share link</button>
        <button type="button" data-act="ctx-open" role="menuitem" onClick={() => { window.open(menuStory.link, "_blank", "noopener"); closeCardMenu(); }}>Open original</button>
      </div>}
      <audio id="radioAudio" ref={radioRef} preload="none" />
    </>
  );
}
