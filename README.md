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

To replay a daily puzzle, delete the `wordseye:v3:games` key in devtools (Application → Local
Storage) and reload. Delete `wordseye:v3:history` too to clear the stats, or
`wordseye:v3:practice-played` to start practice over.

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
npm run data:fetch     # once: downloads the word vectors (~2.7 GB, ~6.5 GB unpacked)
npm run data:vectors   # once: embeds the vocabulary with BGE and blends the models (~5 min)
npm run data:targets   # optional: propose more target words for review (~5 min)
npm run data:build     # rebuild everything in public/data/ (~5 min)
```

Everything downloaded or generated lands in `scripts/.cache/` (gitignored). The heavy work is
spread over every CPU core.

### The word data

How close two words are comes from a blend of three models, each given equal weight:

- **fastText Common Crawl**: trained on 600 billion words of web pages, so it knows everyday
  writing.
- **ConceptNet Numberbatch**: word vectors corrected by a network of common-sense facts.
- **BGE base**: a modern text-embedding model, run locally on each word on its own.
  `data:vectors` installs it in `scripts/embed/` (its own package, so the site's install stays
  light) and downloads the model (~440 MB) on first use.

Each model has blind spots, and they rarely share them: fastText and Numberbatch can follow the
news ("fox" the TV channel), and BGE can follow spelling ("fox" → "foxtrot"). In a blind test of
48 words, the blend never produced a bad list, where each single model, and GloVe (used until
October 2026), did. Words Numberbatch doesn't know (mostly rare plurals) borrow the vectors of
their other forms there.

### The vocabulary

The 100k most frequent GloVe tokens, kept only if they're lowercase words in the SCOWL dictionary
(size ≤ 60, via `wordlist-english`). That drops proper nouns, abbreviations, numbers and junk.
`blocklist.txt` removes profanity and slurs. About 42,500 words remain, all guessable. Words in
`stopwords.txt` are guessable but never ranked, so they're always cold. GloVe is only used for this
list and its frequency order.

### Forms of a word

Rankings count each word once, whatever its form: plurals, verb forms, comparatives, adverbs and
close derivations ("bee", "bees"; "heavy", "heavier"; "sing", "sang"; "reflect", "reflection"), and
British and American spellings ("colour", "color"). Words count as forms when they share a stem
(or a base, for irregular forms) **and** mean much the same, so "general" and "generous" stay
apart. All forms of a word share its rank, so a target's top 10 is ten different words. See
`scripts/lib/forms.ts`.

### Targets: the secret words

- `targets.txt`: hand-picked (~590).
- `targets-auto.txt`: proposed by `data:targets`, then read and pruned by hand (~1,600).
- `rejected.txt`: never proposed again. These also teach the finder what to avoid.

`data:targets` learns what a good target looks like from the two lists above. It uses a small
classifier on the word vectors, plus closeness to known good and bad words. It considers only
everyday words (SCOWL ≤ 35, frequent, base forms), and gates out words with loose, generic
neighbors or a sports, business, politics, war or computing lean. It keeps the list varied and
requires a good hint. New proposals are **appended** to `targets-auto.txt` under a dated "not yet
reviewed" heading. Delete the ones you don't like, add them to `rejected.txt`, and change the
heading to "reviewed".

### What `data:build` does

1. Ranks the vocabulary by cosine similarity to each target and keeps the top 2,000, counting
   the forms of a word once.
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
  ranked neighbors, with a word's forms together in one entry ("bee bees") (~10 KB gzipped). A
  game loads five.
- `scripts/output/review.md`, every day with its three puzzles: targets, hints, extras and top
  neighbors.

The schedules currently run to **1 December 2027** (427 days from 2,192 targets); the build prints
the end date every time. Before then, add targets (`data:targets`, review, `data:build`) and new
days are appended. A gap needs about 15 × gap different words: with today's targets, 120 days
works and 140 makes the schedules end within months. If the schedules do run out, the game
repeats from day 1 rather than breaking.

`--vectors path/to/file.vec` makes either script use any word2vec-style text file instead of the
blend, such as GloVe's (`scripts/.cache/glove.6B.300d.txt`). Build settings (vocabulary size, hint
commonness, same-game similarity limit, how alike two forms must be) sit at the top of the files
in `scripts/` and `scripts/lib/`.

## Tweaking levels, zones and scoring

Everything lives in [`src/config.ts`](src/config.ts):

| Setting             | Default               | Notes                                                                                         |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `LEVELS`            | easy / medium / hard  | per level: `gameSeconds` (300/180/120), `extraHints` (3/1/0) and the first hint's `hintRanks` |
| `defaultLevel`      | `easy`                | what new players start on                                                                     |
| `extraHintRanks`    | `11–100`              | where extra hint words come from                                                              |
| `levelReuseGapDays` | `120`                 | days before a word can come back on another level                                             |
| `ZONES`             | 10 / 100 / 500 / 2000 | `maxRank`, `points`, label and share emoji per zone (all levels)                              |
| `roundsPerGame`     | `5`                   |                                                                                               |
| `speedBonus`        | up to 25 pts          | full within 8 s of the round starting, fading to 0 at 45 s                                    |
| `timeZone`          | `Europe/Amsterdam`    | the day rolls over at local midnight here                                                     |
| `firstPuzzleDate`   | `2026-10-01`          | the date of puzzle #1; set before launch so the calendar starts full                          |
| `weekStartsOn`      | `1`                   | first calendar column: 1 Monday, 0 Sunday                                                     |
| `skipKey`           | `Escape`              | any `KeyboardEvent.key` value                                                                 |
| `storagePrefix`     | `wordseye:v3`         | bump to reset everyone's saved games and stats                                                |

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
  Forms of a word share a rank: any form of the secret word wins the round, and another form of
  a word already guessed or shown ("bees" after "bee") counts as a repeat.
- **Keyboard:** Enter starts and guesses, Esc skips, and typing anywhere goes into the guess box.
- **Results pop-up:** each round on the results screen opens a pop-up in its zone colour. It
  shows the secret word, your guesses and extra hints, and the closest words grouped by zone. You
  can switch between the top 10, 100, 500 and 2000.
- **Updates:** if the puzzle data on the server is newer than the copy of the game in the
  browser, the page reloads itself once to pick up the new version.
- **Spoilers:** the puzzle files are public, so a determined player can read answers in devtools.
  That's the trade-off for having no backend.

## Credits

Word vectors:

- [fastText](https://fasttext.cc/docs/en/english-vectors.html) Common Crawl vectors, Mikolov,
  Grave, Bojanowski, Puhrsch and Joulin (2018), CC BY-SA 3.0.
- [ConceptNet Numberbatch](https://github.com/commonsense/conceptnet-numberbatch) 19.08, Speer,
  Chin and Havasi (2017), CC BY-SA 4.0.
- [BGE base en v1.5](https://huggingface.co/BAAI/bge-base-en-v1.5), Xiao, Liu, Zhang and
  Muennighoff (2023), MIT, run with [Transformers.js](https://github.com/huggingface/transformers.js).
- [GloVe](https://nlp.stanford.edu/projects/glove/) 6B, Pennington, Socher and Manning (2014), ODC
  Public Domain Dedication and License: the vocabulary and its frequency order.

The puzzle files in `public/data/` are derived from the fastText and Numberbatch vectors, so they
are shared under CC BY-SA 4.0 too. Dictionary:
[SCOWL](http://wordlist.aspell.net/) via
[`wordlist-english`](https://github.com/jacksonrayhamilton/wordlist-english). Fonts: Fredoka and
Nunito from Google Fonts.
