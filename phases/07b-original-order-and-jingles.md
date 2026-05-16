# Phase 7b — Original CD Order + Artist Jingles on Hover/Click

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Two small additions on top of Phase 7:
> 1. Reorder the home screen songs to match the original CD's menu.
> 2. Add artist jingles (short audio cues) that play when the user
>    hovers OR clicks a song card.

## Context

Personal-use web app for learning guitar from the 1995 Ubi Soft
"Guit95" CD. Stack: Vite + TypeScript + vanilla DOM. Working directory:
`/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats.
2. `../ROADMAP.md`.
3. Prior phase specs `00`..`07`. Phase 7 introduced multi-song
   support, `songs.ts`, hash router, home screen with 7 cards.

State recap:
- All 7 songs are converted in `public/assets/<slug>/`.
- `src/songs.ts` exports `SONGS: SongMeta[]` in an arbitrary order
  (the order Sonnet picked when building Phase 7).
- The home screen renders one card per song using the `SONGS` order
  verbatim.

## Issue 1 — Reorder to match the original CD menu

The original CD had a **two-page** title screen (TITLE1.TIT +
TITLE2.TIT, switchable via a tab). The order of song buttons by
y-position was:

**Page 1 (TITLE1.TIT):**
1. Jimi Hendrix — Hey Joe
2. Bob Marley — No Woman, No Cry
3. Stevie Ray Vaughan — Life by the Drop
4. Lynyrd Skynyrd — Sweet Home Alabama

**Page 2 (TITLE2.TIT):**
5. Kansas — Dust in the Wind
6. Bob Dylan — Blowin' in the Wind
7. Cat Stevens — Wild World

In our home grid we keep all 7 on one page (don't replicate the
two-page split — modern responsive grid is fine), but the **order**
of cards must match the above 1..7.

In `src/songs.ts`, reorder the `SONGS` array literal to:
`heyjoe`, `woman`, `life`, `sweet`, `dust`, `blowin`, `wild`.

Do NOT change any other field — slugs, titles, paths, exerciseCount
all stay the same. Just move array items around.

## Issue 2 — Artist jingles on card hover and click

The original CD played a short voice cue ("jingle") when the user
clicked an artist on the title screen. Files live in
`/Volumes/Guitar/GUITAR/TITLE/JGL-*.WAV`:

| Song slug | Jingle file       | Notes                          |
| --------- | ----------------- | ------------------------------ |
| `heyjoe`  | `JGL-JH01.WAV`    | Jimi Hendrix                   |
| `woman`   | `JGL-BM01.WAV`    | Bob Marley                     |
| `life`    | `JGL-RV01.WAV`    | (Stevie) Ray Vaughan           |
| `sweet`   | `JGL-LS01.WAV`    | Lynyrd Skynyrd                 |
| `dust`    | `JGL-KS01.WAV`    | Kansas                         |
| `blowin`  | `JGL-BD01.WAV`    | Bob Dylan                      |
| `wild`    | `JGL-CS01.WAV`    | Cat Stevens                    |

### Asset pipeline addition

Extend `scripts/build-assets.sh` with a new step that copies all
seven `JGL-*.WAV` files from `/Volumes/Guitar/GUITAR/TITLE/` to
`public/assets/jingles/`, lowercased:
- `public/assets/jingles/jgl-jh01.wav`
- `public/assets/jingles/jgl-bm01.wav`
- ... etc.

This should run unconditionally (not gated on a song slug arg). Use
the same idempotency pattern as other copy steps — skip if dest is
newer than src.

Note: the script previously accepted optional slug args to limit
scope. The jingles step should run **regardless of args** (they're
global). Place it before or after the per-song loop; either order
works.

### Add `jingleUrl` to SongMeta

`src/songs.ts`:
```ts
export type SongMeta = {
  // ... existing fields
  jingleUrl: string;     // /assets/jingles/<file>.wav
};
```

Populate each entry with its mapped jingle (lowercased relative path
matching the table above).

### Play on hover and click

In the home-screen render code (`renderHome()` or equivalent in
`main.ts`):

1. Create a single reusable `HTMLAudioElement` for jingles (don't
   create one per card). Call it `jingleAudio`.

2. For each card:
   - `onmouseenter`: play that card's jingle.
   - `onclick`: play that card's jingle, then navigate to the song
     after a brief delay so the jingle starts before the page
     transitions. Recommend: play jingle synchronously, then
     `setTimeout(() => location.hash = "#/song/" + slug, 0)` —
     the audio kick already happens before navigation.

3. Behaviour rule: starting a new jingle interrupts the current one
   (mutex via the single Audio element).

4. On hover-out: don't stop the current jingle (let it finish; if
   another card is hovered, it'll preempt). User can move quickly
   through cards without audio glitches.

5. After navigating away from home (hash != `#/`), pause and clear
   the jingle.

### CSS — no changes required

The home screen layout stays as-is. Optional but trivial: add a tiny
🎵 icon next to each card title indicating "hover to hear jingle".
Recommend just a `title` attribute on the card with text "Hover to
hear the artist jingle". Don't add icon clutter unless tasteful.

## Definition of Done

- [ ] Home screen shows 7 cards in the order:
      1) Hey Joe, 2) No Woman No Cry, 3) Life by the Drop,
      4) Sweet Home Alabama, 5) Dust in the Wind,
      6) Blowin' in the Wind, 7) Wild World.
- [ ] `scripts/build-assets.sh` has a new step that copies the 7
      JGL-*.WAV files. Re-running the script is idempotent.
- [ ] `public/assets/jingles/jgl-*.wav` (7 files) exist after running
      `npm run assets`.
- [ ] `SongMeta.jingleUrl` is populated for every song.
- [ ] Hovering a card plays the matching jingle. Hovering another
      card interrupts and plays the new one.
- [ ] Clicking a card plays the jingle and navigates to the song.
- [ ] Navigating away from home stops the jingle.
- [ ] All other Phase 7 behaviours intact: hash routing, back
      button, per-song player, all-songs-work-end-to-end.
- [ ] No console errors.
- [ ] `git status` clean; commit message starts `phase 7b:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run assets   (copies 7 JGL files; near-instant since main
                    videos are already converted)
3. npm run dev
4. Open http://localhost:5173/
5. Home screen — 7 cards in this exact order:
   Hey Joe / No Woman, No Cry / Life by the Drop /
   Sweet Home Alabama / Dust in the Wind /
   Blowin' in the Wind / Wild World.
6. Hover mouse over "Hey Joe" card:
   - Short voice jingle plays (Jimi Hendrix introduction sound).
7. Move mouse to "Bob Marley / No Woman" card:
   - Current jingle stops, Marley jingle starts.
8. Move quickly through all 7 cards — jingles preempt each other
   smoothly.
9. Click "Sweet Home Alabama":
   - Lynyrd Skynyrd jingle starts, page navigates to
     /#/song/sweet, Sweet Home Alabama player opens. Jingle
     audio stops (page changed).
10. Click "← Library" → back to home.
11. Stop the dev server.
```

## Reporting

Final report (≤300 words):
1. Demo block, verbatim, first.
2. What was changed (≤5 bullets).
3. Files touched.
4. Jingle file sizes: total `du -sh public/assets/jingles`.
5. Deviations from spec, with reason. "None" if you stuck to it.
6. Known issues / TODOs deferred.
