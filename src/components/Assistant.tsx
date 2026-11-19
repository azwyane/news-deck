import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { aiState, askAI, summarizeText } from "../lib/ai";
import { renderMarkdownSafe } from "../lib/markdown";
import { TOPIC_COLORS } from "../lib/topics";
import { clearFilters, mutedSources, muteSource, setView, stories, topicFilter, unreadOnly, visibleStories } from "../state/store";
import { assistantContext, closePages, notify, page } from "../state/ui";

interface Message { role: "user" | "assistant"; text: string }

export function Assistant() {
  const open = typeof page !== "undefined" && page.value === "assistant";
  const input = useSignal("");
  const busy = useSignal(false);
  const messages = useSignal<Message[]>([{ role: "assistant", text: "Ask me to find, filter, mute, or summarize what's in your deck." }]);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = chatRef.current;
    if (!node) return;
    node.replaceChildren();
    for (const message of messages.value) {
      const row = document.createElement("div");
      row.className = `a-msg ${message.role}`;
      row.append(renderMarkdownSafe(message.text));
      node.append(row);
    }
    node.scrollTop = node.scrollHeight;
  }, [open, messages.value]);

  useEffect(() => {
    if (!open) return;
    const setHeight = () => {
      const node = document.getElementById("assistantPage");
      if (node) node.style.height = `${globalThis.visualViewport?.height || globalThis.innerHeight || 0}px`;
    };
    setHeight();
    addEventListener("resize", setHeight);
    globalThis.visualViewport?.addEventListener("resize", setHeight);
    return () => {
      removeEventListener("resize", setHeight);
      globalThis.visualViewport?.removeEventListener("resize", setHeight);
    };
  }, [open]);

  if (!open) return null;

  const reply = (text: string) => {
    messages.value = [...messages.value, { role: "assistant", text }];
  };

  const runTool = (raw: string): boolean => {
    const text = raw.trim();
    const lower = text.toLowerCase();
    for (const topic of Object.keys(TOPIC_COLORS)) {
      if (lower === `show ${topic.toLowerCase()}` || lower === `filter ${topic.toLowerCase()}` || lower === topic.toLowerCase()) {
        setView("All");
        topicFilter.value = topic;
        notify(`Showing ${topic} stories`);
        reply(`Showing ${topic} stories in your deck.`);
        return true;
      }
    }
    if (lower.includes("unread only") || lower.includes("only unread")) {
      unreadOnly.value = true;
      reply("Unread only is on.");
      return true;
    }
    if (lower.includes("all stories") || lower.includes("clear filters") || lower.includes("show everything")) {
      clearFilters();
      reply("Filters cleared — showing everything.");
      return true;
    }
    if (lower.startsWith("mute ")) {
      const name = text.slice(5).trim();
      if (mutedSources.value.includes(name)) { reply(`${name} is already muted.`); return true; }
      muteSource(name, true);
      reply(`Muted ${name}.`);
      return true;
    }
    if (lower.startsWith("unmute ")) {
      const name = text.slice(7).trim();
      muteSource(name, false);
      reply(`Unmuted ${name}.`);
      return true;
    }
    if (lower.includes("summar")) {
      const list = visibleStories.value;
      if (!list.length) { reply("There are no stories to summarize right now."); return true; }
      void summarizeText(list.slice(0, 12).map((story) => `- ${story.title}`).join("\n")).then(reply).catch((error) => reply(String((error as Error).message || error)));
      reply(`Summarizing ${list.length} visible stories…`);
      return true;
    }
    return false;
  };

  const send = async () => {
    const question = input.value.trim();
    if (!question || busy.value) return;
    input.value = "";
    messages.value = [...messages.value, { role: "user", text: question }];
    if (runTool(question)) return;
    busy.value = true;
    reply("Thinking…");
    const index = messages.value.length - 1;
    try {
      const article = assistantContext.value;
      const context = article
        ? `Article: ${article.title}\n${article.text.slice(0, 12000)}`
        : `Current deck:\n${visibleStories.value.slice(0, 15).map((story) => `- ${story.title} (${story.src})`).join("\n") || "(empty)"}`;
      let all = "";
      const answer = await askAI(`${context}\n\nQuestion: ${question}`, 300, (_chunk, text) => {
        all = text;
        const next = [...messages.value];
        next[index] = { role: "assistant", text: all };
        messages.value = next;
      });
      const next = [...messages.value];
      next[index] = { role: "assistant", text: answer };
      messages.value = next;
    } catch (error) {
      const next = [...messages.value];
      next[index] = { role: "assistant", text: String((error as Error).message || error) };
      messages.value = next;
    } finally {
      busy.value = false;
    }
  };

  return (
    <div id="assistantPage" class="on" role="dialog" aria-label="AI Assistant">
      <div class="assistant-bar"><button type="button" id="assistantClose" aria-label="Close assistant" onClick={closePages}>←</button><span class="assistant-title">Assistant</span><span class="assistant-status" id="assistantStatus">{aiState.value.state === "loading" ? aiState.value.progress : aiState.value.state === "failed" ? "AI unavailable" : ""}</span></div>
      <div class="assistant-body">
        <div id="assistantChat" role="log" aria-live="polite" ref={chatRef} />
        <div class="assistant-suggest" id="assistantSuggest">
          <button type="button" onClick={() => { input.value = "Summarize my deck"; void send(); }}>Summarize my deck</button>
          <button type="button" onClick={() => { input.value = "Show Politics"; void send(); }}>Show Politics</button>
          <button type="button" onClick={() => { input.value = "Unread only"; void send(); }}>Unread only</button>
        </div>
        <form class="assistant-form" id="assistantForm" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <input id="assistantInput" placeholder="Ask the assistant to find, summarize, or filter stories…" autocomplete="off" autofocus aria-label="Message" value={input.value} onInput={(event) => { input.value = (event.target as HTMLInputElement).value; }} />
          <button type="submit" id="assistantSend" disabled={busy.value}>Send</button>
        </form>
      </div>
      <span hidden>{stories.value.length}</span>
    </div>
  );
}
