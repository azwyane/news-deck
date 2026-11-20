# State and Storage

## State ownership

| Module | Responsibility |
| --- | --- |
| `src/state/store.ts` | Stories, sources, filters, views, read/like/archive/notes, refresh, status |
| `src/state/ui.ts` | Page/reader/flow overlays, card menu, toast, install state, browser history |
| `src/state/prefs.ts` | Theme, font, night mode, universal typography, reader font size, install dismissal |
| `src/lib/stats.ts` | Reading sessions and Wrapped data |
| `src/lib/radio.ts` | Stations, playback, volume, HLS, radio persistence |
| `src/lib/ai.ts` | AI config and `aiState` |
| `src/lib/tts.ts` | TTS controller singleton |
| `src/components/Feed.tsx` | Module-level `sourceSummary` signal for source briefings |

## Important store signals

Persistent:

- `customFeeds`, `sourceOrder`, `removedSources`, `removedFeeds`, `mutedSources`
- `liked`, `archived`, `readStories`, `readTimes`, `annotations`, `feedHealth`
- `refreshMode`, `unreadOnly`
- `sessionPinned` is memory-only: links opened this session stay visible under `unreadOnly` until refresh, clear filters, mark-all-read, or mark-unread

Runtime/cache:

- `stories`, `cacheSavedAt`, `refreshing`, `loadingSources`, `failedSources`
- `statusText`, `statusError`, `cacheNote`

Filters/views:

- `view`, `search`, `sort`, `topicFilter`

Derived:

- `allSources`, `activeSources`, `visibleStories`, `counts`, `noteEntries`

`visibleStories` excludes muted/hidden sources. The Radio view returns `[]` by design; deck-wide actions from Radio therefore do nothing. `counts.radio` is currently `0`.

## Persistence helpers

`src/lib/storage.ts` wraps `localStorage` with `readJSON`, `writeJSON`, `readText`, `writeText`, and `removeKey`. All failures are swallowed.

`persistent()` in `store.ts` seeds from `readJSON` and installs an `effect()` that writes on every change. `persistentStories()` additionally calls `reviveStory()` so ISO date strings become `Date` objects. `saveDeck()` writes `{savedAt, items}` to the deck cache key and slices to `DECK_LIMIT` (500).

## localStorage keys

Defined in `src/lib/constants.ts`. Treat as a compatibility contract.

| Key | Owner / shape |
| --- | --- |
| `aussieNewsDeck.customFeeds.v1` | `customFeeds` JSON |
| `aussieNewsDeck.order.v1` | `sourceOrder` JSON |
| `aussieNewsDeck.liked.v1` | `liked` stories JSON |
| `aussieNewsDeck.archive.v1` | `archived` stories JSON; also written during daily rollover |
| `aussieNewsDeck.read.v1` | `readTimes` map JSON |
| `aussieNewsDeck.readStories.v1` | `readStories` JSON |
| `aussieNewsDeck.removed.v1` | Hidden source names JSON |
| `aussieNewsDeck.removedFeeds.v1` | Removed custom feed definitions JSON |
| `aussieNewsDeck.lastVisit` | `toDateString()` for daily rollover |
| `aussieNewsDeck.v1` | Cached deck `{savedAt, items}` |
| `aussieNewsDeck.muted` | `mutedSources` JSON |
| `aussieNewsDeck.refreshMode` | `"visit" \| "manual" \| "interval"` JSON string |
| `aussieNewsDeck.stats.v1` | `ReadingStats` JSON |
| `aussieNewsDeck.annotations.v1` | `Record<link, Note[]>` JSON |
| `aussieNewsDeck.feedHealth.v1` | `Record<source, FeedHealth>` JSON |
| `aussieNewsDeck.radio.v1` | Radio custom/muted/order/removed state JSON |
| `aussieNewsDeck.unreadOnly` | Boolean JSON |
| `aussieNewsDeck.fs` | Reader font size plain text |
| `aussieNewsDeck.uiFont` | Universal interface text size plain text |
| `aussieNewsDeck.uiWeight` | Universal font weight plain text |
| `aussieNewsDeck.uiLineHeight` | Universal line height plain text |
| `aussieNewsDeck.uiIconScale` | Universal icon scale plain text |
| `aussieNewsDeck.articles.v1` | Article markdown cache, max 80 entries |
| `aussieTheme` | Theme plain text |
| `aussieFontActive` | Font mode/URL plain text |
| `aussieFontUrl` | Custom font URL plain text |
| `aussieNight` | `"off" \| "auto" \| "on"` plain text |
| `aussieTtsRate` | TTS rate plain text |
| `aussieAiServer` | `AIConfig` JSON |
| `installDismissed` | `"1"` when dismissed |

Not persisted: `view`, `search`, `sort`, `topicFilter`, reader/flow overlays, source summaries, loading/error flags.

## Find and normalize stories

`findStory()` checks, in order, `stories`, `liked`, `readStories`, and `archived`. Always add new persisted story collections here.

`asDate()` converts invalid dates to `new Date()`. That keeps malformed old data from crashing the deck, but it also makes it look recent. `isRecent()` enforces the 36-hour story window.

`archiveOldStories()` runs once per local day using `KEYS.lastVisit`; it moves unread stories older than local midnight into `archived`.

## Refresh semantics

`refresh(force = false)` in `store.ts`:

- `visit`: refresh on mount.
- `manual`: show cache and return unless `force=true`.
- `interval`: reuse cache under 30 minutes, then refresh every 30 minutes.

Concurrent calls coalesce through `pendingRefresh`; a forced call during a pending refresh schedules another run. Failures populate `failedSources` and `feedHealth`. Offline loads use the cached deck.

## Overlay history

`src/state/ui.ts` stores `history.state.newsDeckOverlay` values:

- `"reader"`
- `"read-flow"`
- `"radio-flow"`

`pushOverlayState()` pushes a new entry normally but replaces the current entry when another overlay is already open. A module-level `popstate` listener closes the matching overlay. UI close buttons use `closeReader()`, `exitReadFlow()`, and `exitRadioFlow()` so they call `history.back()` when appropriate.

Reader also has an in-memory `readerHistory` stack for prev/next. Its stored `scroll` value is currently always `0` and unused.

## Preferences

`applyPrefs()` sets:

- `html.dataset.theme` to `"light"` or deletes it.
- `html.dataset.night` to the literal `"off"`, `"auto"`, or `"on"` value so CSS can tint every surface consistently.
- `html.dataset.font` to `"hand"` or `"user"`.
- `--rfs` from reader font size, clamped 14–26.
- `--ui-font-size`, `--ui-font-weight`, `--ui-line-height`, and `--ui-icon-scale` for universal typography.
- A `<style>@font-face</style>` when the custom font URL starts with `http`, applied through `html[data-font="user"] *`.
