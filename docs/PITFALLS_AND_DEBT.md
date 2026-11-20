# Pitfalls and Technical Debt

Read this before changing CSS, persistence, history, flows, AI, or the generated artifact.

## Single-file artifact

- `dist/index.html` is generated and tracked. Never hand-edit it.
- Change `src/**`, then `bun run build`.
- The template must keep `<!--STYLES-->` and `<!--SCRIPT-->` placeholders.
- The build escapes `</script` in bundled JS.
- Runtime network calls to proxies/CDNs are allowed, but no external JS/CSS build outputs.

## CSS and DOM contracts

- `src/styles.css` is minified legacy CSS; `src/patch.css` is the override layer.
- Universal typography comes from `--ui-font-size`, `--ui-font-weight`, `--ui-line-height`, and `--ui-icon-scale`; do not add hard-coded font sizes/weights in TSX.
- Custom fonts are applied through `html[data-font="user"] *`; the old limited selector list in `prefs.ts` is obsolete.
- `.on` shows panels such as `#sidebarPage`, `#readerPage`, `#flowPage`, and `#radioFlowPage`.
- `.show` shows `#toast`, `#miniPlayer`, `#cardMenu`, sheets, toolbars, and hints.
- `#tabsBar[data-view]` drives visibility of tab actions via CSS.
- Many legacy selectors in `styles.css` have no current JSX. Do not assume they are active APIs.
- When adding new UI, reuse current IDs/classes from [`UI_MAP.md`](./UI_MAP.md) where possible.

## Module-level hooks

`sourceSummary` in `src/components/Feed.tsx` is a module-level `signal()` from `@preact/signals`. Calling `useSignal()` outside a component breaks app mount in the built HTML. Keep it a plain signal, or move it into component state.

## Flow and history

- `flow` is one signal with `mode: "read" | "radio" | null`; opening one mode replaces the other.
- Read Flow uses `flow.index` and `flow.stories`; Radio Flow uses `flow.radioIndex`.
- Viewport locking is centralized in `src/state/ui.ts`; do not set `document.body.style.overflow` directly in components.
- User-initiated closes should call `exitReadFlow()` / `exitRadioFlow()` so `history.back()` runs.
- Programmatic transitions should use internal `closeReadFlow()` / `closeRadioFlow()` to avoid popping history.
- `popstate` matches `history.state.newsDeckOverlay` values `"reader"`, `"read-flow"`, `"radio-flow"`.
- `pushOverlayState()` replaces the current entry when another overlay is open; do not push a fresh entry in that case.
- The `?read=<url>` deep link calls `history.replaceState(null, "", location.pathname)` after opening.

## Overlay scrolling

- A shared `effect()` in `src/state/ui.ts` locks the viewport whenever `page`, `flow`, `sidebarOpen`, or `showShortcuts` indicates an overlay is active.
- The effect saves `scrollY`, sets `html`/`body` overflow to `hidden`, sets `history.scrollRestoration = "manual"`, and restores all three on the last close.
- The scroll restore temporarily forces `scroll-behavior: auto` so closing an overlay does not animate the feed back to position.
- When the overlay key changes, the effect resets the active scroller to `0` on the next frame: `#readerPage`, `#wrappedPage`, `#settingsPage`, `.flow-slide.active .flow-content`, `#sidebarPanel`, or `.overlay.on .modal`.
- `src/patch.css` applies `overscroll-behavior: contain` to overlay scrollers so wheel/touch scrolling cannot chain into the document behind.
- Full-screen panels use `height: 100dvh` on screen to avoid mobile visual-viewport offsets. Do not reintroduce direct overflow writes or `bottom`-only sizing for these panels.

## Persistence and dates

- `asDate()` turns invalid dates into `new Date()`, which makes malformed items look recent.
- `isRecent()` enforces the 36-hour story window.
- Cached story dates are ISO strings revived to `Date`; `saveDeck()` serializes them back.
- `findStory()` must cover every persisted story collection.
- `unreadOnly` defaults to `false`; do not hide read stories by default.
- `openReader()` marks a story read and pins it in `sessionPinned` so the clicked card does not vanish from the current unread-only deck; clear pins on refresh, clear filters, mark-all-read, or mark-unread.
- Hidden built-ins are names in `removedSources`; removed custom feeds also need `removedFeeds` definitions for restore.
- Restore actions must clear muted/hidden state as well as re-add, or sources remain invisible.
- Radio removals store definitions in `removedStationDefs` and restore them as custom stations.

## Refresh and feed parsing

