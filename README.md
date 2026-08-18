# CLF-C02 Drill

An AWS Certified Cloud Practitioner question bank and study-notes app that
compiles to **one static HTML file** with no runtime dependencies and no
network calls.

```
src/template.html        markup, styles, and all app logic (with two data placeholders)
src/data/questions.json  1,297 questions — 23 practice sets + 155 service scenarios
src/data/review.json     155 study notes and 30 easily-confused comparison groups
build.mjs                validates the data, inlines it, writes dist/index.html
test/integrity.mjs       checks the built file: counts, self-containment, contrast
test/ui.mjs              drives the app in jsdom through the real user journeys
```

`dist/` is generated and git-ignored. The built file is never committed.

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

## Answer-key audit

The 1,142 questions from the public repo are community-collected, so the keys
are not authoritative. Every one of them has now been checked.

| Check | Coverage | Result |
| --- | --- | --- |
| Structural — key points at a real option, no duplicate or blank options, "choose two" matches the key size, no letter skew per set | 1,297 / 1,297 | clean |
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

To record another finding, add an entry to `corrections.json`. The build refuses
to run if `from` no longer matches the bank, so a correction can never quietly
apply to a question that has since changed.

## Changing content

| To change | Edit |
| --- | --- |
| A question, an answer key, a domain tag | `src/data/questions.json` |
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
