# Wordseye

A quick daily word-association game. Each round shows a hint word; a secret word hides close to
it. Every guess gets a rank (how close it is to the secret among ~42,000 words), and anything in
the top 10 is a bullseye that moves you straight on. Five rounds on one shared clock, with a
fresh puzzle every day on three levels: **Easy**, **Medium** and **Hard**. Past puzzles stay
playable from a calendar.

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

| URL                  | Shows                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `./`                 | today's puzzle, on the level last played here (Easy for newcomers)  |
| `?level=hard`        | today's puzzle on a given level                                     |
| `?day=12&level=easy` | puzzle #12 (today's or a future day falls back to today's)          |
| `?calendar`          | every past day, with a dot per level coloured by how you did        |
| `?practice`          | past puzzles back to back, on the picked level, never saved/counted |

Practice is meant for testing: it's linked only in development builds, though the URL works
everywhere. Each practice game is a past day you haven't had in practice yet (remembered in
localStorage), and **Play another** on its results screen has focus, so Enter starts the next.

To replay a daily puzzle, delete the `wordseye:v2:games` key in devtools (Application → Local
Storage) and reload. Delete `wordseye:v2:history` too to clear the stats, or
`wordseye:v2:practice-played` to start practice over.

## Project layout

```
src/config.ts      every gameplay knob (see "Tweaking" below)
src/game/          pure, framework-free logic: levels, rounds, clock, extra hints, scoring,
                   guess rules, stemming, daily schedule, calendar grid, share text, stats; tested
src/data/          fetching puzzle files, and localStorage (validated, never throws)
src/ui/            Preact components; state.ts holds every signal and action, route.ts the URLs
src/styles/        tokens.css (colours, type, motion) and the global/screen styles
scripts/           offline puzzle generation (see below)
scripts/data/      word lists you edit, and the three schedule-<level>.txt files
public/data/       generated output served to the browser
```

## Puzzle data

