# Wordseye

A quick daily word-association game. Each round shows a hint word; a secret word hides close to
it. Every guess gets a rank (how close it is to the secret among ~42,000 words), and anything in
the top 10 is a bullseye that moves you straight on. Five rounds, one shared 2½-minute clock.
Past puzzles stay playable from a calendar.

Static site: Vite, TypeScript (strict), Preact with `@preact/signals`, plain CSS. All semantic data
is precomputed offline, so the browser only does dictionary lookups.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run build        # type-check, then build to dist/
npm run preview      # serve dist/ locally
npm run lint         # ESLint
npm run format       # Prettier
```

`dist/` is plain static files with relative paths: upload it to any static host or subfolder.
The generated puzzles are already in `public/data/`, so none of the data steps below are needed
just to play or deploy.

### Deploying (GitHub Pages)

`.github/workflows/deploy.yml` lints, tests, builds and publishes the site on every push to
`main`. One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. The site then lives at `https://<your-user>.github.io/<repo-name>/`.

### Addresses

| URL         | Shows                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| `./`        | today's puzzle                                                          |
| `?calendar` | every past puzzle, a month at a time, coloured by how you did           |
| `?day=12`   | puzzle #12 (today's or a future day falls back to today's)              |
| `?practice` | practice games: never saved or counted, made of words dailies never use |

Practice is meant for testing: it's linked only in development builds, though the URL works
everywhere. Each practice game is one you haven't had yet (remembered in localStorage), and
**Play another** on its results screen has focus, so Enter starts the next one.

To replay a daily puzzle, delete the `wordseye:v2:games` key in devtools (Application → Local
Storage) and reload. Delete `wordseye:v2:history` too to clear the stats, or
`wordseye:v2:practice-played` to start practice over.

## Project layout

```
src/config.ts      every gameplay knob (see "Tweaking" below)
src/game/          pure, framework-free logic: rounds, clock, scoring, guess rules, stemming,
                   daily schedule, calendar grid, practice picks, share text, stats; tested
src/data/          fetching puzzle files, and localStorage (validated, never throws)
src/ui/            Preact components; state.ts holds every signal and action, route.ts the URLs
src/styles/        tokens.css (colours, type, motion) and the global/screen styles
scripts/           offline puzzle generation (see below)
scripts/data/      word lists you edit, and schedule.txt
public/data/       generated output served to the browser
```

## Puzzle data

```sh
npm run data:fetch     # once: downloads GloVe 6B (~860 MB zip), extracts the 300d file (~1 GB)
npm run data:targets   # optional: propose more target words for review (~30 s)
npm run data:build     # rebuild everything in public/data/ (~20 s)
```

The vector files land in `scripts/.cache/` (gitignored). Both scripts spread the heavy work over
every CPU core.

### The vocabulary

The 100k most frequent GloVe tokens, kept only if they're lowercase words in the SCOWL dictionary
(size ≤ 60, via `wordlist-english`). That drops proper nouns, abbreviations, numbers and junk.
`blocklist.txt` removes profanity and slurs. About 42,500 words remain, all guessable. Words in
`stopwords.txt` are guessable but never ranked, so they're always cold.

### Targets: the secret words

- `targets.txt`: hand-picked (~470).
- `targets-auto.txt`: proposed by `data:targets`, then read and pruned by hand (~1,200).
- `rejected.txt`: never proposed again. These also teach the finder what to avoid.

`data:targets` learns what a good target looks like from the two lists above. It uses a small
classifier on the word vectors, plus closeness to known good and bad words. It considers only
everyday words (SCOWL ≤ 35, frequent, base forms), and gates out words with loose, generic
neighbors or a sports, business, politics, war or computing lean. It keeps the list varied and
requires a good hint. New proposals are **appended** to `targets-auto.txt` under a dated "not yet
reviewed" heading. Delete the ones you don't like, add them to `rejected.txt`, and change the
heading to "reviewed".

### What `data:build` does

1. Ranks the vocabulary by cosine similarity to each target and keeps the top 2,000.
2. Picks a hint from ranks 20–80. It skips the target's own variants (same stem), anything in
   `hint-avoid.txt`, and words whose family already appears higher up. Among the rest it prefers
   everyday words whose own neighbor list points back at the target. That screens out generic
   words like "away" that sit near everything. A new target whose best hint is still weak is
   skipped.
3. Splits targets into two pools for good, by a hash of the word: three in four go to dailies,
   one in four to practice. Practice can then never spoil a daily.
