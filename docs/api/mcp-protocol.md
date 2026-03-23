# MCP Protocol Interface Documentation

## Overview

ANDOS implements the **Model Context Protocol (MCP)** over Server-Sent Events (SSE), enabling external AI agents and tools to interact with the ANDOS memory system. This document describes the MCP protocol interface for ANDOS Agent Memory System v1.5.

**Protocol Version:** 2024-11-05
**Server Version:** 1.5.0
**Base URL:** `http://localhost:3000/mcp`

---

## Architecture

```
┌─────────────────┐      SSE (Persistent)       ┌─────────────────┐
│   MCP Client    │ ◄──────────────────────────► │   ANDOS MCP     │
│  (Claude Code,  │                             │     Server      │
│   Claude Desktop)│                            │                 │
└─────────────────┘      POST (One-way)         └─────────────────┘
         │ ◄────────────────────────────────►          │
         │                                            │
         │         JSON-RPC 2.0 Messages              │
         │                                            ▼
         │                                   ┌─────────────────┐
         │                                   │  Memory Tools   │
         │                                   │  - remember     │
         │                                   │  - forget       │
         │                                   │  - search       │
         │                                   └─────────────────┘
         │                                            │
         │                                   ┌─────────────────┐
         │                                   │  Memory Services│
         │                                   │  - Session      │
         │                                   │  - Project      │
         │                                   │  - KV Store     │
         │                                   └─────────────────┘
```

---

## Transport Layer

### SSE Connection

MCP uses Server-Sent Events for bidirectional communication:

1. **Client connects** to `GET /mcp/sse`
2. **Server assigns** a unique `sessionId` and returns SSE stream
3. **Client sends** messages via `POST /mcp/messages?sessionId={id}`
4. **Server responds** via SSE events

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mcp/sse` | Establish SSE connection |
| POST | `/mcp/messages?sessionId={id}` | Send JSON-RPC requests |
| GET | `/mcp/health` | Health check |

### SSE Event Types

| Event | Description |
|-------|-------------|
| `endpoint` | Contains message endpoint URI |
| `message` | JSON-RPC response |
| `ping` | Keep-alive (every 30s) |

---

## JSON-RPC Protocol

All messages follow JSON-RPC 2.0 format.

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": "string|number",
  "method": "method.name",
  "params": {}
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": "string|number",
  "result": {},
  "error": {
    "code": -32600,
    "message": "Error description",
    "data": {}
  }
}
```

### Error Codes

| Code | Meaning | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid request | Invalid request object |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal server error |
| -32000 | Server error | Session not found |

---

## MCP Methods

### `initialize`

Initialize MCP session and negotiate capabilities.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {
        "subscribe": false,
        "listChanged": false
      },
      "prompts": {}
    },
    "serverInfo": {
      "name": "andos-mcp-server",
      "version": "1.5.0"
    }
  }
}
```

---

## Tools Interface

### `tools/list`

List available memory tools.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "memory_remember",
        "description": "Store a new memory at session, project, or organization level",
        "inputSchema": {
          "type": "object",
          "properties": {
            "content": { "type": "string", "description": "Memory content" },
            "level": { "type": "string", "enum": ["session", "project", "organization"] },
            "namespace": { "type": "string", "default": "default" },
            "tags": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["content", "level"]
        }
      },
      {
        "name": "memory_forget",
        "description": "Remove a memory by key",
        "inputSchema": {
          "type": "object",
          "properties": {
            "key": { "type": "string" },
            "level": { "type": "string", "enum": ["session", "project", "organization"] }
          },
          "required": ["key", "level"]
        }
      },
      {
        "name": "memory_search",
        "description": "Search memories by keywords (V1.5: keyword-based, V3.0: semantic)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "Search query/keywords" },
            "level": { "type": "string", "enum": ["session", "project", "organization"] },
            "limit": { "type": "number", "default": 10 }
          },
          "required": ["query", "level"]
        }
      }
    ]
  }
}
```

### `tools/call`

Execute a memory tool.

#### memory_remember

Store a new memory.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "memory_remember",
    "arguments": {
      "content": "User prefers Vue 3 Composition API over Options API",
      "level": "project",
      "namespace": "preferences",
      "tags": ["vue", "coding-style"]
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"key\": \"project:preferences:a1b2c3d4...\"}"
      }
    ]
  }
}
```

#### memory_forget

Remove a memory by key.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "memory_forget",
    "arguments": {
      "key": "project:preferences:a1b2c3d4...",
      "level": "project"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\": true}"
      }
    ]
  }
}
```

#### memory_search

Search memories using keywords.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "memory_search",
    "arguments": {
      "query": "vue composition api",
      "level": "project",
      "limit": 5
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"key\": \"...\", \"content\": \"...\", \"relevance\": 0.95}]"
      }
    ]
  }
}
```

---

## Resources Interface

### `resources/list`

List available memory resources.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "resources/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "resources": [
      {
        "uri": "memory://project/{projectId}",
        "name": "Project Memory",
        "description": "Project-level shared context and learned patterns",
        "mimeType": "application/json"
      },
      {
        "uri": "memory://session/{sessionId}",
        "name": "Session Memory",
        "description": "Session-level key-value memories",
        "mimeType": "application/json"
      },
      {
        "uri": "memory://organization/{orgId}",
        "name": "Organization Memory",
        "description": "Organization-level shared memories",
        "mimeType": "application/json"
      }
    ]
  }
}
```

