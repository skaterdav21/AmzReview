# Review Sprint for Firefox

A Firefox add-on for Android and desktop. On an Amazon product page, tap **Send to Review Sprint**. It opens Review Sprint with the product's title, feature bullets, specs, price, rating, and photo filled in. It reads the page you're viewing, so Amazon can't block it the way it blocks link imports.

- **Android:** tap **⋮ → Extensions → Send to Review Sprint**.
- **Desktop:** click the **R** button in the toolbar. You may need to pin it from the puzzle-piece menu.

If the page isn't a product page, or can't be read, the add-on sends the link and page title instead.

Permissions: `activeTab` and `scripting` (read the current tab only when you tap the button), and `storage` (remember the app address). It has no access to your other tabs or sites, and it sends nothing anywhere except the Review Sprint tab it opens.

## Install

Firefox only installs add-ons signed by Mozilla. Signing is free, and a private ("unlisted") add-on is usually signed automatically within minutes, without a public listing.

### 1. Get a signed copy (one time)

1. Sign in at <https://addons.mozilla.org/developers/> with a free Firefox account.
2. Download the ready-made package, [`dist/review-sprint-firefox.zip`](dist/review-sprint-firefox.zip) (on GitHub, click it, then the download button).
3. On the Developer Hub, click **Submit a New Add-on**, choose **On your own**, and upload the zip. Answer the questions: there's no source-code step, since nothing is minified.
4. When it's signed, download the `.xpi` file.

With AMO API keys you can do this from the command line instead: `npx web-ext sign --channel=unlisted --source-dir extension --api-key=... --api-secret=...`

### 2a. Install on Firefox for Android

1. Put the `.xpi` on your phone, for example by downloading it or emailing it to yourself.
2. In Firefox, go to **Settings → About Firefox** and tap the Firefox logo **5 times**. This turns on the debug menu.
3. Go back to **Settings**. Near the bottom, tap **Install extension from file** and pick the `.xpi`.

### 2b. Install on Firefox desktop

Open `about:addons`, click the gear icon, choose **Install Add-on From File…**, and pick the `.xpi`.

To try it without signing (desktop only; it's removed when Firefox restarts): open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and pick `extension/manifest.json`.

## Using a different app address

The add-on opens `https://skaterdav21.github.io/AmzReview/` by default. If you move the app, for example to Cloudflare Pages, change the address in the add-on's settings: **⋮ → Add-ons → Review Sprint → Settings** on Android, or `about:addons → Review Sprint → Preferences` on desktop.

## Other ways to send products

The app's **Use a link** tab has a setup guide for these:

- **Android share menu:** install the app from Chrome once, then share from Firefox or the Amazon app.
- **iPhone:** a Shortcut in the share sheet.
- **Paste** button: works everywhere.
