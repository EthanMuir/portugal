# portugal

A Cloudflare Worker with static assets — no build step, no framework, no `package.json`.

- `public/index.html` is the site. Open it normally to view the scrapbook, or with `?edit` to launch the built-in editor.
- `public/photos.json` is the fallback published data (captions, page layout, cover text); once the Worker is deployed, the live published data is served from R2 instead.
- `src/index.js` is the Worker: it serves photos and `photos.json` from R2, proxies everything else to the static assets, and exposes the `/api/*` endpoints the editor uses to upload photos and publish.
- `wrangler.jsonc` configures the Worker, the static assets directory, and the `PHOTOS` R2 bucket binding.
- Photos live in the `PHOTOS` R2 bucket, not in this repo.
