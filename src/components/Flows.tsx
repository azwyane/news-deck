import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { articleToFragment, loadArticle } from "../lib/article";
import { escapeHtml, hashColor, relativeTime } from "../lib/format";
import { playStation, radioPlaying, radioStatus, setVolume, stopRadio, toggleRadio, visibleStations } from "../lib/radio";
import { classifyTopic, TOPIC_COLORS } from "../lib/topics";
import { tts } from "../lib/tts";
import { archiveStory, isLiked, markRead, toggleLike } from "../state/store";
import { closeRadioFlow, closeReadFlow, exitRadioFlow, exitReadFlow, flow, notify, openReader, readerContent } from "../state/ui";

interface SlideContent { html: string; loading: boolean; failed: boolean }

function Dots({ count, active, onPick }: { count: number; active: number; onPick: (index: number) => void }) {
  if (!count) return null;
  const shown = Math.min(count, 24);
  const start = Math.max(0, Math.min(active - Math.floor(shown / 2), count - shown));
  return (
    <>
      {Array.from({ length: shown }, (_, offset) => {
        const index = start + offset;
        return <button type="button" key={index} class={index === active ? "flow-dot active" : "flow-dot"} data-i={index} aria-label={`Go to item ${index + 1}`} onClick={(event) => { event.stopPropagation(); onPick(index); }} />;
      })}
      {count > shown && <span class="flow-dot-more">+{count - shown}</span>}
    </>
  );
}

function shareStory(title: string, link: string): void {
  if (navigator.share) {
    void navigator.share({ title, url: link }).catch(() => undefined);
    return;
  }
  void navigator.clipboard?.writeText(link).then(() => notify("Link copied")).catch(() => notify("Couldn't copy — use Original ↗"));
}

