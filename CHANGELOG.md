# Changelog

All notable changes to the ANDOS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **OpenAI API Support**: Multi-provider LLM architecture supporting Anthropic Claude, OpenAI GPT, and OpenAI-compatible APIs (Ollama, llama.cpp, etc.)
  - Unified `LLMProvider` interface
  - `AnthropicProvider`, `OpenAIProvider`, `OpenAICompatibleProvider` implementations
  - `LLMProviderFactory` for provider management
  - Environment-based configuration (`LLM_PROVIDER`, `OPENAI_API_KEY`, etc.)
- **Unified Logger**: Centralized logging utility with component-based loggers
  - `createLogger(component)` for module-specific logging
  - Automatic fallback to console when global logger not set
  - Integration with Fastify's pino logger

### Changed
- **Refactored AgentExecutionEngine**: Now uses unified `LLMProvider` interface instead of direct Anthropic SDK
- **Performance Optimization**: Added database indexes for frequently queried columns
  - Composite indexes for project_id + state/type queries
  - GIN indexes for array columns (tags, owners)
  - Indexes for agent/sessions/executions lookups
  - Memory tables optimization
- **Improved Type Safety**:
  - Fixed 10+ `any` types in `FileTransparencyService`, `mcp.ts`
  - Replaced `z.any()` with `z.unknown()` in Zod schemas
- **Code Quality**:
  - Extracted `BaseAgent` abstract class for all AI agents
  - Added comprehensive test coverage for webhooks and graph routes
  - Replaced 24 `console` usages with proper logger

### Fixed
- **Global Error Handling**: Added `unhandledRejection` and `uncaughtException` handlers
- **Playwright Conflict**: Resolved Vitest/Playwright version conflict in web tests
- **Type Safety**: Eliminated `any` types from core services

## [1.5.0] - 2026-03-20

### Added
- **Agent Memory System v1.5**: Complete memory management for AI agents
  - Session Memory: Checkpoints and recovery
  - KV Memory: Key-value storage with TTL
  - Project Memory: Shared context and patterns
  - Auto Memory Extraction: Automatic pattern recognition
- **MCP Protocol Support**: Model Context Protocol implementation
  - Tools: memory_remember, memory_forget, memory_search
  - Resources: memory://project/{id}, memory://session/{id}
  - Prompts: memory-aware prompts
- **Web UI**: Memory management interface
  - AI Chat Panel with memory integration
  - MemoryManager component
  - AgentSessionHistory component
- **Organization & RBAC**: Hierarchical org structure with role-based access
  - Organization tree (max 3 levels)
  - Predefined roles (org_admin, project_admin, developer)
  - Permission system with wildcard support

### Changed
- **Performance**: Added lazy loading, API caching, virtual scrolling
- **Architecture**: DAG-based dependency tracking with ltree

## [1.0.0] - 2026-03-01

### Added
- **Core Asset Management**: Version control for AI-native assets
  - Asset CRUD with soft delete
  - Version publishing workflow
  - State machine (draft → clean → dirty → archived)
- **Dependency System**: DAG-based dependency tracking
  - Upstream/downstream queries
  - Impact analysis
  - Cycle detection
- **AI Agent Core**: 7 specialized agents
  - RequirementAgent, DesignAgent, TaskAgent
  - CodeAgent, TestAgent, CompatibilityAgent, ImpactAgent
- **Webhook System**: Event-driven integrations
  - Subscription management
  - Delivery retry logic
- **API**: RESTful API with Fastify
  - Idempotency support
  - Rate limiting
  - Field filtering

---

## Legend

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
