# Free AI for every visitor (AI relay)

This folder contains a small Cloudflare Worker that lets anyone using the site get AI writing without their own key. Your API key is stored as a secret on Cloudflare. It never appears in the website, the repo, or a visitor's browser.

What the relay does:

- Accepts requests only from the site origins you list.
- Limits each visitor, by default to 40 AI requests an hour. A deploy with Wrangler adds a 10-per-minute burst limit.
- Allows only the free models the site uses, caps reply length, and passes through only the fields the site sends.
- Doesn't count a request against the visitor's limit when it fails because the provider is overloaded.

Cloudflare Workers' free plan allows 100,000 requests a day, far more than this needs. The real ceiling is your Gemini free-tier quota.

## Setup (about 10 minutes, no coding)

1. **Get a key for the relay.** Create a new key at <https://aistudio.google.com/app/apikey> (**Create API key**). A separate key from your personal one lets you revoke it on its own.
2. **Create the Worker.**
   1. Sign up or log in at <https://dash.cloudflare.com>. The free plan is fine.
   2. Go to **Workers & Pages → Create → Create Worker** (the "Hello World" starter), name it `review-sprint-ai`, and click **Deploy**.
   3. Click **Edit code**. Delete everything in the editor, paste the full contents of [`worker.js`](worker.js), and click **Deploy**.
3. **Add your settings.** In the Worker, open **Settings → Variables and Secrets** and add:
   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `GEMINI_API_KEY` | the key from step 1 |
   | Text | `ALLOWED_ORIGINS` | `https://skaterdav21.github.io` |
   | Text (optional) | `HOURLY_LIMIT` | requests per visitor per hour, default `40` |
   If you also host the site elsewhere (for example `https://review-sprint.pages.dev`), add that too, separated by a comma. Use only the origin: no path and no trailing slash.
4. **Check it.** Open the Worker's URL (something like `https://review-sprint-ai.<your-name>.workers.dev`) in a browser. You should see `"ok":true` and `"providers":["gemini"]`.
5. **Connect the site.** Put that URL in [`../config.js`](../config.js) as `relayUrl`, and commit the change to `main`:
   ```js
   relayUrl: 'https://review-sprint-ai.your-name.workers.dev',
   ```
   You can edit the file directly on GitHub with the pencil icon.

Visitors now see **AI: on** automatically. Anyone can still turn it off, or use their own key, in AI settings.

## Using Groq instead of (or as well as) Gemini

Add a `GROQ_API_KEY` secret from <https://console.groq.com/keys>. To make visitors use Groq, set `relayProvider: 'groq'` in `config.js`. Gemini is recommended, because it also powers the link lookup.

## Deploying with the CLI instead

From this folder: `npx wrangler login`, then `npx wrangler secret put GEMINI_API_KEY`, then `npx wrangler deploy`. `wrangler.toml` already sets the allowed origin, the hourly limit, and the per-minute burst limiter.

## Limits and caveats

- Browsers can't fake the origin check, but a determined script can. The per-visitor limits and Google's own free-tier quota cap what anyone could use.
- The hourly limit is counted separately in each Cloudflare location, so a visitor may occasionally get a little more than the limit. The CLI deploy's burst limiter is shared across locations.
- On the free tier, Google may use prompts to improve its models. The prompts contain the product details and the visitor's answers.
- If the key stops working, visitors see a message suggesting they add their own key. Replace the `GEMINI_API_KEY` secret to fix it.