export function ReadFlow() {
  const contents = useSignal<Record<number, SlideContent>>({});
  const generation = useSignal(0);
  const hint = useSignal("");
  const dragY = useSignal(0);
  const dragX = useSignal(0);
  const dragging = useSignal(false);
  const startX = useSignal(0);
  const startY = useSignal(0);

  const setContent = (index: number, value: SlideContent) => { contents.value = { ...contents.value, [index]: value }; };

  const loadSlide = async (index: number) => {
    const story = flow.value.stories[index];
    if (!story || contents.value[index]?.html) return;
    const token = generation.value;
    setContent(index, { html: "", loading: true, failed: false });
    try {
      const result = await loadArticle(story.link, story.hn);
      if (token !== generation.value) return;
      const fragment = articleToFragment(result);
      const paragraphs = Array.from(fragment?.querySelectorAll("p") || []).filter((node) => (node.textContent || "").trim().length > 30).slice(0, 4);
      const html = paragraphs.length
        ? paragraphs.map((node) => node.outerHTML).join("")
        : `<p>${escapeHtml((fragment?.textContent || result.error || "Couldn't load the full article — tap below to open the original.").trim().slice(0, 600))}</p>`;
      setContent(index, { html, loading: false, failed: false });
    } catch (error) {
      if (token !== generation.value) return;
      setContent(index, { html: `<p>${escapeHtml(String((error as Error).message || error))}</p>`, loading: false, failed: true });
    }
  };

  const activate = (index: number) => {
    const storiesList = flow.value.stories;
    if (!storiesList.length) return;
    if (index < 0 || index >= storiesList.length) {
      hint.value = index < 0 ? "Already at the first story" : "End of feed — swipe down to go back";
      const shown = hint.value;
      setTimeout(() => { if (hint.value === shown) hint.value = ""; }, 1400);
      return;
    }
    if (index !== flow.value.index) {
      flow.value = { ...flow.value, index };
      generation.value++;
    }
    markRead(storiesList[index].link);
    void loadSlide(index);
    void loadSlide(index + 1);
    void loadSlide(index + 2);
  };

  useEffect(() => {
    if (!flow.value.open || flow.value.mode !== "read") return;
    generation.value++;
    contents.value = {};
    const first = flow.value.index;
    void loadSlide(first);
    void loadSlide(first + 1);
    void loadSlide(first + 2);
    const setHeight = () => {
      const node = document.getElementById("flowPage");
      if (node) node.style.height = `${globalThis.visualViewport?.height || innerHeight}px`;
    };
    setHeight();
    addEventListener("resize", setHeight);
    globalThis.visualViewport?.addEventListener("resize", setHeight);
    const observer = new MutationObserver(setHeight);
    document.getElementById("flowPage") && observer.observe(document.getElementById("flowPage")!, { attributes: true, attributeFilter: ["class"] });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); exitReadFlow(); }
      else if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); activate(flow.value.index + 1); }
      else if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); activate(flow.value.index - 1); }
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("resize", setHeight);
      globalThis.visualViewport?.removeEventListener("resize", setHeight);
      observer.disconnect();
    };
  }, [flow.value.open, flow.value.mode]);

  if (!flow.value.open || flow.value.mode !== "read") return null;
  const story = flow.value.stories[flow.value.index];
  if (!story) return null;
  const content = contents.value[flow.value.index];
  const topic = classifyTopic(story.title, story.desc);

  const listen = () => {
    closeReadFlow();
    void openReader(story).then(() => {
      setTimeout(() => { if ((readerContent.value?.text.length || 0) > 50) tts.play(); }, 900);
    });
  };

  return (
    <div id="flowPage" class="on" aria-label="Read Flow">
      <div class="flow-progress" id="flowProgress" style={{ width: `${((flow.value.index + 1) / flow.value.stories.length) * 100}%` }} />
      <button type="button" class="flow-close" id="flowClose" aria-label="Exit Read Flow" onClick={exitReadFlow}>×</button>
      <div class="flow-dots" id="flowDots"><Dots count={flow.value.stories.length} active={flow.value.index} onPick={activate} /></div>
      <div
        class="flow-stack"
        id="flowStack"
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest(".flow-hero") || target.closest("button, .flow-dot, .flow-expand, .flow-act-btn")) return;
          startX.value = event.clientX;
          startY.value = event.clientY;
        }}
        onPointerMove={(event) => {
          if (!startY.value) return;
          dragY.value = event.clientY - startY.value;
          dragX.value = event.clientX - startX.value;
          if (Math.abs(dragY.value) > 4 || Math.abs(dragX.value) > 4) dragging.value = true;
        }}
        onPointerUp={() => {
          const dy = dragY.value;
          const dx = dragX.value;
          startX.value = 0;
          startY.value = 0;
          dragY.value = 0;
          dragX.value = 0;
          dragging.value = false;
          if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.3) activate(flow.value.index + (dy < 0 ? 1 : -1));
          else if (dx < -90 && Math.abs(dx) > Math.abs(dy) * 1.3) { archiveStory(story.link); notify("Archived"); activate(flow.value.index + 1); }
        }}
        onPointerCancel={() => { startX.value = 0; startY.value = 0; dragY.value = 0; dragX.value = 0; dragging.value = false; }}
      >
        <article class={`flow-slide active${dragging.value ? " dragging" : ""}`} data-idx={flow.value.index} style={{ transform: dragging.value ? `translate(${dragX.value * 0.25}px, ${dragY.value * 0.5}px)` : "" }}>
          <div class={`flow-hero${dragging.value ? " dragging" : ""}`}>
            {story.thumb && <img src={story.thumb} alt="" referrerpolicy="no-referrer" onError={(event) => { (event.target as HTMLImageElement).style.display = "none"; }} />}
            <span class="flow-swipe-hint-up">Swipe up for next</span>
          </div>
          <div class="flow-content">
            <div class="flow-meta"><span class="src-dot" style={{ background: hashColor(story.src) }} /><span class="badge">{story.src}</span>{topic && <span class="topic-tag" style={{ background: `${TOPIC_COLORS[topic]}20`, color: TOPIC_COLORS[topic] }}>{topic}</span>}<span class="time">{relativeTime(story.date)}</span></div>
            <h2 class="flow-title">{story.title}</h2>
            {story.desc && <p class="flow-lede">{story.desc}</p>}
            <div class={`flow-body${content?.loading ? " flow-loading" : ""}`} dangerouslySetInnerHTML={{ __html: content?.html || (content?.loading ? "Loading article…" : "") }} />
            <button type="button" class="flow-expand" data-link={story.link} onClick={() => { closeReadFlow(); void openReader(story); }}>Read full article →</button>
          </div>
          <div class="flow-actions">
            <button type="button" class={`flow-act-btn${isLiked(story.link) ? " on" : ""}`} data-act="star" onClick={() => toggleLike(story.link)}><span class="ico">{isLiked(story.link) ? "★" : "☆"}</span> Save</button>
            <button type="button" class="flow-act-btn" data-act="listen" onClick={listen}><span class="ico">▶</span> Listen</button>
            <button type="button" class="flow-act-btn" data-act="share" onClick={() => shareStory(story.title, story.link)}><span class="ico">⤴</span> Share</button>
            <button type="button" class="flow-act-btn" data-act="archive" onClick={() => { archiveStory(story.link); notify("Archived"); activate(flow.value.index + 1); }}><span class="ico">▣</span> Archive</button>
          </div>
        </article>
      </div>
      <div class={`flow-swipe-hint${hint.value ? " show" : ""}`} id="flowHint">{hint.value || "Swipe ↑ for next · ↓ for previous · ← to archive"}</div>
    </div>
  );
}

