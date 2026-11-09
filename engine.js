(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.PromoFinder = make();
})(globalThis, function () {
  'use strict';

  const VERSION = '1.0';
  const TIME = '(\\d{1,3}:[0-5]\\d\\.\\d{2})';
  const TAGS = [
    ['violence', 4, 3, /\b(slaps?|strikes?|struck|lashes?|punch(?:es)?|stabs?|strangles?|bloodied|bleeding|blood[- ]soaked|chokes?|brandishes?|lunge[sd]?|lunging|riding crop|red-hot iron)\b/i],
    ['danger', 4, 4, /\b(explo(?:sion|des?)|shatters?|ablaze|inferno|gunshot|poison(?:s|ed|ing)?|arsenic|gallows|hang(?:ed|ing)?|execut(?:e[ds]?|ion)|kill(?:s|ed)?|arrest(?:s|ed)?|dungeons?|burn(?:s|ed|ing)? alive)\b/i],
    ['betrayal', 4, 3, /\b(betray(?:s|ed|al)?|disown(?:s|ed)?|inheritance|marry(?:ing)? (?:her|him|you|my|your)|engagement|dowry|bride|illegitimate|annul(?:s|led|ment)?|invalid(?:ate[sd]?)?|ruined)\b/i],
    ['reveal', 4, 4, /\b(rightful|your son|my son|your mother|my husband|my wife|I am (?:the|your)|alive|survived|it was (?:you|him|her)|traitor|treason|confess(?:es|ion|ed)?|forged|framed|recogniz(?:es?|ed)|admits?|reveals?|exposes?|unmask(?:s|ed)?|impostor)\b/i],
    ['ultimatum', 4, 4, /\b(or else|unless|on one condition|your choice|one chance|you will (?:die|hang|pay)|I will (?:kill|destroy|burn)|must choose|ultimatum|demands?|swears?|threaten(?:s|ed|ing)?)\b/i],
    ['proposal', 4, 4, /\b(marry me|will you marry|propos(?:e[sd]?|al|ing)|one knee|take my hand)\b/i],
    ['interruption', 2, 4, /\b(interrupts?|bursts? (?:in|open)|doors? (?:swing|slam|burst)|kicks? (?:in|open)|knock(?:s|ing)? (?:on|at)|footsteps|storms? in|cut(?:s)? (?:abruptly|to black))\b/i],
    ['confrontation', 3, 3, /\b(accus(?:es?|ed|ation)|orders?|confronts?|refuses?|never again|how dare|get out|you (?:dare|lied|knew|did this)|guards?|prisoner|chains?|trial)\b/i],
    ['romance', 2, 2, /\b(kiss(?:es|ed|ing)?|embrace[sd]?|tender(?:ly|ness)?|intimate|I love you|I need you|I trust you)\b/i],
    ['question', 1, 2, /\?/],
    ['reaction', 1, 1, /\b(gasps?|shocked|stunned|freezes?|falter(?:s|ed)?|eyes widen|recoils?|trembles?)\b/i],
    ['resolution', 0, 0, /\b(safe now|it is over|it's over|all over|rescued|forgiven|cured|we won|walk(?:s|ed)? away|leaves peacefully|finally at peace)\b/i]
  ];
  const EXPLANATIONS = {
    violence: ['A physical threat or blow registers immediately.', 'The clip cuts with physical danger still in play.'],
    danger: ['An immediate danger establishes stakes.', 'A dangerous outcome hangs in the balance.'],
    betrayal: ['A relationship or status reversal raises the stakes.', 'The consequences of the reversal are still open.'],
    reveal: ['A disclosure challenges what someone believed.', 'A disclosure leaves its consequences unanswered.'],
    ultimatum: ['A threat or demand puts a character under pressure.', 'A threatened consequence or forced choice remains open.'],
    proposal: ['A marriage or commitment beat invites an immediate reaction.', 'A proposal or commitment beat leaves the response in question.'],
    interruption: ['An abrupt interruption changes the scene.', 'An interruption cuts off the expected next action.'],
    confrontation: ['An accusation or confrontation sets up conflict.', 'A confrontation continues past the cut.'],
    romance: ['An intimate beat puts the relationship in focus.', 'An intimate beat leaves the next response open.'],
    question: ['A question creates an immediate information gap.', 'The last question invites an answer beyond the cut.'],
    reaction: ['A visible reaction signals something has changed.', 'The final reaction suggests consequences to come.'],
    none: ['Opening needs an editor to confirm the hook.', 'Ending needs an editor to confirm the open question.']
  };

  function timestamp(s) {
    const [m, sec, hundredths] = s.split(/[:.]/).map(Number);
    return m * 6000 + sec * 100 + hundredths;
  }

  function format(t) {
    return `${String(Math.floor(t / 6000)).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`;
  }

  function fingerprint(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function parse(name, source) {
    const script = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if ([...script.matchAll(/^\s*EPISODE NUMBER:/gim)].length > 1) {
      throw new Error('Use one episode per file or paste. Split combined scripts into separate .txt files.');
    }
    const number = script.match(/^\s*EPISODE NUMBER:\s*(?:Episode\s*)?(\d+)/im)?.[1]
      ?? name.match(/episode[-_ ]*(\d+)/i)?.[1];
    if (!number || +number < 1) throw new Error('Missing a positive episode number.');
    const text = script.split(/--- SCRIPT START ---/i).at(-1).split(/--- SCRIPT END ---/i)[0];
    const events = [];
    const sceneStarts = [];
    const sceneEnds = [];
    const issues = [];
    let block = null;
    const timed = new RegExp(`^Start:\\s*\\(${TIME}\\)\\s*\\|\\s*End:\\s*\\(${TIME}\\)\\s*$`, 'i');
    const sceneBoundary = new RegExp(`^Scene (start|end):\\s*${TIME}\\s*$`, 'i');
    const complete = () => {
      if (!block) return;
      if (block.start == null || block.end <= block.start || !block.lines.length) {
        issues.push(`Skipped malformed ${block.label} block at line ${block.line}.`);
      } else {
        const value = block.lines.join(' ').trim();
        const label = block.label;
        const kind = /^(camera|action|sound(?:\s+(?:fx|effect[s]?))?|sfx|music|transition|visual(?: fx)?)$/i.test(label)
          ? label.toLowerCase().split(' ')[0] : 'dialogue';
        events.push({ start: block.start, end: block.end, kind, label, text: value,
          tags: TAGS.filter(([, , , regex]) => regex.test(value)) });
      }
      block = null;
    };
    text.split('\n').forEach((raw, index) => {
      const line = raw.trim();
      if (!line) return;
      const scene = line.match(sceneBoundary);
      if (scene) {
        complete();
        (scene[1].toLowerCase() === 'start' ? sceneStarts : sceneEnds).push(timestamp(scene[2]));
        return;
      }
      if (/^(?:SCENE\s+\d+\b|Scene heading:|Actions and dialogue:)/i.test(line)) {
        complete();
        return;
      }
      const label = line.match(/^\*\*(.+?):\*\*$/);
      if (label) {
        complete();
        block = { label: label[1], line: index + 1, lines: [] };
        return;
      }
      if (!block) return;
      const time = line.match(timed);
      if (time) {
        block.start = timestamp(time[1]);
        block.end = timestamp(time[2]);
      } else block.lines.push(line);
    });
    complete();
    if (!events.length) throw new Error('No usable timestamped screenplay blocks.');
    if (!sceneStarts.length || !sceneEnds.length) issues.push('Scene metadata incomplete. Event timestamps used for coverage.');
    events.sort((a, b) => a.start - b.start || a.end - b.end);
    const duration = Math.max(...events.map(event => event.end), ...sceneEnds);
    const starts = [...new Set([events[0].start, ...sceneStarts, ...events.map(event => event.start)])].sort((a, b) => a - b);
    const ends = [...new Set([duration, ...sceneEnds, ...events.map(event => event.end),
      ...events.filter(event => event.kind === 'camera').map(event => event.start)])].sort((a, b) => a - b);
    return { number: +number, name, key: fingerprint(text.trim()), events, duration, starts, ends, sceneStarts, issues };
  }

  function evidence(events, position, side) {
    let best = { score: 0, tag: 'none', event: null };
    for (const event of events) {
      if (!['action', 'dialogue', 'camera', 'sound', 'sfx'].includes(event.kind)) continue;
      for (const [tag, hook, cliff] of event.tags) {
        if (side === 1 && tag === 'interruption' && /^cut(?:s)? to black\.?$/i.test(event.text)) continue;
        const strength = side === 0 ? hook : cliff;
        if (!strength) continue;
        const distance = side === 0 ? event.start - position : position - event.end;
        const score = strength + (event.kind === 'action' ? .65 : event.kind === 'dialogue' ? .45 : 0) - distance / 600;
        if (score > best.score) best = { score, tag, event };
      }
    }
    return best;
  }

  const intersect = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const overlap = (a, b) => intersect(a, b) / (Math.max(a.end, b.end) - Math.min(a.start, b.start));
  const cutsSpeech = (events, time) => events.some(event => event.start < time && time < event.end);
  const showEvidence = (e, side) => ({ tag: e.tag, at: e.event ? format(side === 0 ? e.event.start : e.event.end) : null });

  function shortlist(ranked) {
    const chosen = [];
    for (const row of ranked) {
      if (chosen.every(prev => overlap(row, prev) < .50)) chosen.push(row);
      if (chosen.length === 2) break;
    }
    return chosen;
  }

  function candidates(ep) {
    const dialogue = ep.events.filter(event => event.kind === 'dialogue');
    const shot = new Set([...ep.sceneStarts, ...ep.events.filter(event => event.kind === 'camera').map(event => event.start)]);
    const safeEnds = ep.ends.filter(end => !cutsSpeech(dialogue, end));
    const result = [];
    let eligible = 0;
    for (const start of ep.starts) {
      if (cutsSpeech(dialogue, start)) continue;
      const first = ep.events.filter(e => e.start >= start && e.start < start + 300);
      const hook = evidence(first, start, 0);
      for (const end of safeEnds) {
        const length = end - start;
        if (length < 2000) continue;
        if (length > 6000) break;
        const within = ep.events.filter(e => e.start >= start && e.end <= end);
        const story = within.filter(e => e.kind === 'action' || e.kind === 'dialogue');
        if (!story.length) continue;
        eligible++;
        const last = within.filter(e => e.end > end - 500);
        const cliff = evidence(last, end, 1);
        const early = within.filter(e => e.start < start + 1000 && e.end <= start + 1600);
        const stakes = new Set(early.flatMap(e => e.tags.filter(([, h]) => h >= 3).map(([name]) => name)));
        const weakOpening = first.some(e => e.kind === 'dialogue' && /^["“']?(?:yes|no|it|that|this|he|she|they|then)\b/i.test(e.text));
        const setup = Math.max(0, Math.min(3.5, 1.2 + .5 * stakes.size + (story.length >= 4 ? .5 : 0) - (weakOpening ? .45 : 0)));
        const closure = last.some(e => e.tags.some(([name]) => name === 'resolution')) ? 1.5 : 0;
        const sceneChanges = ep.sceneStarts.filter(t => start < t && t < end).length;
        const rhythm = Math.max(0, 1 - Math.abs(length - 3700) / 2600);
        const weight = 13.5 * hook.score + 12.5 * cliff.score + 9 * setup + 7 * rhythm
          + 3 * Number(shot.has(start)) + 2 * Number(shot.has(end)) - 8 * closure - 5 * sceneChanges;
        const roundedWeight = Math.min(100, Math.max(0, Math.round(weight)));
        const score = Math.min(100, Math.max(0, Math.round(weight / 1.65)));
        result.push({ start, end, score, roundedWeight, hook, cliff, sceneChanges });
      }
    }
    result.sort((a, b) => b.score - a.score || b.roundedWeight - a.roundedWeight || b.hook.score - a.hook.score
      || b.cliff.score - a.cliff.score || a.start - b.start || a.end - b.end);
    const pool = [];
    for (const item of result) {
      if (pool.every(other => overlap(item, other) < .72)) pool.push(item);
      if (pool.length === 6) break;
    }
    return { eligible, pool: pool.map(item => {
      const start = format(item.start);
      const end = format(item.end);
      const flags = [];
      if (item.hook.score < 3.5) flags.push('weak_opening_signal');
      if (item.cliff.score < 3.5) flags.push('weak_cliffhanger_signal');
      if (item.sceneChanges) flags.push('scene_change');
      return { id: `E${String(ep.number).padStart(2, '0')}-${ep.key}-${item.start}-${item.end}`,
        episode: ep.number, segments: [{ episode: ep.number, start, end }], start: item.start, end: item.end,
        duration_seconds: (item.end - item.start) / 100, score: item.score,
        hook: EXPLANATIONS[item.hook.tag][0], cliffhanger: EXPLANATIONS[item.cliff.tag][1],
        why: `Opening: ${item.hook.tag.replace('none', 'unclear')}. Ending: ${item.cliff.tag.replace('none', 'unclear')}. Read for cold-viewer context.`,
        opening_signal: showEvidence(item.hook, 0), ending_signal: showEvidence(item.cliff, 1), flags };
    }) };
  }

  function scan(files) {
    const episodes = [];
    const errors = [];
    const seen = new Set();
    for (const file of files) {
      try {
        const ep = parse(file.name, file.text);
        if (seen.has(ep.number)) throw new Error(`Duplicate episode ${ep.number}. Upload one show at a time.`);
        seen.add(ep.number);
        episodes.push({ ...ep, ...candidates(ep) });
      } catch (error) { errors.push({ file: file.name, message: error.message }); }
    }
    return { episodes: episodes.sort((a, b) => a.number - b.number), errors };
  }

  function reviewMap(episodes, input) {
    if (input == null) return new Map();
    if (!input || typeof input.reviewer !== 'string' || !input.reviewer.trim() || !Array.isArray(input.reviews)) {
      throw new Error('Review JSON needs a reviewer and a reviews array.');
    }
    const known = new Set(episodes.flatMap(ep => ep.pool.map(row => row.id)));
    const reviews = new Map();
    for (const row of input.reviews) {
      if (!row || !known.has(row.id) || reviews.has(row.id)) throw new Error(`Unknown or duplicate review ID: ${row?.id}.`);
      if (!['hook_score', 'cliffhanger_score', 'context_score'].every(key => Number.isInteger(row[key]) && row[key] >= 0 && row[key] <= 4)
        || typeof row.reject !== 'boolean' || !['hook', 'cliffhanger', 'why'].every(key => typeof row[key] === 'string'
          && row[key].trim().length > 0 && row[key].length <= 350)) throw new Error(`Invalid scores or notes for ${row.id}.`);
      reviews.set(row.id, row);
    }
    return reviews;
  }

  function summarize(run, reviewInput, scorer) {
    const reviews = reviewMap(run.episodes, reviewInput);
    const promos = [];
    const rejected = [];
    for (const ep of run.episodes) {
      const ranked = ep.pool.map(item => {
        const { start, end, score, ...output } = item;
        const review = reviews.get(item.id);
        if (!review) return { ...output, start, end, score: scorer ? scorer(ep, item) : score, rule_score: score,
          review_status: scorer ? 'trained_ranker' : 'rules_only' };
        return { ...output, start, end, rule_score: score, score: Math.round((.4 * review.hook_score + .35 * review.cliffhanger_score
          + .25 * review.context_score) * 25), review_status: review.reject ? 'rejected' : 'model_reviewed',
          hook: review.hook, cliffhanger: review.cliffhanger, why: review.why,
          rubric: { hook: review.hook_score, cliffhanger: review.cliffhanger_score, context: review.context_score } };
      });
      ranked.sort(compare);
      rejected.push(...ranked.filter(row => row.review_status === 'rejected').map(clean));
      promos.push(...shortlist(ranked.filter(row => row.review_status !== 'rejected')).map(clean));
    }
    promos.sort(compare);
    const firstByEpisode = promos.filter((row, index) => promos.findIndex(prev => prev.episode === row.episode) === index);
    const postFirst = firstByEpisode.filter(row => row.review_status === 'model_reviewed' && row.rubric.hook >= 3
      && row.rubric.cliffhanger >= 3 && row.rubric.context >= 3).slice(0, 5);
    return { version: VERSION, episodes: run.episodes.map(ep => ({ episode: ep.number, duration: format(ep.duration),
      timed_blocks: ep.events.length, eligible_windows: ep.eligible, shortlisted_windows: ep.pool.length,
      warnings: [...ep.issues, ...(!ep.pool.length ? ['No eligible 20–60 second window.'] : [])] })),
    errors: run.errors, reviewer: reviewInput?.reviewer ?? null, review_count: reviews.size,
    ...(scorer ? { ranking_method: scorer.rankingMethod ?? 'trained_logistic' } : {}),
    post_first: postFirst.map(({ id, why }) => ({ id, why })), promos: promos.map((row, index) => ({ rank: index + 1, ...row })), rejected };
  }

  const clean = ({ start, end, ...row }) => row;
  const reviewOrder = { model_reviewed: 0, trained_ranker: 1, rules_only: 1, rejected: 2 };
  const compare = (a, b) => reviewOrder[a.review_status] - reviewOrder[b.review_status]
    || b.score - a.score || b.rule_score - a.rule_score || a.episode - b.episode || a.id.localeCompare(b.id);

  function reviewPacket(run, limit = 18, mode = 'series', scorer) {
    const eligible = run.episodes.flatMap(ep => ep.pool.map(item => ({ ep, item, score: scorer ? scorer(ep, item) : item.score })));
    eligible.sort((a, b) => b.score - a.score || b.item.score - a.item.score || a.ep.number - b.ep.number);
    const count = new Map();
    const selected = [];
    for (const { ep, item } of eligible) {
      if (mode === 'series' && count.get(ep.number)) continue;
      count.set(ep.number, true);
      selected.push({ id: item.id, episode: ep.number, segments: item.segments, opening_signal: item.opening_signal,
        ending_signal: item.ending_signal, evidence: ep.events.filter(event => event.start >= item.start && event.end <= item.end
          && !['sound', 'music', 'sfx'].includes(event.kind)).map(e => [format(e.start), format(e.end), e.label, e.text]) });
      if (selected.length >= limit) break;
    }
    return { instruction: 'Act as a cold-viewer promo editor. Judge each fixed window independently using only its timed evidence. Keep IDs and never change timestamps. Use integer 0–4 scores: hook (visible or spoken in first 3 seconds), cliffhanger (a specific unanswered question at the end), context (stakes clear to a first-time viewer). 0 absent, 1 weak, 2 borderline, 3 clear, 4 exceptional. Reject if any score is below 3. A cut to black alone is not a cliffhanger. A prior episode cannot supply context. Use fresh paraphrases, no dialogue quotes. In why, name the reason to post or the specific failure.',
      output_schema: { reviewer: 'model name', reviews: [{ id: 'exact candidate ID', hook_score: 0, cliffhanger_score: 0,
        context_score: 0, reject: true, hook: 'short paraphrase', cliffhanger: 'short paraphrase', why: 'one line' }] }, candidates: selected };
  }

  function csv(rows) {
    const headings = ['rank', 'id', 'episode', 'start', 'end', 'duration_seconds', 'score', 'rule_score', 'review_status', 'hook', 'cliffhanger', 'why', 'flags'];
    const quote = value => {
      const safe = String(value ?? '').replace(/^[\s]*[=+@-]/, match => `'${match}`);
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [headings.join(','), ...rows.map(row => headings.map(key => quote(key === 'start' || key === 'end' ? row.segments[0][key] : row[key])).join(','))].join('\r\n') + '\r\n';
  }

  return { VERSION, parse, scan, summarize, reviewPacket, csv, shortlist };
});
