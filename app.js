const { clean } = window.Extract;
const state = { product: null, rating: 0, profile: null, aiQuestions: [], questionsFor: '', pastedHtml: '', draftEdited: false, drafting: false };
const $ = (id) => document.getElementById(id);

// ---------- Product profiles (built-in questions when AI is off) ----------
const PROFILES = [
  { match: /costume|outfit|dress|shirt|shoe|sneaker|boot|clothing|apparel|jacket|hoodie|pants|jeans|legging|sock|hat|wear\b/, label: 'clothing or shoe item', question: 'How did the fit, comfort, and material hold up?', placeholder: 'e.g. Ordered a medium (I’m usually a medium), runs slightly long. Soft after two washes, no shrinking…', liked: 'Which part of the fit, material, or design did you like most?', caveat: 'What should buyers know about sizing, coverage, or care?', bestFor: 'e.g. cold commutes, cosplay, someone with wide feet' },
  { match: /charger|headphone|earbud|speaker|camera|battery|power bank|electronic|keyboard|mouse|monitor|wifi|router|bluetooth|phone|tablet|laptop|usb|hdmi|cable|smart/, label: 'tech product', question: 'How were setup and everyday performance?', placeholder: 'e.g. Paired in under a minute. Battery lasts about 2 days with 3 hrs daily use; sound is clear but bass is light…', liked: 'Which feature performed best in real use?', caveat: 'What should buyers know about setup, compatibility, or battery life?', bestFor: 'e.g. remote work, travel, iPhone users' },
  { match: /skin|serum|cream|shampoo|conditioner|makeup|beauty|scent|fragrance|perfume|lotion|moisturi|sunscreen|razor|toothbrush/, label: 'beauty or personal care product', question: 'How did it feel, and what results did you notice (and when)?', placeholder: 'e.g. Light gel texture, no scent. My dry patches improved after about a week of nightly use…', liked: 'What did you like about the feel, scent, or results?', caveat: 'What should buyers know about scent, sensitivity, or how long results take?', bestFor: 'e.g. dry or sensitive skin, curly hair' },
  { match: /pan|pot|knife|kitchen|cook|coffee|espresso|blender|air fryer|bottle|tumbler|mug|food|snack|bake|container|utensil/, label: 'kitchen or food product', question: 'How did it perform in actual use, and how was cleanup?', placeholder: 'e.g. Made eggs and stir-fry every day; nothing sticks yet. Handle stays cool. Dishwasher safe but I hand wash…', liked: 'Which practical detail made it easier to use?', caveat: 'What should buyers know about size, cleanup, or storage?', bestFor: 'e.g. small kitchens, daily cooking, meal prep' },
  { match: /dog|cat|pet|leash|collar|litter|aquarium|bird|animal|treat/, label: 'pet product', question: 'How did your pet respond to it, and how has it held up?', placeholder: 'e.g. My 60 lb lab chewed it daily for 3 weeks; only surface marks so far…', liked: 'What did your pet (or you) like about it?', caveat: 'What should buyers know about sizing, durability, or supervision?', bestFor: 'e.g. heavy chewers, senior cats, small breeds' },
  { match: /toy|game|puzzle|lego|kids|child|toddler|baby|stroller|infant/, label: 'toy or kids product', question: 'How did it hold up during play, and did it keep their interest?', placeholder: 'e.g. My 4-year-old plays with it most days; survived a few drops; assembly took 10 minutes…', liked: 'What made it fun, useful, or easy for them?', caveat: 'What should buyers know about age range, small parts, or durability?', bestFor: 'e.g. toddlers, a birthday gift, family game night' },
  { match: /chair|desk|table|shelf|sofa|mattress|pillow|bed|lamp|rug|curtain|storage|organizer|furniture|decor/, label: 'home or furniture item', question: 'How were assembly, sturdiness, and day-to-day comfort or use?', placeholder: 'e.g. Took 40 minutes to assemble alone; no wobble; I sit in it 8 hours a day with no back pain…', liked: 'What detail made the biggest difference at home?', caveat: 'What should buyers know about assembly, dimensions, or materials?', bestFor: 'e.g. small apartments, home offices' },
  { match: /drill|saw|tool|wrench|screwdriver|garden|hose|mower|vacuum|cleaner|mop|car\b|automotive|tire/, label: 'tool or home-care product', question: 'What jobs did you use it for, and how well did it handle them?', placeholder: 'e.g. Hung shelves and built a deck box; battery lasted the whole afternoon; struggled with masonry…', liked: 'What made the job easier or faster?', caveat: 'What should buyers know about power, attachments, or durability?', bestFor: 'e.g. weekend DIYers, apartment cleaning' },
  { match: /yoga|fitness|gym|dumbbell|weights|bike|running|camping|tent|hiking|backpack|outdoor|fishing|sport/, label: 'fitness or outdoor gear', question: 'How did it perform during workouts or trips?', placeholder: 'e.g. Used it for 3 camping trips; stayed dry through one night of heavy rain; setup takes 10 minutes…', liked: 'What worked best when you were actually using it?', caveat: 'What should buyers know about weight, durability, or sizing?', bestFor: 'e.g. beginners, backpacking, home gyms' }
];
const DEFAULT_PROFILE = { label: 'product', question: 'What happened when you used it for its intended purpose?', placeholder: 'Describe the real result, fit, setup, or performance you noticed. Numbers and specific moments help most…', liked: 'What feature or result stood out most?', caveat: 'Anything a buyer should know before ordering?', bestFor: 'e.g. a particular room, routine, or type of buyer' };

