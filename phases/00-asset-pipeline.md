# Phase 0 — Asset Pipeline & Project Skeleton

> **Self-contained spec for a Sonnet sub-agent.** You have no prior chat
> context. Read `../SPEC.md` and `../ROADMAP.md` for full project context
> before starting. This phase is the project bootstrap; do **only** what
> is explicitly listed below — no extra features, no scaffolding for
> future phases.

## Context

We are building a modern web replacement for the 1995 Ubi Soft "Guit95"
guitar-learning CD. Sole user is the project owner; goal is **personal
practice**, not a public app. Stack and decisions are fixed in
`../ROADMAP.md` (Vite + TypeScript, vanilla DOM, Web Audio for
specialised players, no frameworks). Don't deviate from the stack.

The CD is mounted at `/Volumes/Guitar/`. Source files we care about for
Phase 0 are listed below.

## Goal of this phase

Project compiles, dev-server starts, a single test page loads and plays
the converted **Hey Joe** video. **No game UI yet** — just enough to
prove the asset pipeline works and ffmpeg conversion is correct.

## Scope — IN

1. **Project skeleton** at `/Users/apetrochenko/src/guitar/` (cwd):
   - `package.json` with name `guit95`, type `module`, scripts:
     `dev` (vite), `build` (vite build), `preview` (vite preview),
     `assets` (runs `scripts/build-assets.sh`).
   - `tsconfig.json` with strict TypeScript, target ES2022, moduleResolution `bundler`.
   - `vite.config.ts` — minimal, but increase `server.fs.allow` if needed.
   - `index.html` — the test page (see below).
   - `src/main.ts` — entry script.
   - `.gitignore` — see "Git hygiene" below.
   - `.nvmrc` (optional) — `26`.
   - **Do NOT install** any framework (React, Vue, etc), CSS toolkit
     (Tailwind, etc), state library, or test runner. Only Vite + TypeScript.

2. **Asset pipeline** — `scripts/build-assets.sh`:
   - Bash, `set -euo pipefail`.
   - Source: `/Volumes/Guitar/GUITAR/` and `/Volumes/Guitar/VIDEO/`.
   - Destination: `public/assets/<song>/...` (lowercase).
   - **For Phase 0, process only Hey Joe.** The script must accept an
     optional list of song slugs as args; default = `heyjoe`. Future
     phases will call it with more slugs.
   - Operations for `heyjoe`:
     1. Convert `/Volumes/Guitar/VIDEO/HJOE.AVI` → `public/assets/heyjoe/hjoe.mp4`
        using:
        ```
        ffmpeg -y -i <src> -c:v libx264 -preset slow -crf 22 \
               -c:a aac -b:a 128k -movflags +faststart <dst>
        ```
        Skip if dst exists and is newer than src (idempotency).
     2. Copy `/Volumes/Guitar/GUITAR/HEYJOE/` recursively to
        `public/assets/heyjoe/raw/` with **lowercased filenames and
        directory names** (`HEYJOE` → `heyjoe`, `EX0.EXR` → `ex0.exr`).
        Use `rsync` or `find … -exec`.
     3. Copy `/Volumes/Guitar/GUITAR/CHORDS/` similarly if it exists at
        the song level (the actual location is `HEYJOE/CHORDS/` per SPEC).
   - Print clear progress (`==> heyjoe: video`, `==> heyjoe: data`,
     `==> done in Ns`).
   - Handle missing CD: print friendly error and exit 1.
   - Handle missing ffmpeg: print friendly install hint (`brew install ffmpeg`).

3. **Test page** (`index.html` + `src/main.ts`):
   - Title: "Guit95 — Phase 0 sanity check".
   - Show the page heading, a single `<video>` element with native controls,
     `src="/assets/heyjoe/hjoe.mp4"`, `width=640`, autoplay disabled.
   - Below the video, plain text indicating asset path and the result of a
     trivial parser self-test:
     - `src/main.ts` calls `parseIni()` on a small inline fixture string
       (3-line INI) and prints PASS/FAIL.
   - **You ARE writing a tiny INI parser in this phase** as part of
     proving the toolchain. Place it at `src/parsers/ini.ts`. Minimum
     contract:
     ```ts
     export type IniFile = {
       global: Record<string, string>;             // key=value before any [section]
       sections: Array<{
         name: string;
         entries: Array<{ key: string; value: string }>;  // ordered, may have duplicates
       }>;
     };
     export function parseIni(text: string): IniFile;
     ```
     - Must handle CRLF and LF.
     - Must be case-insensitive for section names but preserve casing in output.
     - Must support `;` and `#` line comments.
     - Must allow duplicate keys within a section (return as array entries).
     - Must NOT throw on malformed lines — skip silently.
     - Decode input as **Windows-1252** at the call site — but the parser itself
       takes already-decoded `string`. Phase 1 will add the file-loading wrapper.
   - One inline self-test at the bottom of `main.ts`:
     ```
     const r = parseIni("BackBmp=foo.bmp\n[chord]\nname=C\nname=D\n");
     console.assert(r.global.BackBmp === "foo.bmp");
     console.assert(r.sections.length === 1 && r.sections[0].entries.length === 2);
     ```
     Display the result on the page (PASS / FAIL).

