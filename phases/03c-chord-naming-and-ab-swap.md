# Phase 3c — Modern Chord Notation + A/B Swap Fix

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Two small fixes to Phase 3b output:
> 1. Display chord names using modern subscript notation (e.g. C₃, G₃)
>    instead of the original CD's `Go` / `C_3` / `MI 7ème mineure`.
> 2. Fix the A↔B inversion bug — auto-swap when A > B.

## Context

Personal-use web app for learning guitar. Stack: Vite + TypeScript +
vanilla DOM. Working directory: `/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats; §3.3 (CHD chord database)
   is most relevant. Note that CHD chord `name` field uses non-standard
   notation: `Go` for G-open, `C_3` for "C barred at 3rd fret", etc.
2. `../ROADMAP.md` — overall plan.
3. Prior phase specs `00`, `01`, `02`, `02b`, `02c`, `03`, `03b`.

Current state: chord names like `Go`, `C_3`, `G_3`, `D_5`, `A_5`,
`E_7`, `E7#9` show literally in the UI alongside French comments
(e.g. `Go (SOL ouvert)`, `C_3 (DO barré 3ème case)`). The user finds
this unreadable and wants standard guitar-app notation.

## Issue 1 — Modern chord notation

### Mapping rules

For each `Chord.name` from CHD, derive a `displayName`:

1. **`Go` → `G`** (special case: "G open")
2. **Pattern `<NAME>_<N>` → `<NAME><subscript N>`**, e.g.
   `C_3` → `C₃`, `G_3` → `G₃`, `D_5` → `D₅`, `A_5` → `A₅`, `E_7` → `E₇`.
   - Use Unicode subscript characters: ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉.
   - Map: `0123456789` → `₀₁₂₃₄₅₆₇₈₉`.
3. **Names without `_` and not `Go`** are passed through unchanged
   (so `C`, `D`, `A`, `E`, `E7#9` stay as they are).

Implementation — add a tiny helper in `src/parsers/chd.ts` (or a new
`src/util/chord-name.ts`, your choice):

```ts
const SUBS = "₀₁₂₃₄₅₆₇₈₉";
function toSubscript(s: string): string {
  return s.replace(/\d/g, (d) => SUBS[+d]!);
}

export function displayChordName(name: string): string {
  if (name === "Go") return "G";
  const m = /^([A-G][#b]?)_(\d+)$/.exec(name);
  if (m) return m[1]! + toSubscript(m[2]!);
  return name;
}
```

### Where to use the helper

Replace **every** UI place that renders `chord.name` with
`displayChordName(chord.name)`:

- All-chords row buttons in side panel (`btn.textContent = …`).
- NOW preview name (`now-name`).
- NEXT preview name (`next-name`).
- Any other place you find (search the codebase for `chord.name` and
  `\.name\b` references in `main.ts`).

### Drop the French comment from the rendered name

Currently NOW/NEXT name text is:
`${chord.name}${chord.comments ? ` (${chord.comments})` : ""}`

Change to: just `displayChordName(chord.name)`. Don't show the French
comment at all (`(DO)`, `(SOL ouvert)`, `(MI 7ème mineure)` — drop
all of them).

Don't delete the `comments` field from the parser — leave the data
intact in the typed `Chord` for any future use. Just stop displaying
it in Phase 3c.

### What does NOT need to change

- The CHD parser still parses `name` and `comments` as before; only
  the *display* changes.
- WAV file paths, `sound` field, `picRect` etc. are unchanged.
- Chord mapping by `id` (from `score.events[].chord`) is unchanged.
- The `rgbHighlight` for NOW border is unchanged.

## Issue 2 — A↔B inversion bug

### Repro

1. Loop is unset (A = null, B = null).
2. Cursor at song start (e.g. bar 1).
3. User presses `Shift+[` (intends to shrink A, but A is unset).
   Current behaviour: A gets primed and then shifted, ending up at
   bar 3 (or some bar later than the cursor).
4. User presses `]`. Current behaviour: B is primed at bar 1
   (nearest bar to cursor), even though A is already at bar 3.
