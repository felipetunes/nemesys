interface RecognitionAlternativeLike { transcript: string }
interface RecognitionResultLike { 0: RecognitionAlternativeLike }
interface RecognitionEventLike { results: { 0: RecognitionResultLike } }
interface RecognitionErrorLike { error: string }

interface RecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: ((event: RecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type RecognitionConstructor = new () => RecognitionLike
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
}

export interface SpeechProvider {
  canSpeak: boolean
  canRecognize: boolean
  speak(text: string, language?: string): void
  listen(language?: string): Promise<string>
  cancel(): void
}

export class BrowserSpeechProvider implements SpeechProvider {
  private recognition: RecognitionLike | null = null

  constructor(private readonly browserWindow: SpeechWindow = window as SpeechWindow) {}

  get canSpeak() { return 'speechSynthesis' in this.browserWindow }
  get canRecognize() { return Boolean(this.recognitionConstructor) }

  speak(text: string, language = 'pt-BR') {
    if (!this.canSpeak) return
    this.browserWindow.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language
    this.browserWindow.speechSynthesis.speak(utterance)
  }

  listen(language = 'pt-BR'): Promise<string> {
    const Recognition = this.recognitionConstructor
    if (!Recognition) return Promise.reject(new Error('Speech recognition is not supported by this browser.'))
    this.cancel()
    return new Promise((resolve, reject) => {
      const recognition = new Recognition()
      let settled = false
      this.recognition = recognition
      recognition.lang = language
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      recognition.onresult = event => { settled = true; resolve(event.results[0][0].transcript) }
      recognition.onerror = event => { settled = true; reject(new Error(`Speech recognition failed: ${event.error}`)) }
      recognition.onend = () => {
        this.recognition = null
        if (!settled) reject(new Error('No speech was recognized.'))
      }
      recognition.start()
    })
  }

  cancel() {
    this.browserWindow.speechSynthesis?.cancel()
    this.recognition?.abort()
    this.recognition = null
  }

  private get recognitionConstructor() {
    return this.browserWindow.SpeechRecognition || this.browserWindow.webkitSpeechRecognition
  }
}
