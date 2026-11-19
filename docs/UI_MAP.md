# UI Map

## CSS layering

`src/styles.css` is extracted compatibility CSS from `reference/original.html`. `src/patch.css` is appended after it and is the safe place for new styles.

Current visibility classes:

| Class | Meaning |
| --- | --- |
| `.on` | Sidebar/page/flow visibility for original-style panels |
| `.show` | Toast, mini player, card menu, sheets, selection toolbar, hints |
| `.active` | Current tab, flow slide/dot, topic tag, action button |
| `.hide` | Intentionally hidden element, e.g. `#readerAskButton` |
| `.muted` | Muted source/station |
| `.dragging`, `.drag-over` | Drag reorder state |
| `.playing` | Active radio card/slide |
| `.read` | Visited story card |
| `.error` | Error state, e.g. radio status |

Important: `#toast`, `#miniPlayer`, and `#cardMenu` use `.show`. Using `.on` on those elements will not display them.

`#tabsBar[data-view="..."]` selectors are meaningful. Keep the `data-view` attribute synchronized with `view.value`.

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
- Views: `All`, `Liked`, `Read`, `Notes`, `Radio`.
- `#readFlowBtn` — opens Read Flow from `visibleStories.value`.
- `#unreadBtn`, `#markReadBtn`, contextual Radio button.

## Feed

Owner: `src/components/Feed.tsx`.

- `main#feed`
- Cards: `article.card[data-link]` with `.read`, `.age-fresh`, `.age-today`, `.age-aging`, `.age-old`
- Card internals: `.swipe-hint`, `.card-thumb`, `.badge.cache`, `.badge.hn`, `.topic-tag`, `.time`, `a.title`, `.ai`, `.desc`, `.open-btn`, `.starbtn.on`
- Source briefing: `#triggerSourceSummary`, `#markSourceRead`, `#srcSummaryWrap`, `#srcSummary`, `.ss-progress`, `.ss-article`, `.ss-summary-text`
- Filters: `#filterBreadcrumb`, `#topicFilter`, `.tag-chip`, `.tag-clear`, `#breadcrumbClear`
- Empty states: `.empty-smart`, `.empty-icon`, `.empty-title`, `.empty-msg`
- Grouping: `.src-group-header`
- Notes: `.notes-grid`, `.ns-item`, `.note-delete`
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
- Navigation: `#readerPrev`, `#readerPos`, `#readerNext`, `#readerTime`, `#readerTimer`
- Actions: `#readerListen`, `#readerSummarize`, `#readerNotes`, `#readerOverflow`, hidden `#readerAskButton`
- Body: `#readerBody.reader-body`; injected nodes get `.tts-active` / `.tts-paused`
- AI: `#readerSummary`, `.ai-err`, `#aiCopy`, `.conn-panel`, `#connLinks`
- HN comments: `.hn-comments`
- Footer: `#footPrev`, `#footNext`
- Selection: `#selToolbar.show`, `.sel-quote`, `#selCopy`, `#selNote`
- Notes sheet: `#notesBackdrop.show`, `#notesSheet.show`, `#nsAdd`, `#nsClose`, `#nsSave`, `.ns-item`, `.ns-del`
- Overflow sheet: `#overflowBackdrop.show`, `#overflowSheet.show`, `#ovSummarize`, `#ovAsk`, `#ovNote`, `#ovPrint`, `#fontDown`, `#fontUp`, `#ttsSpeed`, `#ovClose`

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

- Settings: `#settingsPage.on`, `#srvUrl`, `#srvModel`, `#srvKey`, `#srvSave`, `#srvClear`, `#srvStatus`, `#settingsThemeBtn`, `#fontHandBtn`, `#customFontUrl`, `#refreshModeSelect`, `#nightModeBtn`, `#exportBtn`, `#importBtn`, `#opmlExportBtn`, `#opmlImportBtn`, `#statsGrid`, `#statsSources`, `#wrappedBtn`
- Assistant: `#assistantPage.on`, `#assistantChat`, `.a-msg.user/.assistant`, `#assistantForm`, `#assistantInput`, `#assistantSend`
- Extras: `#toast.show`, `#toastMsg`, `#toastUndo`, `#miniPlayer.show`, `#installBar.show`, `#installYes`, `#installNo`, `#ptrIndicator`, `#radioAudio`, `#wrappedPage.on`

CSS also contains legacy selectors such as `#aiRun`, `#aiBox`, `#filterBar`, `#likedBtn`, `#readerPrint`, and `#ssClose` that are not rendered by current TSX. Treat them as historical, not current APIs.
