# Documentation Index

This directory is the maintained knowledge base for `au-news-deck`. The root [`agents.md`](../agents.md) is the operating manual; these docs are the detailed maps.

## Reading order

1. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how source files become the single `dist/index.html`.
2. [`FEATURES.md`](./FEATURES.md) — what exists, where it lives, and what is intentionally deferred.
3. [`STATE_AND_STORAGE.md`](./STATE_AND_STORAGE.md) — signals, derived state, persistence, and localStorage keys.
4. [`UI_MAP.md`](./UI_MAP.md) — current DOM IDs/classes and CSS visibility contracts.
5. [`AI_AND_MEDIA.md`](./AI_AND_MEDIA.md) — AI server/local mode, article extraction, TTS, and radio.
6. [`DEVELOPMENT.md`](./DEVELOPMENT.md) — commands, change recipes, and verification.
7. [`PITFALLS_AND_DEBT.md`](./PITFALLS_AND_DEBT.md) — known traps and deferred work.

## What exists at a glance

| Area | Owner | Notes |
| --- | --- | --- |
| Feed deck | `src/components/Feed.tsx` | Cards, source grouping, empty states, source AI briefing, radio grid, notes grid |
| Reader | `src/components/Reader.tsx` | Article body, progress, timer, summary, connections, notes, TTS, HN comments |
| Full-screen flows | `src/components/Flows.tsx` | One shared `flow` signal with separate `read` and `radio` modes |
| Sidebar | `src/components/Sidebar.tsx` | Source/station lists, mute/hide/restore, drag reorder, custom feeds/stations |
| Global shell | `src/components/AppShell.tsx` | Keyboard shortcuts, overlays, context menu, install prompts, deep link, audio element |
| Settings | `src/components/Settings.tsx` | AI config, appearance, refresh mode, backup/OPML, stats, Wrapped |
| Assistant | `src/components/Assistant.tsx` | Chat with deck/article context and deterministic phrase tools |
| Feed state | `src/state/store.ts` | Stories, filters, views, read/like/archive/note, refresh, source actions |
| UI state | `src/state/ui.ts` | Reader/flow/overlay state and browser history handling |
| Preferences | `src/state/prefs.ts` | Theme, font, night mode, universal typography, reader font size, install dismissal |
| Radio | `src/lib/radio.ts` | Stations, playback, HLS, volume, persistence |
| AI | `src/lib/ai.ts` | Server/OpenAI-compatible mode and embedded local model |
| Build | `scripts/build.ts` | Inlines JS/CSS/template/manifest into `dist/index.html` |

## Decision tree

- **"Where do I change X?"** → routing table in [`../agents.md`](../agents.md#change-routing), then [`FEATURES.md`](./FEATURES.md).
- **"Why does CSS not apply?"** → [`UI_MAP.md`](./UI_MAP.md#css-layering) and [`PITFALLS_AND_DEBT.md`](./PITFALLS_AND_DEBT.md#css-and-dom-contracts).
- **"Why is data missing/duplicated?"** → [`STATE_AND_STORAGE.md`](./STATE_AND_STORAGE.md).
- **"User says an original feature is missing."** → [`FEATURES.md`](./FEATURES.md#deferred-or-not-currently-restored), then compare with `reference/original.html` only as a historical source.
- **"How do I verify?"** → [`DEVELOPMENT.md`](./DEVELOPMENT.md#verification).

## Maintenance rule

When a behavior, state key, DOM ID, or feature status changes, update the relevant doc in the same change. Stale docs are worse than no docs for agent consistency.
