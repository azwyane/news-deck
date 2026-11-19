# AI, Article Extraction, TTS, and Radio

## AI modes

`src/lib/ai.ts` exposes `askAI(prompt, maxTokens = 300, onChunk?)`.

- If `getAIConfig()?.url` is set, it uses **server mode**.
- Otherwise it initializes the **embedded local model**.
- `AI_SYSTEM` in `src/lib/constants.ts` asks for concise plain text, no markdown, no reasoning.
- `cleanText()` strips `` fences and stray tags.

Prompt helpers:

- `summarizeText()` — general summary.
- `socraticSummary()` — Reader summary button.
- `findConnections()` — Reader story connections.
- `chatAboutArticle()` — Assistant context prompt.

## Server mode

Config key: `aussieAiServer`, shape `{ url, model, apiKey? }`.

- `normalizeServerUrl()` trims trailing `/v1` and adds `http://` when no scheme is present.
- `testAIConfig()` checks `GET /v1/models` and then a tiny `POST /v1/chat/completions`.
- `serverChat()` posts OpenAI-compatible chat requests with `temperature: 0.3` and `chat_template_kwargs.enable_thinking = false`.
- Streaming uses SSE `data:` rows and accepts `delta.content` or `delta.reasoning_content`.
- Non-streaming responses are checked against many field fallbacks (`message.content`, `reasoning_content`, `text`, `content`, etc.).
- On POST failure, `withCorsHint()` probes `/v1/models`. If reachable, the error explains that JSON POST preflight is blocked and suggests Ollama/LM Studio CORS settings.

## Embedded local mode

- Probes Hugging Face and hf-mirror for SmolLM/SmolLM2 135M ONNX model files with quantized/int8/q4 suffixes.
- Runtime comes from `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1`, with an `esm.sh` fallback.
- `localHandlerFactory(report)` handles `load` and `generate` messages and reports steps/progress/errors.
- The worker blob is built from `localHandlerFactory.toString()`, then falls back to a main-thread handler if worker creation fails. **Keep that factory self-contained.**
- `extractGenerated()` takes the first sentence with at least four words, otherwise the first 30 words.
- Failures populate `aiState.summary` and `aiState.report`. Reader renders a `<details class="ai-err">` with `#aiCopy`.
- `stopEngine()` terminates the worker, revokes the blob URL, and rejects pending requests; loading can be retried.

## Assistant tools

`Assistant.runTool()` is deterministic phrase matching, not structured function calling:

- `show|filter <topic>` for topics in `TOPIC_COLORS`
- `unread only`
- `clear filters|all stories|show everything`
- `mute <exact source name>`
- `unmute <exact source name>`
- any prompt containing `summar`

Everything else calls `askAI()` with either `assistantContext` or up to 15 current deck headlines.

## Article extraction

`src/lib/article.ts` resolves full text in this order:

1. Jina reader (`r.jina.ai`) — cached on success.
2. Readability through proxy — cached on success.
3. HN-discussion Jina fallback — not cached.

The markdown cache is stored under `aussieNewsDeck.articles.v1` and capped at 40 entries by `fetchedAt`.

`src/lib/sanitize.ts` sanitizes article HTML before `articleToFragment()` injects it into the reader or flows. It removes dangerous tags/attributes, forces `rel="noopener noreferrer"` on links, and makes images lazy/no-referrer.

Reader AI summary uses `dangerouslySetInnerHTML` after only replacing `<`. The prompt asks for plain text; do not change that into HTML-capable output without sanitizing.

## TTS

`src/lib/tts.ts` exports singleton `tts` with signals `playing`, `paused`, `progress`, and `title`.

- Uses Web Speech API with an `en-AU` voice preference.
- Splits text into paragraph segments.
- Applies `.tts-active` / `.tts-paused` classes to rendered paragraphs.
- Rate is persisted in `aussieTtsRate`; the getter writes to localStorage each access.
- Require SpeechSynthesis before showing/enabling TTS controls.

TTS progress is separate from reader scroll progress. `#readProg` must use the reader `progress` signal.

## Radio

`src/lib/radio.ts` owns:

- Signals: `customStations`, `mutedStations`, `removedStations`, `removedStationDefs`, `stationOrder`, `allStations`, `visibleStations`, `radioPlaying`, `radioStatus`, `activeStationName`.
- Functions: `bindAudio`, `playStation`, `toggleRadio`, `stopRadio`, `setVolume`, mute/hide/restore/reorder helpers.
- Persistence: `aussieNewsDeck.radio.v1` stores custom, muted, order, removed, and removed definitions.

Behavior:

- The Radio tab shows a station grid from `visibleStations`.
- Clicking a grid card calls `playStation(station)` then `openRadioFlow(index)`.
- `activeStationName` drives play/pause UI and mini-player state.
- Native HLS is used when available; otherwise HLS.js is loaded from CDN.
- Autoplay failures surface as `"Tap play to start"`.
- Radio Flow cleanup calls `stopRadio()`.
- Radio swipe only calls `playStation()` when already playing; otherwise it previews a different station.
