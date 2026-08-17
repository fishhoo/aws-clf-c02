# CLF-C02 Drill — deploying to Render

A single static file. No build step, no server, no database.

## What "saving results" means here

Once this is served over `https://`, the app writes your progress to the
browser's **localStorage**. That means:

- Progress survives closing the tab, closing the browser, and restarting the machine.
- Progress is tied to **one browser on one device**. Your laptop and your phone
  keep separate scores.
- Clearing site data, or using a private window, wipes it.

To move progress between devices, use **Export progress** at the bottom of the
home screen and **Import progress** on the other device. The export is a small
JSON file.

If you need one shared score across devices, that requires a real backend — see
the last section.

## Deploy (Blueprint)

1. Put `index.html` and `render.yaml` in a Git repo and push to GitHub.
2. In Render: **New → Blueprint**, pick the repo, apply.
3. You get `https://clf-c02-drill.onrender.com`.

## Deploy (no Blueprint)

1. Push `index.html` to a repo.
2. Render: **New → Static Site**, pick the repo.
3. Leave **Build Command** empty. Set **Publish Directory** to `.`
4. Create.

Static sites on Render's free tier do not spin down, so there is no cold start.

## Notes

- The `routes` rewrite in `render.yaml` sends every path to `index.html`, so a
  stray URL like `/exam/3` still loads the app instead of a 404.
- `Cache-Control: must-revalidate` on `index.html` means a redeploy reaches you
  immediately instead of serving a stale cached copy.
- Nothing in the app calls out to the network, so it also works from a phone in
  airplane mode once the page has loaded, and it works if you just open
  `index.html` from disk.

## If you actually need cross-device sync

You would need a Render **Web Service** (not a static site) plus a database:

- a small Node/Express app serving the same HTML,
- `POST /progress` and `GET /progress` endpoints,
- Render Postgres or a Key Value instance for storage,
- some way to identify you — even a hardcoded token would do for personal use.

That is an afternoon of work and a free Postgres instance on Render expires
after 30 days. Export/Import covers the same need with no moving parts.