4. **Appends** new days to `scripts/data/schedule.txt` (`day: five words`) from daily targets
   not yet scheduled. Similar targets, or a target and another's hint, never share a day.
   Existing days are never changed, since they may be published. You can still edit future days
   by hand.
5. Deals the practice pool into games four times over, each time in a new mix.

It writes:

- `public/data/manifest.json` naming the current vocabulary and index files.
- `public/data/vocab.<hash>.txt` (~115 KB gzipped) and `public/data/index.<hash>.json` (the
  schedule and practice games as word ids). Both are content-hashed, so they can be cached for
  good.
- `public/data/words/<id>.json`, one per target: its hint and ranked neighbors (~8 KB gzipped).
  A game loads five.
- `scripts/output/review.md`, every day with dates, targets, hints and neighbors. ⚠ marks a hint
  that points back only weakly; those are worth a look.

The schedule currently runs to **7 June 2027**; the build prints the end date every time. Before
then, add targets (`data:targets`, review, `data:build`) and new days are appended. If it does
run out, the game repeats the schedule from day 1 rather than breaking.

`--vectors path/to/file.vec` makes either script use any word2vec-style text file instead, such
as fastText `wiki-news-300d-1M.vec`. Build settings (vocabulary size, hint window, practice share,
same-day similarity limit) sit at the top of the files in `scripts/` and `scripts/lib/`.

## Tweaking zones, timer and scoring

Everything lives in [`src/config.ts`](src/config.ts):

| Setting           | Default               | Notes                                                                |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| `ZONES`           | 10 / 100 / 500 / 2000 | `maxRank`, `points`, label and share emoji per zone                  |
| `gameSeconds`     | `150`                 | the one clock shared by all rounds                                   |
| `roundsPerGame`   | `5`                   |                                                                      |
| `speedBonus`      | up to 25 pts          | full within 8 s of the round starting, fading to 0 at 45 s           |
| `timeZone`        | `Europe/Amsterdam`    | the day rolls over at local midnight here                            |
| `firstPuzzleDate` | `2026-10-01`          | the date of puzzle #1; set before launch so the calendar starts full |
| `weekStartsOn`    | `1`                   | first calendar column: 1 Monday, 0 Sunday                            |
| `skipKey`         | `Escape`              | any `KeyboardEvent.key` value                                        |
| `storagePrefix`   | `wordseye:v2`         | bump to reset everyone's saved games and stats                       |

Zone points, rank limits and timing take effect on the next page load. Two changes also need a
`npm run data:build`: the last ranked zone's `maxRank` (it sets how many neighbors each word
file stores), and `roundsPerGame`. Changing `roundsPerGame` also means starting a new
`schedule.txt`, which is only safe before launch. Keep the hint window (20–80 in
`scripts/lib/hints.ts`) between the bullseye limit and the hot limit.

Colours, fonts, radii and motion timings are CSS variables in
[`src/styles/tokens.css`](src/styles/tokens.css), with a dark palette under
`prefers-color-scheme: dark`.

## Behaviour notes

- **Persistence:** every daily game, today's or from the calendar, is saved to localStorage after
  each move. The clock is wall-clock based, so a reload restores your guesses but doesn't pause
  time. A finished game shows its results again. Stats (played, average, best, bullseye rate)
  include calendar games. If storage is blocked, the game still plays; it just doesn't remember.
- **Calendar:** played days are tinted by the zone matching your average points per round, with
  the score written under the date. Days before puzzle #1 and after today can't be opened.
- **Guess rules:** input is trimmed, lowercased and stripped of accents. Words outside the
  vocabulary don't count. The hint and its variants are rejected (Porter stemming plus a few
  derivational endings: value / values / valued / valuable), and so are repeats within a round.
- **Keyboard:** Enter starts and guesses, Esc skips, and typing anywhere goes into the guess box.
- **Results pop-up:** each round on the results screen opens a pop-up in its zone colour. It
  shows the secret word, your guesses, and the closest words grouped by zone. You can switch
  between the top 10, 100, 500 and 2000, and words you guessed are highlighted.
- **Spoilers:** the puzzle files are public, so a determined player can read answers in devtools.
  That's the trade-off for having no backend.

## Credits

Word vectors: [GloVe](https://nlp.stanford.edu/projects/glove/) 6B, Pennington, Socher and
Manning (2014), released under the ODC Public Domain Dedication and License. Dictionary:
[SCOWL](http://wordlist.aspell.net/) via
[`wordlist-english`](https://github.com/jacksonrayhamilton/wordlist-english). Fonts: Fredoka and
Nunito from Google Fonts.
