import type { Asset } from '@/types/asset'

export interface WSMessage {
  type: 'asset_update' | 'asset_delete' | 'user_join' | 'user_leave' | 'cursor_update' | 'save_request' | 'save_response'
  payload: unknown
  timestamp: string
  userId?: string
}

export interface AssetUpdatePayload {
  assetId: string
  changes: Partial<Asset>
}

export interface UserPresencePayload {
  userId: string
  userName: string
  assetId?: string
}

export interface CursorUpdatePayload {
  userId: string
  userName: string
  assetId: string
  position: { line: number; column: number }
}

class WebSocketService {
  private ws: WebSocket | null = null
  private messageHandlers: Map<string, Set<(data: WSMessage) => void>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private token: string | null = null

  connect(token: string): void {
    this.token = token
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/v1/realtime'

    try {
      this.ws = new WebSocket(`${wsUrl}?token=${token}`)

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected')
        this.reconnectAttempts = 0
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected')
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err)
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      if (this.token) {
        this.connect(this.token)
      }
    }, delay)
  }

  private handleMessage(message: WSMessage): void {
    const handlers = this.messageHandlers.get(message.type)
    if (handlers) {
      handlers.forEach(handler => handler(message))
    }
  }

  subscribe(type: string, handler: (data: WSMessage) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)

    return () => {
      this.messageHandlers.get(type)?.delete(handler)
    }
  }

  send(message: Omit<WSMessage, 'timestamp'>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
      }))
    } else {
      console.warn('[WebSocket] Not connected, message dropped:', message)
    }
  }

  // Helper methods for specific message types
  updateAsset(assetId: string, changes: Partial<Asset>): void {
    this.send({
      type: 'asset_update',
      payload: { assetId, changes },
    })
  }

  updateCursor(assetId: string, position: { line: number; column: number }): void {
    this.send({
      type: 'cursor_update',
      payload: { assetId, position },
    })
  }

  requestSave(assetId: string, content: string): void {
    this.send({
      type: 'save_request',
      payload: { assetId, content },
    })
  }
}

export const wsService = new WebSocketService()
