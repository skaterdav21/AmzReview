// Product extraction: turns a bookmarklet payload, a pasted page, or a fetched page into
// { title, bullets[], description, specs[], price, rating, brand, image, asin, url, buyerSummary }.
(function () {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const BAD_TITLE = /^(markdown content|content|title|amazon product|product page|untitled|main content|amazon\.com|page not found|robot check|sorry! something went wrong!?)$/i;
  const isBadTitle = (value) => !value || BAD_TITLE.test(clean(value).replace(/^title:\s*/i, '').replace(/:$/, '')) || /captcha|enter the characters you see|robot check/i.test(value);
  // Amazon answers blocked readers with a bot-check page instead of the product.
  const isBlockedPage = (text) => /robot check|enter the characters you see below|api-services-support@amazon\.com|to discuss automated access/i.test(text);

  function emptyProduct() {
    return { title: '', bullets: [], description: '', specs: [], price: '', rating: '', brand: '', image: '', asin: '', url: '', buyerSummary: '' };
  }

  function asinFromUrl(url) {
    const match = String(url || '').match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
    return match ? match[1].toUpperCase() : '';
  }

  // Amazon links are often long tracking URLs or amzn.to short links; /dp/ASIN is the stable form.
  function canonicalUrl(url) {
    try {
      const parsed = new URL(url);
      const asin = asinFromUrl(parsed.pathname);
      return asin ? `${parsed.origin}/dp/${asin}` : parsed.href;
    } catch { return ''; }
  }

  function titleFromUrl(url) {
    try {
      const path = decodeURIComponent(new URL(url).pathname);
      const slug = path.match(/^\/([^/]+)\/(?:dp|gp\/product)\//i)?.[1];
      if (!slug) return '';
      return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    } catch { return ''; }
  }

  // ---------- Structured HTML (bookmarklet-style selectors, also used for rich clipboard pastes) ----------
  function fromHtml(html, url = '') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = (sel) => clean(doc.querySelector(sel)?.textContent);
    const product = emptyProduct();
    product.title = text('#productTitle') || text('#title');
    product.bullets = [...doc.querySelectorAll('#feature-bullets li, #featurebullets_feature_div li, #productFactsDesktopExpander li')]
      .map((li) => clean(li.textContent)).filter((line) => line.length > 12 && !/make sure this fits/i.test(line));
    product.bullets = [...new Set(product.bullets)].slice(0, 10);
    product.description = (text('#productDescription') || text('#bookDescription_feature_div')).slice(0, 1500);
    product.specs = [...doc.querySelectorAll('#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr')]
      .map((row) => clean([...row.children].map((cell) => clean(cell.textContent)).join(': ')))
      .filter((row) => row.length > 3 && row.length < 160 && !/customer reviews|best sellers rank/i.test(row)).slice(0, 12);
    product.price = text('#corePrice_feature_div .a-offscreen') || text('.a-price .a-offscreen');
    product.rating = text('#acrPopover .a-icon-alt');
    product.brand = text('#bylineInfo');
    product.buyerSummary = (text('#product-summary') || text('[data-hook="cr-product-insights-summary"]')).slice(0, 800);
    const image = doc.querySelector('#landingImage, #imgBlkFront');
    product.image = image?.getAttribute('data-old-hires') || image?.getAttribute('src') || '';
    product.url = canonicalUrl(url);
    product.asin = asinFromUrl(url);
    return product;
  }

  // ---------- Plain text / markdown (Ctrl+A page copies and reader-proxy output) ----------
  function titleFromText(text) {
    const lines = text.split(/\r?\n/).map(clean).filter((x) => x.length > 8);
    const skip = /^(amazon|skip to|keyboard shortcuts|deliver to|all$|today's deals|customer reviews|price|add to cart|buy now|about this item|product information|visit the|brand:|search|markdown content|url source|published time)/i;
    const markdownTitle = lines.find((line) => /^#\s+/.test(line) && !isBadTitle(line.replace(/^#+\s*/, '')))?.replace(/^#+\s*/, '');
    if (!isBadTitle(markdownTitle)) return stripAmazonSuffix(markdownTitle);
    const labelledTitle = lines.find((line) => /^title:\s*/i.test(line))?.replace(/^title:\s*/i, '');
    if (!isBadTitle(labelledTitle)) return stripAmazonSuffix(labelledTitle);
    // Copied desktop pages place the actual title directly after the "Visit the X Store" link.
    const storeLine = lines.findIndex((line) => /^visit the .+ store$/i.test(line));
    if (storeLine >= 0) {
      const afterStore = lines.slice(storeLine + 1, storeLine + 4)
        .find((line) => !skip.test(line) && line.length > 16 && line.length < 230 && !/out of 5 stars|bought in past month/i.test(line));
      if (afterStore) return afterStore;
    }
    // Otherwise the title normally sits just above the last "About this item" heading.
    const about = lines.map((line) => line.toLowerCase()).lastIndexOf('about this item');
    if (about > 0) {
      const nearby = lines.slice(Math.max(0, about - 10), about)
        .filter((line) => !skip.test(line) && line.length < 190 && !/^\$|\b\d(?:\.\d)? out of 5/i.test(line));
      if (nearby.length) return nearby.sort((a, b) => b.length - a.length)[0];
    }
    return lines.find((line) => !skip.test(line) && !isBadTitle(line) && line.length < 190) || '';
  }

  function stripAmazonSuffix(title) {
    // Browser tab titles look like "Amazon.com: Product Name : Category"; only strip when that prefix is present.
    const value = clean(title);
    if (!/^amazon\.[a-z.]+\s*:/i.test(value)) return value;
    return value.replace(/^amazon\.[a-z.]+\s*:\s*/i, '').replace(/\s+:\s+[^:]{2,40}$/, '');
  }

  function sectionAfter(lines, heading, stopPattern, max) {
    const start = lines.map((line) => line.toLowerCase().replace(/^#+\s*/, '')).lastIndexOf(heading);
    if (start < 0) return [];
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((line) => stopPattern.test(line.replace(/^#+\s*/, '')));
    return rest.slice(0, stop < 0 ? max : Math.min(stop, max));
  }

  function fromText(text, url = '') {
    const product = emptyProduct();
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
    product.title = titleFromText(text);
    const stop = /^(item details|product description|product information|sponsored|customer reviews|report an issue|see more product details|videos|products related|compare with similar|from the manufacturer|technical details)/i;
    product.bullets = sectionAfter(lines, 'about this item', stop, 14)
      .map((line) => line.replace(/^[-*•]\s*/, ''))
      .filter((line) => line.length > 18 && line.length < 500)
      .slice(0, 10);
    product.description = sectionAfter(lines, 'product description', /^(product information|customer reviews|sponsored|videos|looking for specific info)/i, 12)
      .filter((line) => line.length > 25).join(' ').slice(0, 1500);
    product.rating = text.match(/(\d(?:\.\d)?) out of 5 stars/i)?.[0] || '';
    product.price = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?/)?.[0] || '';
    product.brand = lines.find((line) => /^visit the .+ store$/i.test(line)) || '';
    product.buyerSummary = sectionAfter(lines, 'customers say', /^(generated from the text|select to learn more|reviews with images|top reviews)/i, 4).join(' ').slice(0, 800);
    product.url = canonicalUrl(url);
    product.asin = asinFromUrl(url);
    return product;
  }

  // Bookmarklet payloads use short keys to keep the URL small.
  function fromPayload(data) {
    const product = emptyProduct();
    const str = (v, max = 400) => clean(typeof v === 'string' ? v : '').slice(0, max);
    const list = (v, max, len) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);
    product.title = str(data.t, 300);
    product.bullets = list(data.b, 10, 500);
    product.description = str(data.d, 1500);
    product.specs = list(data.s, 12, 160);
    product.price = str(data.p, 30);
    product.rating = str(data.r, 40);
    product.brand = str(data.br, 80);
    product.buyerSummary = str(data.cs, 800);
    product.image = /^https:\/\//i.test(data.i || '') ? String(data.i).slice(0, 500) : '';
    product.url = canonicalUrl(data.u || '');
    product.asin = asinFromUrl(data.u || '') || str(data.a, 10);
    return product;
  }

  // Runs on amazon.com, not in this app. Kept short and dependency-free so it fits in a bookmark.
  function bookmarkletSource(appUrl) {
    const body = `(()=>{const c=s=>(s||'').replace(/\\s+/g,' ').trim(),q=s=>c(document.querySelector(s)?.textContent),a=s=>[...document.querySelectorAll(s)].map(e=>c(e.textContent)).filter(x=>x.length>12);`
      + `if(!document.querySelector('#productTitle')&&!confirm('This does not look like an Amazon product page. Send it anyway?'))return;`
      + `const img=document.querySelector('#landingImage,#imgBlkFront');`
      + `const d={t:q('#productTitle')||document.title,b:[...new Set(a('#feature-bullets li,#featurebullets_feature_div li,#productFactsDesktopExpander li'))].slice(0,10),`
      + `d:(q('#productDescription')||q('#bookDescription_feature_div')).slice(0,1200),`
      + `s:[...document.querySelectorAll('#productOverview_feature_div tr,#productDetails_techSpec_section_1 tr')].map(r=>c([...r.children].map(x=>c(x.textContent)).join(': '))).filter(x=>x.length>3&&x.length<160).slice(0,12),`
      + `p:q('#corePrice_feature_div .a-offscreen')||q('.a-price .a-offscreen'),r:q('#acrPopover .a-icon-alt'),br:q('#bylineInfo'),cs:q('#product-summary').slice(0,700),`
      + `i:img?.getAttribute('data-old-hires')||img?.src||'',u:location.href.split('?')[0]};`
      + `window.open(${JSON.stringify(appUrl)}+'#import='+encodeURIComponent(JSON.stringify(d)),'_blank')})()`;
    return `javascript:${encodeURIComponent(body)}`;
  }

  // Amazon links come in many shapes: amazon.<tld> pages, amzn.to / amzn.eu short links, and a.co app shares.
  const AMAZON_LINK = /https?:\/\/(?:[\w-]+\.)*(?:amazon\.[a-z.]{2,6}|amzn\.[a-z]{2,3}|a\.co)\/[^\s"'<>]*/i;
  const isAmazonLink = (value) => AMAZON_LINK.test(String(value || '').trim()) && /^https?:\/\//i.test(String(value || '').trim());

  // Share sheets pass a mix of url, title, and text ("Check out this deal on Amazon: Anker… https://a.co/d/…").
  function parseShare({ url = '', text = '', title = '' } = {}) {
    const link = [url, text, title].map((v) => String(v || '').match(AMAZON_LINK)?.[0]).find(Boolean) || '';
    const candidates = [title, String(text || '').replace(AMAZON_LINK, ' ')].map((value) => stripAmazonSuffix(clean(value)
      .replace(/^(?:check out this (?:deal|product|item)(?: on amazon)?|check this out(?: on amazon)?|(?:i )?found this on amazon|look what i found on amazon|shared (?:from|via) amazon)\s*[:!-]?\s*/i, '')
      .replace(/^["“]|["”]$/g, '')));
    const sharedTitle = candidates.find((value) => value.length >= 8 && !isBadTitle(value) && !/^https?:/i.test(value) && !/^amazon(\.[a-z.]+)?$/i.test(value)) || '';
    return { link: link.replace(/[).,]+$/, ''), title: sharedTitle };
  }

  function merge(primary, fallback) {
    const out = { ...fallback };
    Object.entries(primary).forEach(([key, value]) => { if (Array.isArray(value) ? value.length : value) out[key] = value; });
    return out;
  }

  function hasContent(product) { return !isBadTitle(product.title); }

  window.Extract = { clean, isBadTitle, isBlockedPage, emptyProduct, asinFromUrl, canonicalUrl, titleFromUrl, stripAmazonSuffix, isAmazonLink, parseShare, fromHtml, fromText, fromPayload, bookmarkletSource, merge, hasContent };
})();
