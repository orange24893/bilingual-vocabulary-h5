const STEPS = {
  en: [
    { id: 'word', audioKey: 'word' },
    { id: 'definitionZh' },
    { id: 'phrase', audioKey: 'phrase' },
    { id: 'example', audioKey: 'example' }
  ],
  ko: [
    { id: 'word', audioKey: 'word' },
    { id: 'definitionKo' },
    { id: 'definitionZh' },
    { id: 'phrase', audioKey: 'phrase' },
    { id: 'example', audioKey: 'example' }
  ]
}

function getSteps(language) {
  return STEPS[language]
}

function canAdvance(step, completedAudioKeys) {
  return !step.audioKey || completedAudioKeys.includes(step.audioKey)
}

function completeAudio(keys, audioKey) {
  return keys.includes(audioKey) ? keys : [...keys, audioKey]
}

function interruptAudio(keys, audioKey) {
  return keys.filter(key => key !== audioKey)
}

module.exports = { getSteps, canAdvance, completeAudio, interruptAudio }