- `refresh()` modes: `visit`, `manual`, `interval`.
- `manual` returns cached data unless `force=true`; `interval` reuses cache under 30 minutes.
- Concurrent refreshes coalesce through `pendingRefresh`.
- Offline uses cached deck; failures populate `failedSources` and `feedHealth`.
- Feed fetching depends on public CORS proxies in `src/lib/feeds.ts`; direct fetch is attempted first.
- `storyKey()` is `story.hn || link.split("?")[0]`, so query strings are ignored when deduping.
- `loadAllSources()` and `FETCH_ALL_TIMEOUT` exist but are unused.

## Visible stories and counts

- Muted and hidden sources are excluded from `activeSources` and `visibleStories`.
- The Radio view returns `[]` from `visibleStories`; deck-wide actions from Radio do nothing.
- `counts.radio` is hardcoded `0`.
- Liked/Read/Archived views mostly ignore topic/unread/source filters; search still applies.

## Reader and article safety

- Article HTML is sanitized by `sanitizeHtml()` before `articleToFragment()` injection.
- Reader AI summary uses `dangerouslySetInnerHTML` after only replacing `<`. Keep AI output plain text unless you add sanitization.
- `#readProg` uses reader scroll `progress`; TTS `progress` is separate.
- Reader session timer uses a local 1s interval; reset it on story change.
- Automatic connections use `autoLinked` to avoid re-running for the same link.
- `#readerClose` and Escape call `exitReader()` and clear the whole read path; `‹`/`›` call `navigateReader()` and prefer `readerHistory`/`readerForward` before falling back to `readerList`.
- Deck/source navigation opens stories with `{ replace: true }`; only article-body and connection link clicks use `{ follow: true }` to grow the read path.
- HN fallbacks must keep `ArticleResult.source === "discussion"` so `.reader-notice` can label comments; cache HN fallback text only under the discussion key, never as extracted article text.
- Article body reads need a deadline around both `fetch()` and `response.text()`/`response.json()`; a timeout on `fetch()` alone can hang forever on a slow body.
- Never share an in-flight article promise with a caller-supplied `AbortSignal`; cancellation for one reader open must not abort a second consumer.
- Reader AI panels and sheets are anchored from the clicked control via `anchorStyle()`; keep `bottom: auto` so they stay in the viewer's current viewport.
- Feed cards open the reader on bare-card pointer release with a click fallback; ignore `a/button/input/select/textarea` targets, reset suppression on pointer-down, and honor `suppressClick` after long-press, context menu, or swipe archive.
- `Reader` renders only when `page.value === "reader"`, so a stale `readerStory` cannot leave the full-screen reader over another page.
- On touch devices, selection text is captured into `selection.value` during drag, but the native selection is cleared only after pointer release so multi-word drag selection works; hide `#selToolbar` while `selecting` is true and guard cleanup with `clearingSelection`.
- Night-mode `filter` must stay off `html`/`body`; a filtered ancestor makes `position: fixed` overlays relative to the scrolled document, so `#readerPage` can appear shifted with the feed visible below. Tint base content, reader content, and popovers separately, then set the full-screen surface background with `--nd-night-bg`. Keep print neutral.
- Overlay locking saves scroll, resets `window.scrollY` to 0, then restores it on unlock; this keeps full-screen overlays aligned even when a browser still treats a transformed/filtered ancestor as the containing block.
- Printing must re-show `body > #app` in `patch.css`; the legacy `body > *:not(#readerPage)` rule hides the wrapper that contains `#readerPage`.
- Article-only assistant mode must keep `assistantContext` until the assistant closes; home chat clears it on open/close so deck tools do not leak into article questions.
- Linked-article clicks open a synthetic `Story` with source `"Linked"` when no known story matches.

## AI and worker behavior

- `localHandlerFactory()` is stringified into a Blob worker; keep it self-contained with no outer-scope references.
- The main-thread fallback must implement the same message contract.
- Streaming accepts `delta.content` and `delta.reasoning_content`; non-streaming has many response-field fallbacks.
- Server-mode CORS diagnostics depend on being able to reach `GET /v1/models`.
- Home assistant tools are exact phrase matches, not structured function calling; article assistant mode bypasses them and sends `askAIChat()` history to `/v1/chat/completions`.

## Backup gaps

JSON backup currently includes AI config, theme/muted/refresh/unread, source state, liked/read/archived, `readTimes`, and annotations. It does not include:

- stats
- radio state
- article cache
- deck cache
- feed health
- font/night/TTS/install preferences
- hidden radio stations

OPML export also omits `removedSources`. `parseOpml()` is typed as `RadioStation[]` but used as `Source[]`.

## Legacy reference

`reference/original.html` is historical. It is useful for recovering original behavior, CSS, and IDs, but it contains stale WebMCP code and DOM IDs that are not part of the current Preact build. Do not copy it wholesale.

## Deferred work

See [`FEATURES.md`](./FEATURES.md#deferred-or-not-currently-restored) for the current deferred list. Prioritize compatibility fixes before adding new features.
