# UI Map

## CSS layering

`src/styles.css` is extracted compatibility CSS from `reference/original.html`. `src/patch.css` is appended after it and is the safe place for new styles.

Current visibility classes:

| Class | Meaning |
| --- | --- |
| `.on` | Sidebar/page/flow visibility for original-style panels |
| `.show` | Toast, mini player, card menu, sheets, selection toolbar, hints |
| `.active` | Current tab, flow slide/dot, topic tag, action button |
| `.hide` | Intentionally hidden element |
| `.muted` | Muted source/station |
| `.dragging`, `.drag-over` | Drag reorder state |
| `.playing` | Active radio card/slide |
| `.read` | Visited story card |
| `.error` | Error state, e.g. radio status |

Important: `#toast`, `#miniPlayer`, and `#cardMenu` use `.show`. Using `.on` on those elements will not display them.

`#tabsBar[data-view="..."]` selectors are meaningful. Keep the `data-view` attribute synchronized with `view.value`.

Overlay scrollers use `overscroll-behavior: contain` and `height: 100dvh` on screen to prevent scroll chaining and mobile viewport offsets. Scroll locking/reset/restoration is managed centrally in `src/state/ui.ts`; do not write `overflow` styles directly in components.

Night tint is applied to base content plus reader/tool surfaces in `src/patch.css`, while the reader/full-screen page background uses `--nd-night-bg`. Never put a `filter` on `html` or `body`.

## Header

Owner: `src/components/Header.tsx`.

- `#hdr` — header; gets `.hide` on scroll down past 80px.
- `#sidebarBtn`, `#themeBtn`, `#settingsBtn`, `#assistantBtn`, `#refresh`, `#pasteReadBtn`
- `#offpill` — offline badge.
- `#status` — status text; gets `.status-error`.
- `#search`, `#sort` — search and `src|new` sort.
- `.shortcuts-btn` — opens `?` shortcuts overlay.

## Tabs

Owner: `src/components/TabsBar.tsx`.

- `#tabsBar[data-view]` with `.tab-btn.active`.
- Views: `All`, `Liked`, `Read`, `Notes`. The Radio tab starts Radio Flow directly at the active/visible station instead of changing `view.value`.
- `#readFlowBtn` — opens Read Flow from `visibleStories.value`.
- `#unreadBtn`, `#markReadBtn`, contextual Radio button.

## Feed

Owner: `src/components/Feed.tsx`.

- `main#feed`
- Cards: `article.card[data-link]` with `.read`, `.age-fresh`, `.age-today`, `.age-aging`, `.age-old`
- Card internals: `.swipe-hint`, `.card-thumb`, `.badge.cache`, `.badge.hn`, `.topic-tag`, `.time`, `a.title`, `.ai`, `.desc`, `.starbtn.on`; a bare tap opens on pointer release with a click fallback, while links/buttons are ignored
- Source briefing: `#triggerSourceSummary`, `#markSourceRead`, `#srcSummaryWrap`, `#srcSummary`, `.ss-progress`, `.ss-article`, `.ss-summary-text`
- Filters: `#filterBreadcrumb`, `#topicFilter`, `.tag-chip`, `.tag-clear`, `#breadcrumbClear`
- Empty states: `.empty-smart`, `.empty-icon`, `.empty-title`, `.empty-msg`
- Grouping: `.src-group-header`
- Notes: `.notes-grid`, `.ns-item`, `.note-open`, `.note-delete`
- Radio grid: `.radio-grid`, `.radio-card.playing`, `.radio-card-gradient`, `.radio-card-eq`

Card context menu is rendered in `AppShell.tsx`:

- `#cardMenu.show`
- `data-act="ctx-read|ctx-star|ctx-archive|ctx-summarize|ctx-share|ctx-open"`

## Sidebar

Owner: `src/components/Sidebar.tsx`.

- `#sidebarPage.on`, `#sidebarBackdrop`, `#sidebarPanel`, `#sidebarClose`
- Quick views: `.sidebar-item[data-src="All|Liked|Archived|Read|Notes"]`
- Sources: `#sidebarSources`, `.sidebar-item[data-name]`, `.src-name`, `.count`, `.mute-icon`, `.delete-feed`
- Add feed: `#addFeedToggle`, `#addFeedForm.on`, `#addFeedSave`
- Hidden feeds: `#hiddenSources`, `.restore-box`, `.restore-item`
- Stations: `#sidebarRadio`, `.radio-sidebar-item`, `.rs-order`, `.rs-dot`, `.rs-name`, `.rs-cat`
- Add station: `#addRadioToggle`, `#addRadioForm.on`, `#addRadioSave`
- Hidden stations: `#hiddenStations`