### `resources/read`

Read a memory resource.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "resources/read",
  "params": {
    "uri": "memory://project/proj-123"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "contents": [
      {
        "uri": "memory://project/proj-123",
        "mimeType": "application/json",
        "text": "{\n  \"shared_context\": { ... },\n  \"patterns\": [ ... ]\n}"
      }
    ]
  }
}
```

### Resource URI Format

| URI Pattern | Description |
|-------------|-------------|
| `memory://project/{projectId}` | Project memory with shared context and patterns |
| `memory://session/{sessionId}` | Session checkpoints and working context |
| `memory://organization/{orgId}` | Organization-level shared memories |

---

## Prompts Interface

### `prompts/list`

List available memory-aware prompts.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "prompts/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "prompts": [
      {
        "name": "memory_context",
        "description": "Include relevant memory context in the conversation",
        "arguments": [
          {
            "name": "project_id",
            "description": "Project ID to load context from",
            "required": true
          },
          {
            "name": "query",
            "description": "Query to search for relevant memories",
            "required": false
          }
        ]
      },
      {
        "name": "memory_assist",
        "description": "Get assistance based on learned patterns and previous decisions",
        "arguments": [
          {
            "name": "task",
            "description": "Current task description",
            "required": true
          }
        ]
      }
    ]
  }
}
```

### `prompts/get`

Get a memory-aware prompt.

#### memory_context

Load project context into the conversation.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "prompts/get",
  "params": {
    "name": "memory_context",
    "arguments": {
      "project_id": "proj-123",
      "query": "coding preferences"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "description": "Memory context for project proj-123",
    "messages": [
      {
        "role": "system",
        "content": {
          "type": "text",
          "text": "You have access to the following project context:\n\n{...}"
        }
      }
    ]
  }
}
```

#### memory_assist

Get assistance based on learned patterns.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "prompts/get",
  "params": {
    "name": "memory_assist",
    "arguments": {
      "task": "Implement user authentication"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "description": "Memory-assisted guidance for: Implement user authentication",
    "messages": [
      {
        "role": "system",
        "content": {
          "type": "text",
          "text": "You are assisting with the following task: Implement user authentication. Use your learned patterns and project context to provide relevant guidance."
        }
      }
    ]
  }
}
```

---

## Memory Levels

| Level | Scope | Use Case |
|-------|-------|----------|
| `session` | Single conversation | Temporary context, working state |
| `project` | Project-wide | Shared patterns, coding preferences |
| `organization` | Org-wide | Standards, conventions, decisions |

---

## Usage Examples

### Python Client Example

```python
import json
import requests

# Establish SSE connection
session = requests.Session()
response = session.get('http://localhost:3000/mcp/sse', stream=True)

# Get session ID from headers
session_id = response.headers.get('X-MCP-Session-Id')

# Send initialize request
init_request = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
}

requests.post(
    f'http://localhost:3000/mcp/messages?sessionId={session_id}',
    json=init_request
)

# Read SSE response
for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))
```

### TypeScript/JavaScript Example

```typescript
// Connect to MCP SSE endpoint
const eventSource = new EventSource('http://localhost:3000/mcp/sse');

let sessionId: string | null = null;
let messageEndpoint: string | null = null;

eventSource.addEventListener('endpoint', (event) => {
  const data = JSON.parse(event.data);
  messageEndpoint = data.uri;
  sessionId = new URLSearchParams(messageEndpoint.split('?')[1]).get('sessionId');
});

eventSource.addEventListener('message', (event) => {
  const response = JSON.parse(event.data);
  console.log('MCP Response:', response);
});

// Send a tool call
async function callRemember(content: string, level: string) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: 'memory_remember',
      arguments: { content, level }
    }
  };

  await fetch(`http://localhost:3000/mcp/messages?sessionId=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
}
```

---

## Health Check

**Request:**
```bash
GET /mcp/health
```

**Response:**
```json
{
  "status": "healthy",
  "protocol": "mcp",
  "version": "1.5.0",
  "connections": 5
}
```

---

## Error Handling

All errors follow JSON-RPC 2.0 error format:

```json
{
  "jsonrpc": "2.0",
  "id": 123,
  "error": {
    "code": -32602,
    "message": "Invalid params: Missing required field 'content'",
    "data": {
      "field": "content"
    }
  }
}
```

### Common Error Scenarios

| Scenario | Error Code | Message |
|----------|------------|---------|
| Missing session ID | -32600 | Missing sessionId query parameter |
| Invalid JSON | -32700 | Parse error: ... |
| Unknown method | -32601 | Method not found: ... |
| Missing parameters | -32602 | Invalid params: ... |
| Session not found | -32000 | Session not found or connection closed |
| Tool not found | -32601 | Tool not found: ... |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.5.0 | 2024-03 | MCP Protocol 2024-11-05 support, keyword-based search |
| 1.0.0 | 2024-01 | Initial MCP implementation |

---

## References

- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [ANDOS OpenAPI Specification](./openapi.json)
- [Agent Memory System v1.5](../architecture/memory-system.md)
