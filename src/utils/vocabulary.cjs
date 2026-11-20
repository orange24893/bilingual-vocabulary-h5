function sortIndexEntries(entries) {
  return [...entries].sort((a, b) =>
    (a.priority ?? 999999999) - (b.priority ?? 999999999) ||
    a.normalizedText.localeCompare(b.normalizedText) || a.id.localeCompare(b.id)
  )
}

function paginate(items, requestedPage, pageSize = 50) {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1))
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageCount
  }
}

function repairSession(session, validIds) {
  const previousCurrentId = session.wordIds[session.currentWordIndex]
  const currentPreserved = previousCurrentId && validIds.has(previousCurrentId)
  const validBeforeCurrent = session.wordIds
    .slice(0, session.currentWordIndex)
    .filter(id => validIds.has(id)).length
  const wordIds = session.wordIds.filter(id => validIds.has(id))
  return {
    ...session,
    wordIds,
    currentWordIndex: Math.min(validBeforeCurrent, wordIds.length),
    currentStepId: currentPreserved ? session.currentStepId : 'word',
    completedAudioKeys: currentPreserved ? session.completedAudioKeys : []
  }
}

function resolveVocabularyUrl(root, url) {
  const prefix = '/static/vocabulary/'
  if (!url.startsWith(prefix)) return url
  return `${root.replace(/\/+$/, '')}/${url.slice(prefix.length)}`
}

function resolveWordAssets(word, root) {
  return {
    ...word,
    wordAudioUrl: resolveVocabularyUrl(root, word.wordAudioUrl),
    phrase: { ...word.phrase, audioUrl: resolveVocabularyUrl(root, word.phrase.audioUrl) },
    example: { ...word.example, audioUrl: resolveVocabularyUrl(root, word.example.audioUrl) }
  }
}

module.exports = { paginate, repairSession, resolveVocabularyUrl, resolveWordAssets, sortIndexEntries }
