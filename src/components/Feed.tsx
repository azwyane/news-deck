import { useSignal } from "@preact/signals";
import { hashColor, relativeTime } from "../lib/format";
import { askAI, aiState } from "../lib/ai";
import { classifyTopic, makeBriefing, TOPIC_COLORS } from "../lib/topics";
import type { Story } from "../lib/types";
import { activeSources, archiveStory, clearFilters, deleteNote, findStory, isArchived, isLiked, isRead, markUnread, noteEntries, stories, toggleLike, toggleTopic, topicFilter, unarchiveStory, view, visibleStories } from "../state/store";
import { closeCardMenu, notify, openReader, showCardMenu } from "../state/ui";

function Card({ story }: { story: Story }) {
  const offset = useSignal(0);
  const startX = useSignal(0);
  const startY = useSignal(0);
  const pressTimer = useSignal<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => { if (pressTimer.value) clearTimeout(pressTimer.value); pressTimer.value = null; };
  const topic = classifyTopic(story.title, story.desc);
  const age = (Date.now() - story.date.getTime()) / 3600000;
  const ageClass = age < 2 ? "age-fresh" : age < 12 ? "age-today" : age < 24 ? "age-aging" : "age-old";
  return (
    <article
      class={`card${isRead(story.link) ? " read" : ""} ${ageClass}`}
      data-link={story.link}
      onPointerDown={(event) => {
        startX.value = event.clientX;
        startY.value = event.clientY;
        if (event.pointerType === "touch") pressTimer.value = setTimeout(() => showCardMenu(story, event.clientX, event.clientY), 500);
      }}
      onPointerMove={(event) => {
        if (!startX.value) return;
        offset.value = Math.max(-120, Math.min(0, event.clientX - startX.value));
        if (Math.abs(offset.value) > 10 || Math.abs(event.clientY - startY.value) > 10) clearPress();
      }}
      onPointerUp={(event) => {
        clearPress();
        if (startX.value - event.clientX > 90) { archiveStory(story.link); notify("Archived", () => { unarchiveStory(story.link); }); }
        offset.value = 0;
        startX.value = 0;
        startY.value = 0;
      }}
      onPointerCancel={() => { clearPress(); offset.value = 0; startX.value = 0; startY.value = 0; }}
      onPointerLeave={clearPress}
      onContextMenu={(event) => { event.preventDefault(); showCardMenu(story, event.clientX, event.clientY); }}
      style={offset.value ? { transform: `translateX(${offset.value}px)` } : undefined}
    >
      <div class="swipe-hint">Archive</div>
      {story.thumb && <img class="card-thumb" src={story.thumb} loading="lazy" referrerpolicy="no-referrer" alt="" onError={(event) => { (event.target as HTMLImageElement).style.display = "none"; }} />}
      <div class="meta">
        <span class="src-dot" style={{ background: hashColor(story.src) }} />
        <span class={`badge${story.cached ? " cache" : ""}${story.hn ? " hn" : ""}`}>{story.src}{story.cached ? " · cached" : ""}</span>
        {topic && <button type="button" class={`topic-tag${topicFilter.value === topic ? " active" : ""}`} style={{ background: `${TOPIC_COLORS[topic]}20`, color: TOPIC_COLORS[topic] }} onClick={() => toggleTopic(topic)}>{topic}</button>}
        <span class="time" title={story.date.toLocaleString()}>{relativeTime(story.date)}</span>
      </div>
      <a class="title" href={story.link} target="_blank" rel="noopener" onClick={(event) => { event.preventDefault(); void openReader(story); }}>{story.title}</a>
      {story.ai && <div class="ai">{story.ai}</div>}
      {story.desc && <div class="desc">{story.desc}</div>}
      <div class="cardfoot">
        {story.hn && <a class="hnstat" href={story.hn} target="_blank" rel="noopener" title="Discussion on Hacker News">{story.pts || 0} pts · {story.cmts || 0} comments</a>}
        <span class="acts">
          <button type="button" class="open-btn" title="Open in reader" onClick={() => void openReader(story)}>Open</button>
          <button type="button" class={isLiked(story.link) ? "starbtn on" : "starbtn"} data-act="star" aria-label="Save story" title="Save" onClick={() => toggleLike(story.link)}>{isLiked(story.link) ? "★" : "☆"}</button>
          {isArchived(story.link) && <button type="button" class="starbtn" data-act="unarch" aria-label="Restore" title="Restore to feed" onClick={() => unarchiveStory(story.link)}>↩</button>}
          {view.value === "Read" && <button type="button" class="starbtn" data-act="unread" aria-label="Mark unread" title="Restore to unread" onClick={() => markUnread(story.link)}>↩</button>}
        </span>
      </div>
    </article>
  );
}

