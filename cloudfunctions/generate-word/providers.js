const cloud = require('wx-server-sdk')
const { randomUUID } = require('node:crypto')

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

async function api(path, body, binary = false) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`Provider ${response.status}: ${await response.text()}`)
  return binary ? response.arrayBuffer() : response.json()
}

async function generateText(language, word) {
  const result = await api('/chat/completions', {
    model: process.env.OPENAI_TEXT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Return JSON with pronunciation, definitionEn, definitionKo, definitionZh, phrase{text,translationZh}, example{text,translationZh}. definitionEn must be concise English; definitionKo is natural Korean only for ko and empty for en; use Simplified Chinese and one useful IELTS/TOPIK phrase and one grammatical example.'
      },
      { role: 'user', content: JSON.stringify({ language, word }) }
    ]
  })
  return JSON.parse(result.choices[0].message.content)
}

async function upload(buffer, extension) {
  const cloudPath = `generated/${randomUUID()}.${extension}`
  const { fileID } = await cloud.uploadFile({ cloudPath, fileContent: Buffer.from(buffer) })
  const result = await cloud.getTempFileURL({ fileList: [fileID] })
  if (result.fileList[0].status !== 0) throw new Error('Media URL creation failed')
  return result.fileList[0].tempFileURL
}

async function generateImage(language, word) {
  const result = await api('/images/generations', {
    model: process.env.OPENAI_IMAGE_MODEL,
    prompt: `A clear editorial illustration representing the ${language === 'ko' ? 'Korean' : 'English'} word ${word}, no letters, no words, no watermark`,
    response_format: 'b64_json'
  })
  return upload(Buffer.from(result.data[0].b64_json, 'base64'), 'png')
}

async function generateSpeech(text, language) {
  const audio = await api('/audio/speech', {
    model: process.env.OPENAI_TTS_MODEL,
    voice: process.env.OPENAI_TTS_VOICE,
    input: text,
    instructions: language === 'ko'
      ? 'Speak natural standard Korean clearly at a learning-friendly pace.'
      : 'Speak clear standard English at a learning-friendly pace.'
  }, true)
  return upload(audio, 'mp3')
}

module.exports = { generateText, generateImage, generateSpeech }
