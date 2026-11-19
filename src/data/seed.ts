import type { Word } from '../types/word'
import { normalizeWord } from '../utils/wordbook.cjs'

import negligibleImage from '../assets/words/negligible.png'
import resilientImage from '../assets/words/resilient.jpg'
import ambiguousImage from '../assets/words/ambiguous.png'
import scrutinizeImage from '../assets/words/scrutinize.jpg'
import sagwaImage from '../assets/words/sagwa.jpg'
import siganImage from '../assets/words/sigan.jpg'
import yaksokImage from '../assets/words/yaksok.jpg'
import gongbuhadaImage from '../assets/words/gongbuhada.png'

import negligibleWordAudio from '../assets/words/negligible-word.mp3'
import negligiblePhraseAudio from '../assets/words/negligible-phrase.mp3'
import negligibleExampleAudio from '../assets/words/negligible-example.mp3'
import resilientWordAudio from '../assets/words/resilient-word.mp3'
import resilientPhraseAudio from '../assets/words/resilient-phrase.mp3'
import resilientExampleAudio from '../assets/words/resilient-example.mp3'
import ambiguousWordAudio from '../assets/words/ambiguous-word.mp3'
import ambiguousPhraseAudio from '../assets/words/ambiguous-phrase.mp3'
import ambiguousExampleAudio from '../assets/words/ambiguous-example.mp3'
import scrutinizeWordAudio from '../assets/words/scrutinize-word.mp3'
import scrutinizePhraseAudio from '../assets/words/scrutinize-phrase.mp3'
import scrutinizeExampleAudio from '../assets/words/scrutinize-example.mp3'
import sagwaWordAudio from '../assets/words/sagwa-word.mp3'
import sagwaPhraseAudio from '../assets/words/sagwa-phrase.mp3'
import sagwaExampleAudio from '../assets/words/sagwa-example.mp3'
import siganWordAudio from '../assets/words/sigan-word.mp3'
import siganPhraseAudio from '../assets/words/sigan-phrase.mp3'
import siganExampleAudio from '../assets/words/sigan-example.mp3'
import yaksokWordAudio from '../assets/words/yaksok-word.mp3'
import yaksokPhraseAudio from '../assets/words/yaksok-phrase.mp3'
import yaksokExampleAudio from '../assets/words/yaksok-example.mp3'
import gongbuhadaWordAudio from '../assets/words/gongbuhada-word.mp3'
import gongbuhadaPhraseAudio from '../assets/words/gongbuhada-phrase.mp3'
import gongbuhadaExampleAudio from '../assets/words/gongbuhada-example.mp3'

type SeedContent = Omit<Word, 'id' | 'normalizedText' | 'source' | 'contentStatus'>

function createWord(id: string, content: SeedContent): Word {
  return {
    ...content,
    id,
    normalizedText: normalizeWord(content.text, content.language),
    source: 'builtin',
    contentStatus: 'ready'
  }
}