```sh
npm run data:fetch     # once: downloads GloVe 6B (~860 MB zip), extracts the 300d file (~1 GB)
npm run data:targets   # optional: propose more target words for review (~30 s)
npm run data:build     # rebuild everything in public/data/ (~45 s)
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
2. Picks hints, skipping the target's own variants (same stem), anything in `hint-avoid.txt`,
   words whose family already appears closer to the target, and each other's families:
   - **Medium**, ranks 20–80: the everyday word whose own neighbor list points back hardest at
     the target. That screens out generic words like "away" that sit near everything.
   - **Easy**, ranks 11–25: the same rule, closer in.
   - **Hard**, ranks 100–300: very common words, ranked both by pointing back and by fitting the
     topic of the target's nearest words. Far out, either test alone lets in odd or bland words.
   - **Extra hints**: three more words from ranks 11–100 that point back well.
3. **Appends** new days to `scripts/data/schedule-<level>.txt` (`day: five words`). Each word is
   used at most once per level. It comes back on another level, with that level's hint, only
   after `levelReuseGapDays`. Easy draws the easiest words first (common, tightly clustered, hand
   picked), hard the hardest. Similar targets, or a target and another's hint, never share a game.
   Existing days are never changed, since they may be published.

It writes:

- `public/data/manifest.json` naming the current vocabulary and index files.
- `public/data/vocab.<hash>.txt` (~115 KB gzipped) and `public/data/index.<hash>.json` (each
  level's schedule as word ids). Both are content-hashed, so they can be cached for good.
- `public/data/words/<id>.json`, one per target: its hint per level, the extra hint words and the
  ranked neighbors (~8 KB gzipped). A game loads five.
- `scripts/output/review.md`, every day with its three puzzles: targets, hints, extras and top
  neighbors.

The schedules currently run to **23 August 2027**; the build prints the end date every time.
Before then, add targets (`data:targets`, review, `data:build`) and new days are appended. With
1,680 words and 15 a day, the reuse gap can't go above about 110 days: any gap that long needs
15 × gap different words. If the schedules do run out, the game repeats from day 1 rather than
breaking.

`--vectors path/to/file.vec` makes either script use any word2vec-style text file instead, such
as fastText `wiki-news-300d-1M.vec`. Build settings (vocabulary size, hint commonness, same-game
similarity limit) sit at the top of the files in `scripts/` and `scripts/lib/`.

## Tweaking levels, zones and scoring

Everything lives in [`src/config.ts`](src/config.ts):

| Setting             | Default               | Notes                                                                                         |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `LEVELS`            | easy / medium / hard  | per level: `gameSeconds` (300/180/120), `extraHints` (3/1/0) and the first hint's `hintRanks` |
| `defaultLevel`      | `easy`                | what new players start on                                                                     |
| `extraHintRanks`    | `11–100`              | where extra hint words come from                                                              |
| `levelReuseGapDays` | `90`                  | days before a word can come back on another level                                             |
| `ZONES`             | 10 / 100 / 500 / 2000 | `maxRank`, `points`, label and share emoji per zone (all levels)                              |
| `roundsPerGame`     | `5`                   |                                                                                               |
| `speedBonus`        | up to 25 pts          | full within 8 s of the round starting, fading to 0 at 45 s                                    |
| `timeZone`          | `Europe/Amsterdam`    | the day rolls over at local midnight here                                                     |
| `firstPuzzleDate`   | `2026-10-01`          | the date of puzzle #1; set before launch so the calendar starts full                          |
| `weekStartsOn`      | `1`                   | first calendar column: 1 Monday, 0 Sunday                                                     |
| `skipKey`           | `Escape`              | any `KeyboardEvent.key` value                                                                 |
| `storagePrefix`     | `wordseye:v2`         | bump to reset everyone's saved games and stats                                                |

Clocks, extra hint counts, zone points and timing take effect on the next page load. These need
a `npm run data:build`: `hintRanks`, `extraHintRanks`, the last ranked zone's `maxRank` (it sets
how many neighbors each word file stores), and `roundsPerGame`. Changing published days' hints or
`roundsPerGame` means starting the schedules over, which is only safe before launch. Keep every
first-hint window outside the bullseye zone (ranks 11 and up).

Colours, fonts, radii and motion timings are CSS variables in
[`src/styles/tokens.css`](src/styles/tokens.css), with a dark palette under
`prefers-color-scheme: dark`.

## Behaviour notes

- **Levels:** each day has an Easy, a Medium and a Hard puzzle with different secret words. The
  start and results screens let you switch, show how you did on each, and finishing a level
  suggests the next one up.
- **Extra hints:** Easy gets 3 and Medium 1, to spend over the whole game. Each reveals the
  round's next extra word and its rank, shown among your guesses. Hint words don't count towards
  your score, and you can't guess them for credit.
- **Persistence:** every daily game, today's or from the calendar, on any level, is saved to
  localStorage after each move. The clock is wall-clock based, so a reload restores your guesses
  but doesn't pause time. A finished game shows its results again. Stats (played, average, best,
  bullseye rate) are kept per level and include calendar games. Games saved before levels existed
  count as Medium. If storage is blocked, the game still plays; it just doesn't remember.
- **Calendar:** each day shows a dot per level, coloured by the zone matching your average points
  per round. Days before puzzle #1 and after today can't be opened.
- **Guess rules:** input is trimmed, lowercased and stripped of accents. Words outside the
  vocabulary don't count. The hint and its variants are rejected (Porter stemming plus a few
  derivational endings: value / values / valued / valuable), and so are repeats within a round.
- **Keyboard:** Enter starts and guesses, Esc skips, and typing anywhere goes into the guess box.
- **Results pop-up:** each round on the results screen opens a pop-up in its zone colour. It
  shows the secret word, your guesses and extra hints, and the closest words grouped by zone. You
  can switch between the top 10, 100, 500 and 2000.
- **Updates:** if the puzzle data on the server is newer than the copy of the game in the
  browser, the page reloads itself once to pick up the new version.
- **Spoilers:** the puzzle files are public, so a determined player can read answers in devtools.
  That's the trade-off for having no backend.

## Credits

Word vectors: [GloVe](https://nlp.stanford.edu/projects/glove/) 6B, Pennington, Socher and
Manning (2014), released under the ODC Public Domain Dedication and License. Dictionary:
[SCOWL](http://wordlist.aspell.net/) via
[`wordlist-english`](https://github.com/jacksonrayhamilton/wordlist-english). Fonts: Fredoka and
Nunito from Google Fonts.
