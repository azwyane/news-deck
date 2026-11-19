import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { findConnections, socraticSummary } from "../lib/ai";
import { estimateReadTime } from "../lib/markdown";
import { tts } from "../lib/tts";
import { addNote, annotations, deleteNote, findStory, isLiked, stories, toggleLike } from "../state/store";
import { changeFontSize } from "../state/prefs";
import { assistantContext, closeReader, navigateReader, notify, openPage, openReader, overflowOpen, notesOpen, readerComments, readerCommentsLoading, readerContent, readerError, readerHistory, readerList, readerLoading, readerStory, readerSummary, readerConnections } from "../state/ui";

export function Reader() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const selection = useSignal("");
  const summaryBusy = useSignal(false);
  const connectionsBusy = useSignal(false);
  const noteQuote = useSignal("");
  const noteDraft = useSignal("");
  const noteComposer = useSignal(false);
  const story = readerStory.value;

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.replaceChildren();
    const content = readerContent.value;
    if (content) node.append(content.fragment);
  }, [readerContent.value]);

  useEffect(() => {
    const handler = () => {
      const selected = (document.getSelection()?.toString() || "").trim();
      const anchor = window.getSelection()?.anchorNode;
      if (selected && anchor && bodyRef.current?.contains(anchor)) selection.value = selected.slice(0, 300);
      else if (!selected) selection.value = "";
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

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
    noteQuote.value = "";
    noteDraft.value = "";
    noteComposer.value = false;
    summaryBusy.value = false;
    connectionsBusy.value = false;
  }, [readerStory.value?.link]);

  if (!story) return null;
  const text = readerContent.value?.text || "";
  const notes = annotations.value[story.link] || [];
  const listIndex = readerList.value.findIndex((item) => item.link === story.link);
  const position = listIndex >= 0 ? `${listIndex + 1} / ${readerList.value.length}` : "";

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

  const openNotes = (quote = "") => {
    overflowOpen.value = false;
    noteQuote.value = quote || selection.value || "";
    noteComposer.value = !!noteQuote.value;
    notesOpen.value = true;
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
    void navigator.clipboard?.writeText(story.link).then(() => notify("Link copied")).catch(() => notify("Couldn't copy link"));
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
    <div id="readerPage" class="on" role="dialog" aria-label="Article reader">
      <div id="readProg" style={{ width: `${tts.progress.value}%` }} />
      <div class="reader-bar">
        <button type="button" id="readerClose" aria-label="Close reader" onClick={closeReader}>←</button>
        <div class="reader-bar-meta"><span id="readerSrc">{story.src}</span></div>
        <div class="reader-actions">
          <button type="button" id="readerStar" aria-label="Save" title="Save" onClick={() => toggleLike(story.link)}>{isLiked(story.link) ? "★" : "☆"}</button>
          <button type="button" id="readerShare" aria-label="Share" title="Share link" onClick={share}>⤴</button>
        </div>
      </div>
      <div class="reader-article">
        <h1 id="readerTitle">{story.title}</h1>
        <div class="reader-meta2">
          <div class="rm-primary">
            <button type="button" id="readerPrev" class="rm-icon" aria-label="Previous story" title="Previous (k or ←)" onClick={() => navigateReader(-1)}>‹</button>
            <span id="readerPos" class="rm-pos">{position}</span>
            <button type="button" id="readerNext" class="rm-icon" aria-label="Next story" title="Next (j or →)" onClick={() => navigateReader(1)}>›</button>
            <span id="readerTime" class="rm-time">{text ? estimateReadTime(text) : ""}</span>
            <span class="rm-time">{readerHistory.value.length ? `${readerHistory.value.length} back` : ""}</span>
          </div>
          <button type="button" id="readerListen" class="rm-icon" aria-label="Listen" title="Read aloud" onClick={() => tts.toggle()}>{tts.playing.value && !tts.paused.value ? "❚❚" : "▶"}</button>
          <button type="button" id="readerSummarize" class="rm-icon" aria-label="Summarize" title="Socratic summary" onClick={() => void summarize()}>✦</button>
          <button type="button" id="readerNotes" class="rm-icon" aria-label="Notes" title="View and add notes" onClick={() => openNotes()}>✎</button>
          <button type="button" id="readerOverflow" class="rm-icon rm-overflow" aria-label="More controls" title="More controls" onClick={() => { notesOpen.value = false; overflowOpen.value = true; }}>⋯</button>
          <button type="button" id="readerAskButton" class="hide" onClick={askFromArticle}>Ask</button>
        </div>
        {readerLoading.value && <div class="empty"><span class="spin">◌</span> Fetching article…</div>}
        {readerError.value && <div class="empty">{readerError.value} <a href={story.link} target="_blank" rel="noopener">Open original ↗</a></div>}
        <div id="readerBody" class="reader-body" ref={bodyRef} onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (!anchor) return;
          const target = findStory(anchor.href);
          if (target) { event.preventDefault(); void openReader(target); }
        }} />
        {readerSummary.value && <div id="readerSummary" class="reader-summary" dangerouslySetInnerHTML={{ __html: readerSummary.value.replace(/</g, "&lt;") }} />}
        {readerConnections.value && <div class="conn-panel"><h4>Story connections</h4><div class="conn-text">{readerConnections.value.text}</div><div id="connLinks">{readerConnections.value.links.map((item) => <button type="button" key={item.link} onClick={() => void openReader(item)}>{item.title}</button>)}</div></div>}
        {(story.hn || readerCommentsLoading.value || readerComments.value.length > 0) && <div class="conn-panel hn-comments"><h4>Hacker News discussion</h4>{readerCommentsLoading.value && <div class="faint">Loading comments…</div>}{readerComments.value.map((comment, index) => <p key={index}>{comment}</p>)}<a href={story.hn} target="_blank" rel="noopener">View all comments ↗</a></div>}
        <nav class="reader-foot" aria-label="More stories"><button type="button" id="footPrev" onClick={() => navigateReader(-1)}>← Previous</button><button type="button" id="footNext" onClick={() => navigateReader(1)}>Next →</button></nav>
        <button type="button" class="btn-secondary" onClick={() => void findLinks()} disabled={connectionsBusy.value}>{connectionsBusy.value ? "Finding connections…" : "Find story connections"}</button>
      </div>
      {selection.value && <div id="selToolbar" class="show"><span class="sel-quote">“{selection.value.slice(0, 80)}{selection.value.length > 80 ? "…" : ""}”</span><button type="button" id="selCopy" onClick={() => { void navigator.clipboard?.writeText(selection.value).then(() => notify("Copied")).catch(() => notify("Couldn't copy")); }}>Copy</button><button type="button" id="selNote" onClick={() => openNotes(selection.value)}>Note</button></div>}
      {notesOpen.value && <div id="notesBackdrop" class="show" onClick={() => { notesOpen.value = false; }} />}
      {overflowOpen.value && <div id="overflowBackdrop" class="show" onClick={() => { overflowOpen.value = false; }} />}
      {notesOpen.value && <div id="notesSheet" class="show" role="dialog" aria-label="Notes">
        <div class="ov-handle" />
        <div class="ns-header"><h3>Notes</h3><span class="ns-count">{notes.length}</span><span class="grow" /><button type="button" id="nsAdd" class="ns-add" onClick={() => { noteComposer.value = true; noteQuote.value = selection.value || noteQuote.value; }}>+ Add note</button><button type="button" id="nsClose" aria-label="Close notes" onClick={() => { notesOpen.value = false; }}>✕</button></div>
        {noteComposer.value && <div class="ns-composer"><label>Text to annotate<input value={noteQuote.value} placeholder="Select text in the article or type here" onInput={(event) => { noteQuote.value = (event.target as HTMLInputElement).value; }} /></label><label>Your note<textarea rows={3} value={noteDraft.value} placeholder="What do you want to remember?" onInput={(event) => { noteDraft.value = (event.target as HTMLTextAreaElement).value; }} /></label><div class="ns-composer-actions"><button type="button" class="btn-secondary" onClick={() => { noteComposer.value = false; noteDraft.value = ""; }}>Cancel</button><button type="button" id="nsSave" onClick={saveNote}>Save note</button></div></div>}
        <div class="ns-list">{notes.map((note, index) => <div class="ns-item" key={note.createdAt + index}><blockquote>{note.quote}</blockquote><p>{note.note}</p><button type="button" class="ns-del" aria-label="Delete note" onClick={() => { deleteNote(story.link, index); notify("Note deleted"); }}>✕</button></div>)}</div>
        {!notes.length && !noteComposer.value && <div class="ns-empty">No notes yet for this article. Select text in the article, then tap Note.</div>}
      </div>}
      {overflowOpen.value && <div id="overflowSheet" class="show" role="dialog" aria-label="More controls">
        <div class="ov-handle" />
        <div class="ov-grid">
          <button type="button" class="ov-btn" id="ovSummarize" onClick={() => { overflowOpen.value = false; void summarize(); }}>✦ Summarize</button>
          <button type="button" class="ov-btn" id="ovAsk" onClick={askFromArticle}>💬 Ask AI</button>
          <button type="button" class="ov-btn" id="ovNote" onClick={() => openNotes()}>✎ Note</button>
          <button type="button" class="ov-btn" id="ovPrint" onClick={printArticle}>⎙ Print</button>
        </div>
        <div class="ov-row"><span>Font size</span><div class="font-controls"><button type="button" id="fontDown" aria-label="Decrease font size" onClick={() => changeFontSize(-1)}>A−</button><button type="button" id="fontUp" aria-label="Increase font size" onClick={() => changeFontSize(1)}>A+</button></div></div>
        <div class="ov-row"><span>Listen speed</span><select id="ttsSpeed" value={String(tts.rate)} onChange={(event) => { tts.rate = Number((event.target as HTMLSelectElement).value); }}><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></div>
        <button type="button" class="btn-secondary" id="ovClose" onClick={() => { overflowOpen.value = false; }}>Close</button>
      </div>}
    </div>
  );
}