Sidebar `.count` should show loaded story count; its `title` carries health/fetch detail.

## Reader

Owner: `src/components/Reader.tsx`.

- `#readerPage.on`, `#readProg`, `.reader-bar`, `#readerClose`, `#readerSrc`, `#readerStar`, `#readerShare`
- Navigation: `.reader-nav-row` contains `#readerClose` (back to deck), `#readerPrev`, `#readerPos`, `#readerNext`, `#readerTime`, `#readerTimer`; `‹`/`›` follow read-path history first, then the current source/All view
- Actions: `.reader-action-row` contains `#readerListen`, `#readerSummarize`, `#readerAskButton` (`primary-ask`), and `#readerOverflow` ("Tools")
- Loading: `.empty` shows `readerLoadingStage` text such as "Resolving article source…", "Fetching direct article text…", or "Rendering article…"
- Body: `#readerBody.reader-body`; injected nodes get `.tts-active` / `.tts-paused`
- AI panel: `#readerPanelBackdrop.show`, `#readerPanel.show.reader-popover`, `#readerPanelClose`, `#readerSummary`, `.ai-err`, `#aiCopy`, `.conn-panel`, `#connLinks`
- HN: `.reader-notice`, `.hn-comments`
- Footer: `#footPrev`, `#footNext`
- Selection: `#selToolbar.show` (anchored to selection rect), `.sel-quote`, `#selCopy`, `#selNote`; drag selection is captured up to 5000 chars, the toolbar stays hidden while dragging, and native touch callouts are cleared only after release. `#selCopy` routes through `copyText()` with clipboard API and `execCommand` fallback.
- Notes sheet: `#notesBackdrop.show`, `#notesSheet.show.reader-popover`, `#nsAdd`, `#nsClose`, `#nsSave`, `.ns-item`, `.ns-del`
- Tools sheet: `#overflowBackdrop.show`, `#overflowSheet.show.reader-popover`, `.ns-header` with `#ovClose`, `.ov-group-title`, `.tool-list`, `.tool-row`, `#ovSummarize`, `#ovConnect`, `#ovAsk`, `#ovNote`, `#ovPrint`, `#fontDown`, `#fontUp`, `#ttsSpeed`

## Flows

Owner: `src/components/Flows.tsx`.

Read Flow:

- `#flowPage.on`, `#flowProgress`, `#flowClose`, `#flowDots`, `.flow-dot.active`, `.flow-dot-more`
- `#flowStack`, `.flow-slide.active.dragging[data-idx]`, `.flow-hero`, `.flow-title`, `.flow-lede`, `.flow-body`
- `.flow-actions .flow-act-btn.on` with `data-act="star|listen|share|archive"`
- `#flowHint.show`

Radio Flow:

- `#radioFlowPage.on`, `#radioFlowClose`, `#radioFlowDots`, `#radioStack`
- `.radio-slide.active.playing.dragging[data-idx]`, `.radio-play-btn[data-action]`, `.radio-status.error`, `#radioFlowHint.show`

## Settings, assistant, extras

- Settings: `#settingsPage.on`, `#srvUrl`, `#srvModel`, `#srvKey`, `#srvSave`, `#srvClear`, `#srvStatus`, `#settingsThemeBtn`, `#fontHandBtn`, `#customFontUrl`, `#uiFontRange`, `#uiWeightSelect`, `#uiLineRange`, `#uiIconRange`, `#readerFontRange`, `#typographyReset`, `#refreshModeSelect`, `#nightModeBtn`, `#exportBtn`, `#importBtn`, `#opmlExportBtn`, `#opmlImportBtn`, `#statsGrid`, `#statsSources`, `#wrappedBtn`
- Assistant: `#assistantPage.on`, `#assistantChat`, `.a-msg.user/.assistant`, `#assistantForm`, `#assistantInput`, `#assistantSend`
- Extras: `#toast.show`, `#toastMsg`, `#toastUndo`, `#miniPlayer.show`, `#installBar.show`, `#installYes`, `#installNo`, `#ptrIndicator`, `#radioAudio`, `#wrappedPage.on`

CSS also contains legacy selectors such as `#aiRun`, `#aiBox`, `#filterBar`, `#likedBtn`, `#readerPrint`, and `#ssClose` that are not rendered by current TSX. Treat them as historical, not current APIs.
