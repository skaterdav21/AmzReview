const state = { product: '', details: '', rating: 0, profile: null };
const $ = (id) => document.getElementById(id);

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function isBadTitle(value) { return !value || /^(markdown content|content|title|amazon product|product page|untitled|main content)$/i.test(clean(value).replace(/:$/, '')); }
function titleFromUrl(url) {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const slug = path.match(/^\/([^/]+)\/(?:dp|gp\/product)\//i)?.[1];
    if (!slug) return '';
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch { return ''; }
}
function titleFromText(text) {
  const lines = text.split(/\r?\n/).map(clean).filter((x) => x.length > 8);
  const skip = /^(amazon|skip to|keyboard shortcuts|deliver to|all$|today's deals|customer reviews|price|add to cart|buy now|about this item|product information|visit the|brand:|search|markdown content|url source|published time)/i;
  const markdownTitle = lines.find((line) => /^#\s+/.test(line) && !isBadTitle(line.replace(/^#+\s*/, '')))?.replace(/^#+\s*/, '');
  if (!isBadTitle(markdownTitle)) return markdownTitle;
  const labelledTitle = lines.find((line) => /^title:\s*/i.test(line))?.replace(/^title:\s*/i, '');
  if (!isBadTitle(labelledTitle)) return labelledTitle;
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
  return lines.find((line) => !skip.test(line) && !isBadTitle(line) && line.length < 190) || '';
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
function productProfile(title, details) {
  const source = `${title} ${details}`.toLowerCase();
  const profiles = [
    { match: /costume|outfit|dress|shirt|shoe|clothing|apparel|jacket|hat|wear/, label: 'costume or clothing item', question: 'How did the fit and comfort work for you?', placeholder: 'Mention the size you chose, how it sat or moved, and whether it felt comfortable...', liked: 'Which part of the fit, material, or design did you like most?', caveat: 'What should buyers know about sizing, coverage, or care?', bestFor: 'e.g. Halloween parties, cosplay, someone with a similar build' },
    { match: /charger|headphone|speaker|camera|battery|electronic|keyboard|mouse|wifi|bluetooth|phone|laptop/, label: 'tech product', question: 'How was the setup and everyday performance?', placeholder: 'Mention setup, connectivity, battery life, speed, sound, or another result you noticed...', liked: 'Which feature performed best in real use?', caveat: 'What should buyers know about setup, compatibility, or battery life?', bestFor: 'e.g. remote work, travel, a specific device setup' },
    { match: /skin|serum|cream|shampoo|makeup|beauty|scent|fragrance|lotion/, label: 'beauty or personal care product', question: 'How did it feel and what result did you notice?', placeholder: 'Mention texture, scent, skin or hair type, and the result after using it...', liked: 'What did you like about the feel, scent, or results?', caveat: 'What should buyers know about scent, sensitivity, or how long it takes to see results?', bestFor: 'e.g. dry skin, a particular hair type, fragrance lovers' },
    { match: /pan|knife|kitchen|cook|coffee|bottle|mug|food|bake|recipe/, label: 'kitchen product', question: 'How did it perform during actual use and cleanup?', placeholder: 'Mention what you made or used it for, how it performed, and how cleanup went...', liked: 'Which practical detail made it easier to use?', caveat: 'What should buyers know about size, cleanup, or storage?', bestFor: 'e.g. small kitchens, daily cooking, coffee drinkers' },
    { match: /dog|cat|pet|leash|litter|animal/, label: 'pet product', question: 'How did your pet respond to it?', placeholder: 'Mention your pet’s size or habits and what happened when you used it...', liked: 'What did your pet or you like about it?', caveat: 'What should buyers know about sizing, durability, or supervision?', bestFor: 'e.g. small dogs, active cats, a particular pet need' },
    { match: /toy|game|puzzle|kids|child|baby/, label: 'toy or kids product', question: 'How did it hold up during play or regular use?', placeholder: 'Mention the child’s age, how they used it, and what kept their attention...', liked: 'What made it fun, useful, or easy for them to use?', caveat: 'What should buyers know about age range, small parts, or durability?', bestFor: 'e.g. toddlers, a birthday gift, family game night' }
  ];
  return profiles.find((profile) => profile.match.test(source)) || { label: 'product', question: 'What happened when you used it for its intended purpose?', placeholder: 'Describe the real result, fit, setup, or performance you noticed...', liked: 'What feature or result stood out most?', caveat: 'Anything a buyer should know before ordering?', bestFor: 'e.g. a particular room, routine, or type of buyer' };
}
function updateExperienceQuestions() {
  const profile = state.profile || productProfile(state.product, state.details); state.profile = profile;
  $('experienceLead').textContent = `We found a ${profile.label}. These questions focus on the details buyers will actually want to know.`;
  $('productLensText').textContent = `For this ${profile.label}, focus on your real experience with fit, use, and any helpful tradeoff.`;
  $('specificLabel').textContent = profile.question; $('productSpecific').placeholder = profile.placeholder;
  $('likedLabel').textContent = profile.liked; $('caveatLabel').innerHTML = `${profile.caveat} <span>Optional, but helpful</span>`;
  $('bestFor').placeholder = profile.bestFor;
}
function showProduct(name, details = '') {
  state.product = clean(name) || 'This product'; state.details = clean(details); state.profile = productProfile(state.product, state.details);
  $('detectedTitle').textContent = state.product;
  const highlights = state.details ? state.details.split(' · ').length : 0;
  $('detectedMeta').textContent = highlights ? `${highlights} product highlights found. Step 2 will ask product-specific questions.` : 'Product identified. Step 2 will ask product-specific questions.';
  $('productPreview').classList.remove('hidden'); $('toQuestions').classList.remove('hidden');
  $('manualProduct').classList.add('hidden');
  updateExperienceQuestions();
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
    const text = await response.text();
    const extractedTitle = titleFromText(text);
    const title = isBadTitle(extractedTitle) ? titleFromUrl(url) : extractedTitle;
    if (isBadTitle(title)) throw new Error('No title');
    showProduct(title, detailsFromText(text)); message.textContent = 'Product details imported.';
  } catch {
    const fallbackTitle = titleFromUrl(url);
    if (fallbackTitle) { showProduct(fallbackTitle); $('productName').value = fallbackTitle; message.textContent = 'Amazon blocked the full import. We used the product name from the link, then tailored the next step.'; message.className = 'import-status'; }
    else { $('productName').value = ''; $('manualProduct').classList.remove('hidden'); $('productPreview').classList.add('hidden'); message.textContent = 'Amazon blocked the importer. Paste the page text, or enter the product name below.'; message.className = 'import-status error'; }
  }
}
function setRating(value) {
  state.rating = value;
  document.querySelectorAll('.star').forEach((star, index) => star.classList.toggle('is-picked', index < value));
  $('ratingLabel').textContent = value ? `${value} out of 5` : 'Choose 1 to 5';
}
function sentenceStart(rating) { return rating >= 5 ? 'I’m genuinely impressed with' : rating === 4 ? 'Overall, I’ve had a good experience with' : rating === 3 ? 'There are things I like about' : 'My experience with'; }
function reviewTitle(rating, product, liked) {
  const starter = rating >= 4 ? 'Worth considering' : rating === 3 ? 'Good, with some trade-offs' : 'Not quite what I expected';
  const shortProduct = product.length > 50 ? 'this product' : product;
  return liked ? `${starter}: ${shortProduct}` : starter;
}
function withPunctuation(value) { const text = clean(value); return !text ? '' : /[.!?]$/.test(text) ? text : `${text}.`; }
function createDraft(event) {
  event.preventDefault();
  const product = state.product || $('productName').value.trim() || 'this product';
  const specific = clean($('productSpecific').value); const liked = clean($('liked').value); const caveat = clean($('caveat').value); const time = $('useTime').value; const bestFor = clean($('bestFor').value); const recommend = $('recommend').value; const rating = state.rating || 4;
  const first = `${sentenceStart(rating)} ${product}. I’ve been using it for ${time}. ${withPunctuation(specific || 'It has been straightforward to work into my routine')}`;
  const middle = liked ? `What stood out most was this: ${withPunctuation(liked)}` : caveat ? `One thing to keep in mind: ${withPunctuation(caveat)}` : rating < 4 ? 'It may not be the best fit for everyone, so it is worth checking the details against what you need.' : 'The overall experience has felt solid for the price and purpose.';
  const buyerNote = liked && caveat ? `One thing to keep in mind: ${withPunctuation(caveat)}` : '';
  const ending = recommend === 'yes' ? `I’d recommend it${bestFor ? `, especially for ${bestFor}` : ''}.` : recommend === 'with a small caveat' ? `I’d recommend it${bestFor ? ` for ${bestFor}` : ''}, as long as that point works for you.` : recommend === 'only for the right person' ? `I’d consider it mainly${bestFor ? ` for ${bestFor}` : ' if its particular strengths match your needs'}.` : 'I would probably look at alternatives before buying again.';
  $('draftProduct').textContent = product.toUpperCase(); $('reviewTitle').textContent = reviewTitle(rating, product, liked || specific); $('reviewText').textContent = [first, middle, buyerNote, ending].filter(Boolean).join('\n\n'); updateWordCount(); setStage(3);
}
function updateWordCount() { $('wordCount').textContent = `${$('reviewText').textContent.trim().split(/\s+/).filter(Boolean).length} words`; }
async function copyReview() {
  const text = `${$('reviewTitle').textContent.trim()}\n\n${$('reviewText').textContent.trim()}`;
  try { await navigator.clipboard.writeText(text); $('copyFeedback').textContent = 'Copied. Ready to paste into Amazon.'; } catch { $('copyFeedback').textContent = 'Select the review text and copy it manually.'; }
}
function resetForNextReview() {
  state.product = ''; state.details = ''; state.rating = 0; state.profile = null;
  $('pageText').value = ''; $('productUrl').value = ''; $('productName').value = ''; $('importStatus').textContent = '';
  $('productPreview').classList.add('hidden'); $('manualProduct').classList.add('hidden'); $('toQuestions').classList.add('hidden');
  $('experienceForm').reset(); setRating(0); chooseSource('paste'); setStage(1);
}
function setTheme(mode) {
  const light = mode === 'light'; document.body.classList.toggle('light', light);
  $('themeText').textContent = light ? 'Dark' : 'Light'; $('themeToggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
  $('themeToggle').setAttribute('aria-pressed', String(light)); $('themeToggle').querySelector('.theme-icon').textContent = light ? '◐' : '☼';
  try { localStorage.setItem('review-sprint-theme', mode); } catch { /* Private browsing can disable storage. */ }
}
document.querySelectorAll('.source-tab').forEach((button) => button.addEventListener('click', () => chooseSource(button.dataset.source)));
$('analyzePaste').addEventListener('click', analyzePaste); $('importLink').addEventListener('click', importLink);
$('toQuestions').addEventListener('click', () => setStage(2));
$('editProduct').addEventListener('click', () => { $('manualProduct').classList.remove('hidden'); $('productName').value = state.product; $('productName').focus(); });
$('productName').addEventListener('input', (event) => { if (event.target.value.trim()) showProduct(event.target.value); });
document.querySelectorAll('.star').forEach((star) => star.addEventListener('click', () => setRating(Number(star.dataset.rating))));
$('experienceForm').addEventListener('submit', createDraft); $('copyReview').addEventListener('click', copyReview); $('reviewText').addEventListener('input', updateWordCount);
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => setStage(Number(button.dataset.back))));
$('anotherProduct').addEventListener('click', resetForNextReview);
$('themeToggle').addEventListener('click', () => setTheme(document.body.classList.contains('light') ? 'dark' : 'light'));
try { setTheme(localStorage.getItem('review-sprint-theme') || 'dark'); } catch { setTheme('dark'); }
