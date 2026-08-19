# CLF-C02 Drill

An AWS Certified Cloud Practitioner question bank and study-notes app that
compiles to **one static HTML file** with no runtime dependencies and no
network calls.

```
src/template.html        markup, styles, and all app logic (with two data placeholders)
src/data/questions.json  1,141 questions across 23 community practice sets + 155 service scenarios
src/data/exam-style.json set 24 — 30 original questions, each with a rationale per option
src/data/explanations.json hand-written rationales for questions the glossary can't reach
tools/next-batch.mjs      lists the questions still missing a rationale, worst first
src/data/review.json     155 study notes and 30 easily-confused comparison groups
build.mjs                validates the data, inlines it, writes dist/index.html
test/integrity.mjs       checks the built file: counts, self-containment, contrast
test/ui.mjs              drives the app in jsdom through the real user journeys
```

`dist/` is generated and git-ignored. The built file is never committed.

`build.mjs` looks for its four inputs in `src/` and `src/data/` first, and falls
back to the repo root. That matters because uploading through the GitHub web UI
flattens folders unless you drag the whole directory — either layout builds.

## Local

```bash
node build.mjs   # no dependencies needed — writes dist/index.html

npm ci           # only for the tests
npm run check    # build + both test suites
```

`node build.mjs` alone produces `dist/index.html` and needs nothing installed. Open it in a browser — that
is exactly what gets deployed.

## How deploys work

Render is connected to this repo. **Pushing to `main` is the entire deploy
process.** You never upload a file and you never re-sync the Blueprint.

```
git push origin main  ─►  Render runs `node build.mjs`, publishes dist/   (~30 s)
```

There is no CI pipeline. `autoDeployTrigger: commit` means Render deploys every
push immediately. If a push contains bad data the build fails on Render, the
deploy is cancelled, and the previous version keeps serving — so a broken
question file still cannot take the site down. It just means you find out on
Render instead of in a pull request.

Before pushing, run `npm run check` locally to catch it earlier.

### Turning CI back on later

Add a GitHub Actions workflow that runs `npm ci && npm run check`, then change
`autoDeployTrigger` to `checksPass`. Note the catch: with `checksPass`, Render
deploys only when it detects at least one check **and** all of them pass. If a
commit produces no checks at all, nothing deploys.

### When you need to touch the Blueprint

Only when `render.yaml` itself changes — a new header, a different publish path,
a renamed service. Changing questions, styling, or app logic never requires it.

## Duplicates and missing options

Two structural problems came out of the upstream markdown and are now fixed and
guarded:

- **Options swallowed into the stem.** Two questions had option A written on the
  same line as the question, so the parser folded it into the stem and the
  question shipped with only B, C and D. Both are repaired. The whole bank was
  then re-parsed from the original markdown and compared option by option —
  every one of the 1,141 remaining questions matches its source exactly.
- **A set asking the same question twice.** Set 15 contained the edge-locations
  question at both Q9 and Q18. The second copy is removed and the set renumbered
  to 49 questions.

168 stems still appear in more than one *different* set, which is how the
upstream repo is. Those stay — a set should match its source file — but each
group carries a `g` tag, and the random modes (exam simulation, domain drill,
mistakes) filter on it, so a single round never asks the same thing twice.

The build fails on a repeat inside a set, on an option marker stuck in a stem,
on option letters with a gap, and on a shared stem that is missing its group tag.

## Answer-key audit

The 1,142 questions from the public repo are community-collected, so the keys
are not authoritative. Every one of them has now been checked.

| Check | Coverage | Result |
| --- | --- | --- |
| Structural — key points at a real option, options run A–N with none swallowed into the stem, no duplicate or blank options, "choose two" matches the key size, no repeat within a set | 1,296 / 1,296 | 3 defects found and fixed |
| 168 stems that appear in more than one set, compared by **answer text** | all | 1 self-contradiction |
| 47 rules asserting a known-correct service for a stem pattern | all | 15 flags, all false positives on review |
| **Hand review, question by question** | **972 / 972 unique stems** | **11 wrong keys, 9 arguable** |
| Hand review of the generated service scenarios | 155 / 155 | no errors |

`src/data/corrections.json` holds all 20 findings with the reasoning for each.
Eleven change the key; nine only attach a note. Both kinds show up in the app
under the answer, so nothing is corrected silently.

Where the errors were:

- 5 in shared responsibility and compliance — the single most error-prone topic
  in this bank, and the one where the wrong answer is most likely to stick
