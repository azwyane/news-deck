import { useSignal } from "@preact/signals";
import { hashColor } from "../lib/format";
import { addStation, mutedStations, normalizeStreamUrl, removeStation, removedStations, reorderStations, restoreStation, toggleMute as toggleStationMute, visibleStations } from "../lib/radio";
import type { Source } from "../lib/types";
import { addFeed, allSources, counts, customFeeds, failedSources, feedHealth, hideSource, loadingSources, mutedSources, muteSource, normalizeFeedUrl, refreshSource, removeFeed, removedSources, reorderSources, restoreSource, restoreSources, setView, view } from "../state/store";
import { closePages, notify, openFeedReadFlow, openRadioFlow, sidebarOpen } from "../state/ui";

const QUICK = [
  { key: "All", label: "All Stories", count: () => counts.value.all },
  { key: "Liked", label: "Liked", count: () => counts.value.liked },
  { key: "Archived", label: "Archived", count: () => counts.value.archived },
  { key: "Read", label: "Read", count: () => counts.value.read },
  { key: "Notes", label: "Notes", count: () => counts.value.notes },
] as const;

interface DragState {
  name: string | null;
  over: string | null;
  set: (name: string | null) => void;
  setOver: (name: string | null) => void;
}

function move<T>(list: { name: string }[], from: string, to: string, apply: (order: string[]) => void): void {
  if (from === to) return;
  const names = list.map((item) => item.name);
  const fromIndex = names.indexOf(from);
  const toIndex = names.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = names.splice(fromIndex, 1);
  const target = names.indexOf(to);
  names.splice(target + (fromIndex < toIndex ? 1 : 0), 0, moved);
  apply(names);
}

function SourceRow({ source, drag }: { source: Source; drag: DragState }) {
  const muted = mutedSources.value.includes(source.name);
  const health = loadingSources.value.has(source.name) ? "…" : failedSources.value.includes(source.name) ? "!" : feedHealth.value[source.name]?.lastOk ? "✓" : "·";
  const classes = ["sidebar-item", view.value === source.name && "active", muted && "muted", drag.name === source.name && "dragging", drag.over === source.name && "drag-over"].filter(Boolean).join(" ");
  return (
    <div
      class={classes}
      data-name={source.name}
      draggable
      onDragStart={(event) => { drag.set(source.name); if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", source.name); } }}
      onDragEnd={() => { drag.set(null); drag.setOver(null); }}
      onDragEnter={(event) => { event.preventDefault(); drag.setOver(source.name); }}
      onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; drag.setOver(source.name); }}
      onDragLeave={() => { if (drag.over === source.name) drag.setOver(null); }}
      onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer?.getData("text/plain") || drag.name; if (from) move(allSources.value, from, source.name, reorderSources); drag.set(null); drag.setOver(null); }}
      onClick={() => { setView(source.name); closePages(); }}
    >
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <span class="src-name">{source.name}</span>
      <span class="count" title={health === "!" ? "Feed failed to load" : health === "…" ? "Fetching…" : health === "✓" ? "Loaded recently" : "Not loaded yet"}>{muted ? "off" : health}</span>
      <button type="button" class="mute-icon" title="Open feed list" onClick={(event) => { event.stopPropagation(); setView(source.name); closePages(); }}>≡</button>
      <button type="button" class="mute-icon" title="Open Read Flow for this feed" onClick={(event) => { event.stopPropagation(); sidebarOpen.value = false; openFeedReadFlow(source.name); }}>⤢</button>
      <button type="button" class="mute-icon" title={(muted ? "Unmute " : "Mute ") + source.name} onClick={(event) => { event.stopPropagation(); muteSource(source.name, !muted); }}>{muted ? "off" : "on"}</button>
      <button type="button" class="mute-icon" title="Refresh this feed" onClick={(event) => { event.stopPropagation(); void refreshSource(source.name); }}>↻</button>
      <button type="button" class="delete-feed" title={customFeeds.value.some((feed) => feed.name === source.name) ? "Remove custom feed" : "Hide source"} onClick={(event) => { event.stopPropagation(); const custom = customFeeds.value.some((feed) => feed.name === source.name); if (custom) removeFeed(source.name); else hideSource(source.name); notify(custom ? `${source.name} removed — restore from Hidden feeds` : `${source.name} hidden — restore from Hidden feeds`); }}>×</button>
    </div>
  );
}

