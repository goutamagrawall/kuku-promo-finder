'use strict';

const engine = globalThis.PromoFinder;
const library = globalThis.PROMO_LIBRARY;
const $ = id => document.getElementById(id);
const libraryPageSize = 20;
let shown = libraryPageSize;
let run;
let report;
let reviewInput;
let sourceName;
let revision = 0;

const trained = globalThis.PROMO_TRAINED_MODEL;
const editorial = globalThis.PROMO_EDITORIAL_MODEL;
const transfer = globalThis.PROMO_TRANSFER_MODEL;
const scorers = {
  trained: trained && globalThis.PromoRanker.scorer(trained),
  editorial: editorial && globalThis.PromoEditorial.scorer(editorial),
  transfer: transfer && globalThis.PromoTransfer.scorer(transfer)
};
const selectedScorer = () => scorers[$('ranking').value];
for (const [name, scorer] of Object.entries(scorers)) {
  $('ranking').querySelector('option[value="' + name + '"]').disabled = !scorer;
}
$('ranking').value = scorers.trained ? 'trained' : 'rules';

function el(tag, value, className) {
  const node = document.createElement(tag);
  if (value != null) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function icon(name) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  const use = document.createElementNS(namespace, 'use');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function beat(label, text) {
  const line = el('p', null, 'beat');
  if (label) line.append(el('strong', label), document.createTextNode(' '));
  line.append(document.createTextNode(text));
  return line;
}

function cutTime(start, end, seconds) {
  const time = el('div', null, 'cut-time');
  time.append(icon('clock'), el('span', start + '–' + end), el('small', Number(seconds).toFixed(2) + ' s'));
  return time;
}

function featuredCuts() {
  const [first, ...others] = library.featured;
  const card = el('article', null, 'feature-main');
  const metadata = el('div', null, 'feature-meta');
  metadata.append(el('span', '#1 overall', 'rank-badge'), el('span', 'Episode ' + first.episode));
  const { start, end } = first.segments[0];
  card.append(metadata, el('h3', first.title), cutTime(start, end, first.duration_seconds),
    beat('Hook', first.hook), beat('Cliffhanger', first.cliffhanger), beat('Why it works', first.why));
  const rail = el('div', null, 'feature-rail');
  others.forEach(row => {
    const details = el('details');
    const summary = el('summary');
    const label = el('span');
    const { start, end } = row.segments[0];
    label.append(el('strong', row.title), el('small', 'Episode ' + row.episode + ' / ' + start + '–' + end));
    summary.append(el('span', String(row.rank).padStart(2, '0')), label, icon('down'));
    const body = el('div', null, 'rail-body');
    body.append(cutTime(start, end, row.duration_seconds), beat('Hook', row.hook),
      beat('Cliffhanger', row.cliffhanger), beat('Why it works', row.why));
    details.append(summary, body);
    rail.append(details);
  });
  $('featured').replaceChildren(card, rail);
}

function showLibraryCuts() {
  const episode = $('library-episode').value;
  const term = $('library-search').value.trim().toLowerCase();
  const rows = library.cuts.filter(row => (episode === 'all' || row.episode === Number(episode))
    && (!term || (row.why + ' ' + row.appeal).toLowerCase().includes(term)));
  const visible = rows.slice(0, shown);
  $('library-cuts').replaceChildren(...visible.map(row => {
    const entry = el('article', null, 'cut-row');
    const label = el('div', 'Episode ' + row.episode, 'episode-label');
    label.append(el('small', 'Rank ' + row.rank));
    entry.append(label, cutTime(row.start, row.end, row.seconds), beat(null, row.why));
    return entry;
  }));
  if (!visible.length) $('library-cuts').append(el('p', 'No cuts match. Try a different episode or search term.', 'empty'));
  $('library-count').textContent = 'Showing ' + visible.length + ' of ' + rows.length + ' cuts';
  $('library-more').hidden = visible.length === rows.length;
}

const episodes = [...new Set(library.cuts.map(row => row.episode))];
$('series-title').textContent = library.title;
$('library-episodes').textContent = episodes.length;
$('library-total').textContent = library.cuts.length;
$('library-episode').append(...episodes.map(number => new Option('Episode ' + number, number)));
$('library-episode').onchange = $('library-search').oninput = () => {
  shown = libraryPageSize;
  showLibraryCuts();
};
$('library-more').onclick = () => {
  shown += libraryPageSize;
  showLibraryCuts();
};
featuredCuts();
showLibraryCuts();

function navigate() {
  const hash = location.hash;
  if (hash === '#main') return;
  const analyzing = hash === '#analyze';
  $('library-page').hidden = analyzing;
  $('analyze-page').hidden = !analyzing;
  const active = $('nav-' + (analyzing ? 'analyze' : 'library'));
  const inactive = $('nav-' + (analyzing ? 'library' : 'analyze'));
  active.setAttribute('aria-current', 'page');
  inactive.removeAttribute('aria-current');
  if (hash === '#all-cuts') $('all-cuts').scrollIntoView();
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navigate);
navigate();

function status(message, error = false) {
  const line = $('status');
  line.hidden = false;
  line.textContent = message;
  line.classList.toggle('error', error);
}

function download(name, value, mime) {
  const href = URL.createObjectURL(new Blob([value], { type: mime }));
  const anchor = Object.assign(document.createElement('a'), { href, download: name });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function timedEvidence(row) {
  const details = el('details');
  details.append(el('summary', 'Show timed script evidence'));
  details.addEventListener('toggle', () => {
    if (!details.open || details.childElementCount > 1) return;
    const episode = run.episodes.find(item => item.number === row.episode);
    const range = episode.pool.find(item => item.id === row.id);
    const evidence = el('ul', null, 'evidence');
    for (const event of episode.events) {
      if (event.start >= range.start && event.end <= range.end && ['dialogue', 'action'].includes(event.kind)) {
        const start = (event.start / 100).toFixed(2);
        evidence.append(el('li', start + ' s / ' + event.label + ' / ' + event.text));
      }
    }
    details.append(evidence);
  });
  return details;
}

function showList() {
  const episode = $('episode').value;
  const method = $('ranking').selectedOptions[0].textContent;
  const rows = report[$('view').value].filter(row => episode === 'all' || row.episode === Number(episode));
  $('list').replaceChildren(...rows.map(row => {
    const segment = row.segments[0];
    const labels = { model_reviewed: 'Reviewed', rejected: 'Rejected by review', trained_ranker: method, rules_only: 'Original rules' };
    const card = el('article', null, 'result-card');
    const meta = el('div', null, 'result-meta');
    meta.append(el('span', row.rank ? '#' + row.rank : 'Rejected', 'rank-badge'),
      el('span', Math.round(row.score) + '/100'), el('span', labels[row.review_status]));
    card.append(meta, el('h3', 'Episode ' + row.episode), cutTime(segment.start, segment.end, row.duration_seconds),
      beat('Hook', row.hook), beat('Cliffhanger', row.cliffhanger), beat('Why it works', row.why), timedEvidence(row));
    return card;
  }));
  if (!rows.length) {
    const message = $('view').value === 'rejected' ? 'No rejected cuts match this view.' : 'No eligible cuts match this view.';
    $('list').append(el('p', message, 'empty'));
  }
}

function showResults(resetFilters = false) {
  $('results').hidden = false;
  if (resetFilters) {
    $('episode').replaceChildren(new Option('All episodes', 'all'), ...report.episodes.map(ep => new Option('Episode ' + ep.episode, ep.episode)));
    $('view').value = 'promos';
  }
  $('result-source').textContent = sourceName + ' / Scores estimate teaser fit from the script.';
  $('stats').replaceChildren(...[[report.episodes.length, 'episodes'], [report.promos.length, 'shortlisted'], [report.review_count, 'reviewed']].map(([count, label]) => {
    const node = el('span');
    node.append(el('b', count), document.createTextNode(label));
    return node;
  }));
  const warnings = [...report.errors.map(error => el('p', error.file + ': ' + error.message, 'error')),
    ...report.episodes.flatMap(ep => ep.warnings.map(warning => el('p', 'Episode ' + ep.episode + ': ' + warning)))];
  $('warnings').replaceChildren(...warnings);
  $('warnings').hidden = !warnings.length;
  $('post').hidden = !report.post_first.length;
  $('post-list').replaceChildren(...report.post_first.map(({ id, why }) => {
    const row = report.promos.find(item => item.id === id);
    return el('li', 'Episode ' + row.episode + ' / ' + row.segments[0].start + '–' + row.segments[0].end + ' / ' + why);
  }));
  $('csv').disabled = !report.promos.length;
  $('packet').disabled = !report.promos.length;
  $('import').disabled = !report.episodes.length;
  showList();
}

function analyze(inputs, source) {
  run = engine.scan(inputs);
  reviewInput = undefined;
  sourceName = source;
  report = engine.summarize(run, reviewInput, selectedScorer());
  showResults(true);
  const files = inputs.length + ' file' + (inputs.length === 1 ? '' : 's');
  if (!report.episodes.length) {
    status('No screenplay could be read. Check the timed block format and try again.', true);
  } else if (!report.promos.length) {
    status('Processed ' + report.episodes.length + ' of ' + files + '. No continuous 20–60 second cut was found.', true);
  } else {
    status('Processed ' + report.episodes.length + ' of ' + files + ' and found ' + report.promos.length + ' cuts.', !!report.errors.length);
  }
}

async function useFiles(files) {
  if (!files.length) return;
  if (files.some(file => !/\.txt$/i.test(file.name))) {
    status('Choose .txt screenplays or paste the script text.', true);
    return;
  }
  const current = ++revision;
  status('Reading screenplay files…');
  $('results').hidden = true;
  try {
    const inputs = await Promise.all(files.map(async file => ({ name: file.name, text: await file.text() })));
    if (current === revision) analyze(inputs, files.length === 1 ? files[0].name : 'Uploaded screenplays');
  } catch (error) {
    if (current === revision) status(error.message, true);
  }
}

function inputMode(paste) {
  $('upload-panel').hidden = paste;
  $('paste-panel').hidden = !paste;
  $('upload-tab').setAttribute('aria-pressed', String(!paste));
  $('paste-tab').setAttribute('aria-pressed', String(paste));
  if (paste) $('script-text').focus();
}

$('upload-tab').onclick = () => inputMode(false);
$('paste-tab').onclick = () => inputMode(true);
$('choose').onclick = () => $('files').click();
$('files').onchange = event => {
  const files = [...event.target.files];
  event.target.value = '';
  useFiles(files);
};
const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('is-over');
});
dropZone.addEventListener('dragleave', event => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-over');
});
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('is-over');
  useFiles([...event.dataTransfer.files]);
});
$('paste-panel').onsubmit = event => {
  event.preventDefault();
  const text = $('script-text').value.trim();
  if (!text) {
    status('Paste the screenplay text before analyzing.', true);
    $('script-text').focus();
    return;
  }
  revision++;
  analyze([{ name: 'episode-001-pasted.txt', text }], 'Pasted screenplay');
};
$('demo').onclick = () => {
  revision++;
  analyze([{ name: 'episode-001-demo.txt', text: globalThis.PROMO_DEMO }], 'Fictional demo');
};
$('episode').onchange = $('view').onchange = showList;
$('ranking').onchange = () => {
  report = engine.summarize(run, reviewInput, selectedScorer());
  showResults();
};
$('csv').onclick = () => download('ranked-promos.csv', engine.csv(report.promos), 'text/csv');
$('json').onclick = () => download('run.json', JSON.stringify(report, null, 2) + '\n', 'application/json');
$('packet').onclick = () => download('private-review-packet.json', JSON.stringify(engine.reviewPacket(run, 18, 'series', selectedScorer()), null, 2) + '\n', 'application/json');
$('import').onclick = () => $('reviews').click();
$('reviews').onchange = async event => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  const current = revision;
  try {
    const input = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (current !== revision) return;
    report = engine.summarize(run, input, selectedScorer());
    reviewInput = input;
    showResults();
    status('Imported ' + report.review_count + ' reviews from ' + report.reviewer + '.');
  } catch (error) {
    if (current === revision) status('Review import: ' + error.message, true);
  }
};
