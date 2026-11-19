function normalizeWord(text, language) {
  const normalized = text.trim().replace(/\s+/g, ' ').normalize('NFC')
  return language === 'en' ? normalized.toLowerCase() : normalized
}

function switchWordbookLanguage(view, language) {
  return { language, filter: view.filter, query: '' }
}

function filterWordbook(words, states, view) {
  const query = view.query.trim().toLocaleLowerCase()
  return words.filter(word => {
    if (word.language !== view.language) return false
    if (query && !`${word.text} ${word.definitionZh}`.toLocaleLowerCase().includes(query)) return false
    if (view.filter === 'custom') return word.source === 'custom'
    if (view.filter === 'mastered') return states[word.id]?.status === 'mastered'
    if (view.filter === 'learning') return states[word.id]?.status !== 'mastered'
    return true
  })
}

module.exports = { normalizeWord, switchWordbookLanguage, filterWordbook }