export function RadioFlow() {
  const volume = useSignal(80);
  const activeStation = useSignal<string | null>(null);
  const hint = useSignal("");
  const dragY = useSignal(0);
  const dragging = useSignal(false);
  const startY = useSignal(0);
  const startX = useSignal(0);
  const eventX = useSignal(0);

  const activate = (index: number) => {
    const stations = visibleStations.value;
    if (!stations.length) return;
    if (index < 0 || index >= stations.length) {
      hint.value = index < 0 ? "Already at the first station" : "No more stations — swipe down to go back";
      const shown = hint.value;
      setTimeout(() => { if (hint.value === shown) hint.value = ""; }, 1400);
      return;
    }
    flow.value = { ...flow.value, radioIndex: index };
    setVolume(volume.value / 100);
    if (radioPlaying.value && activeStation.value !== stations[index].name) {
      activeStation.value = stations[index].name;
      void playStation(stations[index]);
    }
  };

  useEffect(() => {
    if (!flow.value.open || flow.value.mode !== "radio") return;
    setVolume(volume.value / 100);
    const setHeight = () => {
      const node = document.getElementById("radioFlowPage");
      if (node) node.style.height = `${globalThis.visualViewport?.height || innerHeight}px`;
    };
    setHeight();
    addEventListener("resize", setHeight);
    globalThis.visualViewport?.addEventListener("resize", setHeight);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); exitRadioFlow(); }
      else if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); activate(flow.value.radioIndex + 1); }
      else if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); activate(flow.value.radioIndex - 1); }
      else if (event.key === " ") { event.preventDefault(); toggleRadio(); }
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("resize", setHeight);
      globalThis.visualViewport?.removeEventListener("resize", setHeight);
      stopRadio();
    };
  }, [flow.value.open, flow.value.mode]);

  if (!flow.value.open || flow.value.mode !== "radio") return null;
  const station = visibleStations.value[flow.value.radioIndex] || visibleStations.value[0];
  if (!station) return null;
  const playing = radioPlaying.value;
  const isActive = playing && activeStation.value === station.name;
  const error = /error|can't|unavailable/i.test(radioStatus.value);

  return (
    <div id="radioFlowPage" class="on" aria-label="Radio Flow">
      <button type="button" class="flow-close" id="radioFlowClose" aria-label="Exit radio" onClick={exitRadioFlow}>×</button>
      <div class="flow-dots" id="radioFlowDots"><Dots count={visibleStations.value.length} active={flow.value.radioIndex} onPick={activate} /></div>
      <div
        class="radio-stack"
        id="radioStack"
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("button, .flow-dot, input")) return;
          startX.value = event.clientX;
          startY.value = event.clientY;
        }}
        onPointerMove={(event) => {
          if (!startY.value) return;
          eventX.value = event.clientX;
          dragY.value = event.clientY - startY.value;
          if (Math.abs(dragY.value) > 4) dragging.value = true;
        }}
        onPointerUp={() => {
          const dy = dragY.value;
          const dx = eventX.value - startX.value;
          startX.value = 0; startY.value = 0; dragY.value = 0; eventX.value = 0; dragging.value = false;
          if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.3) activate(flow.value.radioIndex + (dy < 0 ? 1 : -1));
        }}
        onPointerCancel={() => { startX.value = 0; startY.value = 0; dragY.value = 0; dragging.value = false; }}
        style={{ "--rs-color": station.color || hashColor(station.name) } as Record<string, string>}
      >
        <article class={`radio-slide active${playing ? " playing" : ""}${dragging.value ? " dragging" : ""}`} data-idx={flow.value.radioIndex} style={{ transform: dragging.value ? `translateY(${dragY.value * 0.5}px)` : "" }}>
          <div class="radio-slide-bg" />
          <div class="radio-slide-content">
            <span class="radio-slide-icon">📻</span>
            <h2 class="radio-slide-name">{station.name}</h2>
            {station.desc && <p class="radio-slide-desc">{station.desc}</p>}
            <span class="radio-slide-cat">{station.category || "Radio"}</span>
            <div class="radio-eq" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
            <button type="button" class="radio-play-btn" aria-label={isActive ? "Pause" : "Play"} data-action={isActive ? "pause" : "play"} onClick={(event) => { event.stopPropagation(); if (isActive) toggleRadio(); else { activeStation.value = station.name; void playStation(station); } }}>{isActive ? "❚❚" : "▶"}</button>
            <div class="radio-volume-row">
              <span>🔊</span>
              <input type="range" min="0" max="100" value={volume.value} aria-label="Volume" onInput={(event) => { volume.value = Number((event.target as HTMLInputElement).value); setVolume(volume.value / 100); }} />
            </div>
            <div class={`radio-status${error ? " error" : ""}`}><span class="dot" /><span class="status-text">{radioStatus.value}</span></div>
          </div>
        </article>
      </div>
      <div class={`radio-swipe-hint${hint.value ? " show" : ""}`} id="radioFlowHint">{hint.value || "Swipe ↑ for next station · ↓ for previous · space to play/pause"}</div>
    </div>
  );
}
