const INTERVALS = [1, 1, 2, 3, 8, 15, 30]

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getToday(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nextStudyState(state, rating, today) {
  const history = [...(state.history || []), { date: today, rating, stage: state.stage }]
  if (rating === 'unknown') {
    return { ...state, stage: 0, status: 'learning', nextDueDate: addDays(today, 1), lastCompletedDate: today, history }
  }
  if (rating === 'fuzzy') {
    return { ...state, status: 'learning', nextDueDate: addDays(today, 1), lastCompletedDate: today, history }
  }
  if (state.stage >= 7) {
    return { ...state, stage: 7, status: 'mastered', lastCompletedDate: today, history }
  }
  return {
    ...state,
    stage: state.stage + 1,
    status: 'learning',
    firstLearnedDate: state.firstLearnedDate || today,
    lastCompletedDate: today,
    nextDueDate: addDays(today, INTERVALS[state.stage]),
    history
  }
}

function buildDailyQueue({ words, states, today, language, newTarget, completedNewIds }) {
  const languageWords = words.filter(word => word.language === language && word.contentStatus === 'ready')
  const reviewIds = languageWords
    .filter(word => {
      const state = states[word.id]
      return state && state.status === 'learning' && state.nextDueDate <= today
    })
    .sort((a, b) => states[a.id].nextDueDate.localeCompare(states[b.id].nextDueDate) || a.id.localeCompare(b.id))
    .map(word => word.id)
  const remaining = Math.max(0, newTarget - completedNewIds.length)
  const newIds = languageWords
    .filter(word => !states[word.id] && !completedNewIds.includes(word.id))
    .slice(0, remaining)
    .map(word => word.id)
  return { reviewIds, newIds }
}

function calculateStreak(records, language, today) {
  const activityOn = date => {
    const record = records[`${date}:${language}`]
    return Boolean(record && (record.completedNewIds.length > 0 || record.completedReviewIds.length > 0))
  }
  let cursor = activityOn(today) ? today : addDays(today, -1)
  let streak = 0
  while (activityOn(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

module.exports = { INTERVALS, addDays, getToday, nextStudyState, buildDailyQueue, calculateStreak }
