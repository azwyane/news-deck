import { useSignal } from "@preact/signals";
import { getAIConfig, normalizeServerUrl, setAIConfig, testAIConfig } from "../lib/ai";
import { KEYS } from "../lib/constants";
import { downloadFile, makeBackup, makeOpml, parseBackup, parseOpml } from "../lib/data";
import { formatDuration, stats, wrappedData } from "../lib/stats";
import { readText, writeText } from "../lib/storage";
import { cycleNight, fontActive, fontUrl, setFont, setFontUrl, theme, toggleTheme } from "../state/prefs";
import { addFeed, annotations, archived, customFeeds, liked, mutedSources, readStories, readTimes, refresh, refreshMode, removedFeeds, removedSources, restoreSources, reviveStory, setView, sourceOrder, stories, unreadOnly } from "../state/store";
import { closePages, notify, page } from "../state/ui";

export function Settings() {
  const config = getAIConfig();
  const serverUrl = useSignal(config?.url || "");
  const model = useSignal(config?.model || "");
  const key = useSignal(config?.apiKey || "");
  const serverStatus = useSignal("");
  const customFont = useSignal(fontUrl.value);
  const fileRef = useSignal<HTMLInputElement | null>(null);
  const opmlRef = useSignal<HTMLInputElement | null>(null);

  if (page.value !== "settings") return null;

  const saveServer = async () => {
    const next = { url: normalizeServerUrl(serverUrl.value), model: model.value.trim(), apiKey: key.value.trim() };
    if (!next.url) { serverStatus.value = "Enter a server URL."; return; }
    serverStatus.value = "Testing…";
    try {
      const result = await testAIConfig(next);
      if (!result.ok) throw new Error(result.message);
      setAIConfig(next);
      model.value = next.model;
      serverStatus.value = result.message;
    } catch (error) {
      serverStatus.value = String((error as Error).message || error);
    }
  };

  const exportBackup = () => {
    downloadFile(`news-deck-backup-${new Date().toISOString().slice(0, 10)}.json`, makeBackup({
      settings: { aiServer: getAIConfig(), theme: readText(KEYS.theme, ""), muted: mutedSources.value, refreshMode: refreshMode.value, unreadOnly: unreadOnly.value },
      sources: { customFeeds: customFeeds.value, order: sourceOrder.value, removed: removedSources.value, removedFeeds: removedFeeds.value },
      liked: liked.value,
      read: readStories.value,
      archived: archived.value,
      readTimes: readTimes.value,
      annotations: annotations.value,
    }), "application/json");
    notify("Backup exported");
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      if (data.settings?.aiServer) setAIConfig(data.settings.aiServer);
      if (data.settings?.theme) writeText(KEYS.theme, data.settings.theme);
      if (data.settings?.muted) mutedSources.value = data.settings.muted;
      if (data.settings?.refreshMode) refreshMode.value = data.settings.refreshMode;
      if (typeof data.settings?.unreadOnly === "boolean") unreadOnly.value = data.settings.unreadOnly;
      if (data.sources?.customFeeds) customFeeds.value = data.sources.customFeeds;
      if (data.sources?.order) sourceOrder.value = data.sources.order;
      if (data.sources?.removed) removedSources.value = data.sources.removed;
      if (data.sources?.removedFeeds) removedFeeds.value = data.sources.removedFeeds;
      if (data.liked) liked.value = data.liked.map(reviveStory);
      if (data.read) readStories.value = data.read.map(reviveStory);
      if (data.archived) archived.value = data.archived.map(reviveStory);
      if (data.readTimes) readTimes.value = data.readTimes;
      if (data.annotations) annotations.value = data.annotations;
      notify("Backup imported");
      closePages();
      location.reload();
    } catch (error) {
      notify(String((error as Error).message || error));
    }
  };

  const importOpml = async (file: File | undefined) => {
    if (!file) return;
    try {
      const feeds = parseOpml(await file.text(), [...customFeeds.value, ...stories.value].map((item) => "url" in item ? item.url || "" : ""));
      let added = 0;
      feeds.forEach((feed) => { if (addFeed(feed.name, feed.url, true)) added++; });
      if (added) void refresh(true);
      notify(`Imported ${added} feeds`);
    } catch (error) {
      notify(String((error as Error).message || error));
    }
  };

  const wrapped = wrappedData(readStories.value, liked.value, sourceOrder.value, new Set(mutedSources.value), new Set(removedSources.value));
  const appBase = location.href.split("?")[0].split("#")[0];
  const bookmarklet = `javascript:(function(){location.href=${JSON.stringify(`${appBase}?read=`)} + encodeURIComponent(location.href)})();`;

  return (
    <div id="settingsPage" class="on" role="dialog" aria-label="Settings">
      <div class="settings-bar"><button type="button" id="settingsClose" aria-label="Close settings" onClick={closePages}>←</button><span class="settings-title">Settings</span></div>
      <div class="settings-content">
        <section class="settings-section">
          <h3>AI Server</h3>
          <p class="settings-desc">Use your own Ollama, llama.cpp, or LM Studio server. Any OpenAI-compatible endpoint works.</p>
          <label class="settings-label" for="srvUrl">Server URL</label>
          <input id="srvUrl" placeholder="http://192.168.1.50:11434" value={serverUrl.value} onInput={(event) => { serverUrl.value = (event.target as HTMLInputElement).value; }} />
          <label class="settings-label" for="srvModel">Model</label>
          <input id="srvModel" placeholder="qwen2.5:1.5b" value={model.value} onInput={(event) => { model.value = (event.target as HTMLInputElement).value; }} />
          <label class="settings-label" for="srvKey">API key (optional)</label>
          <input id="srvKey" type="password" placeholder="sk-..." value={key.value} onInput={(event) => { key.value = (event.target as HTMLInputElement).value; }} />
          <div class="settings-buttons"><button type="button" id="srvSave" class="btn-primary" onClick={() => void saveServer()}>Save &amp; Test</button><button type="button" id="srvClear" class="btn-secondary" onClick={() => { setAIConfig(null); serverUrl.value = ""; model.value = ""; key.value = ""; serverStatus.value = "Server cleared"; }}>Clear</button></div>
          <div id="srvStatus">{serverStatus.value}</div>
        </section>
        <section class="settings-section">
          <h3>Appearance</h3>
          <div class="settings-row"><span>Theme</span><button type="button" id="settingsThemeBtn" class="btn-secondary" onClick={toggleTheme}>Switch theme ({theme.value})</button></div>
          <div class="settings-row" style={{ "margin-top": "10px" }}><span>Font</span><button type="button" id="fontHandBtn" class="btn-secondary" onClick={() => setFont(fontActive.value === "hand" ? "" : "hand")}>Hand</button></div>
          <div style={{ "margin-top": "10px" }}><label class="settings-label">Custom font URL (.woff2 / .woff / .ttf)</label><div style={{ display: "flex", gap: "8px" }}><input id="customFontUrl" placeholder="https://example.com/font.woff2" value={customFont.value} onInput={(event) => { customFont.value = (event.target as HTMLInputElement).value; }} style={{ flex: 1, "min-width": 0 }} /><button type="button" id="customFontApply" class="btn-primary" onClick={() => { setFontUrl(customFont.value); setFont(customFont.value); }}>Apply</button></div><button type="button" id="customFontClear" class="btn-secondary" style={{ "margin-top": "8px", width: "100%" }} onClick={() => { customFont.value = ""; setFontUrl(""); setFont(""); }}>Reset to system font</button></div>
        </section>
        <section class="settings-section">
          <h3>Refresh</h3>
          <p class="settings-desc">In manual mode the app loads from cache on visit — tap ↻ to fetch new stories.</p>
          <div class="settings-row"><span>Mode</span><select id="refreshModeSelect" value={refreshMode.value} onChange={(event) => { refreshMode.value = (event.target as HTMLSelectElement).value; }}><option value="visit">On every visit</option><option value="manual">Manual only</option><option value="interval">Every 30 minutes</option></select></div>
          <div class="settings-row" style={{ "margin-top": "10px" }}><span>Night reading mode</span><button type="button" id="nightModeBtn" class="btn-secondary" onClick={() => notify(`Night mode: ${cycleNight()}`)}>Cycle</button></div>
        </section>
        <section class="settings-section">
          <h3>Data</h3>
          <div class="data-buttons"><button type="button" id="exportBtn" class="btn-secondary" onClick={exportBackup}>Export</button><button type="button" id="importBtn" class="btn-secondary" onClick={() => fileRef.value?.click()}>Import</button></div>
          <input type="file" ref={(element) => { fileRef.value = element; }} accept="application/json" hidden onChange={(event) => void importBackup((event.target as HTMLInputElement).files?.[0])} />
          <div style={{ "margin-top": "12px" }}><label class="settings-label">OPML feeds</label><div class="data-buttons"><button type="button" id="opmlExportBtn" class="btn-secondary" onClick={() => { downloadFile("news-deck-feeds.opml", makeOpml(customFeeds.value, new Set(removedSources.value)), "text/xml"); notify("OPML exported"); }}>Export OPML</button><button type="button" id="opmlImportBtn" class="btn-secondary" onClick={() => opmlRef.value?.click()}>Import OPML</button></div><input type="file" ref={(element) => { opmlRef.value = element; }} accept=".opml,.xml,application/xml" hidden onChange={(event) => void importOpml((event.target as HTMLInputElement).files?.[0])} /></div>
          <div style={{ "margin-top": "12px" }}><label class="settings-label">Bookmarklet</label><p class="settings-desc">Drag this link to your bookmarks bar.</p><a id="bookmarkletLink" href={bookmarklet} style={{ display: "inline-block", padding: "8px 14px", background: "var(--accent)", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>Read in News Deck</a></div>
          {!!removedSources.value.length && <button type="button" class="btn-secondary" style={{ "margin-top": "12px" }} onClick={() => { restoreSources(); notify("Hidden sources restored"); }}>Restore {removedSources.value.length} hidden source(s)</button>}
        </section>
        <section class="settings-section">
          <h3>Reading Stats</h3>
          <div class="stats-grid" id="statsGrid"><div><b>{stats.value.totalRead}</b><span>articles</span></div><div><b>{formatDuration(stats.value.totalTime)}</b><span>reading time</span></div><div><b>{wrapped.topSources.length}</b><span>top sources</span></div><div><b>{liked.value.length}</b><span>saved</span></div></div>
          <div class="stat-sources" id="statsSources">{wrapped.topSources.length ? <>Most read: {wrapped.topSources.slice(0, 5).map(([name, count]) => <span key={name}>{name} · {count}</span>)}</> : "Start reading to see your stats here."}</div>
          <button type="button" id="wrappedBtn" class="btn-primary" style={{ "margin-top": "12px" }} onClick={() => { closePages(); page.value = "wrapped"; setView("All"); }}>View Monthly Wrapped</button>
        </section>
        <section class="settings-section"><h3>About</h3><p class="settings-desc">News Deck is a client-side RSS reader with on-device AI summaries and a built-in article reader. Your reading data stays on this device.</p></section>
      </div>
    </div>
  );
}
