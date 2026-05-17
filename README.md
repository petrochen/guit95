# Guit95 — modern web reissue of the 1995 Ubi Soft guitar-learning CD

A from-scratch HTML/TypeScript engine that reads the original Guit95
data files (INI-based scenes, custom score-sync format, chord
database, exercise scripts) and renders them in a modern web UI with
**slow-down practice**, **A↔B looping**, **synchronized scrolling
tablature**, **chord previews**, and **per-exercise progress
tracking**.

> ⚠️ **This repository contains only the engine and asset-build
> scripts. None of the original CD's video, audio, or image content is
> distributed here.** To run the app you need a copy of the original
> `Guitar.iso` (or the physical CD). All music and instructional
> content is property of the respective artists and Ubi Soft (1995);
> use this engine for personal practice only.

## What's in the original CD

7 lessons, each ~30 minutes of video instruction:

| # | Song                  | Artist             | Exercises |
|---|-----------------------|--------------------|----------|
| 1 | Hey Joe               | Jimi Hendrix       | 15       |
| 2 | No Woman, No Cry      | Bob Marley         | 13       |
| 3 | Life by the Drop      | Stevie Ray Vaughan | 7        |
| 4 | Sweet Home Alabama    | Lynyrd Skynyrd     | 12       |
| 5 | Dust in the Wind      | Kansas             | 9        |
| 6 | Blowin' in the Wind   | Bob Dylan          | 7        |
| 7 | Wild World            | Cat Stevens        | 10       |

Per song:
- Video lesson (8–10 MB H.264 after conversion from CD AVI)
- 11–25 chord shapes with diagrams + sample audio
- 7–15 exercise videos with voice commentary
- Synchronized tablature strip (~14000 px wide) that scrolls in time
- Difficulty hotspots that link to the relevant exercise

## What this engine adds (vs the 1995 original)

Practice tools:
- **Slow-down practice** (0.25–1.5×) with pitch preservation
- **A↔B loop** with bar-snapping, auto-swap, keyboard control
- **"Loop here"** one-click bar loop
- **Page-flip scrolling tablature** (Songsterr-style)
- **Drag / wheel / touch** to manually pan the partition
- **NOW / NEXT chord previews** auto-update from playback events
- **Hand close-up photo** of each chord shown in the NOW slot
- **"↪ jump in song"** icon per chord — seeks video to where the chord
  is first played
- **Multi-segment exercises** auto-chain voice → demo → next segment
- **Per-exercise progress tracking** with `N / total done` on home cards
- **Resume on reload** per song
- **iPad / touch support** via Pointer Events
- **Modern responsive layout** (phone / tablet / desktop)
- **Keyboard shortcuts** (Space, [, ], Shift+[/], L, C, ←/→, Shift+←/→, ?, W, Esc)
- **Speed preset buttons** (0.5× / 0.75× / 1×)
- **Settings panel** with default speed / volume / reset progress

CD content preserved (often improved):
- **Artist jingles** on home card hover (from CD `TITLE/JGL-*.WAV`)
- **Artist portraits** on home cards (cropped from `TITLE1B.BMP`, `TITLE2.BMP`)
- **Title-screen backdrop** behind home cards (dimmed)
- **Lyrics overlay** with original CD BMPs + prev/next pagination (`W` key)
- **About / Credits** modal with the 6 original Ubi Soft credits pages
- **Tuner** with 6 reference-note samples from the CD (no microphone /
  DSP — just listen and tune by ear)
- **Toolkit** view (9 generic technique exercises) with faithful
  CD-style playback: hover a button to hear title voice; click opens
  with multi-segment chain (slow + voice with guitar close-up →
  silent normal-tempo demo)
- Exercise renumbering by song-curriculum order (first hotspot in the
  song = "Exercise 1", regardless of CD's file numbering)

Production deployment example: live at
**[guitar.petrochenko.info](https://guitar.petrochenko.info)** behind a
Cloudflare Tunnel — see [`DEPLOY.md`](DEPLOY.md).

## Tech stack

- **Vite** + **TypeScript** (strict mode)
- **Vanilla DOM** — no framework
- **Plain CSS** — no Tailwind/SCSS
- **Web Audio API** for chord samples
- **HTML5 video** with `playbackRate` + `preservesPitch`
- **localStorage** for settings/progress/positions
- **ffmpeg** + **sips** (macOS built-in) for one-time asset conversion

Total: 0 runtime dependencies (just Vite for build).

## Quick start

You need:
- macOS (the asset pipeline uses `sips`; on Linux you can substitute
  `convert` from ImageMagick)
- Node.js 20+
- ffmpeg (`brew install ffmpeg`)
- A mounted copy of `Guitar.iso` at `/Volumes/Guitar/`

Then:
```bash
git clone https://github.com/<your-username>/guit95.git
cd guit95
npm install
npm run assets       # one-time: convert AVI→MP4, BMP→PNG (~10 min)
npm run dev          # opens http://localhost:5173
```

## Documentation

- **[SPEC.md](SPEC.md)** — Reverse-engineered spec of the original
  CD's data formats (INI scenes, SCO sync, CHD chord DB, EXR
  exercise scripts).
- **[ROADMAP.md](ROADMAP.md)** — 8-phase development plan.
- **[BACKLOG.md](BACKLOG.md)** — Deferred ideas (tuner, metronome,
  visual polish, etc.).
- **[DEPLOY.md](DEPLOY.md)** — Production deploy guide (Docker +
  nginx + Caddy reverse proxy).
- **[CLAUDE.md](CLAUDE.md)** — Architecture overview for future AI
  contributors (read this first if you're an AI assistant).
- **[phases/](phases/)** — Per-phase spec files (each ~200–500 lines,
  self-contained for delegation to Sonnet sub-agents).

## Project status

Functional and used for practice daily. See CLAUDE.md → "What's done /
what's deferred" for the feature list.

Phases 5 (tuner) and 6 (metronome) are deferred to BACKLOG.md.

## Development workflow

This project was built primarily by an Opus-orchestrated, Sonnet-
implemented agent loop:
1. Opus writes a self-contained spec to `phases/N-spec.md`
2. Opus spawns a Sonnet sub-agent with that spec
3. Sonnet implements + commits + reports demo steps
4. User runs the demo to verify

If you want to use this pattern, see CLAUDE.md → "Sonnet sub-agents".

## License

The engine code in this repository is MIT-licensed (see [LICENSE](LICENSE)).

The original CD content (video, audio, images, INI scenes) is **NOT**
included and is **not** licensed by this repository — copyright
remains with the original authors and Ubi Soft. This engine is
provided for the lawful purpose of letting CD owners interact with
their own legally-acquired media on modern hardware.
