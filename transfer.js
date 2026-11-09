(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('./ranker.js'));
  else root.PromoTransfer = make(root.PromoRanker);
})(globalThis, function (ranker) {
  'use strict';

  const emotions = ['anger', 'disgust', 'fear', 'joy', 'neutral', 'sadness', 'surprise'];
  const dimension = 1024;
  const names = [...ranker.names, ...['opening', 'ending'].flatMap(part => emotions.map(e => `${part}_${e}`)),
    'dialogue_emotion_shift', 'first_line_words', 'dialogue_coverage'];

  function vector(text) {
    const tokens = text.toLowerCase().replace(/’/g, "'").match(/[a-z]+(?:'[a-z]+)?|[!?]/g) ?? [];
    const features = new Set(tokens);
    for (let i = 1; i < tokens.length; i++) features.add(`${tokens[i - 1]} ${tokens[i]}`);
    const buckets = new Set();
    for (const token of features) {
      let hash = 2166136261;
      for (const character of token) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      buckets.add((hash >>> 0) % dimension);
    }
    return [...buckets].sort((a, b) => a - b);
  }

  function emotion(model, text) {
    const buckets = vector(text);
    if (!buckets.length) return emotions.map(() => 0);
    const length = Math.sqrt(buckets.length);
    const logits = model.weights.map((weights, i) => model.intercept[i]
      + buckets.reduce((sum, bucket) => sum + weights[bucket], 0) / length);
    const max = Math.max(...logits);
    const exp = logits.map(value => Math.exp(value - max));
    const total = exp.reduce((sum, value) => sum + value, 0);
    return exp.map(value => value / total);
  }

  function clipFeatures(model, episode, clip) {
    const speech = episode.events.filter(e => e.kind === 'dialogue' && e.start >= clip.start && e.end <= clip.end);
    const opening = speech.filter(e => e.start < clip.start + 300);
    const closing = speech.filter(e => e.end > clip.end - 550);
    const firstText = opening.map(event => {
      const words = event.text.split(/\s+/);
      return words.slice(0, Math.ceil(words.length * Math.min(1, (clip.start + 300 - event.start) / (event.end - event.start)))).join(' ');
    }).join(' ');
    const endText = closing.map(e => e.text).join(' ');
    const a = emotion(model, firstText);
    const b = emotion(model, endText);
    const change = firstText && endText ? a.reduce((sum, p, i) => sum + Math.abs(p - b[i]), 0) / 2 : 0;
    return [...ranker.features(episode, clip), ...a, ...b, change, firstText ? firstText.split(/\s+/).length : 0,
      Math.min(1, speech.reduce((sum, e) => sum + e.end - e.start, 0) / (clip.end - clip.start))];
  }

  function scorer(model) {
    if (!model || model.schema !== 'transfer-1' || !names.every((n, i) => model.features?.[i] === n)
      || model.features.length !== names.length || !['logistic', 'mlp'].includes(model.kind)
      || !model.means?.every(Number.isFinite) || model.means.length !== names.length
      || !model.scales?.every(value => Number.isFinite(value) && value > 0) || model.scales.length !== names.length
      || !Array.isArray(model.layers) || model.layers.length !== (model.kind === 'mlp' ? 3 : 1)
      || model.layers.at(-1)?.bias?.length !== 1
      || !Array.isArray(model.emotion?.weights) || model.emotion.weights.length !== emotions.length
      || !model.emotion.weights.every(row => row.length === dimension && row.every(Number.isFinite))
      || model.emotion.intercept?.length !== emotions.length || !model.emotion.intercept.every(Number.isFinite)) {
      throw new Error('Incompatible dialogue transfer model.');
    }
    let width = names.length;
    for (const layer of model.layers) {
      if (!Array.isArray(layer.bias) || !layer.bias.length || !layer.bias.every(Number.isFinite)
        || !Array.isArray(layer.weights) || layer.weights.length !== layer.bias.length
        || !layer.weights.every(row => row.length === width && row.every(Number.isFinite))) {
        throw new Error('Invalid dialogue transfer model layer.');
      }
      width = layer.bias.length;
    }
    const rank = (episode, clip) => {
      let values = clipFeatures(model.emotion, episode, clip).map((value, i) => (value - model.means[i]) / model.scales[i]);
      model.layers.forEach((layer, index) => {
        values = layer.weights.map((weights, j) => {
          const sum = weights.reduce((total, weight, i) => total + weight * values[i], layer.bias[j]);
          return index < model.layers.length - 1 ? Math.tanh(sum) : sum;
        });
      });
      return 100 * ranker.sigmoid(values[0]);
    };
    return Object.assign(rank, { rankingMethod: `dialogue_transfer_${model.kind}` });
  }

  return { dimension, emotions, names, vector, emotion, clipFeatures, scorer };
});
