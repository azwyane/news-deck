import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { aiState, findConnections, socraticSummary } from "../lib/ai";
import { copyText } from "../lib/clipboard";
import { estimateReadTime } from "../lib/markdown";
import { tts } from "../lib/tts";
import { addNote, annotations, deleteNote, findStory, isLiked, stories, toggleLike } from "../state/store";
import { changeFontSize } from "../state/prefs";
import { assistantContext, exitReader, navigateReader, notify, openPage, openReader, overflowOpen, page, notesOpen, readerArticleSource, readerComments, readerCommentsLoading, readerContent, readerError, readerForward, readerHistory, readerList, readerLoading, readerLoadingStage, readerStory, readerSummary, readerConnections } from "../state/ui";

type AnchorEvent = { currentTarget: EventTarget | null };
type ReaderPanel = "summary" | "connections" | null;

function rectStyle(rect: DOMRect, width: number, height: number): Record<string, string> {
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  const panelWidth = Math.min(width, viewportWidth - 16);
  const panelHeight = Math.min(height, viewportHeight - 16);
  let top = rect.bottom + 8;
  if (top + panelHeight > viewportHeight - 8) top = Math.max(8, Math.min(viewportHeight - panelHeight - 8, rect.top - panelHeight - 8));
  const left = Math.max(8, Math.min(rect.left, viewportWidth - panelWidth - 8));
  return { left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto", transform: "none", width: `${panelWidth}px`, maxHeight: `${panelHeight}px` };
}

function anchorStyle(event: AnchorEvent | undefined, width: number, height: number): Record<string, string> | undefined {
  if (!event) return undefined;
  return rectStyle((event.currentTarget as HTMLElement).getBoundingClientRect(), width, height);
}

export function Reader() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const progress = useSignal(0);
  const elapsed = useSignal(0);
  const autoLinked = useSignal("");
  const selection = useSignal("");
  const summaryBusy = useSignal(false);
  const connectionsBusy = useSignal(false);
  const noteQuote = useSignal("");
  const noteDraft = useSignal("");
  const noteComposer = useSignal(false);
  const readerPanel = useSignal<ReaderPanel>(null);
  const panelAnchor = useSignal<Record<string, string> | undefined>(undefined);
  const notesAnchor = useSignal<Record<string, string> | undefined>(undefined);
  const overflowAnchor = useSignal<Record<string, string> | undefined>(undefined);
  const selAnchor = useSignal<Record<string, string> | undefined>(undefined);
  const selecting = useSignal(false);
  const clearingSelection = useSignal(false);
  const story = page.value === "reader" ? readerStory.value : null;

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.replaceChildren();
    const content = readerContent.value;
    if (content) node.append(content.fragment);
  }, [readerContent.value]);

  const captureSelection = (finalize = false) => {
    if (clearingSelection.value) return;
    const nativeSelection = document.getSelection();
    const selected = (nativeSelection?.toString() || "").trim();
    const anchorNode = nativeSelection?.anchorNode;
    if (!selected || !anchorNode || !bodyRef.current?.contains(anchorNode)) {
      if (finalize) {
        selection.value = "";
        selAnchor.value = undefined;
      }
      return;
    }
    selection.value = selected.slice(0, 5000);
    const range = nativeSelection?.rangeCount ? nativeSelection.getRangeAt(0) : null;
    if (range) selAnchor.value = rectStyle(range.getBoundingClientRect(), 320, 44);
    const coarse = window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (finalize && coarse) {
      clearingSelection.value = true;
      setTimeout(() => {
        nativeSelection?.removeAllRanges();
        setTimeout(() => { clearingSelection.value = false; }, 50);
      }, 0);
    }
  };

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const onSelectionChange = () => { captureSelection(false); };
    const onPointerDown = (event: PointerEvent) => {
      if (!node.contains(event.target as Node)) return;
      selecting.value = true;
    };
    const onPointerUp = () => {
      if (!selecting.value) return;
      selecting.value = false;
      setTimeout(() => captureSelection(true), 80);
    };
    const onPointerCancel = () => { selecting.value = false; };
    document.addEventListener("selectionchange", onSelectionChange);
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [readerStory.value?.link]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (notesOpen.value || overflowOpen.value) event.stopImmediatePropagation();
      if (notesOpen.value) notesOpen.value = false;
      else if (overflowOpen.value) overflowOpen.value = false;
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    selection.value = "";
    selecting.value = false;
    clearingSelection.value = false;
    noteQuote.value = "";
    noteDraft.value = "";
    noteComposer.value = false;
    summaryBusy.value = false;
    connectionsBusy.value = false;
    autoLinked.value = "";
    readerPanel.value = null;
    panelAnchor.value = undefined;
    notesAnchor.value = undefined;
    overflowAnchor.value = undefined;
    selAnchor.value = undefined;
  }, [readerStory.value?.link]);

  useEffect(() => {
    const node = pageRef.current;
    if (!node || !readerStory.value) return;
    const onScroll = () => {
      const max = node.scrollHeight - node.clientHeight;
      progress.value = max > 0 ? Math.min(100, Math.round((node.scrollTop / max) * 100)) : 100;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const started = Date.now();
    const timer = setInterval(() => { elapsed.value = Math.floor((Date.now() - started) / 1000); }, 1000);
    return () => { node.removeEventListener("scroll", onScroll); clearInterval(timer); };
  }, [readerStory.value?.link]);

  useEffect(() => {
    const link = readerStory.value?.link;
    const content = readerContent.value;
    if (!link || autoLinked.value === link || !content || content.text.length < 120) return;
    autoLinked.value = link;
    void (async () => {
      try {
        const answer = await findConnections(readerStory.value?.title || "", content.text, stories.value.map((item) => item.title));
        if (readerStory.value?.link !== link) return;
        const matches = stories.value.filter((item) => answer.toLowerCase().includes(item.title.toLowerCase()) && item.link !== link).slice(0, 3);
        readerConnections.value = { text: answer, links: matches };
      } catch { /* manual retry remains available */ }
    })();
  }, [readerContent.value, readerStory.value?.link]);

  if (!story) return null;
  const text = readerContent.value?.text || "";
  const notes = annotations.value[story.link] || [];
  const listIndex = readerList.value.findIndex((item) => item.link === story.link);
  const backCount = readerHistory.value.length;
  const forwardCount = readerForward.value.length;
  const position = listIndex >= 0 ? `${listIndex + 1} / ${readerList.value.length}` : backCount ? `Linked · ${backCount} back` : "Linked";

  const summarize = async () => {
    if (!text || summaryBusy.value) return;
    const link = story.link;
    summaryBusy.value = true;
    readerSummary.value = "Thinking…";
    try {
      const result = await socraticSummary(story.title, text, (_chunk, all) => { if (readerStory.value?.link === link) readerSummary.value = all; });
      if (readerStory.value?.link === link) readerSummary.value = result;
    } catch (error) {
      if (readerStory.value?.link === link) readerSummary.value = String((error as Error).message || error);
    } finally {
      summaryBusy.value = false;
    }
  };

  const openNotes = (quote = "", event?: AnchorEvent) => {
    notesAnchor.value = anchorStyle(event, 560, 420);
    overflowOpen.value = false;
    noteQuote.value = quote || selection.value || "";
    noteComposer.value = !!noteQuote.value;
    notesOpen.value = true;
  };

  const openOverflow = (event?: AnchorEvent) => {
    overflowAnchor.value = anchorStyle(event, 420, 340);
    notesOpen.value = false;
    overflowOpen.value = true;
  };

  const showPanel = (kind: Exclude<ReaderPanel, null>, event?: AnchorEvent) => {
    panelAnchor.value = anchorStyle(event, 560, 400);
    readerPanel.value = kind;
    overflowOpen.value = false;
    if (kind === "summary") void summarize();
    else void findLinks();
  };

  const saveNote = () => {
    const quote = noteQuote.value.trim();
    const note = noteDraft.value.trim();
    if (!quote) { notify("Select or type the text you want to annotate"); return; }
    if (!note) { notify("Write your note first"); return; }
    addNote(story.link, quote, note);
    notify("Note saved");
    noteDraft.value = "";
    noteQuote.value = "";
    noteComposer.value = false;
    selection.value = "";
    document.getSelection()?.removeAllRanges();
  };

  const askFromArticle = () => {
    if (!text) { notify("Wait for the article to load before asking"); return; }
    assistantContext.value = { title: story.title, text };
    overflowOpen.value = false;
    openPage("assistant");
  };

  const printArticle = () => {
    if (text.length < 50) { notify("Wait for the article to load before printing"); return; }
    overflowOpen.value = false;
    window.print();
  };

  const share = () => {
    if (navigator.share) {
      void navigator.share({ title: story.title, url: story.link }).catch(() => undefined);
      return;
    }
    void copyText(story.link).then((copied) => notify(copied ? "Link copied" : "Couldn't copy link"));
  };

  const findLinks = async () => {
    if (!text || connectionsBusy.value) return;
    const link = story.link;
    connectionsBusy.value = true;
    try {
      const headlines = stories.value.map((item) => item.title);
      const answer = await findConnections(story.title, text, headlines);
      if (readerStory.value?.link !== link) return;
      const matches = stories.value.filter((item) => answer.toLowerCase().includes(item.title.toLowerCase()) && item.link !== link).slice(0, 3);
      readerConnections.value = { text: answer, links: matches };
    } catch (error) {
      if (readerStory.value?.link === link) notify(String((error as Error).message || error));
    } finally {
      connectionsBusy.value = false;
    }
  };

  return (
    <div id="readerPage" ref={pageRef} class="on" role="dialog" aria-label="Article reader">
      <div id="readProg" style={{ width: `${progress.value}%` }} />
      <div class="reader-bar">
        <button type="button" id="readerClose" aria-label="Back to deck" title="Back to deck (Esc)" onClick={exitReader}>←</button>
        <div class="reader-bar-meta"><span id="readerSrc">{story.src}</span></div>
        <div class="reader-actions">
          <button type="button" id="readerStar" aria-label="Save" title="Save" onClick={() => toggleLike(story.link)}>{isLiked(story.link) ? "★" : "☆"}</button>
          <button type="button" id="readerShare" aria-label="Share" title="Share link" onClick={share}>⤴</button>
          {story.link !== story.hn && <a class="rm-icon" href={story.link} target="_blank" rel="noopener" aria-label="Open original article" title="Open original article">↗</a>}
        </div>
      </div>
      <div class="reader-article">
        <h1 id="readerTitle">{story.title}</h1>
        <div class="reader-meta2">
          <div class="reader-nav-row">
            <div class="rm-primary">
              <button type="button" id="readerPrev" class="rm-icon" aria-label="Back" title={backCount ? `Back through read path (${backCount} back, k or ←)` : "Previous in this view (k or ←)"} onClick={() => navigateReader(-1)}>‹</button>
              <span id="readerPos" class="rm-pos">{position}</span>
              <button type="button" id="readerNext" class="rm-icon" aria-label="Next" title={forwardCount ? "Forward through read path (j or →)" : "Next in this view (j or →)"} onClick={() => navigateReader(1)}>›</button>
              <span id="readerTime" class="rm-time">{text ? estimateReadTime(text) : ""}</span>
              <span class="rm-time" id="readerTimer">{Math.floor(elapsed.value / 60)}m {String(elapsed.value % 60).padStart(2, "0")}s{readerHistory.value.length ? ` · ${readerHistory.value.length} back` : ""}</span>
            </div>
          </div>
          <div class="reader-action-row">
            <button type="button" id="readerListen" class="tools-btn primary-listen" aria-label="Read aloud" title="Read aloud" onClick={() => tts.toggle()}>{tts.playing.value && !tts.paused.value ? "❚❚ Pause" : "▶ Listen"}</button>
            <button type="button" id="readerSummarize" class="tools-btn" onClick={() => showPanel("summary")}>✦ Summarize</button>
            <button type="button" id="readerAskButton" class="tools-btn primary-ask" onClick={askFromArticle}>? Ask AI</button>
            <button type="button" id="readerOverflow" class={`tools-btn${readerConnections.value ? " has-result" : ""}`} aria-label="More reader tools" title="More reader tools" onClick={openOverflow}>Tools <span aria-hidden="true">▾</span></button>
          </div>
        </div>
        {readerArticleSource.value === "discussion" && <div class="reader-notice">{story.hnSelfPost ? "This is a Hacker News text post — showing the discussion." : "Couldn't extract the linked article — showing the Hacker News discussion."}{story.link !== story.hn && <a href={story.link} target="_blank" rel="noopener">Open original ↗</a>}</div>}
        {readerLoading.value && <div class="empty"><span class="spin">◌</span> {readerLoadingStage.value || "Fetching article…"}</div>}
        {readerError.value && <div class="empty">{readerError.value} <a href={story.link} target="_blank" rel="noopener">Open original ↗</a></div>}
        <div id="readerBody" class="reader-body" ref={bodyRef} onContextMenu={(event) => event.preventDefault()} onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (!anchor) return;
          const target = findStory(anchor.href);
          event.preventDefault();
          if (target) { void openReader(target, { follow: true }); return; }
          if (!/^https?:$/.test(new URL(anchor.href, location.href).protocol)) return;
          void openReader({ title: "Linked article", link: anchor.href, src: "Linked", desc: "", date: new Date() }, { follow: true });
        }} />
        {(story.hn || readerCommentsLoading.value || readerComments.value.length > 0) && <div class="conn-panel hn-comments"><h4>Hacker News discussion</h4>{readerCommentsLoading.value && <div class="faint">Loading comments…</div>}{readerComments.value.map((comment, index) => <p key={index}>{comment}</p>)}<a href={story.hn} target="_blank" rel="noopener">View all comments ↗</a></div>}
        <nav class="reader-foot" aria-label="More stories"><button type="button" id="footPrev" onClick={() => navigateReader(-1)}>← Previous</button><button type="button" id="footNext" onClick={() => navigateReader(1)}>Next →</button></nav>
      </div>
      {selection.value && !selecting.value && <div id="selToolbar" class="show" style={selAnchor.value}><span class="sel-quote">“{selection.value.slice(0, 80)}{selection.value.length > 80 ? "…" : ""}”</span><button type="button" id="selCopy" onClick={() => { void copyText(selection.value).then((copied) => notify(copied ? "Copied" : "Couldn't copy")); }}>Copy</button><button type="button" id="selNote" onClick={(event) => openNotes(selection.value, event)}>Note</button></div>}
      {notesOpen.value && <div id="notesBackdrop" class="show" onClick={() => { notesOpen.value = false; }} />}
      {overflowOpen.value && <div id="overflowBackdrop" class="show" onClick={() => { overflowOpen.value = false; }} />}
      {notesOpen.value && <div id="notesSheet" class="show reader-popover" style={notesAnchor.value} role="dialog" aria-label="Notes">
        <div class="ov-handle" />
        <div class="ns-header"><h3>Notes</h3><span class="ns-count">{notes.length}</span><span class="grow" /><button type="button" id="nsAdd" class="ns-add" onClick={() => { noteComposer.value = true; noteQuote.value = selection.value || noteQuote.value; }}>+ Add note</button><button type="button" id="nsClose" aria-label="Close notes" onClick={() => { notesOpen.value = false; }}>✕</button></div>
        {noteComposer.value && <div class="ns-composer"><label>Text to annotate<input value={noteQuote.value} placeholder="Select text in the article or type here" onInput={(event) => { noteQuote.value = (event.target as HTMLInputElement).value; }} /></label><label>Your note<textarea rows={3} value={noteDraft.value} placeholder="What do you want to remember?" onInput={(event) => { noteDraft.value = (event.target as HTMLTextAreaElement).value; }} /></label><div class="ns-composer-actions"><button type="button" class="btn-secondary" onClick={() => { noteComposer.value = false; noteDraft.value = ""; }}>Cancel</button><button type="button" id="nsSave" onClick={saveNote}>Save note</button></div></div>}
        <div class="ns-list">{notes.map((note, index) => <div class="ns-item" key={note.createdAt + index}><blockquote>{note.quote}</blockquote><p>{note.note}</p><button type="button" class="ns-del" aria-label="Delete note" onClick={() => { deleteNote(story.link, index); notify("Note deleted"); }}>✕</button></div>)}</div>
        {!notes.length && !noteComposer.value && <div class="ns-empty">No notes yet for this article. Select text in the article, then tap Note.</div>}
      </div>}
      {overflowOpen.value && <div id="overflowSheet" class="show reader-popover" style={overflowAnchor.value} role="dialog" aria-label="More controls">
        <div class="ov-handle" />
        <div class="ns-header"><h3>Reader tools</h3><span class="grow" /><button type="button" id="ovClose" class="ns-add" aria-label="Close reader tools" onClick={() => { overflowOpen.value = false; }}>✕</button></div>
        <div class="ov-group-title">AI tools</div>
        <div class="tool-list">
          <button type="button" class="tool-row" id="ovSummarize" onClick={(event) => showPanel("summary", event)}><span class="tool-ico">✦</span><span class="tool-copy"><strong>Summary</strong><small>Socratic key points</small></span><span class="tool-chev">›</span></button>
          <button type="button" class={`tool-row${readerConnections.value ? " has-result" : ""}`} id="ovConnect" onClick={(event) => showPanel("connections", event)}><span class="tool-ico">↔</span><span class="tool-copy"><strong>Find relations</strong><small>Related stories in your deck</small></span><span class="tool-chev">›</span></button>
          <button type="button" class="tool-row" id="ovAsk" onClick={askFromArticle}><span class="tool-ico">?</span><span class="tool-copy"><strong>Ask AI</strong><small>Chat about this article</small></span><span class="tool-chev">›</span></button>
        </div>
        <div class="ov-group-title">Article tools</div>
        <div class="tool-list">
          <button type="button" class="tool-row" id="ovNote" onClick={(event) => openNotes("", event)}><span class="tool-ico">✎</span><span class="tool-copy"><strong>Note</strong><small>Annotate a quote</small></span><span class="tool-chev">›</span></button>
          <button type="button" class="tool-row" id="ovPrint" onClick={printArticle}><span class="tool-ico">⎙</span><span class="tool-copy"><strong>Print</strong><small>Clean article view</small></span><span class="tool-chev">›</span></button>
        </div>
        <div class="ov-row"><span>Font size</span><div class="font-controls"><button type="button" id="fontDown" aria-label="Decrease font size" onClick={() => changeFontSize(-1)}>A−</button><button type="button" id="fontUp" aria-label="Increase font size" onClick={() => changeFontSize(1)}>A+</button></div></div>
        <div class="ov-row"><span>Listen speed</span><select id="ttsSpeed" value={String(tts.rate)} onChange={(event) => { tts.rate = Number((event.target as HTMLSelectElement).value); }}><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></div>
      </div>}
      {readerPanel.value && <div id="readerPanelBackdrop" class="panel-backdrop show" onClick={() => { readerPanel.value = null; }} />}
      {readerPanel.value && <div id="readerPanel" class="reader-popover show reader-ai-panel" style={panelAnchor.value} role="dialog" aria-label={readerPanel.value === "summary" ? "Article summary" : "Story connections"}>
        <div class="ov-handle" />
        <div class="ns-header"><h3>{readerPanel.value === "summary" ? "Summary" : "Connections"}</h3><span class="grow" /><button type="button" id="readerPanelClose" class="ns-add" onClick={() => { readerPanel.value = null; }}>✕</button></div>
        <div class="reader-panel-body">
          {readerPanel.value === "summary" && (readerSummary.value ? <div id="readerSummary" class="reader-summary" dangerouslySetInnerHTML={{ __html: readerSummary.value.replace(/</g, "&lt;") }} /> : <div class="faint">Thinking…</div>)}
          {readerPanel.value === "connections" && (readerConnections.value ? <div class="conn-panel"><div class="conn-text">{readerConnections.value.text}</div><div id="connLinks">{readerConnections.value.links.map((item) => <button type="button" key={item.link} onClick={() => void openReader(item, { follow: true })}>{item.title}</button>)}</div></div> : <div class="faint">{connectionsBusy.value ? "Finding connections…" : "No connections found yet."}</div>)}
          {aiState.value.state === "failed" && <details class="ai-err"><summary>Technical details</summary><pre>{aiState.value.report || aiState.value.progress}</pre><button type="button" id="aiCopy" class="x" onClick={(event) => { void copyText(aiState.value.report || aiState.value.progress).then((copied) => { (event.target as HTMLButtonElement).textContent = copied ? "Copied ✓" : "Copy failed — select the text above"; }); }}>Copy report</button></details>}
        </div>
      </div>}
    </div>
  );
}
