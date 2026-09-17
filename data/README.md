# Content — edit JSON, just reload

The game engine is `src/app.ts` → `app.js`. **You don't need it.**
All quiz content lives here as plain JSON:

| File | What | Shape |
|------|------|-------|
| `decks.json` | deck tabs | `{id, name, icon, desc}` |
| `cards.json` | main quiz cards | `{deck, diff, tags, q, code, a, explain, options[]}` |
| `trivia.json` | casual trivia | `{q, a, explain, options[]}` |
| `debug.json` | click-the-bug | `{title, desc, diff, code, bug, bugName, explain}` |
| `build.json` | fill-the-slot | `{deck, tags, q, template[], options[], a, explain}` |
| `order.json` | assemble in order | `{deck, tags, q, lines[], explain}` |
| `lessons.json` | hand-holding lessons (own model, never quiz) | `{id, name, icon, desc, steps[]}` — step kinds: `read` / `run` / `fix` / `order` / `spot` (tap the broken line) / `build` (assemble with decoys) |

## Add one card (no rebuild)

1. Open `cards.json`, copy any entry, edit the fields.
2. Run `npm run validate:content` — it checks the shape fast.
3. Reload the page. That's it. No `tsc`, no stamp script.

Notes:

- `diff` is `rookie | gopher | boss`. Anything else plays as gopher-tier.
- `code` may be `""` (no code block shown).
- `debug.json` `code` accepts a single `"\n"`-joined string **or** an array of lines. `bug` is the 0-based broken line.
- `build.json` `template` needs exactly the marker `{{}}` where the slot goes.
- One bad item never kills the app: the loader skips it, logs to console, and shows a toast count. Fix it at leisure.
- Files are fetched with `cache: no-store`, so edits show on reload — no version bump needed. (The `?v=` stamp is only for `app.js` engine changes.)

## Serve (needed for the in-lesson compiler)

```bash
npm run serve   # http://localhost:8080 — static files + /api/compile proxy
```

The lesson Run button compiles real Go via a same-origin proxy (`scripts/serve.py` → `go.dev/_/compile`, stdlib only). Plain `python3 -m http.server` still works for everything else, but Run will tell you to switch to `npm run serve`.

## Serve over http

`fetch()` doesn't work on `file://`. Serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Card ids and memory

Quiz cards carry stable `id`s (`deck-001`…). Never renumber: progress,
mastery, and spaced-repetition memory key off them. Old question-text-keyed
saves migrate automatically on load. Validate before pushing:
`npm run validate:content`.
