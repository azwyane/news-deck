import { allSources, counts, markAllRead, setView, unreadOnly, view, visibleStories } from "../state/store";
import { notify, openRadioFlow, openReadFlow } from "../state/ui";

export function TabsBar() {
  const markRead = () => {
    const links = visibleStories.value.map((story) => story.link);
    const added = markAllRead(links);
    notify(added ? `Marked ${added} stories as read` : "Nothing new to mark");
  };

  return (
    <nav id="tabsBar" data-view={view.value} aria-label="Primary views">
      <button type="button" class={view.value === "All" ? "tab-btn active" : "tab-btn"} data-view="All" onClick={() => setView("All")}>Deck <span class="tab-count">{counts.value.all}</span></button>
      <button type="button" class={view.value === "Liked" ? "tab-btn active" : "tab-btn"} data-view="Liked" onClick={() => setView("Liked")}>Liked <span class="tab-count">{counts.value.liked}</span></button>
      <button type="button" class={view.value === "Read" ? "tab-btn active" : "tab-btn"} data-view="Read" onClick={() => setView("Read")}>Read <span class="tab-count">{counts.value.read}</span></button>
      <button type="button" class={view.value === "Notes" ? "tab-btn active" : "tab-btn"} data-view="Notes" onClick={() => setView("Notes")}>Notes <span class="tab-count">{counts.value.notes}</span></button>
      <button type="button" class="tab-btn radio-tab" data-view="Radio" title="Radio stations" onClick={() => setView("Radio")}>
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" /></svg>
        Radio <span class="tab-count">{counts.value.radio}</span>
      </button>
      <button type="button" class="flow-action-btn" id="readFlowBtn" title="Swipe through stories full-screen" onClick={() => openReadFlow(visibleStories.value)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg> Read Flow
      </button>
      <span class="tabs-spacer" />
      <span class="tabs-actions" id="tabsActions">
        <button type="button" id="unreadBtn" class={unreadOnly.value ? "tab-action active" : "tab-action"} title="Hide stories you have already opened" onClick={() => { unreadOnly.value = !unreadOnly.value; }}>Unread</button>
        <button type="button" id="markReadBtn" class="tab-action" title="Mark everything shown as read" onClick={markRead}>Mark Read</button>
        {allSources.value.some((source) => source.name === view.value) && <button type="button" class="tab-action" onClick={() => openRadioFlow(0)}>Radio</button>}
      </span>
    </nav>
  );
}
