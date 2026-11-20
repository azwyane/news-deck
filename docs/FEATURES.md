# Features

This is the current feature inventory. "Current" means implemented in `src/**` and included in `dist/index.html`. "Deferred" means it exists in `reference/original.html` or was discussed but is not active.

## Feed and deck

| Feature | Status | Owner |
| --- | --- | --- |
| Source-grouped card deck | Current | `src/components/Feed.tsx` |
| Sort by source / newest | Current | `src/components/Feed.tsx`, `src/state/store.ts` |
| Topic chips and topic filtering | Current | `src/lib/topics.ts`, `Feed.tsx` |
| Search across visible stories | Current | `src/state/store.ts` (`visibleStories`) |
| Unread-only toggle | Current, default off | `src/components/TabsBar.tsx`, `store.ts` |
| Bare card tap opens the reader reliably | Current | `Feed.tsx` card pointer/click handlers |
| Opened cards stay pinned in current unread-only deck | Current | `store.ts` (`sessionPinned`) |
| Mark all read / single-card unread | Current | `store.ts`, `Feed.tsx` |
| Star/like, archive, unarchive | Current | `store.ts`, `Feed.tsx` |
| Right-swipe to archive | Current | `Feed.tsx` card pointer handlers |
| Long-press / context menu | Current | `Feed.tsx`, `AppShell.tsx` |
| Context Summarize opens reader summary | Current | `AppShell.tsx` → `#readerSummarize` |
| Context Share / link copy with clipboard fallback | Current | `AppShell.tsx`, `src/lib/clipboard.ts` |
| Smart empty states with CTA | Current | `Feed.tsx` (`EmptyState`) |
| Per-source AI briefing + HN comments | Current | `Feed.tsx`, `src/lib/ai.ts`, `src/lib/feeds.ts` |
| Hidden/muted source restore UI | Current | `Sidebar.tsx`, `store.ts` |
| Sidebar source story counts | Current | `Sidebar.tsx` |
| Daily archive rollover | Current | `store.ts` (`archiveOldStories`) |

## Reader

| Feature | Status | Owner |
| --- | --- | --- |
| Parallel full article extraction/cache with staged loading | Current | `src/lib/article.ts`, `sanitize.ts` |
| Cancellable article loads when switching stories | Current | `ui.ts` (`articleController`), `article.ts` (`signal`) |
| Scroll progress `#readProg` | Current | `Reader.tsx`, `progress` signal |
| Session timer `#readerTimer` | Current | `Reader.tsx`, `elapsed` signal |
| Exit-back vs deck/traversal arrows | Current | `Reader.tsx`, `ui.ts` (`exitReader`, `navigateReader`) |
| Linked-article read path with back/forward | Current | `ui.ts` (`readerHistory`, `readerForward`) |
| Browser Back closes or steps back through read path | Current | `ui.ts` (`popstate`, `closeReader`) |
| Text-to-speech with highlighting | Current | `Reader.tsx`, `src/lib/tts.ts` |
| Socratic AI summary + failure report | Current | `Reader.tsx`, `ai.ts` |
| Automatic story connections | Current | `Reader.tsx` (`findConnections`, `autoLinked`) |
| Primary reader actions and grouped tools menu | Current | `Reader.tsx` (`.reader-action-row`, `#readerOverflow`, `#ovConnect`) |
| Anchored summary/connections/notes/controls panels | Current | `Reader.tsx`, `patch.css` (`.reader-popover`) |
| Native Android selection toolbar suppression | Current | `Reader.tsx`, `patch.css` (`-webkit-touch-callout`) |
| Anchored selection copy/note toolbar and annotations | Current | `Reader.tsx`, `store.ts` (`annotations`) |
| HN external article resolution + discussion labeling | Current | `article.ts`, `Reader.tsx` (`readerArticleSource`) |
| HN comments for discussion links | Current | `Reader.tsx`, `feeds.ts` |
| Linked-article click-through | Current | `Reader.tsx` (`#readerBody` click handler) |
| Share / full-article print / font size controls | Current | `Reader.tsx`, `patch.css`, `Extras.tsx` |
| Article-only AI chat with follow-up context | Current | `Assistant.tsx`, `ai.ts` (`askAIChat`) |

