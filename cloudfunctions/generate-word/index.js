const cloud = require('wx-server-sdk')
const { generateText, generateImage, generateSpeech } = require('./providers')
const { validateGeneratedText } = require('./validate')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }
}

function input(event) {
  const language = event.language
  const word = typeof event.word === 'string' ? event.word.trim() : ''
  if (language !== 'en' && language !== 'ko') throw Object.assign(new Error('language must be en or ko'), { statusCode: 400 })
  if (!word || word.length > 2000) throw Object.assign(new Error('word is required and must not exceed 2000 characters'), { statusCode: 400 })
  return { language, word }
}

exports.main = async event => {
  try {
    const { language, word } = input(event || {})
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_TEXT_MODEL || !process.env.OPENAI_IMAGE_MODEL || !process.env.OPENAI_TTS_MODEL || !process.env.OPENAI_TTS_VOICE) {
      throw new Error('Cloud provider environment is incomplete')
    }
    const operation = event.operation || 'bundle'
    if (operation === 'image') return response(200, { imageUrl: await generateImage(language, word) })
    if (operation === 'speech') return response(200, { audioUrl: await generateSpeech(word, language) })
    if (operation !== 'bundle') throw Object.assign(new Error('Unsupported operation'), { statusCode: 400 })
    if (word.length > 100) throw Object.assign(new Error('word must not exceed 100 characters'), { statusCode: 400 })

    const generated = validateGeneratedText(await generateText(language, word), language)
    const [imageUrl, wordAudioUrl, phraseAudioUrl, exampleAudioUrl] = await Promise.all([
      generateImage(language, word),
      generateSpeech(word, language),
      generateSpeech(generated.phrase.text, language),
      generateSpeech(generated.example.text, language)
    ])
    return response(200, {
      word: {
        text: word,
        ...generated,
        imageUrl,
        wordAudioUrl,
        phrase: { ...generated.phrase, audioUrl: phraseAudioUrl },
        example: { ...generated.example, audioUrl: exampleAudioUrl }
      }
    })
  } catch (error) {
    console.error('[generate-word]', error)
    return response(error.statusCode || 502, {
      error: error.statusCode ? error.message : '生词生成服务暂时不可用，请稍后重试'
    })
  }
}