function productProfile(product) {
  const source = `${product.title} ${product.bullets.join(' ')}`.toLowerCase();
  // Prefer the title so a phone case isn't classed by a stray word in its bullets.
  return PROFILES.find((p) => p.match.test(product.title.toLowerCase())) || PROFILES.find((p) => p.match.test(source)) || DEFAULT_PROFILE;
}

// "Anker Portable Charger, 10000mAh Power Bank with..." → "Anker Portable Charger"
function shortName(title) {
  const head = clean(title).split(/\s*(?:,|\s-\s|\s–\s|\||\(|\[|:\s)/)[0];
  const words = head.split(' ');
  return words.length > 7 ? `${words.slice(0, 6).join(' ')}` : head;
}

// ---------- Step 1: bringing in the product ----------
function showProduct(product) {
  product.title = clean(product.title) || 'This product';
  state.product = product;
  state.profile = productProfile(product);
  $('detectedTitle').textContent = product.title;

  const facts = [];
  if (product.bullets.length) facts.push(`${product.bullets.length} feature highlight${product.bullets.length === 1 ? '' : 's'}`);
  if (product.specs.length) facts.push(`${product.specs.length} specs`);
  if (product.description) facts.push('description');
  const extras = [product.price, product.rating].filter(Boolean).join(' · ');
  $('detectedMeta').textContent = `${facts.length ? `Found ${facts.join(', ')}.` : 'Product identified.'}${extras ? ` ${extras}.` : ''} Step 2 will ask questions for this ${state.profile.label}.`;

  const list = $('highlightsList'); list.replaceChildren();
  [...product.bullets, ...product.specs].forEach((line) => { const li = document.createElement('li'); li.textContent = line; list.append(li); });
  if (product.description) { const li = document.createElement('li'); li.textContent = product.description; list.append(li); }
  $('highlightsBox').classList.toggle('hidden', !list.children.length);

  const image = $('productImage');
  if (product.image) { image.src = product.image; image.classList.remove('hidden'); } else { image.removeAttribute('src'); image.classList.add('hidden'); }

  $('productPreview').classList.remove('hidden'); $('toQuestions').classList.remove('hidden');
  $('manualProduct').classList.add('hidden');
  updateExperienceQuestions();
}

function showManualEntry(prefill = '') {
  $('productName').value = prefill;
  $('manualProduct').classList.remove('hidden');
  if (!prefill) $('productPreview').classList.add('hidden');
  $('productName').focus();
}

function chooseSource(source) {
  document.querySelectorAll('.source-tab').forEach((button) => { const on = button.dataset.source === source; button.classList.toggle('is-selected', on); button.setAttribute('aria-selected', on); });
  ['button', 'paste', 'link'].forEach((name) => $(`${name}-source`).classList.toggle('hidden', source !== name));
}

function setStage(n) {
  document.querySelectorAll('.stage').forEach((stage) => stage.classList.toggle('is-visible', stage.id === `stage-${n}`));
  document.querySelectorAll('.step').forEach((step) => step.classList.toggle('is-active', Number(step.dataset.step) === n));
  document.querySelector('.steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (n === 2) maybeLoadAiQuestions();
}

function analyzePaste() {
  const text = $('pageText').value.trim();
  if (!text) { $('pageText').focus(); return; }
  let product = Extract.fromText(text);
  // A rich-text paste of the page keeps Amazon's element ids, which is more precise than line guessing.
  if (state.pastedHtml) {
    const fromHtml = Extract.fromHtml(state.pastedHtml);
    if (Extract.hasContent(fromHtml)) product = Extract.merge(fromHtml, product);
  }
  if (Extract.hasContent(product)) showProduct(product);
  else showManualEntry();
}

function setImportStatus(text, isError = false) {
  $('importStatus').textContent = text;
  $('importStatus').className = `import-status${isError ? ' error' : ''}`;
}

async function importLink() {
  const raw = $('productUrl').value.trim();
  if (!/^https?:\/\//i.test(raw) || !/(amazon\.|amzn\.)/i.test(raw)) { setImportStatus('Please add a full Amazon product link (it should start with https://).', true); return; }
  const url = Extract.canonicalUrl(raw) || raw;
  const asin = Extract.asinFromUrl(raw);
  const slugTitle = Extract.titleFromUrl(raw);
  $('importLink').disabled = true;

  try {
    setImportStatus('Reading the product page…');
    try {
      const response = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Unavailable');
      const product = Extract.fromText(await response.text(), url);
      if (Extract.hasContent(product) && (product.bullets.length || !slugTitle)) {
        showProduct(product);
        setImportStatus('Product details imported.');
        return;
      }
    } catch { /* The reader is often blocked by Amazon; fall through to the next method. */ }

    if (AI.canLookup()) {
      setImportStatus('Amazon blocked the page reader. Looking the product up with Gemini + Google Search…');
      try {
        AI.onProgress((note) => setImportStatus(note));
        const found = await AI.lookupProduct(url, asin);
        showProduct(Extract.merge({ ...found, url, asin }, Extract.emptyProduct()));
        setImportStatus('Found it via search. Check the name matches your product.');
        return;
      } catch (error) { setImportStatus(error.message, true); }
    }

    if (slugTitle) {
      showProduct({ ...Extract.emptyProduct(), title: slugTitle, url, asin });
      setImportStatus(`Amazon blocked the full import, so we used the name from the link.${AI.canLookup() ? '' : ' Tip: the One-click button or turning on Gemini gets full details.'}`);
    } else {
      showManualEntry();
      setImportStatus('Amazon blocked the import and this link has no product name in it. Type the name below, or use the One-click button or Paste page.', true);
    }
  } finally { $('importLink').disabled = false; }
}

function readImportHash() {
  if (!location.hash.startsWith('#import=')) return;
  try {
    const product = Extract.fromPayload(JSON.parse(decodeURIComponent(location.hash.slice(8))));
    history.replaceState(null, '', location.pathname + location.search);
    if (!Extract.hasContent(product)) throw new Error('empty');
    resetForNextReview();
    chooseSource('button');
    showProduct(product);
  } catch {
    chooseSource('paste');
    setImportStatus('');
    $('pageText').placeholder = 'That page could not be read by the button. Copy the page (Ctrl+A, Ctrl+C) and paste it here instead…';
  }
}

// ---------- Step 2: questions ----------
function updateExperienceQuestions() {
  const profile = state.profile || DEFAULT_PROFILE;
  $('experienceLead').textContent = `Questions for this ${profile.label}. Short notes are fine: numbers, situations, and comparisons make the review most helpful.`;
  $('productLensText').textContent = `${shortName(state.product?.title || 'This product')}: focus on what a shopper can't learn from the listing. How it actually performed, what surprised you, and who it suits.`;
  $('specificLabel').textContent = profile.question; $('productSpecific').placeholder = profile.placeholder;
  $('likedLabel').textContent = profile.liked; $('caveatLabel').innerHTML = `${profile.caveat} <span>Optional, but helpful</span>`;
  $('bestFor').placeholder = profile.bestFor;
}

function renderAiQuestions() {
  const list = $('aiQuestionsList'); list.replaceChildren();
  state.aiQuestions.forEach((q, index) => {
    const label = document.createElement('label'); label.className = 'wide-label'; label.htmlFor = `aiq-${index}`; label.textContent = q.question;
    const area = document.createElement('textarea'); area.id = `aiq-${index}`; area.className = 'short'; area.placeholder = q.placeholder || 'Optional';
    area.value = q.answer || '';
    area.addEventListener('input', () => { q.answer = area.value; });
    list.append(label, area);
  });
}

async function maybeLoadAiQuestions() {
  const box = $('aiQuestions');
  if (!AI.enabled() || !state.product) { box.classList.add('hidden'); return; }
  const key = `${AI.settings.provider}|${state.product.title}`;
  if (state.questionsFor === key) return;
  state.questionsFor = key; state.aiQuestions = []; renderAiQuestions();
  box.classList.remove('hidden'); $('aiQuestionsStatus').textContent = 'Writing questions for this product…';
  try {
    AI.onProgress((note) => { if (state.questionsFor === key) $('aiQuestionsStatus').textContent = note; });
    const { category, questions } = await AI.generateQuestions(state.product);
    if (state.questionsFor !== key) return;
    state.aiQuestions = questions; renderAiQuestions();
    $('aiQuestionsStatus').textContent = `Answer any that apply · ${AI.providerName()}`;
    if (category) $('experienceLead').textContent = `Questions for this ${category}. Short notes are fine: numbers, situations, and comparisons make the review most helpful.`;
  } catch (error) {
    if (state.questionsFor !== key) return;
    state.questionsFor = '';
    $('aiQuestionsStatus').textContent = `Couldn't load extra questions. ${error.message}`;
  }
}

function setRating(value) {
  state.rating = value;
  document.querySelectorAll('.star').forEach((star, index) => star.classList.toggle('is-picked', index < value));
  $('ratingLabel').textContent = value ? `${value} out of 5` : 'Choose 1–5';
}

function collectAnswers() {
  const profile = state.profile || DEFAULT_PROFILE;
  const fields = [
    ['How long I’ve used it', $('useTime').value],
    ['Why I bought it / what I use it for', $('whyBought').value],
    [profile.question, $('productSpecific').value],
    ...state.aiQuestions.map((q) => [q.question, q.answer]),
    [profile.liked, $('liked').value],
    [profile.caveat, $('caveat').value],
    ['What I compared it to', $('compared').value],
    ['Value for the price', $('value').value],
    ['Who it’s best for', $('bestFor').value],
    ['Would I recommend it', $('recommend').value]
  ];
  return fields.map(([label, value]) => ({ label, value: clean(value) })).filter((f) => f.value);
}

// ---------- Step 3: built-in draft (no AI) ----------
const withPunctuation = (value) => { const text = clean(value).replace(/^[a-z]/, (c) => c.toUpperCase()); return !text ? '' : /[.!?]$/.test(text) ? text : `${text}.`; };
const lowerFirst = (value) => clean(value).replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase()).replace(/[.!?]+$/, '');
const splitPoints = (value) => clean(value.replace(/\n+/g, '. ')).split(/(?<=[.!?;])\s+|,\s+(?:and\s+)?(?=[a-z])/i).map((x) => x.replace(/[.;,]+$/, '').trim()).filter((x) => x.length > 2);

function templateReview(options) {
  const name = shortName(state.product?.title || $('productName').value || 'this product');
  const rating = options.rating;
  const v = (id) => clean($(id).value);
  const time = v('useTime'); const why = v('whyBought'); const specific = v('productSpecific'); const liked = v('liked'); const caveat = v('caveat');
  const compared = v('compared'); const value = v('value'); const bestFor = v('bestFor'); const recommend = v('recommend');
  const extra = state.aiQuestions.map((q) => clean(q.answer)).filter(Boolean);
  const casual = options.tone === 'casual'; const detailed = options.tone === 'detailed';

  const verdict = {
    5: casual ? `Really happy with the ${name}.` : detailed ? `The ${name} has done everything I needed it to, and done it well.` : `The ${name} has earned all five stars from me.`,
    4: casual ? `Pretty happy with the ${name}, with one or two small gripes.` : `The ${name} is a solid buy with a couple of minor trade-offs.`,
    3: `The ${name} is a mixed bag: some things work well, others don't.`,
    2: `I wanted to like the ${name}, but it fell short for me.`,
    1: `I can't recommend the ${name} based on my experience.`
  }[rating];
  const context = `I’ve been using it for ${time}${why ? `. ${withPunctuation(why)}` : '.'}`.replace(/\.\./g, '.');
  const opening = `${verdict} ${context}`;

  const experience = [withPunctuation(specific), ...extra.map(withPunctuation)].filter(Boolean).join(' ');
  const likedLine = liked ? (casual ? `The best part: ${lowerFirst(liked)}.` : `What stood out most: ${lowerFirst(liked)}.`) : '';
  const comparedLine = compared ? `Compared with ${lowerFirst(compared)}, ${rating >= 4 ? 'this is the one I’d pick again' : rating === 3 ? 'it’s about even' : 'I preferred the other option'}.` : '';
  const valueLine = value ? `For the price, I’d call it ${value}.` : '';
  const caveatLine = caveat ? `${rating >= 4 ? 'One thing to know before buying' : 'The main problem'}: ${lowerFirst(caveat)}.` : '';

  const closing = recommend === 'yes' ? `I’d recommend it${bestFor ? `, especially for ${lowerFirst(bestFor)}` : ''}.`
    : recommend === 'with a small caveat' ? `I’d recommend it${bestFor ? ` for ${lowerFirst(bestFor)}` : ''}, as long as that caveat doesn’t matter for you.`
      : recommend === 'only for the right person' ? `It’s worth it mainly${bestFor ? ` for ${lowerFirst(bestFor)}` : ' if its specific strengths match what you need'}; others may be better served elsewhere.`
        : `I’d look at alternatives${bestFor ? `, unless you’re specifically looking for something for ${lowerFirst(bestFor)}` : ''}.`;

  let paragraphs;
  if (options.format === 'pros-cons') {
    const pros = splitPoints(liked).slice(0, 4); const cons = splitPoints(caveat).slice(0, 4);
    const list = (heading, items) => (items.length ? `${heading}\n${items.map((item) => `- ${withPunctuation(item).replace(/\.$/, '')}`).join('\n')}` : '');
    paragraphs = [opening, experience, list('Pros:', pros), list('Cons:', cons), [comparedLine, valueLine, closing].filter(Boolean).join(' ')];
  } else if (options.length === 'short') {
    paragraphs = [`${opening} ${likedLine}`.trim(), [caveatLine, closing].filter(Boolean).join(' ')];
  } else {
    paragraphs = [opening, [experience, likedLine].filter(Boolean).join(' '), [comparedLine, caveatLine, valueLine].filter(Boolean).join(' '), closing];
  }

  const titleLead = { 5: 'Does exactly what I needed', 4: 'Solid, with minor trade-offs', 3: 'Good in some ways, not in others', 2: 'Fell short for me', 1: 'Wouldn’t buy again' }[rating];
  const hook = splitPoints(liked || specific)[0];
  const title = hook && hook.length < 45 && rating >= 3 ? `${titleLead}: ${lowerFirst(hook)}` : titleLead;
  return { title, body: paragraphs.map((p) => clean(p.replace(/\n/g, '\u0000')).replace(/\u0000/g, '\n')).filter(Boolean).join('\n\n') };
}

// ---------- Step 3: drafting ----------
function draftOptions() {
  return { rating: state.rating || 4, tone: $('tone').value, length: $('length').value, format: $('format').value };
}

function setDraft({ title, body }) {
  $('reviewTitle').textContent = title; $('reviewText').textContent = body;
  state.draftEdited = false; updateWordCount();
}

function setDraftStatus(text, isError = false) {
  $('draftStatus').textContent = text;
  $('draftStatus').className = `draft-status${isError ? ' error' : ''}`;
}

async function buildDraft() {
  if (state.drafting) return;
  if (!state.product) state.product = { ...Extract.emptyProduct(), title: clean($('productName').value) || 'this product' };
  const options = draftOptions();
  $('draftProduct').textContent = state.product.title.toUpperCase();
  $('copyFeedback').textContent = '';

  if (!AI.enabled()) {
    setDraft(templateReview(options));
    $('engineChip').textContent = 'Built-in template';
    setDraftStatus('Tip: for a fuller, more natural review, ');
    const setup = document.createElement('button');
    setup.type = 'button'; setup.className = 'text-button inline'; setup.textContent = 'set up free AI writing (takes a minute)';
    setup.addEventListener('click', openAiSettings);
    $('draftStatus').append(setup, '.');
    return;
  }

  state.drafting = true;
  document.body.classList.add('is-drafting');
  $('regenerate').disabled = true; $('createDraft').disabled = true;
  $('engineChip').textContent = `Writing with ${AI.providerName()}…`;
  setDraftStatus('Writing your review. This usually takes a few seconds…');
  try {
    AI.onProgress((note) => setDraftStatus(note));
    setDraft(await AI.writeReview(state.product, collectAnswers(), options));
    $('engineChip').textContent = `Written with ${AI.modelFor()}`;
    setDraftStatus('Check every detail is true for you, and edit anything that doesn’t sound like you.');
  } catch (error) {
    setDraft(templateReview(options));
    $('engineChip').textContent = 'Built-in template';
    setDraftStatus(`${error.message} Showing the built-in draft instead.`, true);
  } finally {
    state.drafting = false;
    document.body.classList.remove('is-drafting');
    $('regenerate').disabled = false; $('createDraft').disabled = false;
  }
}

function createDraft(event) {
  event.preventDefault();
  if (!state.rating) { $('ratingLabel').textContent = 'Pick a rating first'; $('ratingLabel').classList.add('needs'); document.querySelector('.rating-control').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (!clean($('productSpecific').value) && !clean($('liked').value) && !clean($('caveat').value)) {
    $('productSpecific').focus(); $('productSpecific').classList.add('needs');
    return;
  }
  setStage(3); buildDraft();
}

function rewrite() {
  if (state.draftEdited && !confirm('Rewriting will replace your edits. Continue?')) return;
  buildDraft();
}

function updateWordCount() { $('wordCount').textContent = `${$('reviewText').innerText.trim().split(/\s+/).filter(Boolean).length} words`; }

async function copyReview() {
  const text = `${$('reviewTitle').innerText.trim()}\n\n${$('reviewText').innerText.trim()}`;
  try { await navigator.clipboard.writeText(text); $('copyFeedback').textContent = 'Copied. Paste the first line as the headline and the rest as the review.'; } catch { $('copyFeedback').textContent = 'Select the review text and copy it manually.'; }
}

function resetForNextReview() {
  Object.assign(state, { product: null, rating: 0, profile: null, aiQuestions: [], questionsFor: '', pastedHtml: '', draftEdited: false });
  $('pageText').value = ''; $('productUrl').value = ''; $('productName').value = ''; setImportStatus('');
  $('productPreview').classList.add('hidden'); $('manualProduct').classList.add('hidden'); $('toQuestions').classList.add('hidden');
  $('experienceForm').reset(); setRating(0); renderAiQuestions(); $('aiQuestions').classList.add('hidden');
  setStage(1);
}

// ---------- AI settings ----------
function refreshAiChip() {
  const on = AI.enabled();
  $('aiChipText').textContent = !on ? 'AI: off' : AI.isShared() ? 'AI: on' : `AI: ${AI.providerName()}`;
  $('openAiSettings').classList.toggle('is-on', on);
  $('linkNote').textContent = AI.canLookup()
    ? 'We try a public page reader first, then look the product up with Gemini + Google Search if Amazon blocks it.'
    : 'We try a public page reader, which Amazon often blocks. Turn on Gemini in AI settings to also look products up with Google Search.';
}

function syncProviderFields() {
  const provider = AI.PROVIDERS[$('aiProvider').value];
  $('sharedNote').classList.toggle('hidden', $('aiProvider').value !== 'shared');
  document.querySelectorAll('.key-card').forEach((card) => card.classList.toggle('is-selected', card.dataset.provider === $('aiProvider').value));
  $('aiKeyFields').classList.toggle('hidden', !provider);
  if (!provider) return;
  $('providerNote').textContent = provider.note;
  $('aiKeyLink').href = provider.keyUrl;
  $('aiModel').placeholder = `Automatic: ${provider.models[0]}, then others if busy`;
}

function selectProvider(name) {
  $('aiProvider').value = name;
  syncProviderFields();
}

// Keys have recognizable prefixes, so a pasted key can pick its own provider.
function detectProviderFromKey() {
  const key = $('aiKey').value.trim();
  const match = /^AIza/.test(key) ? 'gemini' : /^gsk_/.test(key) ? 'groq' : '';
  if (match && match !== $('aiProvider').value) selectProvider(match);
}

function openAiSettings() {
  const s = AI.settings;
  $('aiProvider').value = s.provider; $('aiKey').value = s.key; $('aiModel').value = s.model;
  $('aiTestStatus').textContent = '';
  syncProviderFields();
  $('aiSettings').showModal();
}

function saveAiSettings() {
  const provider = $('aiProvider').value;
  const changedProvider = provider !== AI.settings.provider;
  // Remember a deliberate "Off" so the site's shared AI doesn't switch itself back on next visit.
  AI.update({ provider, key: $('aiKey').value.trim(), model: changedProvider && !$('aiModel').value.trim() ? '' : $('aiModel').value.trim(), chosenOff: provider === 'none' });
  state.questionsFor = '';
  refreshAiChip();
}

async function testAi() {
  saveAiSettings();
  const status = $('aiTestStatus');
  if (!AI.enabled()) { status.textContent = 'Choose a provider and paste a key first.'; status.className = 'settings-status error'; return; }
  status.textContent = 'Testing…'; status.className = 'settings-status';
  AI.onProgress((note) => { status.textContent = note; });
  try { await AI.testConnection(); status.textContent = `Connected to ${AI.providerName()} (${AI.modelFor()}).`; } catch (error) { status.textContent = error.message; status.className = 'settings-status error'; }
}

// ---------- Theme ----------
function setTheme(mode) {
  const light = mode === 'light'; document.body.classList.toggle('light', light);
  $('themeText').textContent = light ? 'Dark' : 'Light'; $('themeToggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
  $('themeToggle').setAttribute('aria-pressed', String(light)); $('themeToggle').querySelector('.theme-icon').textContent = light ? '◐' : '☼';
  try { localStorage.setItem('review-sprint-theme', mode); } catch { /* Private browsing can disable storage. */ }
}

// ---------- Wiring ----------
if (AI.hasRelay) {
  const shared = new Option('Free AI from this site (no key needed)', 'shared');
  $('aiProvider').prepend(shared);
}
$('bookmarklet').href = Extract.bookmarkletSource(location.href.split('#')[0]);
$('bookmarklet').addEventListener('click', (event) => { event.preventDefault(); $('bookmarklet').classList.add('wiggle'); setTimeout(() => $('bookmarklet').classList.remove('wiggle'), 600); });
document.querySelectorAll('.source-tab').forEach((button) => button.addEventListener('click', () => chooseSource(button.dataset.source)));
$('pageText').addEventListener('paste', (event) => { state.pastedHtml = event.clipboardData?.getData('text/html') || ''; });
$('pageText').addEventListener('input', () => { if (!$('pageText').value.trim()) state.pastedHtml = ''; });
$('analyzePaste').addEventListener('click', analyzePaste); $('importLink').addEventListener('click', importLink);
$('productUrl').addEventListener('keydown', (event) => { if (event.key === 'Enter') importLink(); });
$('toQuestions').addEventListener('click', () => setStage(2));
$('editProduct').addEventListener('click', () => showManualEntry(state.product?.title || ''));
$('productName').addEventListener('input', (event) => {
  const title = event.target.value.trim(); if (!title) return;
  if (state.product) { state.product.title = title; $('detectedTitle').textContent = title; state.profile = productProfile(state.product); updateExperienceQuestions(); $('productPreview').classList.remove('hidden'); $('toQuestions').classList.remove('hidden'); }
  else { showProduct({ ...Extract.emptyProduct(), title }); $('manualProduct').classList.remove('hidden'); }
});
document.querySelectorAll('.star').forEach((star) => star.addEventListener('click', () => { setRating(Number(star.dataset.rating)); $('ratingLabel').classList.remove('needs'); }));
$('productSpecific').addEventListener('input', () => $('productSpecific').classList.remove('needs'));
$('experienceForm').addEventListener('submit', createDraft);
$('regenerate').addEventListener('click', rewrite);
['tone', 'length', 'format'].forEach((id) => $(id).addEventListener('change', () => {
  // The template is instant, so re-render; AI rewrites wait for the button to save free-tier quota.
  if (!AI.enabled() && !state.draftEdited) setDraft(templateReview(draftOptions()));
  else setDraftStatus('Click “Rewrite” to apply the new settings.');
}));
$('copyReview').addEventListener('click', copyReview);
['reviewText', 'reviewTitle'].forEach((id) => $(id).addEventListener('input', () => { state.draftEdited = true; updateWordCount(); }));
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => setStage(Number(button.dataset.back))));
document.querySelectorAll('.step').forEach((button) => button.addEventListener('click', () => {
  const n = Number(button.dataset.step);
  if (n === 1 || (n === 2 && state.product) || (n === 3 && $('reviewText').textContent.trim())) setStage(n);
}));
$('anotherProduct').addEventListener('click', () => { resetForNextReview(); chooseSource(defaultSource()); });
$('themeToggle').addEventListener('click', () => setTheme(document.body.classList.contains('light') ? 'dark' : 'light'));
$('openAiSettings').addEventListener('click', openAiSettings);
$('aiProvider').addEventListener('change', syncProviderFields);
$('aiKey').addEventListener('input', detectProviderFromKey);
document.querySelectorAll('.key-card').forEach((card) => card.addEventListener('click', () => {
  selectProvider(card.dataset.provider);
  if (!$('aiKey').value.trim()) $('aiKey').focus({ preventScroll: true });
}));
$('aiSettingsForm').addEventListener('submit', saveAiSettings);
$('aiTest').addEventListener('click', testAi);
$('aiSettings').addEventListener('click', (event) => { if (event.target === $('aiSettings')) $('aiSettings').close(); });
window.addEventListener('hashchange', readImportHash);

// Phones can't use bookmarklets easily, so they start on the link importer.
function defaultSource() { return window.matchMedia('(pointer: coarse)').matches ? 'link' : 'button'; }
try { setTheme(localStorage.getItem('review-sprint-theme') || 'dark'); } catch { setTheme('dark'); }
chooseSource(defaultSource());
refreshAiChip();
readImportHash();