## Full-screen flows

| Feature | Status | Owner |
| --- | --- | --- |
| Read Flow full-screen swipe | Current | `Flows.tsx`, `ui.ts` |
| Read Flow dots/progress/hints | Current | `Flows.tsx` |
| Radio Flow full-screen swipe | Current | `Flows.tsx`, `radio.ts` |
| Keyboard navigation in flows | Current | `Flows.tsx` |
| Browser Back closes flows | Current | `ui.ts` (`exitReadFlow`, `exitRadioFlow`) |
| Shared overlay scroll lock/reset/restoration | Current | `ui.ts`, `patch.css` |

Flow modes are mutually exclusive. Opening one replaces the other in the shared `flow` signal. See [PITFALLS_AND_DEBT.md](./PITFALLS_AND_DEBT.md#flow-and-history).

## Radio

| Feature | Status | Owner |
| --- | --- | --- |
| Radio tab starts Radio Flow at current/first station | Current | `TabsBar.tsx` (`startRadioFlow`), `ui.ts` |
| 10 built-in stations | Current | `src/lib/constants.ts` (`DEFAULT_RADIO`) |
| Play/pause and active station status | Current | `radio.ts`, `AppShell.tsx` |
| Mini player | Current | `Extras.tsx` |
| Radio Flow | Current | `Flows.tsx` |
| Custom stations, reorder, mute, hide/restore | Current | `Sidebar.tsx`, `radio.ts` |
| HLS.js fallback from CDN | Current | `radio.ts` |

## Sidebar and feeds

| Feature | Status | Owner |
| --- | --- | --- |
| 15 built-in AU/HN sources | Current | `constants.ts` |
| Custom RSS/Atom feeds | Current | `Sidebar.tsx`, `store.ts`, `feeds.ts` |
| Drag reorder | Current | `Sidebar.tsx` |
| Mute / hide / restore | Current | `Sidebar.tsx`, `store.ts` |
| Per-source refresh and health | Current | `Sidebar.tsx`, `store.ts`, `feeds.ts` |
| OPML import/export | Current | `Settings.tsx`, `src/lib/data.ts` |

## Settings, extras, assistant

| Feature | Status | Owner |
| --- | --- | --- |
| Theme, custom font, night mode, reader font size | Current | `prefs.ts`, `Settings.tsx`, `patch.css` |
| Universal text size, weight, line height, icon scale | Current | `prefs.ts`, `Settings.tsx`, `patch.css` |
| AI server config/test/clear | Current | `Settings.tsx`, `ai.ts` |
| JSON backup/restore | Current | `Settings.tsx`, `data.ts` |
| Reading stats and Wrapped | Current | `Settings.tsx`, `lib/stats.ts`, `Wrapped.tsx` |
| Install bar and install modal | Current | `Extras.tsx`, `AppShell.tsx` |
| Pull-to-refresh | Current | `Extras.tsx` |
| Paste-a-URL reader | Current | `Extras.tsx` |
| Keyboard shortcuts modal | Current | `Extras.tsx`, `AppShell.tsx` |
| `?read=<url>` deep link | Current | `AppShell.tsx` |
| Assistant chat with deck/article context | Current | `Assistant.tsx`, `ai.ts` |
| Deterministic Assistant phrase tools | Current | `Assistant.tsx` (`runTool`) |

## Deferred or not currently restored

These are not active in the TS build even though related code/CSS may exist in `reference/original.html`:

- WebMCP tool registration (`document.modelContext.registerTool`) and its tool server.
- Strict legacy DOM-ID parity. Many CSS selectors in `styles.css` have no current JSX counterpart.
- Resume audio when tapping the already-active station again; current tap toggles play/pause via active station state.
- Full backup coverage: stats, radio state, article/deck caches, feed health, night/TTS/install preferences are not in the JSON backup; theme and typography are included.
- `loadAllSources()` / `FETCH_ALL_TIMEOUT` exist in `feeds.ts` but are unused by the app.
- `readerSummaryBusy` in `ui.ts` is exported but unused; `Reader.tsx` uses a local `summaryBusy`.

When adding one of these, update this file and [`UI_MAP.md`](./UI_MAP.md) in the same change.
