import { describe, it, expect } from 'vitest'
import { detectLanguage, getLanguageLabel, getLanguageByExtension } from '@/utils/languageDetect'

describe('languageDetect', () => {
  describe('detectLanguage', () => {
    it('should detect JavaScript files', () => {
      expect(detectLanguage('test.js')).toBe('javascript')
      expect(detectLanguage('test.mjs')).toBe('javascript')
    })

    it('should detect TypeScript files', () => {
      expect(detectLanguage('test.ts')).toBe('typescript')
      expect(detectLanguage('test.tsx')).toBe('typescript')
    })

    it('should detect Python files', () => {
      expect(detectLanguage('test.py')).toBe('python')
    })

    it('should detect Markdown files', () => {
      expect(detectLanguage('test.md')).toBe('markdown')
      expect(detectLanguage('test.markdown')).toBe('markdown')
    })

    it('should detect JSON files', () => {
      expect(detectLanguage('test.json')).toBe('json')
    })

    it('should detect YAML files', () => {
      expect(detectLanguage('test.yaml')).toBe('yaml')
      expect(detectLanguage('test.yml')).toBe('yaml')
    })

    it('should detect Vue files', () => {
      expect(detectLanguage('test.vue')).toBe('html')
    })

    it('should return plaintext for unknown extensions', () => {
      expect(detectLanguage('test.unknown')).toBe('plaintext')
      expect(detectLanguage('test')).toBe('plaintext')
    })

    it('should handle empty filename', () => {
      expect(detectLanguage('')).toBe('plaintext')
    })

    it('should be case insensitive', () => {
      expect(detectLanguage('TEST.JS')).toBe('javascript')
      expect(detectLanguage('Test.Py')).toBe('python')
    })
  })

  describe('getLanguageLabel', () => {
    it('should return correct labels', () => {
      expect(getLanguageLabel('javascript')).toBe('JavaScript')
      expect(getLanguageLabel('typescript')).toBe('TypeScript')
      expect(getLanguageLabel('python')).toBe('Python')
      expect(getLanguageLabel('markdown')).toBe('Markdown')
    })

    it('should return Plain Text for unknown language', () => {
      expect(getLanguageLabel('unknown')).toBe('Plain Text')
    })
  })

  describe('getLanguageByExtension', () => {
    it('should detect language by extension', () => {
      expect(getLanguageByExtension('.js')).toBe('javascript')
      expect(getLanguageByExtension('js')).toBe('javascript')
      expect(getLanguageByExtension('.py')).toBe('python')
    })

    it('should return plaintext for unknown extension', () => {
      expect(getLanguageByExtension('.unknown')).toBe('plaintext')
    })
  })
})
