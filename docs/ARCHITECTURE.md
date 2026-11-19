# Architecture

## Runtime shape

`au-news-deck` is a Preact app compiled into a single self-contained HTML file.

```text
src/main.tsx
  └─ src/app.tsx
      └─ src/components/AppShell.tsx
          ├─ Header / TabsBar / Sidebar / Feed
          ├─ Reader / Flows / Settings / Assistant / Wrapped
          └─ Extras (toast, mini player, install bar, shortcuts, paste reader)
```

State is signal-based:

- `src/state/store.ts` owns feed/story/source data and derived views.
- `src/state/ui.ts` owns ephemeral overlay/navigation state.
- `src/state/prefs.ts` owns appearance and install preferences.
- `src/lib/*.ts` owns domain behavior and persistence helpers.

## Build pipeline

`bun run build` runs `scripts/build.ts`:

1. esbuild bundles `src/main.tsx` with `bundle: true`, `minify: true`, `format: "iife"`, `target: "es2020"`, `platform: "browser"`.
2. The generated JS is escaped with `replace(/<\/script/gi, "<\\/script")`.
3. `src/styles.css` and `src/patch.css` are concatenated into one inline `<style>` block.
4. `src/index.template.html` placeholders are validated and replaced:
   - `<!--STYLES-->`
   - `<!--SCRIPT-->`
5. A data-URI web app manifest is generated from the template's `apple-touch-icon` and injected before `</head>`.
6. The final string is written to `dist/index.html`.

## Generated artifact

- `dist/index.html` is committed and must be regenerated after any `src/**` change.
- Never hand-edit it.
- After `bun run build`, inspect `git diff -- dist/index.html`.
- The build expects both template placeholders to exist exactly once.
- There are no external JS/CSS build outputs. Runtime network calls to proxies/CDNs are separate from the build.

## Template and CSS sources

- `src/index.template.html` came from `reference/original.html` and contains the original `<head>`.
- `src/styles.css` is minified CSS extracted from the legacy reference. Treat it as frozen compatibility CSS.
- `src/patch.css` is the preferred place for new or corrective styles; it is appended after `styles.css`.

`node scripts/extract-reference.mjs` can overwrite `src/styles.css` and `src/index.template.html`. It is a one-off migration tool, not a normal build step.

## Dev server

`bun run dev` runs `scripts/dev.ts`:

- Builds once on startup.
- Serves `dist/index.html` with `cache-control: no-store`.
- Uses `PORT` or `3000`.
- Watches `src` and rebuilds 150ms after changes.
- Does not live-reload the browser; refresh manually.

## Runtime dependencies

The artifact works offline for cached stories, but these features need network at runtime:

- RSS feeds via the proxy chain in `src/lib/feeds.ts`.
- Hacker News Algolia API and HN comments.
- Jina reader and Readability proxies for article extraction.
- jsDelivr for optional HLS.js and the embedded AI runtime.
- Hugging Face model hosts for the embedded local AI.
- User-configured OpenAI-compatible AI server.

## Module boundaries

| Layer | May import | Should not import |
| --- | --- | --- |
| `src/lib/*` | Other libs, types, constants | Components, state UI signals |
| `src/state/*` | Libs, types, constants | Components |
| `src/components/*` | State, libs, types | Build scripts |
| `scripts/*` | Node/Bun APIs, filesystem | App state/components |

Keep this direction. Putting DOM/component logic in `src/lib` makes it untestable in the current harness.
