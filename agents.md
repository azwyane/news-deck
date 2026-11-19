# Agent Operating Manual

This file is the canonical operating manual for AI agents working on `au-news-deck`. Read it before changing code. The `docs/` directory contains the detailed maps referenced below.

## Non-negotiables

1. **The deliverable is one self-contained `dist/index.html`.** Change `src/**`, then run `bun run build`. Never hand-edit `dist/index.html`.
2. **Preserve localStorage compatibility.** Existing keys in `src/lib/constants.ts` are a public contract. Do not rename, drop, or silently change their shapes. Normalize old data on read instead.
3. **Preserve the legacy CSS/DOM contracts.** Visibility is class-driven: `.on`, `.show`, `.active`, `.hide`, `.muted`, `.playing`, `.dragging`, `.drag-over`. Overlays such as `#toast`, `#miniPlayer`, and `#cardMenu` require `.show`, not `.on`.
4. **Keep flow modes separate.** Read Flow and Radio Flow share `flow` but must never overwrite each other's list/index semantics. See `docs/FEATURES.md`.
5. **Overlay history is custom.** Reader and flows push `history.state.newsDeckOverlay` values and close through `popstate`. Keep `src/state/ui.ts` and flow close buttons in sync.
6. **Always verify.** Run `bun run check && bun test && bun run build`. Add or update targeted tests/smoke checks when behavior changes.
7. **Do not commit unless explicitly asked.**

## Start here

- `docs/INDEX.md` — documentation map and "where do I start?" guide.
- `docs/ARCHITECTURE.md` — build pipeline and module boundaries.
- `docs/STATE_AND_STORAGE.md` — signals, derived state, persistence, and localStorage keys.
- `docs/UI_MAP.md` — DOM IDs/classes and CSS layering.
- `docs/FEATURES.md` — what exists, where it lives, and known gaps.
- `docs/AI_AND_MEDIA.md` — AI, reader extraction, TTS, and radio behavior.
- `docs/DEVELOPMENT.md` — commands, change recipes, and verification.
- `docs/PITFALLS_AND_DEBT.md` — known traps and deferred work.

## Change routing

| Task | Start in | Also check |
| --- | --- | --- |
| Feed cards, grouping, empty states, source briefing, radio grid | `src/components/Feed.tsx` | `src/state/store.ts`, `src/lib/topics.ts`, `src/lib/ai.ts`, `docs/FEATURES.md` |
| Reader body, progress, timer, summary, notes, TTS controls | `src/components/Reader.tsx` | `src/lib/article.ts`, `src/lib/ai.ts`, `src/lib/tts.ts`, `src/state/ui.ts` |
| Read Flow / Radio Flow swipe behavior | `src/components/Flows.tsx` | `src/state/ui.ts`, `src/lib/radio.ts`, `docs/PITFALLS_AND_DEBT.md` |
| Sidebar sources, radio stations, restore/mute/reorder | `src/components/Sidebar.tsx` | `src/state/store.ts`, `src/lib/radio.ts` |
| Tabs, view switching, Read Flow button | `src/components/TabsBar.tsx` | `src/state/store.ts`, `src/state/ui.ts` |
| Global keys, install prompts, context menu, deep link | `src/components/AppShell.tsx` | `src/state/ui.ts`, `docs/UI_MAP.md` |
| Settings, backup/import/export, stats | `src/components/Settings.tsx` | `src/lib/data.ts`, `src/lib/stats.ts`, `src/state/prefs.ts` |
| Refresh, dedupe, filters, source health | `src/state/store.ts` | `src/lib/feeds.ts`, `src/lib/constants.ts` |
| Theme/font/night mode | `src/state/prefs.ts` | `src/styles.css`, `src/patch.css` |
| Build output or dev server | `scripts/build.ts`, `scripts/dev.ts` | `src/index.template.html`, `docs/ARCHITECTURE.md` |
| Pure helper behavior | `src/lib/*.ts` | `tests/core.test.ts`, `tests/feeds.test.ts` |

## Workflow

1. Identify the owning file from the routing table; do not patch symptoms in a downstream component.
2. Check `docs/PITFALLS_AND_DEBT.md` before changing CSS, persistence, history, flows, or AI.
3. Make the smallest coherent change. Prefer editing existing files over creating new ones. Avoid adding code comments unless the user asks.
4. If behavior or architecture changes, update the relevant `docs/*.md` in the same change.
5. Run `bun run check && bun test && bun run build`.
6. For DOM behavior, run a temporary happy-dom smoke script against `dist/index.html`; remove it afterward unless the user asked for a committed harness.
7. Inspect `git diff -- dist/index.html` to confirm the generated artifact changed as expected.
8. Report what changed and what was verified. Do not commit.

## Verification commands

```bash
bun install
bun run check
bun test
bun run build
bun run dev
git diff --check
git status --short
```

`bun run dev` serves `dist/index.html` on `$PORT` or `3000` and rebuilds 150ms after `src` changes. There is no browser live reload; refresh manually.

## Compatibility contracts

- `reviveStory()` / `asDate()` normalize persisted story dates. Keep `findStory()` able to look in `stories`, `liked`, `readStories`, and `archived`.
- `unreadOnly` defaults to `false`. Do not hide read stories by default.
- Hidden built-in sources live in `removedSources`; removed custom feeds also need `removedFeeds` so they can be restored.
- `visibleStories` excludes muted/hidden sources and returns `[]` for the Radio view.
- Source counts in the sidebar should reflect loaded stories, not health glyphs.
- Restore actions must unmute as well as re-add, otherwise restored sources stay invisible.
- Reader progress uses scroll position; `#readerTimer` is the session timer. TTS progress is a different signal and should not drive the scroll bar.
- `sourceSummary` in `Feed.tsx` is a module-level `signal()` from `@preact/signals`, not a hook; calling `useSignal()` outside a component breaks the app mount.

## Never do

- Run `node scripts/extract-reference.mjs` casually; it overwrites `src/styles.css` and `src/index.template.html`.
- Add external JS/CSS files to the runtime artifact; everything must inline into `dist/index.html`.
- Rename legacy localStorage keys without a migration.
- Treat `reference/original.html` as active code. It is a historical source for CSS/template and contains stale IDs plus WebMCP code not present in the TS build.
- Introduce HTML-capable AI output into `dangerouslySetInnerHTML` paths without sanitizing it.
- Add service worker sidecars, CDN-dependent build steps, or new package managers without explicit approval.
- Commit unless explicitly requested.
