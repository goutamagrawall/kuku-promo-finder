(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.PromoRanker = make();
})(globalThis, function () {
  'use strict';

  const names = ['rule_score', 'opening_visual_action', 'opening_spoken_stakes', 'opening_emotional_turn',
    'opening_dependent_reply', 'opening_speech_delay', 'early_story_stakes', 'dialogue_turns',
    'closing_interruption', 'closing_direct_threat', 'closing_specific_question', 'closing_unresolved_action',
    'closing_reassurance_or_resolution', 'closing_repeated_stakes', 'closing_quiet', 'lead_to_new_stakes',
    'duration_seconds', 'scene_change'];

  const physical = /\b(bursts?|lung(?:es|ing)|tackles?|shoves?|slaps?|strikes?|struck|charges?|seizes?|drags?|explod\w*|explosion|shatters?|collaps\w*|ablaze|burning|blood(?:ied|y|[- ]soaked)?|bleeding|handcuffs?|shackles?|chained|draws? (?:a|his|her) (?:sword|weapon)|brandish\w*|gallows|armed guard)\b/i;
  const stakes = /\b(arrest\w*|witchcraft|poison\w*|arsenic|execut\w*|gallows|hang(?:s|ed|ing)?|kill\w*|dead|died|death|dying|murder\w*|betray\w*|disown\w*|inheritance|dowry|traitor|treason|impost[eo]r|accus\w*|marry|marriage|prison\w*|kidnap\w*|stole|theft|steal\w*|hostage)\b/i;
  const emotional = /\b(surviv\w*|alive|you (?:lied|betrayed|promised|planted|chose|knew)|you (?:cannot|can't) (?:leave|marry)|my (?:mother|wife|husband|son) is|won't marry|cannot marry|will never marry|discarded bride|will you marry|the rightful|gave me your word|you were dead)\b/i;
  const reply = /^["“'\[\s.\-]*(yes|no|then|well|it is|it was|this is|that is|and you|and what|because|they did|she did|what is it|what do you mean|i know|of course)\b/i;
  const interruption = /\b(bursts?|interrupt\w*|shatters?|explod\w*|explosion|fireball|someone (?:is coming|approaches)|guards? (?:drag|shove|seize)|kicks? (?:the|in)|pounds? (?:on|against)|doors? (?:slam|burst)|stop[!.]|wait[!.]|before (?:he|she|they) can|no one will .{0,25} yet)\b/i;
  const threat = /\b(or (?:else|watch)|unless|gallows|before .{0,45} (?:hangs?|dies?|kills?|arrives?)|will (?:hang|kill|die|burn|destroy)|is to be executed|under arrest|burn(?:s|ing)?|take (?:her|him) away|searing iron|who sent you|choose your witnesses|one condition|you are disowned|do you want the same punishment)\b/i;
  const question = /\b(will you|will (?:he|she|they)|can you (?:save|stop|tell)|where (?:is|did)|who (?:sent|has|did|is|could|else|poisoned)|what (?:happens|will happen|do you want)|how did (?:you|he|she)|are you certain|why would anyone|what did you|how much longer)\b/i;
  const uncertainty = /\b(hovers?|inches from|raises? .{0,35}(?:club|iron|blade|weapon)|reaches? for|kneels?.{0,45} ring|offering .{0,40}ring|aims?|await(?:s|ing)|no answer|prepares? to|lung(?:es|ing)|drags?|reveals? (?:a|the) .{0,30}(?:guard|weapon)|raises? .{0,30}(?:paper|parchment)|read the first)\b/i;
  const closure = /\b(safe(?:ly| now| tonight)|rescued|no one will hurt you|i've got you|you saved|you have saved|he is saved|the herbs did their work|it is over|it's over|finally at peace|walks? (?:off|away|hand-in-hand)|escaped|retreats?|i accept|i didn't need to|unspoken bond|sinks? into .{0,28} warmth|i chose you because|thank you|you are safe|drops? his guard)\b/i;
  const quiet = /\b(smiles? (?:softly|gently|warmly)|tender(?:ly|ness)?|bandag\w*|silent beneath|quietly reassur\w*|gaze deeply|warmth|peaceful(?:ly)?|relaxes?|embrac\w*)\b/i;

  function spokenInOpening(event, cutoff) {
    const words = event.text.split(/\s+/);
    const available = Math.min(1, (cutoff - event.start) / (event.end - event.start));
    return words.slice(0, Math.min(words.length, Math.ceil(words.length * available))).join(' ');
  }

  function features(episode, clip) {
    const cutoff = clip.start + 300;
    const window = episode.events.filter(e => e.start >= clip.start && e.end <= clip.end);
    const story = window.filter(e => e.kind === 'dialogue' || e.kind === 'action');
    const opening = window.filter(e => e.start < cutoff);
    const visual = opening.filter(e => e.kind === 'action' || e.kind === 'camera');
    const openingSpeech = opening.filter(e => e.kind === 'dialogue');
    const words = openingSpeech.map(e => spokenInOpening(e, cutoff)).join(' ');
    const early = story.filter(e => e.start < clip.start + 1000);
    const last = story.filter(e => e.end > clip.end - 550);
    const closing = last.map(e => e.text).join(' ');
    const recent = early.map(e => e.text).join(' ');
    const firstSpeaker = story.find(e => e.kind === 'dialogue');
    const earlyWords = new Set((recent.toLowerCase().match(/[a-z]+/g) ?? []).filter(word => stakes.test(word)));
    const lastWords = (closing.toLowerCase().match(/[a-z]+/g) ?? []).filter(word => stakes.test(word));
    const newEndStakes = lastWords.some(word => !earlyWords.has(word));
    const flag = (pattern, content) => Number(pattern.test(content));
    return [clip.score, Number(visual.some(e => physical.test(e.text))), flag(stakes, words), flag(emotional, words),
      flag(reply, words), Math.min(8, ((firstSpeaker?.start ?? clip.start + 800) - clip.start) / 100),
      Math.min(3, early.filter(e => stakes.test(e.text) || emotional.test(e.text)).length),
      Math.min(12, new Set(story.filter(e => e.kind === 'dialogue').map(e => e.label.split(' (')[0])).size
        + story.filter(e => e.kind === 'dialogue').length / 4),
      flag(interruption, closing), flag(threat, closing), flag(question, closing), flag(uncertainty, closing),
      flag(closure, closing), Number(lastWords.some(word => earlyWords.has(word))),
      Number(!last.length || quiet.test(closing)), Number(newEndStakes), clip.duration_seconds,
      Number(clip.flags.includes('scene_change'))];
  }

  const sigmoid = value => 1 / (1 + Math.exp(-value));

  function validate(model) {
    if (!model || model.schema !== 1 || !Array.isArray(model.features) || model.features.length !== names.length
      || !names.every((name, i) => name === model.features[i]) || !Number.isFinite(model.intercept)
      || !['means', 'scales', 'weights'].every(key => Array.isArray(model[key]) && model[key].length === names.length
        && model[key].every(Number.isFinite)) || model.scales.some(value => value <= 0)) {
      throw new Error('Incompatible trained ranker file.');
    }
    return model;
  }

  function score(model, values) {
    return sigmoid(model.weights.reduce((sum, weight, i) => sum + weight * (values[i] - model.means[i]) / model.scales[i], model.intercept));
  }

  function scorer(model) {
    validate(model);
    return (episode, clip) => score(model, features(episode, clip)) * 100;
  }

  return { names, features, sigmoid, score, scorer };
});
