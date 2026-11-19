import { wrappedData } from "../lib/stats";
import { archived, liked, mutedSources, readStories, removedSources, sourceOrder } from "../state/store";
import { closePages, page } from "../state/ui";

export function Wrapped() {
  if (page.value !== "wrapped") return null;
  const data = wrappedData(readStories.value, liked.value, sourceOrder.value, new Set(mutedSources.value), new Set(removedSources.value));
  return (
    <div id="wrappedPage" class="on" role="dialog" aria-label="Reading Wrapped">
      <div class="wrapped-bar"><button type="button" id="wrappedClose" class="icon-btn" aria-label="Close" onClick={closePages}>←</button><span class="settings-title">Your Month in News</span></div>
      <div class="wrapped-content" id="wrappedContent">
        <div class="wrap-hero"><span class="wrap-label">THIS MONTH</span><h2>{data.monthRead} stories read</h2><p>{data.duration} of reading across {data.sourcesExplored} sources</p></div>
        <div class="wrap-grid">
          <div class="wrap-stat"><b>{data.streak}</b><span>day streak</span></div>
          <div class="wrap-stat"><b>{data.liked}</b><span>saved stories</span></div>
          <div class="wrap-stat"><b>{data.hours}h</b><span>time well spent</span></div>
          <div class="wrap-stat"><b>{archived.value.length}</b><span>archived</span></div>
        </div>
        {data.topTopic && <div class="wrap-card" style={{ borderColor: data.topTopic.color }}><span>TOP TOPIC</span><h3>{data.topTopic.name}</h3><p>{data.topTopic.count} stories</p></div>}
        {!!data.topSources.length && <div class="wrap-card"><span>TOP SOURCES</span><ol>{data.topSources.map(([name, count]) => <li key={name}>{name} · {count}</li>)}</ol></div>}
        {data.suggestion && <div class="wrap-card"><span>TRY SOMETHING NEW</span><h3>{data.suggestion}</h3><p>You haven't explored this source yet.</p></div>}
        <button type="button" class="btn-primary" onClick={closePages}>Back to your deck</button>
      </div>
    </div>
  );
}
