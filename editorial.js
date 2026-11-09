(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('./ranker.js'));
  else root.PromoEditorial = make(root.PromoRanker);
})(globalThis, function (ranker) {
  'use strict';

  const names = [...ranker.names, 'opens_on_shot', 'ends_on_shot', 'starts_episode', 'ends_episode',
    'opening_conflict', 'closing_conflict', 'story_arc', 'opening_signal_delay', 'closing_signal_gap',
    'first_story_delay', 'last_story_gap', 'midpoint_stakes', 'ending_reaction', 'starts_action', 'ends_action',
    'ending_reversal', 'speakers', 'dialogue_density', 'opening_visual_change', 'closing_visual_change'];
  const conflict = /\b(?:betrayal|betray|poison(?:ed|ing)?|stole|steal|stolen|arrest|hang|kill|execution|witchcraft|gallows|guards?|my (?:wife|husband|mother|son|sister)|marry(?:ing)?|wedding|no right|hand in marriage|heir|rightful|you (?:planted|lied|knew)|help (?:me|her|him))\b/i;
  const change = /\b(?:reveal\w*|recogniz\w*|bursts?|snatch\w*|explod\w*|slams?|collaps\w*|tackl\w*|lung\w*|shov\w*|seiz\w*|charg\w*|strik\w*|rush\w*|kneel\w*|drops?|snips?|unveils?)\b/i;
  const reversal = /\b(?:accept my hand|your husband hangs|who gave this|what is your husband's name|no one will|you are not|impost[eo]r|they (?:killed|stole|lied)|before (?:he|she|they) can|armed (?:men|figures)|fireball|rightful duke|the dead duke)\b/i;
  const shotStarts = new WeakMap();

  function features(episode, clip) {
    if (!shotStarts.has(episode)) {
      shotStarts.set(episode, new Set([...episode.sceneStarts, ...episode.events.filter(e => e.kind === 'camera').map(e => e.start)]));
    }
    const shots = shotStarts.get(episode);
    const { start, end } = clip;
    const events = episode.events.filter(e => e.start >= start && e.end <= end);
    const speech = events.filter(e => e.kind === 'dialogue');
    const story = events.filter(e => e.kind === 'dialogue' || e.kind === 'action');
    const opening = events.filter(e => e.start < start + 400);
    const closing = events.filter(e => e.end > end - 500);
    const middle = story.filter(e => e.start >= start + 400 && e.end <= end - 500);
    const significant = events => events.filter(e => e.tags.some(([, strength]) => strength >= 3));
    const hasText = (events, pattern) => Number(events.some(e => pattern.test(e.text)));
    const visual = events => events.filter(e => e.kind === 'action' || e.kind === 'camera');
    const seconds = t => t ? 60 * Number(t.split(':')[0]) + Number(t.split(':')[1]) : null;
    const firstSignal = seconds(clip.opening_signal.at);
    const lastSignal = seconds(clip.ending_signal.at);
    return [...ranker.features(episode, clip), Number(shots.has(start)), Number(shots.has(end) || end === episode.duration),
      Number(start === episode.starts[0]), Number(end === episode.duration), hasText(opening, conflict), hasText(closing, conflict),
      new Set(significant(story).flatMap(e => e.tags.filter(([, strength]) => strength >= 3).map(([tag]) => tag))).size,
      firstSignal === null ? 4 : Math.max(0, firstSignal - start / 100),
      lastSignal === null ? 6 : Math.max(0, end / 100 - lastSignal),
      Math.min(8, ((story[0]?.start ?? start + 800) - start) / 100),
      Math.min(8, (end - Math.max(end - 800, ...story.map(e => e.end))) / 100),
      Math.min(8, significant(middle).length), hasText(closing, /\b(?:gasps?|stunn\w*|shock\w*|realiz\w*|eyes widen|horror)\b/i),
      Number(visual(opening).some(e => e.kind === 'action' && e.start === start)),
      Number(visual(closing).some(e => e.kind === 'action' && e.end === end)),
      hasText(closing, reversal), new Set(speech.map(e => e.label.split(' (')[0])).size,
      speech.length / clip.duration_seconds, hasText(visual(opening), change), hasText(visual(closing), change)];
  }

  function scorer(model) {
    if (model?.schema !== 'editorial-1' || !Array.isArray(model.features) || model.features.length !== names.length
      || !names.every((name, i) => name === model.features[i])
      || !['means', 'scales', 'weights'].every(key => Array.isArray(model[key]) && model[key].length === names.length
        && model[key].every(Number.isFinite)) || model.scales.some(value => value <= 0)
      || !Number.isFinite(model.blend) || model.blend < 0) {
      throw new Error('Incompatible editorial ranker file.');
    }
    ranker.scorer(model.baseline);
    const predict = (episode, clip) => {
      const x = features(episode, clip);
      const editorial = model.weights.reduce((sum, weight, i) => sum + weight * (x[i] - model.means[i]) / model.scales[i], 0);
      const v2 = Math.max(1e-9, Math.min(1 - 1e-9, ranker.score(model.baseline, x.slice(0, ranker.names.length))));
      return ranker.sigmoid(editorial + model.blend * Math.log(v2 / (1 - v2))) * 100;
    };
    predict.rankingMethod = 'editorial_pairwise';
    return predict;
  }

  return { names, features, scorer };
});
