const state = { product: '', details: '', rating: 0 };
const $ = (id) => document.getElementById(id);

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function titleFromText(text) {
  const lines = text.split(/\r?\n/).map(clean).filter((x) => x.length > 8);
  const skip = /^(amazon|skip to|keyboard shortcuts|deliver to|all$|today's deals|customer reviews|price|add to cart|buy now|about this item|product information|visit the|brand:|search)/i;
  // Amazon's copied desktop pages place the actual title directly after its store link.
  // This is far more reliable than scanning the page header or full copied document.
  const storeLine = lines.findIndex((line) => /^visit the .+ store$/i.test(line));
  if (storeLine >= 0) {
    const afterStore = lines.slice(storeLine + 1, storeLine + 4)
      .find((line) => !skip.test(line) && line.length > 16 && line.length < 230 && !/out of 5 stars|bought in past month/i.test(line));
    if (afterStore) return afterStore;
  }
  // On Amazon's copied page text, the title is normally just above "About this item".
  // Prefer the longest sensible line in that neighborhood over navigation text at the top.
  // "About this item" appears in Amazon's accessibility jump menu near the top.
  // Use the last matching heading, which is the actual product-details section.
  const about = lines.map((line) => line.toLowerCase()).lastIndexOf('about this item');
  if (about > 0) {
    const nearby = lines.slice(Math.max(0, about - 10), about)
      .filter((line) => !skip.test(line) && line.length < 190 && !/^\$|\b\d(?:\.\d)? out of 5/i.test(line));
    if (nearby.length) return nearby.sort((a, b) => b.length - a.length)[0];
  }
  return lines.find((line) => !skip.test(line) && line.length < 190) || '';
}
function detailsFromText(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const about = lines.map((line) => line.toLowerCase()).lastIndexOf('about this item');
  if (about >= 0) {
    const stopAt = lines.slice(about + 1).findIndex((line) => /^(item details|product description|sponsored|customer reviews|report an issue)/i.test(line));
    const highlights = lines.slice(about + 1, stopAt < 0 ? about + 7 : about + 1 + stopAt)
      .filter((line) => line.length > 18 && line.length < 360)
      .slice(0, 3);
    if (highlights.length) return highlights.join(' · ');
  }
  return '';
}
function showProduct(name, details = '') {
  state.product = clean(name) || 'This product'; state.details = clean(details);
  $('detectedTitle').textContent = state.product;
  $('detectedMeta').textContent = state.details || 'Product details are ready to use';
  $('productPreview').classList.remove('hidden'); $('toQuestions').classList.remove('hidden');
  $('manualProduct').classList.add('hidden');
}
function chooseSource(source) {
  document.querySelectorAll('.source-tab').forEach((button) => { const on = button.dataset.source === source; button.classList.toggle('is-selected', on); button.setAttribute('aria-selected', on); });
  $('paste-source').classList.toggle('hidden', source !== 'paste'); $('link-source').classList.toggle('hidden', source !== 'link');
}
function setStage(n) {
  document.querySelectorAll('.stage').forEach((stage) => stage.classList.toggle('is-visible', stage.id === `stage-${n}`));
  document.querySelectorAll('.step').forEach((step) => step.classList.toggle('is-active', Number(step.dataset.step) === n));
  document.querySelector('.steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function analyzePaste() {
  const text = $('pageText').value.trim();
  if (!text) { $('pageText').focus(); return; }
  const title = titleFromText(text);
  if (title) showProduct(title, detailsFromText(text));
  else { $('manualProduct').classList.remove('hidden'); $('productPreview').classList.add('hidden'); $('productName').focus(); }
}
async function importLink() {
  const url = $('productUrl').value.trim(); const message = $('importStatus');
  if (!/^https?:\/\//i.test(url) || !/amazon\./i.test(url)) { message.textContent = 'Please add a full Amazon product URL.'; message.className = 'import-status error'; return; }
  message.textContent = 'Trying to read product details…'; message.className = 'import-status';
  // GitHub Pages cannot read Amazon directly because of browser restrictions. This public text reader is a best-effort fallback.
  try {
    const response = await fetch(`https://r.jina.ai/http://${url.replace(/^https?:\/\//i, '')}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Unavailable');
    const text = await response.text(); const title = titleFromText(text);
    if (!title) throw new Error('No title');
    showProduct(title, detailsFromText(text)); message.textContent = 'Product details imported.';
  } catch {
    const asin = url.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i)?.[1];
    state.product = asin ? `Amazon product (${asin.toUpperCase()})` : 'Amazon product';
    $('productName').value = ''; $('manualProduct').classList.remove('hidden'); $('productPreview').classList.add('hidden');
    message.textContent = 'Amazon blocked the importer. Paste the page text, or enter the product name below.'; message.className = 'import-status error';
  }
}
function setRating(value) {
  state.rating = value;
  document.querySelectorAll('.star').forEach((star, index) => star.classList.toggle('is-picked', index < value));
  $('ratingLabel').textContent = `${value} out of 5`;
}
function sentenceStart(rating) { return rating >= 5 ? 'I’m genuinely impressed with' : rating === 4 ? 'Overall, I’ve had a good experience with' : rating === 3 ? 'There are things I like about' : 'My experience with'; }
function reviewTitle(rating, product, liked) {
  const starter = rating >= 4 ? 'Worth considering' : rating === 3 ? 'Good, with some trade-offs' : 'Not quite what I expected';
  const shortProduct = product.length > 50 ? 'this product' : product;
  return liked ? `${starter}: ${shortProduct}` : starter;
}
function createDraft(event) {
  event.preventDefault();
  const product = state.product || $('productName').value.trim() || 'this product';
  const liked = clean($('liked').value); const caveat = clean($('caveat').value); const time = $('useTime').value; const bestFor = clean($('bestFor').value); const recommend = $('recommend').value; const rating = state.rating || 4;
  const first = `${sentenceStart(rating)} ${product}. I’ve been using it for ${time}, and ${liked ? liked.charAt(0).toLowerCase() + liked.slice(1) : 'it has been straightforward to work into my routine'}.`;
  const middle = caveat ? `One thing to keep in mind: ${caveat.charAt(0).toLowerCase() + caveat.slice(1)}.` : rating < 4 ? 'It may not be the best fit for everyone, so it is worth checking the details against what you need.' : 'The overall experience has felt solid for the price and purpose.';
  const ending = recommend === 'yes' ? `I’d recommend it${bestFor ? `, especially for ${bestFor}` : ''}.` : recommend === 'with a small caveat' ? `I’d recommend it${bestFor ? ` for ${bestFor}` : ''}, as long as that point works for you.` : recommend === 'only for the right person' ? `I’d consider it mainly${bestFor ? ` for ${bestFor}` : ' if its particular strengths match your needs'}.` : 'I would probably look at alternatives before buying again.';
  $('draftProduct').textContent = product.toUpperCase(); $('reviewTitle').textContent = reviewTitle(rating, product, liked); $('reviewText').textContent = `${first}\n\n${middle}\n\n${ending}`; updateWordCount(); setStage(3);
}
function updateWordCount() { $('wordCount').textContent = `${$('reviewText').textContent.trim().split(/\s+/).filter(Boolean).length} words`; }
async function copyReview() {
  const text = `${$('reviewTitle').textContent.trim()}\n\n${$('reviewText').textContent.trim()}`;
  try { await navigator.clipboard.writeText(text); $('copyFeedback').textContent = 'Copied. Ready to paste into Amazon.'; } catch { $('copyFeedback').textContent = 'Select the review text and copy it manually.'; }
}
document.querySelectorAll('.source-tab').forEach((button) => button.addEventListener('click', () => chooseSource(button.dataset.source)));
$('analyzePaste').addEventListener('click', analyzePaste); $('importLink').addEventListener('click', importLink);
$('toQuestions').addEventListener('click', () => setStage(2));
$('editProduct').addEventListener('click', () => { $('manualProduct').classList.remove('hidden'); $('productName').value = state.product; $('productName').focus(); });
$('productName').addEventListener('input', (event) => { if (event.target.value.trim()) showProduct(event.target.value); });
document.querySelectorAll('.star').forEach((star) => star.addEventListener('click', () => setRating(Number(star.dataset.rating))));
$('experienceForm').addEventListener('submit', createDraft); $('copyReview').addEventListener('click', copyReview); $('reviewText').addEventListener('input', updateWordCount);
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => setStage(Number(button.dataset.back))));