export const SEED_WORDS: Word[] = [
  createWord('builtin-en-negligible', {
    language: 'en', text: 'negligible', priority: 0, pronunciation: '/ˈneɡlɪdʒəbəl/',
    definitionEn: 'so small or unimportant as to be not worth considering',
    definitionZh: '微不足道的；可忽略不计的', imageUrl: negligibleImage,
    wordAudioUrl: negligibleWordAudio,
    phrase: { text: 'a negligible amount', translationZh: '微不足道的数量', audioUrl: negligiblePhraseAudio },
    example: { text: 'The damage to the car was negligible.', translationZh: '这辆车的损坏微乎其微。', audioUrl: negligibleExampleAudio }
  }),
  createWord('builtin-en-resilient', {
    language: 'en', text: 'resilient', priority: 1, pronunciation: '/rɪˈzɪliənt/',
    definitionEn: 'able to recover quickly from difficult conditions',
    definitionZh: '有韧性的；能迅速恢复的', imageUrl: resilientImage,
    wordAudioUrl: resilientWordAudio,
    phrase: { text: 'a resilient economy', translationZh: '韧性十足的经济', audioUrl: resilientPhraseAudio },
    example: { text: 'Children can be remarkably resilient after adversity.', translationZh: '儿童在逆境后也能展现出惊人的恢复力。', audioUrl: resilientExampleAudio }
  }),
  createWord('builtin-en-ambiguous', {
    language: 'en', text: 'ambiguous', priority: 2, pronunciation: '/æmˈbɪɡjuəs/',
    definitionEn: 'open to more than one interpretation',
    definitionZh: '含糊的；有歧义的', imageUrl: ambiguousImage,
    wordAudioUrl: ambiguousWordAudio,
    phrase: { text: 'an ambiguous statement', translationZh: '含糊其辞的陈述', audioUrl: ambiguousPhraseAudio },
    example: { text: 'His answer was deliberately ambiguous.', translationZh: '他的回答故意含糊其辞。', audioUrl: ambiguousExampleAudio }
  }),
  createWord('builtin-en-scrutinize', {
    language: 'en', text: 'scrutinize', priority: 3, pronunciation: '/ˈskruːtənaɪz/',
    definitionEn: 'to examine something very carefully',
    definitionZh: '仔细审查；细致检查', imageUrl: scrutinizeImage,
    wordAudioUrl: scrutinizeWordAudio,
    phrase: { text: 'scrutinize the evidence', translationZh: '仔细审查证据', audioUrl: scrutinizePhraseAudio },
    example: { text: 'Researchers scrutinized the data before publishing the report.', translationZh: '研究人员在发布报告前仔细审查了数据。', audioUrl: scrutinizeExampleAudio }
  }),
  createWord('builtin-ko-sagwa', {
    language: 'ko', text: '사과', priority: 0, pronunciation: '[sa-gwa]',
    definitionEn: 'a round fruit with firm flesh and usually red, green, or yellow skin',
    definitionKo: '둥글고 단단한 과육을 가진 과일로, 보통 빨간색이나 초록색 껍질을 가짐.',
    definitionZh: '苹果', imageUrl: sagwaImage, wordAudioUrl: sagwaWordAudio,
    phrase: { text: '사과를 먹다', translationZh: '吃苹果', audioUrl: sagwaPhraseAudio },
    example: { text: '저는 아침에 사과를 하나 먹었어요.', translationZh: '我早上吃了一个苹果。', audioUrl: sagwaExampleAudio }
  }),
  createWord('builtin-ko-sigan', {
    language: 'ko', text: '시간', priority: 1, pronunciation: '[si-gan]',
    definitionEn: 'a measurable period during which something happens or exists',
    definitionKo: '어떤 일이 일어나거나 지속되는 흐름이나 그 길이.',
    definitionZh: '时间；小时', imageUrl: siganImage, wordAudioUrl: siganWordAudio,
    phrase: { text: '시간이 있다', translationZh: '有时间', audioUrl: siganPhraseAudio },
    example: { text: '지금 몇 시예요?', translationZh: '现在几点了？', audioUrl: siganExampleAudio }
  }),
  createWord('builtin-ko-yaksok', {
    language: 'ko', text: '약속', priority: 2, pronunciation: '[yak-sok]',
    definitionEn: 'an arrangement to meet someone or do something at a particular time',
    definitionKo: '사람과 만나거나 무엇을 하기로 미리 정한 일.',
    definitionZh: '约定；约会；诺言', imageUrl: yaksokImage, wordAudioUrl: yaksokWordAudio,
    phrase: { text: '약속을 지키다', translationZh: '遵守约定', audioUrl: yaksokPhraseAudio },
    example: { text: '저는 내일 친구와 약속이 있어요.', translationZh: '我明天和朋友有约。', audioUrl: yaksokExampleAudio }
  }),
  createWord('builtin-ko-gongbuhada', {
    language: 'ko', text: '공부하다', priority: 3, pronunciation: '[gong-bu-ha-da]',
    definitionEn: 'to study a subject in order to learn about it',
    definitionKo: '지식이나 기술을 익히고 배우다.',
    definitionZh: '学习', imageUrl: gongbuhadaImage, wordAudioUrl: gongbuhadaWordAudio,
    phrase: { text: '한국어를 공부하다', translationZh: '学习韩语', audioUrl: gongbuhadaPhraseAudio },
    example: { text: '저는 도서관에서 한국어를 공부해요.', translationZh: '我在图书馆学习韩语。', audioUrl: gongbuhadaExampleAudio }
  })
]
