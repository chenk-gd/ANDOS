import { ref, computed } from 'vue'
import { detectLanguage } from '@/utils/languageDetect'

export interface MonacoOptions {
  language?: string
  theme?: string
  readonly?: boolean
}

export function useMonaco() {
  const options = ref<MonacoOptions>({
    language: 'plaintext',
    theme: 'vs-dark',
    readonly: false,
  })

  const setLanguage = (lang: string) => {
    options.value.language = lang
  }

  const setTheme = (theme: string) => {
    options.value.theme = theme
  }

  const setReadonly = (readonly: boolean) => {
    options.value.readonly = readonly
  }

  const autoDetectLanguage = (filename: string) => {
    options.value.language = detectLanguage(filename)
  }

  const currentLanguage = computed(() => options.value.language)
  const currentTheme = computed(() => options.value.theme)
  const isReadonly = computed(() => options.value.readonly)

  return {
    options,
    currentLanguage,
    currentTheme,
    isReadonly,
    setLanguage,
    setTheme,
    setReadonly,
    autoDetectLanguage,
  }
}
