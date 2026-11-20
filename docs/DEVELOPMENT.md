# Development

## Commands

```bash
bun install          # install from bun.lock
bun run dev          # build once, serve dist/index.html on $PORT or 3000
bun run build        # regenerate dist/index.html
bun run check        # tsc --noEmit
bun test             # bun:test suite
git diff --check     # whitespace sanity
git status --short   # changed files
```

No linter is configured. `bun run check` is the typecheck/lint-equivalent gate.

## Verification

After any source change:

```bash
bun run check && bun test && bun run build
git diff -- dist/index.html
git diff --check
```

Current baseline: `bun run check` passes, `bun test` reports 12 pass / 0 fail / 27 expect calls, and `bun run build` produces `dist/index.html` around 303 KB.

`bun run dev` rebuilds 150ms after `src` changes but does not reload the browser. Refresh manually.

## Tests

Committed tests:

- `tests/core.test.ts` — format helpers, topics, literal night-mode dataset values.
- `tests/feeds.test.ts` — RSS/Atom parsing, dedupe, body-read timeouts, sanitizer, OPML.
- `tests/reader.test.ts` — reader loading replacement, scroll locking, selection capture, primary reader actions, direct Radio tab flow.
- `tests/clipboard.test.ts` — clipboard API and fallback.
- `tests/ai-chat.test.ts` — article chat request shape.
- `tests/setup.ts` — happy-dom globals.

Not covered by committed tests: build output, AI streaming, radio/HLS playback, TTS output, article extraction provider results, stats/Wrapped rendering, and refresh orchestration.

## DOM smoke checks

For UI behavior that pure tests cannot cover:

1. Run `bun run build`.
2. Create a temporary happy-dom script outside the tracked source set, e.g. `.smoke.mjs`.
3. Seed `localStorage` before `doc.write(dist/index.html)`.
4. Enable JavaScript evaluation in the `Window`.
5. Use real DOM events (`click`, `input`, `popstate`, pointer/mouse events) and assert on current IDs/classes.
6. Close the `Window` and `process.exit(...)`.
7. Remove the temporary script unless the user asked for a committed harness.

Useful seeding keys are in [`STATE_AND_STORAGE.md`](./STATE_AND_STORAGE.md#localstorage-keys). When testing sources, remember that startup may fetch live stories; assert relative counts (before/after) instead of fixed totals where possible.

## Change recipes

### Add a UI feature

1. Find the owning component in [`FEATURES.md`](./FEATURES.md) or [`../agents.md`](../agents.md#change-routing).
2. Add state only where it belongs: domain data in `store.ts`, ephemeral overlays in `ui.ts`, preferences in `prefs.ts`.
3. Use existing DOM ID/class conventions from [`UI_MAP.md`](./UI_MAP.md).
4. Add styles to `src/patch.css`, not `src/styles.css`.
5. Verify, then update docs.

### Add persisted data

1. Add the key to `src/lib/constants.ts`.
2. Seed and save through `persistent()` or an explicit `writeJSON`.
3. Normalize old shapes on read; never assume the new shape exists.
4. If it is a story collection, add it to `findStory()` and date revival.
5. If it should be in backup, update `makeBackup()` / `parseBackup()` in `src/lib/data.ts`.
6. Document the key.

### Change flow or overlay behavior

1. Read [`PITFALLS_AND_DEBT.md`](./PITFALLS_AND_DEBT.md#flow-and-history).
2. Keep `flow.mode`, `history.state.newsDeckOverlay`, the shared overlay scroll lock in `ui.ts`, and close functions in sync.
3. Use `exitReadFlow()` / `exitRadioFlow()` for user-initiated closes so Back works.
4. Use internal `closeReadFlow()` / `closeRadioFlow()` for programmatic transitions that should not pop history.

### Change CSS visibility

1. Check the existing class contract in [`UI_MAP.md`](./UI_MAP.md#css-layering).
2. Prefer adding a scoped rule in `src/patch.css`.
3. Verify all states: default, active, muted, loading, error, overlay open/closed.
4. For typography, change the `--ui-*` variables in `prefs.ts` and their consumers in `patch.css`; avoid new inline `font-size`/`font-weight` styles in TSX.

## Documentation duty

Update the relevant doc when changing:

- a feature's status or owner → `FEATURES.md`
- a state signal, derived value, or localStorage key → `STATE_AND_STORAGE.md`
- a DOM ID/class or visibility rule → `UI_MAP.md`
- AI/radio/TTS/article behavior → `AI_AND_MEDIA.md`
- build/dev behavior → `ARCHITECTURE.md` or this file
- a known trap or deferred item → `PITFALLS_AND_DEBT.md`

## Commit policy

Do not commit unless the user explicitly asks. If asked, stage only intended files and follow the existing concise commit-message style.