- 3 in cloud-concept vocabulary — elasticity vs scalability, what counts as a
  benefit of the cloud, multi-AZ vs multi-Region for "highest" fault tolerance
- 2 in cost tooling — Cost Explorer being keyed for estimating a project that
  does not exist yet
- 1 in security services — CloudWatch keyed where the stem is lifted word for
  word from the AWS WAF documentation

Four of the eleven were caught because the same question appears elsewhere in
the bank with a different key. Six of the nine disputes are wording problems
rather than knowledge problems; two are questions that were correct when written
and have since been overtaken by AWS policy changes (penetration testing).

### Set 24 — written for this app

Sets 1–23 come from the community repo and mostly give you a link at best. Set
24 is 30 questions written from scratch, in the shape the official practice
questions take: a short scenario, then **a rationale under every option** saying
why it is right or why it is wrong, plus one line naming the idea being tested.

It covers the four exam domains (5 / 8 / 9 / 8 questions) and leans on the two
areas that are easiest to get wrong: purchase options and support plans, and
where the shared responsibility line falls.

The build enforces the format — every option must carry a rationale of real
length, the keyed option's rationale must begin by confirming it, and no
distractor may claim to be correct. Getting that wrong fails the build.

Nothing in this set is copied from AWS's official practice questions or any
other paid question bank. Concepts are not copyrightable; wording is.

### Explanations

Three layers sit under a checked answer, in order of quality:

1. **Hand-written rationales** in `explanations.json` — a line per option saying
   why it is right or wrong. Entries may be partial: write only the options the
   glossary cannot reach and it fills the rest. 323 questions carry these today.
2. **The built-in glossary** — 474 entries. When an option names a service or a
   concept, its note explains what that thing is and when it is the right answer.
3. **The source notes** from the community repo, shown underneath where they exist.

Coverage stands at **92.1% of all options** and **1,109 of 1,326 questions explained
end to end**. Two whole domains are complete — billing, pricing and support, and
security and compliance — with a line under every option of every question. Both
are enforced by a test, so a new question in either domain cannot ship bare. What
remains is 92 questions in cloud concepts and 125 in technology and services,
about 440 bare options.

Closing that gap is writing, not coding. `node tools/next-batch.mjs 25` prints
the worst offenders with their options and any glossary match, ready to write
against. Add entries to `explanations.json` keyed by question id. The build
enforces the format: no stub lines, a keyed option's line must begin with
"Correct" if it has one, and no distractor may claim to be correct. Set 24 is
held to a stricter rule — it must explain every option and carry a key insight.

### Duplicates

Set 15 asked the same question at Q9 and Q18 — one copy is gone, and the build
now refuses to run if any set repeats a stem. No set repeats a question, and set
24 does not restate anything already asked in sets 1–23. The bank stands at
1,326 questions.

168 stems are shared *between* sets, which is normal for this source and is left
alone: each practice set stays complete. Instead the build stamps a group id on
matching stems, and the random modes (exam simulation, domain drill, mistakes)
skip a question whose twin has already been drawn. A 65-question simulation
therefore asks 65 different things. Both the data rule and the round behaviour
are covered by tests.

To record another finding, add an entry to `corrections.json`. The build refuses
to run if `from` no longer matches the bank, so a correction can never quietly
apply to a question that has since changed.

## Changing content

| To change | Edit |
| --- | --- |
| A question, an answer key, a domain tag | `src/data/questions.json` |
| An original question with full rationales | `src/data/exam-style.json` |
| A key correction or a disputed-key note | `src/data/corrections.json` |
| A study note or a comparison group | `src/data/review.json` |
| Layout, colours, modes, logic | `src/template.html` |

The build refuses to produce a file when the data is wrong — an answer key that
points at a missing option, a duplicate id, a "choose two" question with three
answers, stray HTML in a stem, a bad domain number. It prints the offending
question numbers and exits 1, which fails the Render build and cancels the
deploy. That
is why a typo in a JSON file cannot quietly reach the live site.

## First-time Render setup

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo → Apply.
3. Confirm **Settings → Build & Deploy → Auto-Deploy** is on.

Static sites are free on Render and do not spin down, so there is no cold start.
Do not add `plan:` to `render.yaml` — static sites have no instance type and
Render rejects the Blueprint with `no such plan free for service type web`.

## Saving progress

Progress lives in the browser's `localStorage`, so it is per-device. The footer
has **Export / Import progress** for moving it by hand, and an optional
**Sync through GitHub** panel that keeps a secret Gist in your account. That
sync is the only thing in the app that ever touches the network, and only after
you enter a token.
