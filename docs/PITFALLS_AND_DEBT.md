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
- Both flows lock `document.body.style.overflow`; all close paths must unlock it.
- User-initiated closes should call `exitReadFlow()` / `exitRadioFlow()` so `history.back()` runs.
- Programmatic transitions should use internal `closeReadFlow()` / `closeRadioFlow()` to avoid popping history.
- `popstate` matches `history.state.newsDeckOverlay` values `"reader"`, `"read-flow"`, `"radio-flow"`.
- `pushOverlayState()` replaces the current entry when another overlay is open; do not push a fresh entry in that case.
- The `?read=<url>` deep link calls `history.replaceState(null, "", location.pathname)` after opening.

## Persistence and dates

- `asDate()` turns invalid dates into `new Date()`, which makes malformed items look recent.
- `isRecent()` enforces the 36-hour story window.
- Cached story dates are ISO strings revived to `Date`; `saveDeck()` serializes them back.
- `findStory()` must cover every persisted story collection.
- `unreadOnly` defaults to `false`; do not hide read stories by default.
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
- Linked-article clicks open a synthetic `Story` with source `"Linked"` when no known story matches.

## AI and worker behavior

- `localHandlerFactory()` is stringified into a Blob worker; keep it self-contained with no outer-scope references.
- The main-thread fallback must implement the same message contract.
- Streaming accepts `delta.content` and `delta.reasoning_content`; non-streaming has many response-field fallbacks.
- Server-mode CORS diagnostics depend on being able to reach `GET /v1/models`.
- Assistant tools are exact phrase matches, not structured function calling.

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
