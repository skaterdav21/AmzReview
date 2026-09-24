# Review Sprint

A static GitHub Pages app that turns a real customer experience with an Amazon product into a detailed, copy-ready review.

## Publish with GitHub Pages

1. Put these files in a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Set the source to **Deploy from a branch**, then choose `main` and `/ (root)`.
4. Save. GitHub will show the public site address in a minute or two.

## Bringing in a product

Amazon blocks other websites from reading its pages, so the app offers three routes:

- **One-click button (most reliable, desktop).** Drag the orange *Send to Review Sprint* button to your bookmarks bar once. On any Amazon product page, click it. It reads the title, feature bullets, specs, description, price, rating, and photo from the page you're viewing and opens the app with them filled in.
- **Paste page.** Ctrl+A, Ctrl+C on the product page, then paste. Rich-text pastes are parsed using Amazon's page structure, and plain text falls back to line matching.
- **Use a link.** Tries a public page reader first. If Gemini is turned on, it then looks the product up with Google Search, and as a last resort it uses the product name in the URL.

## Optional free AI writing

Open **AI: off** in the header and choose a provider:

| Provider | Free key | Notes |
| --- | --- | --- |
| Google Gemini (recommended) | https://aistudio.google.com/app/apikey | Free tier, no card. Also powers link lookups via Google Search. Default model `gemini-flash-latest`. |
| Groq | https://console.groq.com/keys | Free tier, no card, very fast open models. Default model `llama-3.3-70b-versatile`. |

With AI on, Step 2 adds three questions written for the specific product (for example, checking a listing's battery claim), and Step 3 writes the review from your answers with tone, length, and pros/cons controls. The prompt forbids inventing experiences: only your answers become claims, and the listing is used just to name features correctly.

The key is stored only in your browser's localStorage and is sent directly to the provider you chose. Free tiers may use prompts to improve their models. Without a key, the app still builds a structured draft from your answers.

## Files

- `index.html`: page structure
- `extract.js`: product parsing (bookmarklet payload, pasted text/HTML, reader output)
- `ai.js`: Gemini/Groq clients and prompts
- `app.js`: UI flow and the built-in (no-AI) draft writer
- `styles.css`, `theme.css`, `polish.css`, `features.css`: styling