export function Sidebar() {
  const addingFeed = useSignal(false);
  const addingRadio = useSignal(false);
  const feedName = useSignal("");
  const feedUrl = useSignal("");
  const radioName = useSignal("");
  const radioUrl = useSignal("");
  const radioDesc = useSignal("");
  const dragName = useSignal<string | null>(null);
  const dragOver = useSignal<string | null>(null);
  const radioDragName = useSignal<string | null>(null);
  const radioDragOver = useSignal<string | null>(null);
  const drag: DragState = { name: dragName.value, over: dragOver.value, set: (name) => { dragName.value = name; }, setOver: (name) => { dragOver.value = name; } };
  const radioDrag: DragState = { name: radioDragName.value, over: radioDragOver.value, set: (name) => { radioDragName.value = name; }, setOver: (name) => { radioDragOver.value = name; } };

  const saveFeed = () => {
    const normalized = normalizeFeedUrl(feedUrl.value);
    if (!normalized) { notify("Enter a valid http(s) feed URL"); return; }
    let name = feedName.value.trim();
    if (!name) {
      try { name = new URL(normalized).hostname.replace(/^www\./, ""); } catch { name = ""; }
    }
    if (!name) { notify("Enter a feed name or URL"); return; }
    if (!addFeed(name, normalized)) { notify("A source with that name or URL already exists"); return; }
    notify(`${name} added`);
    feedName.value = "";
    feedUrl.value = "";
    addingFeed.value = false;
  };

  const saveRadio = () => {
    const normalized = normalizeStreamUrl(radioUrl.value);
    if (!normalized) { notify("Enter a valid http(s) stream URL"); return; }
    let name = radioName.value.trim();
    if (!name) {
      try { name = new URL(normalized).hostname.replace(/^www\./, ""); } catch { name = ""; }
    }
    if (!name) { notify("Give the station a name"); return; }
    if (!addStation({ name, url: normalized, desc: radioDesc.value.trim() || "Custom stream", category: "Custom", color: hashColor(name + normalized) })) {
      notify("A station with that name or URL already exists");
      return;
    }
    notify(`${name} added — opening Radio Flow`);
    radioName.value = "";
    radioUrl.value = "";
    radioDesc.value = "";
    addingRadio.value = false;
    sidebarOpen.value = false;
    const index = visibleStations.value.findIndex((station) => station.name === name);
    openRadioFlow(Math.max(0, index));
  };

  return (
    <div id="sidebarPage" class={sidebarOpen.value ? "on" : ""} role="dialog" aria-label="Sources">
      <div id="sidebarBackdrop" onClick={() => { sidebarOpen.value = false; }} />
      <div id="sidebarPanel">
        <div class="sidebar-bar"><button type="button" id="sidebarClose" aria-label="Close sidebar" onClick={() => { sidebarOpen.value = false; }}>←</button><span class="sidebar-title">Sources</span></div>
        <div class="sidebar-content">
          <div class="sidebar-section">
            {QUICK.map((item) => <button type="button" class={`sidebar-item${view.value === item.key ? " active" : ""}`} data-src={item.key} onClick={() => { setView(item.key); closePages(); }}><span class="src-name">{item.label}</span><span class="count">{item.count()}</span></button>)}
          </div>
          <div class="sidebar-section">
            <button type="button" class="add-feed-btn" id="addFeedToggle" onClick={() => { addingFeed.value = !addingFeed.value; }}>+ Add custom feed</button>
            <div id="addFeedForm" class={`add-feed-form${addingFeed.value ? " on" : ""}`}>
              <input placeholder="Feed name (optional)" maxLength={40} value={feedName.value} onInput={(event) => { feedName.value = (event.target as HTMLInputElement).value; }} />
              <input placeholder="https://example.com/rss" type="url" value={feedUrl.value} onInput={(event) => { feedUrl.value = (event.target as HTMLInputElement).value; }} onKeyDown={(event) => { if (event.key === "Enter") saveFeed(); }} />
              <div class="row"><button type="button" class="save" id="addFeedSave" onClick={saveFeed}>Add</button><button type="button" class="cancel" onClick={() => { addingFeed.value = false; }}>Cancel</button></div>
            </div>
          </div>
          <div class="sidebar-section"><h3>Sources <span class="faint">drag to reorder</span></h3><div id="sidebarSources">{allSources.value.map((source) => <SourceRow key={source.name} source={source} drag={drag} />)}</div>
            {!!removedSources.value.length && <div class="restore-box" id="hiddenSources"><div class="restore-head"><span>Hidden feeds · {removedSources.value.length}</span><button type="button" onClick={restoreSources}>Restore all</button></div>{removedSources.value.map((name) => <button type="button" class="restore-item" key={name} onClick={() => restoreSource(name)}>↩ {name}</button>)}</div>}
          </div>
          <div class="sidebar-section sidebar-radio-section">
            <h3>Radio Stations <span class="faint">drag to prioritize</span></h3>
            <div id="sidebarRadio">
              {visibleStations.value.map((station, index) => {
                const classes = ["radio-sidebar-item", radioDrag.name === station.name && "dragging", radioDrag.over === station.name && "drag-over", mutedStations.value.has(station.name) && "muted"].filter(Boolean).join(" ");
                return (
                  <div
                    class={classes}
                    key={station.name}
                    data-name={station.name}
                    draggable
                    onDragStart={(event) => { radioDrag.set(station.name); if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", station.name); } }}
                    onDragEnd={() => { radioDrag.set(null); radioDrag.setOver(null); }}
                    onDragEnter={(event) => { event.preventDefault(); radioDrag.setOver(station.name); }}
                    onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; radioDrag.setOver(station.name); }}
                    onDragLeave={() => { if (radioDrag.over === station.name) radioDrag.setOver(null); }}
                    onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer?.getData("text/plain") || radioDrag.name; if (from) move(visibleStations.value, from, station.name, reorderStations); radioDrag.set(null); radioDrag.setOver(null); }}
                    onClick={() => { sidebarOpen.value = false; openRadioFlow(index); }}
                    role="button"
                    tabindex={0}
                    onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); sidebarOpen.value = false; openRadioFlow(index); } }}
                  >
                    <span class="drag-handle" title="Drag to prioritize">⠿</span>
                    <span class="rs-order">{index + 1}</span>
                    <span class="rs-dot" style={{ background: station.color || hashColor(station.name) }} />
                    <span class="rs-name">{station.name}</span>
                    <span class="rs-cat">{station.category || "Radio"}</span>
                    <button type="button" class="mute-icon" title="Open in Radio Flow" onClick={(event) => { event.stopPropagation(); sidebarOpen.value = false; openRadioFlow(index); }}>⤢</button>
                    <button type="button" class="mute-icon" title={mutedStations.value.has(station.name) ? "Unmute station" : "Mute station"} onClick={(event) => { event.stopPropagation(); toggleStationMute(station.name); }}>{mutedStations.value.has(station.name) ? "off" : "on"}</button>
                    <button type="button" class="delete-feed" title="Remove station" onClick={(event) => { event.stopPropagation(); removeStation(station.name); notify(`${station.name} removed — restore from Hidden stations`); }}>×</button>
                  </div>
                );
              })}
            </div>
            <button type="button" class="sidebar-add-radio" id="addRadioToggle" onClick={() => { addingRadio.value = !addingRadio.value; }}>+ Add stream / radio station</button>
            <div id="addRadioForm" class={`add-feed-form${addingRadio.value ? " on" : ""}`}>
              <input type="text" placeholder="Station name (optional)" aria-label="Station name" value={radioName.value} onInput={(event) => { radioName.value = (event.target as HTMLInputElement).value; }} />
              <input type="text" placeholder="Stream URL (.m3u8 or .mp3)" aria-label="Stream URL" value={radioUrl.value} onInput={(event) => { radioUrl.value = (event.target as HTMLInputElement).value; }} onKeyDown={(event) => { if (event.key === "Enter") saveRadio(); }} />
              <input type="text" placeholder="Description (optional)" aria-label="Station description" value={radioDesc.value} onInput={(event) => { radioDesc.value = (event.target as HTMLInputElement).value; }} />
              <div class="row"><button type="button" class="cancel" onClick={() => { addingRadio.value = false; }}>Cancel</button><button type="button" class="save" id="addRadioSave" onClick={saveRadio}>Add</button></div>
            </div>
            {!!removedStations.value.size && <div class="restore-box" id="hiddenStations"><div class="restore-head"><span>Hidden stations · {removedStations.value.size}</span></div>{[...removedStations.value].map((name) => <button type="button" class="restore-item" key={name} onClick={() => { restoreStation(name); notify(`${name} restored`); }}>↩ {name}</button>)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
