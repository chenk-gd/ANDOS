export type AiModel = 'claude' | 'openai'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  loading?: boolean
  error?: string
  memoryRefs?: string[]
  feedback?: 'helpful' | 'not_helpful'
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  model: AiModel
  createdAt: number
  updatedAt: number
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>
  error?: { message: string }
}

interface OpenAIResponse {
  choices: Array<{
    message: { role: string; content: string }
  }>
  error?: { message: string }
}

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function getApiKey(model: AiModel): string | null {
  const key = model === 'claude'
    ? localStorage.getItem('claude_api_key')
    : localStorage.getItem('openai_api_key')
  return key
}

export function saveApiKey(model: AiModel, key: string): void {
  if (model === 'claude') {
    localStorage.setItem('claude_api_key', key)
  } else {
    localStorage.setItem('openai_api_key', key)
  }
}

export function getStoredApiKey(model: AiModel): string {
  return getApiKey(model) || ''
}

export async function sendMessage(
  model: AiModel,
  messages: Array<{ role: string; content: string }>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = getApiKey(model)
  if (!apiKey) {
    throw new Error(`${model === 'claude' ? 'Claude' : 'OpenAI'} API key not configured`)
  }

  if (model === 'claude') {
    return sendClaudeMessage(apiKey, messages, onChunk)
  } else {
    return sendOpenAIMessage(apiKey, messages, onChunk)
  }
}

async function sendClaudeMessage(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4096,
      messages: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      stream: !!onChunk,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(error.error?.message || `Claude API error: ${response.status}`)
  }

  if (onChunk && response.body) {
    return streamClaudeResponse(response.body, onChunk)
  }

  const data: ClaudeResponse = await response.json()
  const text = data.content.find(c => c.type === 'text')?.text || ''
  return text
}

async function streamClaudeResponse(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text
              onChunk(parsed.delta.text)
            }
          } catch {
            // Ignore parsing errors for malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}

async function sendOpenAIMessage(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages,
      stream: !!onChunk,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
  }

  if (onChunk && response.body) {
    return streamOpenAIResponse(response.body, onChunk)
  }

  const data: OpenAIResponse = await response.json()
  return data.choices[0]?.message?.content || ''
}

async function streamOpenAIResponse(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              fullText += content
              onChunk(content)
            }
          } catch {
            // Ignore parsing errors for malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
