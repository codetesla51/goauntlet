# GOAUNTLET — learn Go by playing

A game that teaches Go: guided lessons with a real compiler, flashcard battles with lives and streaks, and a daily quest. Static frontend, zero backend to manage.

## What it does

GOAUNTLET runs you through Go the way games teach mechanics: a little reading, then doing. Lessons walk you by the hand (read real code, run it, fix it, assemble it from parts), quiz and speed modes drill you under pressure, and debug mode makes you find the broken line. Everything runs in the browser. Progress, streaks, and achievements live in your browser's local storage.

## Why it exists

Reading Go tutorials feels productive until you close the tab and remember nothing. The Tour teaches syntax but never tests you. Exercism gives real practice but needs setup, accounts, and mentor queues for feedback. LeetCode drills algorithms but assumes you already know the language.

GOAUNTLET sits in the gap: zero setup, instant feedback, and the compiler in the loop from the first minute. Wrong answers cost lives, streaks multiply XP, and lesson steps only pay once, so farming is pointless and practice compounds. It is built for the first three months of learning Go, not for interview grinding.

If you want interview prep specifically, LeetCode is still better. If you want deep Go reference material, read the Tour and the standard library docs. This project wants you writing and running Go within sixty seconds of opening it.

## Features

- Learn tab: guided lessons and build-a-program projects with a real Go compiler (run, fix, order, spot-the-bug, assemble steps)
- Algo tab: 10-lesson data structures track from Big O to sliding window, with step-through visualizations
- Quiz, Speed, Trivia, Debug, and Order modes with lives, streaks, combo multiplier, and shop power-ups
- Daily quest (8 masteries) and consecutive-day streaks that only count real activity
- Hands-on widgets shared by every mode: option grids, tap-the-line, drag-and-drop arrange, typed answers, memory traces, and a "you are the scheduler" concurrency simulator
- Progress export/import as JSON; content ships as plain JSON files you can edit and reload

## Quick start

Deploy it (recommended). The app is static files plus one serverless function that forwards compile requests to the Go playground, since browsers cannot call the playground directly.

```bash
npx vercel --prod
```

The command above publishes the folder: pages serve statically and `api/compile.js` becomes the compile endpoint. No servers to run or databases to provision.

Develop it locally. This serves the app with the same compile proxy on your machine:

```bash
npm run serve
```

Then open http://localhost:8080. The proxy is required for lesson Run buttons. Any other static host works for everything else, but `file://` does not (content loads via fetch).

Run the checks. Content validator, typecheck, build, and unit tests in one command:

```bash
npm test
```

Add content. Quiz cards, lessons, and projects are plain JSON in `data/`. For example, a quiz card is just an object with stable id, question, options, and answer:

```json
{
  "id": "slices-022",
  "deck": "slices",
  "diff": "rookie",
  "q": "What does append return?",
  "a": "A new slice header",
  "explain": "Append may reallocate, so keep the return value.",
  "options": ["A new slice header", "Nothing", "The new length"]
}
```

Save the file and reload the page. New topic ids arrive fresh for existing players, and the app prunes progress for removed topics automatically. Never renumber existing ids: progress is keyed by them.

## Things to watch out for

> Note: lesson Run buttons need a compile endpoint. On Vercel this is automatic. Locally you must use `npm run serve`. Without one, Run fails and the Playground button (which opens your code on go.dev) is the fallback.

> Note: the Go sandbox can take up to a minute on slow networks. The app waits 90 seconds before giving up. If compiles always time out for you, check your connection first.

> Warning: progress lives in this browser's local storage. Clearing site data, switching browsers, or using private windows starts you over. Export your progress regularly from the settings if you care about it.

> Note: playground buttons copy your code and open go.dev/play, which always loads with its own starter code. Paste (Ctrl+V) into that tab. The app cannot prefill the playground for you.

## Project map

```
src/          TypeScript modules (compiled to root *.js, loaded via boot.js)
  widgets.ts  shared hands-on components (options, arrange, trace, scheduler…)
  state.ts    versioned save, daily rollover, content reconciliation
  quiz.ts     quiz/trivia/debug/order modes and scoring
  lessons.ts  guided-flow engine driving Learn, Build, and Algo
  ui.ts       HUD, shop, achievements, progress import/export
  content.ts  content shapes, JSON loading, per-item validation
  logic.ts    pure game logic and date helpers (unit-tested)
data/         decks, cards, trivia, debug, build-order, lessons, projects, algo
api/          Vercel serverless compile proxy (same contract as serve.py)
scripts/      serve.py (local dev server), validators, build stamp
tests/        node unit tests (run.mjs)
```

## Credits

Compilation is proxied to the official Go playground compile API. Gopher flavor text owes everything to Go's mascot.