## Scope — OUT (do not do these)

- ❌ Any UI beyond the sanity-check page.
- ❌ Conversion of BMP files to PNG (defer; raw BMPs are copied as-is).
- ❌ Conversion of WAV files (already standard PCM).
- ❌ Conversion of any song other than Hey Joe.
- ❌ Conversion of exercise videos in `HEYJOE/EXERCICE/<n>/*.AVI` — only
  the main `HJOE.AVI` for now.
- ❌ Routing, multiple pages, framework, design system.
- ❌ Test framework (the inline `console.assert` is enough for Phase 0).
- ❌ CI, GitHub Actions, deploy scripts.
- ❌ Reading the CD into the working tree (`assets/raw/` should NOT be
  populated — only `public/assets/heyjoe/`).

## Git hygiene

Initialise git in this directory if not already:
```
git init
git add -A
git commit -m "phase 0: project skeleton + asset pipeline"
```

`.gitignore` must include:
```
node_modules/
dist/
.DS_Store
public/assets/        # built artefacts; rebuild with `npm run assets`
*.log
```

Note: `public/assets/` is gitignored because (a) videos are large, (b)
the source CD is the source of truth. Reproducible via `npm run assets`.

## Toolchain assumptions

Already installed:
- node v26 (`/opt/homebrew/bin/node`)
- npm 11 (`/opt/homebrew/bin/npm`)
- ffmpeg 8.1.1 (`/opt/homebrew/bin/ffmpeg`)

If you somehow find them missing, surface the error to the user — don't
try to install yourself.

## Definition of Done

Before reporting completion, verify all of these yourself:

- [ ] `npm install` runs to completion with no `npm ERR!` lines.
- [ ] `npm run assets` runs to completion. Re-running it a second time
      is fast (skips video conversion if mp4 newer than avi).
- [ ] `public/assets/heyjoe/hjoe.mp4` exists and is at least 5 MB.
- [ ] `public/assets/heyjoe/raw/play/heyjoe1.sng` exists (lowercased).
- [ ] `npm run dev` starts a Vite server on `http://localhost:5173/`
      with no errors in the terminal.
- [ ] Loading that URL in a browser shows: heading, video element with
      the Hey Joe MP4 loaded (poster frame visible), and a "INI parser
      self-test: PASS" line.
- [ ] No errors in browser console.
- [ ] `git log --oneline` shows one commit "phase 0: ...".
- [ ] `git status` is clean (nothing untracked or modified beyond what's
      tracked).

## Demo (mandatory — include in your final report verbatim)

The user will run these steps to verify the phase. Your final report
**must** include this block at the top, with the **exact** commands and
expected outcomes — adjusted only if you legitimately deviated from the
spec.

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/ in Safari or Chrome
4. Expected:
   - Heading "Guit95 — Phase 0 sanity check"
   - A video player with Hey Joe poster frame
   - Text: "INI parser self-test: PASS"
5. Click play on the video → Hey Joe lesson plays with sound.
6. Stop the dev server (Ctrl+C in the terminal).
```

## Reporting

After completion, write a final report with:

1. **Demo block** (above) — first.
2. **What was built** — files created/modified, in <10 bullets.
3. **Deviations** — anything you did differently from this spec, with
   reason. If none: write "None".
4. **Known issues / TODOs deferred to next phase** — if any.
5. **Toolchain footprint** — `du -sh public/assets/heyjoe`,
   `du -sh node_modules`, total time spent on `npm install` and
   `npm run assets`.

Keep the report under 400 words. The user reads it to decide
"approve & proceed to Phase 1" vs "fix this first".