5. Result: A=3, B=1 — invalid (A > B).

### Fix policy: **always swap when A > B**

After any operation that changes A or B (priming, single-bar shift,
manual click on A/B button, "Loop here" — every place A or B mutates),
**check** whether both are set and `aPixel > bPixel`. If so, **swap
them** (the smaller goes to A, the larger goes to B).

Reasoning: simpler than refusal, more forgiving, matches user's
intuition that the loop covers the region between the two markers
regardless of which key set which.

Implementation: in `main.ts`, add a single function:
```ts
function normaliseAB(): void {
  if (aPixel !== null && bPixel !== null && aPixel > bPixel) {
    const tmp = aPixel;
    aPixel = bPixel;
    bPixel = tmp;
  }
}
```

Call `normaliseAB()` at the **end** of:
- `setAtCurrent("a"|"b")` (manual A/B button click)
- `shiftLoopBoundary("A"|"B", direction)` (keyboard `[`/`]` and Shift+`[`/`]`)
- `clearAB()` (no-op, but safe)
- "Loop here" handler

Then call `updateMarkersUI()` afterwards (existing pattern).

### Shrinking still has its own guard

The existing Shift+`[`/`]` "shrink past the other boundary" guard
should stay — `Shift+]` should not move B further left than A's
current position (otherwise both could end up at the same bar with
zero-width loop, which is degenerate). If it would, refuse the move.
Same for `Shift+[`.

The swap policy and the shrink-guard work together cleanly:
- Expansion (`[` toward start, `]` toward end) → can never cause
  inversion of an existing valid loop. Only matters during *priming*,
  where swap handles it.
- Shrinking (Shift+) → refused if it would touch/cross the other side.

## Definition of Done

- [ ] `displayChordName()` helper exists and is used consistently in
      every UI render of a chord name.
- [ ] All-chords row shows: `C`, `G`, `D`, `A`, `E`, `C₃`, `G₃`, `D₅`,
      `A₅`, `E₇`, `E7#9`.
- [ ] NOW and NEXT show the same modernised names. NO French comments
      in the display.
- [ ] CHD parser still loads 11 chords; `chord.comments` field is
      still present in the typed `Chord` (just unused for display).
- [ ] Repro from Issue 2 no longer happens: pressing `Shift+[` then
      `]` from a fresh state at bar 1 results in A and B in the
      correct ascending order (e.g. A=bar 1, B=bar 3 after swap).
- [ ] `Shift+]` still refuses to move B past A; `Shift+[` still
      refuses to move A past B (no zero-width or inverted loops).
- [ ] All Phase 3 / 3b features work: speed slider + presets + hotkeys
      + Loop here + manual buttons + Clear.
- [ ] No errors / warnings in browser console.
- [ ] `git status` clean; commit message starts `phase 3c:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Side panel "All chords" row should now show:
   C  G  D  A  E  C₃  G₃  D₅  A₅  E₇  E7#9
   (subscript fret numbers; no `Go`, no underscores, no French)
5. Press play; when first chord change happens NOW shows e.g. "E"
   (not "E (MI)") and NEXT shows e.g. "D" or whichever next chord
   without French comment.
6. Reset (refresh page or press C). At fresh state with cursor at
   start:
   - Press Shift+[ (which used to corrupt A). Then press ].
   - Result: both A and B are set, A < B (e.g. A=bar 1, B=bar 3).
   - Loop button is enabled (no longer disabled because of inversion).
7. Test plain `[` / `]` priming: refresh, then press [ → A primed,
   press ] → B primed. Verify A < B.
8. Edge case: cursor in middle of song. Set A and B both via
   buttons, then click A button while paused at a position later than
   B. Result: after click, A and B should be in ascending order
   (the new value goes to whichever side keeps A < B; effectively a
   swap if needed).
9. Stop the dev server.
```

## Reporting

Final report (≤300 words):
1. Demo block, verbatim, first.
2. What was changed (≤6 bullets).
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
