import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { sendMessage, saveApiKey, getStoredApiKey, generateId, type AiModel } from '@/services/ai'

describe('AI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('API Key Management', () => {
    it('saves Claude API key to localStorage', () => {
      saveApiKey('claude', 'test-claude-key')
      expect(localStorage.setItem).toHaveBeenCalledWith('claude_api_key', 'test-claude-key')
    })

    it('saves OpenAI API key to localStorage', () => {
      saveApiKey('openai', 'test-openai-key')
      expect(localStorage.setItem).toHaveBeenCalledWith('openai_api_key', 'test-openai-key')
    })

    it('gets stored Claude API key', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('stored-claude-key')
      const result = getStoredApiKey('claude')
      expect(localStorage.getItem).toHaveBeenCalledWith('claude_api_key')
      expect(result).toBe('stored-claude-key')
    })

    it('gets stored OpenAI API key', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('stored-openai-key')
      const result = getStoredApiKey('openai')
      expect(localStorage.getItem).toHaveBeenCalledWith('openai_api_key')
      expect(result).toBe('stored-openai-key')
    })

    it('returns empty string when no API key stored', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)
      const result = getStoredApiKey('claude')
      expect(result).toBe('')
    })
  })

  describe('sendMessage - Claude', () => {
    it('throws error when API key not configured', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      await expect(sendMessage('claude', [])).rejects.toThrow('Claude API key not configured')
    })

    it('sends message to Claude API successfully', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-api-key')
      const mockResponse = {
        content: [{ type: 'text', text: 'Hello from Claude' }],
      }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const messages = [{ role: 'user', content: 'Hello' }]
      const result = await sendMessage('claude', messages)

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
          body: expect.stringContaining('claude-3-sonnet'),
        })
      )
      expect(result).toBe('Hello from Claude')
    })

    it('handles Claude API error', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-api-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      } as Response)

      await expect(sendMessage('claude', [])).rejects.toThrow('Invalid API key')
    })

    it('handles empty response content', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-api-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      } as Response)

      const result = await sendMessage('claude', [])
      expect(result).toBe('')
    })
  })

  describe('sendMessage - OpenAI', () => {
    it('throws error when API key not configured', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      await expect(sendMessage('openai', [])).rejects.toThrow('OpenAI API key not configured')
    })

    it('sends message to OpenAI API successfully', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-openai-key')
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Hello from GPT' } }],
      }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const messages = [{ role: 'user', content: 'Hello' }]
      const result = await sendMessage('openai', messages)

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-openai-key',
          }),
          body: expect.stringContaining('gpt-4'),
        })
      )
      expect(result).toBe('Hello from GPT')
    })

    it('handles OpenAI API error', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-openai-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
      } as Response)

      await expect(sendMessage('openai', [])).rejects.toThrow('Rate limit exceeded')
    })

    it('handles empty choices array', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-openai-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      } as Response)

      const result = await sendMessage('openai', [])
      expect(result).toBe('')
    })
  })

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId()
      const id2 = generateId()

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
      expect(typeof id1).toBe('string')
      expect(id1).toContain('-')
    })
  })
})
