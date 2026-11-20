import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { refresh, refreshing, search, sort, statusError, statusText } from "../state/store";
import { toggleTheme } from "../state/prefs";
import { openPage, showShortcuts } from "../state/ui";
import { sidebarOpen } from "../state/ui";

export function Header() {
  const online = useSignal(typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const update = () => { online.value = navigator.onLine; };
    let lastY = 0;
    const onScroll = () => {
      const y = scrollY;
      document.getElementById("hdr")?.classList.toggle("hide", y > 80 && y > lastY);
      lastY = y;
    };
    addEventListener("online", update);
    addEventListener("offline", update);
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header id="hdr">
      <div class="hrow">
        <button id="sidebarBtn" class="icon-btn" title="Sources & feeds" aria-label="Sources and feeds" onClick={() => { sidebarOpen.value = true; }}>☰</button>
        <h1><span class="flag">AU</span> News Deck</h1>
        <span class="offpill" id="offpill" style={{ display: online.value ? "none" : "" }}>OFFLINE</span>
        <div class="grow" />
        <button id="themeBtn" class="icon-btn" title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme}>☾</button>
        <button id="settingsBtn" class="icon-btn" title="Settings" aria-label="Settings" onClick={() => openPage("settings")}>⚙</button>
        <button id="assistantBtn" class="icon-btn" title="Ask AI" aria-label="Ask AI" onClick={() => openPage("assistant")}>
          <svg class="hdr-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </button>
        <button id="refresh" class={refreshing.value ? "icon-btn spinning" : "icon-btn"} title="Refresh" aria-label="Refresh" onClick={() => void refresh(true)}>↻</button>
        <button id="pasteReadBtn" class="icon-btn" title="Read any URL" aria-label="Read any URL" onClick={() => openPage("paste")}>
          <svg class="hdr-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        </button>
      </div>
      <span id="status" role="status" class={statusError.value ? "status-error" : ""}>{statusText.value}</span>
      <div class="hrow tools">
        <input id="search" type="search" placeholder="Search headlines…" aria-label="Search headlines" value={search.value} onInput={(event) => { search.value = (event.target as HTMLInputElement).value; }} />
        <select id="sort" aria-label="Sort order" value={sort.value} onChange={(event) => { sort.value = (event.target as HTMLSelectElement).value as "src" | "new"; }}>
          <option value="src">Group by source</option>
          <option value="new">Newest first</option>
        </select>
        <button class="icon-btn shortcuts-btn" title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={() => { showShortcuts.value = true; }}>?</button>
      </div>
    </header>
  );
}
