// Review Sprint add-on: reads the Amazon product page in the current tab and opens the app with it.
const DEFAULT_APP_URL = 'https://review-sprint.pages.dev/';

async function appUrl() {
  const { appUrl: saved } = await browser.storage.local.get('appUrl');
  const url = (saved || DEFAULT_APP_URL).trim();
  return url.endsWith('/') || /\.html?$/i.test(url) ? url : `${url}/`;
}

// Runs inside the Amazon page. Must be self-contained: it's serialized into the tab.
// Covers the desktop layout and the mobile layout Firefox for Android usually gets.
function extractProduct() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const first = (selectors) => { for (const sel of selectors) { const text = clean(document.querySelector(sel)?.textContent); if (text) return text; } return ''; };
  const all = (selector) => [...document.querySelectorAll(selector)].map((el) => clean(el.textContent)).filter((x) => x.length > 12 && !/make sure this fits/i.test(x));
  const title = first(['#productTitle', '#title', '#title_feature_div h1', '#titleSection h1']);
  if (!title) return null;
  const img = document.querySelector('#landingImage, #imgBlkFront, #main-image, img[data-a-image-name="landingImage"], #image-block img, #imgTagWrapperId img');
  return {
    t: title,
    b: [...new Set(all('#feature-bullets li, #featurebullets_feature_div li, #productFactsDesktopExpander li, #product-facts-detail li, #productFactsExpander li'))].slice(0, 10),
    d: first(['#productDescription', '#bookDescription_feature_div', '#productDescription_feature_div']).slice(0, 1200),
    s: [...document.querySelectorAll('#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #tech-specs-mobile tr')]
      .map((row) => clean([...row.children].map((cell) => clean(cell.textContent)).join(': ')))
      .filter((row) => row.length > 3 && row.length < 160).slice(0, 12),
    p: first(['#corePrice_feature_div .a-offscreen', '#corePriceDisplay_desktop_feature_div .a-offscreen', '#corePrice_mobile_feature_div .a-offscreen', '.a-price .a-offscreen']),
    r: first(['#acrPopover .a-icon-alt', '#averageCustomerReviews .a-icon-alt', '#acrCustomerReviewText']),
    br: first(['#bylineInfo', '#bylineInfo_feature_div a']),
    cs: first(['#product-summary', '[data-hook="cr-product-insights-summary"]']).slice(0, 700),
    i: img?.getAttribute('data-old-hires') || img?.currentSrc || img?.src || '',
    u: location.href.split('?')[0]
  };
}

browser.action.onClicked.addListener(async (tab) => {
  const base = await appUrl();
  let product = null;
  try {
    const [injection] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: extractProduct });
    product = injection?.result || null;
  } catch { /* Not an Amazon page, or the page blocked scripts: fall back to sending the link. */ }

  const target = product
    ? `${base}#import=${encodeURIComponent(JSON.stringify(product))}`
    : `${base}?${new URLSearchParams({ url: tab.url || '', title: tab.title || '' })}`;
  await browser.tabs.create({ url: target, index: tab.index + 1 });
});