function Briefing() {
  const text = useSignal("");
  const busy = useSignal(false);
  const source = view.value;
  const briefing = makeBriefing(stories.value.filter((story) => story.src === source));
  if (!briefing.multi.length && !briefing.latest.length) return null;
  const summarize = async () => {
    busy.value = true;
    const headlines = stories.value.filter((story) => story.src === source).slice(0, 12).map((story) => `- ${story.title}`).join("\n");
    try {
      text.value = await askAI(`Give a 4-bullet briefing of these ${source} headlines. Each bullet must be one plain sentence with no markdown:\n${headlines}`, 220);
    } catch (error) {
      notify(String((error as Error).message || error));
    } finally {
      busy.value = false;
    }
  };
  return (
    <div id="srcSummaryWrap">
      <div id="srcSummary">
        <div class="ss-header">
          <span class="ss-icon">✦</span>
          <span class="ss-title">Source briefing · <b>{source}</b></span>
        </div>
        <div class="ss-body">
          {!!briefing.multi.length && <p><b>Developing across outlets:</b> {briefing.multi[0].items.map((story) => story.title).join(" · ")}</p>}
          {!!briefing.latest.length && <p><b>Latest:</b> {briefing.latest.slice(0, 3).map((cluster) => cluster.items[0]?.title).filter(Boolean).join(" · ")}</p>}
          {text.value && <p>{text.value}</p>}
          <button type="button" class="btn-secondary" onClick={() => void summarize()} disabled={busy.value || aiState.value.state === "loading"}>{busy.value ? "Summarizing…" : "Summarize with AI"}</button>
        </div>
      </div>
    </div>
  );
}

function Breadcrumb() {
  const isSource = !!stories.value.length && view.value !== "All" && view.value !== "Liked" && view.value !== "Read" && view.value !== "Notes" && view.value !== "Archived" && view.value !== "Radio";
  if (!topicFilter.value && !isSource) return null;
  return (
    <div id="filterBreadcrumb">
      {topicFilter.value && <span id="topicFilter"><button type="button" class="tag-chip" style={{ background: `${TOPIC_COLORS[topicFilter.value]}20`, color: TOPIC_COLORS[topicFilter.value] }} onClick={() => toggleTopic(topicFilter.value!)}>{topicFilter.value}</button><button type="button" class="tag-clear" aria-label="Clear topic filter" onClick={() => toggleTopic(topicFilter.value!)}>✕</button></span>}
      {isSource && <span id="filterLabel">{view.value}</span>}
      <button type="button" id="breadcrumbClear" aria-label="Back to all stories" title="Back to all stories" onClick={clearFilters}>All stories ✕</button>
    </div>
  );
}

function NotesView() {
  if (!noteEntries.value.length) return <div class="empty">No notes yet. Open an article, select text, and tap Note to save highlights.</div>;
  return (
    <div class="notes-grid">
      <div class="notes-caption">{noteEntries.value.length} notes across {Object.keys(noteEntries.value.reduce<Record<string, boolean>>((map, note) => ({ ...map, [note.link]: true }), {})).length} articles</div>
      {noteEntries.value.map((note, index) => {
        const story = findStory(note.link);
        const openNote = () => {
          if (story) { void openReader(story); return; }
          void openReader({ title: note.title, link: note.link, src: note.src, desc: "", date: new Date(note.createdAt) });
        };
        return (
          <article class="card" data-link={note.link} style={{ cursor: "pointer" }} onClick={openNote}>
            <div class="meta"><span class="src-dot" style={{ background: hashColor(note.src) }} /><span class="badge">{note.src}</span><span class="time">{relativeTime(new Date(note.createdAt))}</span></div>
            <a class="title" href={note.link} style={{ "font-size": "13px" }} onClick={(event) => { event.preventDefault(); openNote(); }}>{note.title}</a>
            <div class="ann-quote">{note.quote}</div>
            <div class="ann-note">{note.note}</div>
            <div class="cardfoot"><button type="button" class="open-btn" onClick={(event) => { event.stopPropagation(); openNote(); }}>Open ↗</button><button type="button" class="note-delete" onClick={(event) => { event.stopPropagation(); deleteNote(note.link, index); notify("Note deleted"); }}>Delete</button></div>
          </article>
        );
      })}
    </div>
  );
}

export function Feed() {
  if (view.value === "Notes") return <main id="feed"><Breadcrumb /><NotesView /></main>;
  return (
    <>
      <Breadcrumb />
      <Briefing />
      <main id="feed">
        <FeedContent />
      </main>
    </>
  );
}

function FeedContent() {
  const items = visibleStories.value;
  if (!items.length) {
    const message = stories.value.length ? "No stories match these filters." : activeSources.value.length ? "No cached stories yet — tap ↻ to fetch the latest deck." : "All sources are muted. Open Sources to unmute some.";
    return <div class="empty">{message}</div>;
  }
  return <>{items.map((story) => <Card key={story.link + story.src} story={story} />)}</>;
}
