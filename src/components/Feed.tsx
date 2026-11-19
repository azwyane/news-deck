import { signal, useSignal } from "@preact/signals";
import { hashColor, relativeTime } from "../lib/format";
import { askAI, aiState } from "../lib/ai";
import { fetchHNComments } from "../lib/feeds";
import { activeStationName, playStation, radioPlaying, visibleStations } from "../lib/radio";
import { classifyTopic, TOPIC_COLORS } from "../lib/topics";
import type { Story } from "../lib/types";
import type { VNode } from "preact";
import { activeSources, archiveStory, clearFilters, deleteNote, findStory, isArchived, isLiked, isRead, markAllRead, markUnread, noteEntries, search, setView, sort, stories, toggleLike, toggleTopic, topicFilter, unarchiveStory, view, visibleStories } from "../state/store";
import { closeCardMenu, notify, openRadioFlow, openReader, showCardMenu, sidebarOpen } from "../state/ui";

interface SourceSummaryState {
  src: string;
  status: "init" | "collecting" | "fetching-comments" | "thinking" | "streaming" | "done" | "error";
  articles: { title: string; desc: string; link: string; hn?: string; comments: number }[];
  summary: string;
  fetchingTitle?: string;
  thinkPhase?: number;
}

let sourceSummaryToken = 0;
const sourceSummary = signal<SourceSummaryState | null>(null);

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
        offset.value = Math.max(-120, Math.min(120, event.clientX - startX.value));
        if (Math.abs(offset.value) > 10 || Math.abs(event.clientY - startY.value) > 10) clearPress();
      }}
      onPointerUp={(event) => {
        clearPress();
        if (Math.abs(startX.value - event.clientX) > 90) { archiveStory(story.link); notify("Archived", () => { unarchiveStory(story.link); }); }
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
  const source = view.value;
  const sourceStories = stories.value.filter((story) => story.src === source);
  if (!sourceStories.length) return null;
  const summary = sourceSummary.value?.src === source ? sourceSummary.value : null;
  const busy = !!summary && !["done", "error"].includes(summary.status);

  const summarize = async () => {
    const token = ++sourceSummaryToken;
    const articles = sourceStories.slice(0, 8).map((story) => ({ title: story.title, desc: story.desc, link: story.link, hn: story.hn, comments: 0 }));
    sourceSummary.value = { src: source, status: "collecting", articles, summary: "" };
    try {
      for (const article of articles) {
        if (token !== sourceSummaryToken) return;
        const id = article.hn?.match(/id=(\d+)/)?.[1];
        if (!id) continue;
        sourceSummary.value = { ...sourceSummary.value!, status: "fetching-comments", fetchingTitle: article.title };
        try {
          const comments = await fetchHNComments(id);
          if (token !== sourceSummaryToken) return;
          article.comments = comments.length;
        } catch { /* keep the story without comments */ }
      }
      if (token !== sourceSummaryToken) return;
      const phases = ["analyzing themes", "connecting stories", "finding patterns", "synthesizing the briefing"];
      for (let phase = 0; phase < phases.length; phase++) {
        if (token !== sourceSummaryToken) return;
        sourceSummary.value = { ...sourceSummary.value!, status: "thinking", thinkPhase: phase };
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      if (token !== sourceSummaryToken) return;
      const transcript = articles.map((article, index) => `${index + 1}. ${article.title}\n   ${article.desc.slice(0, 150)}${article.comments ? `\n   HN comments (${article.comments}): ${article.comments} fetched` : ""}`).join("\n");
      const prompt = articles.some((article) => article.hn)
        ? `You summarize what Hacker News is discussing right now. Write 3-4 plain sentences capturing the main themes, the angle the community is taking, and any notable disagreements. No markdown, no list, just prose.\n\nTop stories:\n${transcript}`
        : `You summarize what ${source} is covering right now. Write 3-4 plain sentences capturing the main themes and what's notable about the coverage. No markdown, no list, just prose.\n\nTop stories:\n${transcript}`;
      await askAI(prompt, 320, (_chunk, all) => {
        if (token !== sourceSummaryToken) return;
        sourceSummary.value = { ...sourceSummary.value!, status: "streaming", summary: all };
      });
      if (token !== sourceSummaryToken) return;
      sourceSummary.value = { ...sourceSummary.value!, status: "done", summary: sourceSummary.value?.summary || "No summary generated." };
    } catch (error) {
      if (token !== sourceSummaryToken) return;
      sourceSummary.value = { ...sourceSummary.value!, status: "error", summary: `AI failed: ${String((error as Error).message || error)}` };
    }
  };

  const markRead = () => {
    const links = sourceStories.map((story) => story.link);
    const added = markAllRead(links);
    notify(added ? `Marked ${added} stories from ${source} as read` : "Nothing new to mark");
  };

  const renderStatus = (state: SourceSummaryState) => {
    if (state.status === "init") return <div class="ss-progress"><span class="spin">◌</span> Preparing briefing for {state.src}…</div>;
    if (state.status === "collecting" || state.status === "fetching-comments") {
      const label = state.status === "fetching-comments" ? `Fetching HN discussion for “${(state.fetchingTitle || "").slice(0, 50)}…”` : `Reading ${state.articles.length} stories from ${state.src}…`;
      return <><div class="ss-progress"><span class="spin">◌</span> {label}</div>{state.articles.map((article) => <div class="ss-article" key={article.link}><b>{article.title}</b>{article.desc && <div>{article.desc.slice(0, 120)}</div>}{article.comments > 0 && <div class="ss-cmt">{article.comments} comments fetched</div>}</div>)}</>;
    }
    if (state.status === "thinking") {
      const phases = ["analyzing themes", "connecting stories", "finding patterns", "synthesizing the briefing"];
      return <><div class="ss-progress"><span class="spin">◌</span> AI is <span class="ss-think">{phases[state.thinkPhase || 0]}</span>…</div>{state.articles.map((article) => <div class="ss-article" key={article.link}><b>{article.title}</b></div>)}</>;
    }
    if (state.status === "streaming") return <div class="ss-summary-text">{state.summary}<span class="ss-cursor">▌</span></div>;
    if (state.status === "done") return <>
      <div class="ss-summary-text">{state.summary}</div>
      <details class="ss-sources"><summary>{state.articles.length} sources read by AI</summary>{state.articles.map((article) => <div class="ss-article" key={article.link}><b><a href={article.link} target="_blank" rel="noopener">{article.title}</a></b>{article.comments > 0 && <div class="ss-cmt">{article.comments} comments included</div>}</div>)}</details>
    </>;
    return <div class="ss-progress">{state.summary}</div>;
  };

  return (
    <>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", padding: "6px 0 14px" }}>
        <button type="button" class="btn-secondary" id="triggerSourceSummary" onClick={() => void summarize()} disabled={busy || aiState.value.state === "loading"}>{busy ? "Summarizing…" : `Summarize ${source} with AI`}</button>
        <button type="button" class="btn-secondary" id="markSourceRead" onClick={markRead}>Mark All Read</button>
      </div>
      {summary && <div id="srcSummaryWrap"><div id="srcSummary"><div class="ss-header"><span class="ss-icon">✦</span><span class="ss-title">Source briefing · <b>{summary.src}</b></span></div><div class="ss-body">{renderStatus(summary)}</div></div></div>}
    </>
  );
}

function EmptyState({ kind }: { kind: "liked" | "read" | "archived" | "notes" | "muted" | "noresults" | "offline" }) {
  const states = {
    liked: { icon: "☆", title: "No saved stories yet", msg: "Tap the star on any headline to save it here for later.", cta: "Browse the deck" },
    read: { icon: "📰", title: "Nothing read yet", msg: "Stories you open in the reader will show up here so you can revisit them.", cta: "Browse the deck" },
    archived: { icon: "📂", title: "Archive is empty", msg: "Swipe a card left or right to tuck it away for later.", cta: null },
    notes: { icon: "✎", title: "No notes yet", msg: "Open any article, select text, and tap Note to save highlights and annotations.", cta: null },
    muted: { icon: "🔇", title: "All sources muted", msg: "Open Sources to unmute some outlets.", cta: "Open Sources" },
    noresults: { icon: "🔍", title: "Nothing matches your filter", msg: "Try a different search term or clear the topic filter.", cta: "Clear filters" },
    offline: { icon: "📡", title: "No stories loaded", msg: "Your network may be blocking the public CORS proxies this app relies on. Try a different connection or VPN, then hit Refresh.", cta: null },
  };
  const state = states[kind];
  const action = () => {
    if (kind === "muted") sidebarOpen.value = true;
    else if (kind === "noresults") clearFilters();
    else setView("All");
  };
  return <div class="empty-smart"><div class="empty-icon">{state.icon}</div><p class="empty-title">{state.title}</p><p class="empty-msg">{state.msg}</p>{state.cta && <button type="button" class="btn-secondary" onClick={action}>{state.cta}</button>}</div>;
}

function RadioView() {
  const stations = visibleStations.value;
  if (!stations.length) return <div class="empty-smart"><div class="empty-icon">📻</div><p class="empty-title">No radio stations</p><p class="empty-msg">Restore or unmute a station in Sources to start listening.</p></div>;
  return <div class="radio-grid">{stations.map((station, index) => {
    const active = radioPlaying.value && activeStationName.value === station.name;
    return (
      <article
        class={`radio-card${active ? " playing" : ""}`}
        data-radio-idx={index}
        key={station.name}
        style={{ "--rc-color": station.color || "#4a90d9", "--rc-color2": station.color || "#2196f3" } as Record<string, string>}
        onClick={() => { void playStation(station); openRadioFlow(index); }}
      >
        <div class="radio-card-gradient"><span class="radio-card-icon">📻</span><div class="radio-card-eq"><span /><span /><span /><span /></div></div>
        <div class="radio-card-body"><h3 class="radio-card-name">{station.name}</h3><p class="radio-card-desc">{station.desc || "Live radio stream"}</p><div class="radio-card-meta"><span class="radio-card-cat">{station.category || "Radio"}</span><span class="radio-card-status">Tap to play</span></div></div>
      </article>
    );
  })}</div>;
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
  if (!noteEntries.value.length) return <EmptyState kind="notes" />;
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
  if (view.value === "Radio") return <main id="feed"><RadioView /></main>;
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
    const kind = !activeSources.value.length ? "muted" : search.value.trim() || topicFilter.value ? "noresults" : stories.value.length ? "noresults" : "offline";
    return <EmptyState kind={kind} />;
  }
  if (sort.value === "src" && view.value === "All") {
    const nodes: { key: string; node: VNode }[] = [];
    let current = "";
    items.forEach((story) => {
      if (story.src !== current) {
        current = story.src;
        nodes.push({ key: `group-${current}`, node: <div class="src-group-header" key={`group-${current}`}>{current}</div> });
      }
      nodes.push({ key: story.link + story.src, node: <Card key={story.link + story.src} story={story} /> });
    });
    return <>{nodes.map((entry) => entry.node)}</>;
  }
  return <>{items.map((story) => <Card key={story.link + story.src} story={story} />)}</>;
}
