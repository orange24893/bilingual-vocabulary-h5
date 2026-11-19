const TOP_LEVEL_KEYS = ['pronunciation', 'definitionEn', 'definitionKo', 'definitionZh', 'phrase', 'example']
const NESTED_KEYS = ['text', 'translationZh']

function text(value, field, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`Invalid generated field: ${field}`)
  }
  return value.trim()
}

function exactKeys(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${field}`)
  const keys = Object.keys(value).sort()
  if (JSON.stringify(keys) !== JSON.stringify([...allowed].sort())) throw new Error(`Unexpected fields in ${field}`)
}

function validateGeneratedText(value, language) {
  exactKeys(value, TOP_LEVEL_KEYS, 'text DTO')
  exactKeys(value.phrase, NESTED_KEYS, 'phrase')
  exactKeys(value.example, NESTED_KEYS, 'example')
  const result = {
    pronunciation: text(value.pronunciation, 'pronunciation', 200),
    definitionEn: text(value.definitionEn, 'definitionEn'),
    definitionKo: language === 'ko' ? text(value.definitionKo, 'definitionKo') : '',
    definitionZh: text(value.definitionZh, 'definitionZh'),
    phrase: {
      text: text(value.phrase.text, 'phrase.text'),
      translationZh: text(value.phrase.translationZh, 'phrase.translationZh')
    },
    example: {
      text: text(value.example.text, 'example.text'),
      translationZh: text(value.example.translationZh, 'example.translationZh')
    }
  }
  if (language === 'en' && value.definitionKo !== '') throw new Error('English entry must not contain definitionKo')
  if (!/[A-Za-z]/.test(result.definitionEn) || !/[A-Za-z]/.test(result.phrase.text) && language === 'en') {
    throw new Error('English content validation failed')
  }
  if (language === 'ko' && (!/[가-힣]/.test(result.definitionKo) || !/[가-힣]/.test(result.example.text))) {
    throw new Error('Korean content validation failed')
  }
  if (!/[\u3400-\u9fff]/.test(result.definitionZh)) throw new Error('Chinese definition validation failed')
  return result
}

module.exports = { validateGeneratedText }
