# OpenViking Memory System Analysis for ANDOS

## Executive Summary

After analyzing OpenViking's memory and context management system, I've identified several architectural patterns that could significantly improve ANDOS's agent memory capabilities. OpenViking takes a unified, vector-first approach with sophisticated deduplication and lifecycle management.

---

## 1. Context Unified Model (核心借鉴点)

### OpenViking's Approach

OpenViking uses a **unified Context class** (`openviking/core/context.py`) that serves as the foundation for all data:

```python
class Context:
    def __init__(self, uri, abstract="", level=None, ...):
        self.id = id or str(uuid4())
        self.uri = uri           # URI-based addressing: viking://user/.../memories/preferences/...
        self.level = level       # L0/L1/L2 for vector indexing granularity
        self.abstract = abstract # L0: summary for vector search
        self.active_count = 0    # Access frequency for hotness scoring
        self.vector = None       # Embedded representation
```

**Key Design Decisions:**

1. **URI-based Addressing**: Uses hierarchical URIs like `viking://user/{space}/memories/{category}/{id}`
   - Enables clear ownership and access control
   - Supports both user-scoped and agent-scoped memories
   - Allows natural partitioning by category (preferences, entities, events, cases, patterns)

2. **L0/L1/L2 Context Levels**:
   - **L0 (ABSTRACT)**: One-line summary for vector indexing
   - **L1 (OVERVIEW)**: Short description
   - **L2 (DETAIL)**: Full content
   - Different levels can be embedded separately for semantic search at different granularities

3. **Unified Model**: Skills, memories, and resources all use the same Context class

### ANDOS Current State

ANDOS has a **three-layer memory model** (`apps/server/src/types/memory.ts`):
- Session memory (ephemeral, 24h TTL via checkpoints)
- Project memory (persistent KV store)
- Organization memory (shared patterns)

**Current Limitations:**
- No unified abstraction across memory types
- No explicit L0/L1/L2 granularity for vector indexing
- URI-based addressing not fully adopted (uses IDs with paths)
- Memory categories exist but are not as systematically organized

### Recommendation for ANDOS

**Implement a UnifiedContext class** that can represent:
- Session checkpoints
- KV memories
- Extracted patterns/decisions
- Tool executions

**Add L0/L1/L2 indexing**:
```typescript
interface UnifiedContext {
  uri: string;           // e.g., "andos://session/{id}/memory/{key}"
  level: 0 | 1 | 2;      // Abstract | Overview | Detail
  abstract: string;      // L0: for semantic search
  vector?: number[];     // Embedded representation
  hotness: number;       // Computed score
}
```

---

## 2. Memory Deduplication Strategy (重要借鉴)

### OpenViking's Approach

OpenViking implements **LLM-assisted deduplication** (`openviking/session/memory_deduplicator.py`) with a two-step process:

**Step 1: Vector Pre-filtering**
- Generate embedding for candidate memory
- Search for similar memories using vector similarity
- Apply threshold filtering (configurable, default 0.0)

**Step 2: LLM Decision Making**
- Send top-5 similar memories to LLM
- LLM decides: `SKIP`, `CREATE`, or `NONE`
- For `NONE`, provide per-memory actions: `MERGE` or `DELETE`

```python
class DedupDecision(str, Enum):
    SKIP = "skip"      # Duplicate, skip creation
    CREATE = "create"  # Create new memory
    NONE = "none"      # Resolve existing memories only

class MemoryActionDecision(str, Enum):
    MERGE = "merge"    # Merge candidate into existing
    DELETE = "delete"  # Delete conflicting existing
```

**Key Features:**
- **Facet extraction**: Extracts category keys from abstracts (e.g., "User Preference" from "User Preference: Theme=dark")
- **Conflict resolution**: Handles cases where LLM suggests conflicting actions
- **Legacy compatibility**: Supports old response formats
- **Reason tracking**: Every decision includes a reason

### ANDOS Current State

ANDOS has **AutoMemoryExtractionService** (`apps/server/src/services/AutoMemoryExtractionService.ts`):
- Uses regex patterns for keyword extraction
- Identifies: decisions, patterns, errors, insights
- No LLM-based deduplication
- No vector similarity pre-filtering

**Current Extraction Pattern:**
```typescript
private extractDecisions(content: string): Array<{...}> {
  const patterns = [
    /decided?\s+to\s+(.+?)(?:\.\s|\n|$)/gi,
    /agreed?\s+(?:on|to)\s+(.+?)(?:\.\s|\n|$)/gi,
    // ... more patterns
  ];
  // Simple regex matching
}
```

### Recommendation for ANDOS

**Add LLM-assisted deduplication** to memory extraction:

1. **Vector Pre-filtering**: Before extracting, check if similar memories exist
2. **LLM Deduplication Prompt**: Send candidate + similar memories to LLM
3. **Decision Actions**:
   - Skip: Don't create duplicate
   - Create: Add new memory
   - Merge: Update existing with new info
   - Delete: Remove outdated conflicting memories

**Implementation sketch:**
```typescript
interface DeduplicationResult {
  decision: 'skip' | 'create' | 'merge' | 'delete';
  targetUri?: string;      // For merge/delete
  reason: string;
}

class MemoryDeduplicator {
  async deduplicate(
    candidate: MemoryCandidate,
    ctx: RequestContext
  ): Promise<DeduplicationResult> {
    // 1. Vector search for similar
    const similar = await this.vectorSearch(candidate.embedding);
    if (similar.length === 0) return { decision: 'create', reason: 'No similar memories' };

    // 2. LLM decision
    return await this.llmDecide(candidate, similar);
  }
}
```

---

## 3. Hotness Scoring for Memory Lifecycle (值得借鉴)

### OpenViking's Approach

OpenViking implements **hotness scoring** (`openviking/retrieve/memory_lifecycle.py`) for cold/hot memory management:

```python
def hotness_score(active_count: int, updated_at: Optional[datetime], ...) -> float:
    # Frequency component: sigmoid(log1p(active_count))
    freq = 1.0 / (1.0 + math.exp(-math.log1p(active_count)))

    # Recency component: exponential decay with half-life
    age_days = (now - updated_at).total_seconds() / 86400.0
    decay_rate = math.log(2) / half_life_days  # default 7 days
    recency = math.exp(-decay_rate * age_days)

    return freq * recency  # 0.0 - 1.0
```

**Key Features:**
- **Configurable half-life**: Default 7 days, adjustable per use case
- **Sigmoid for frequency**: Prevents high-frequency items from dominating
- **Exponential decay for recency**: Natural "forgetting" curve
- **Pure function**: Easy to test and cache

### ANDOS Current State

ANDOS has **session checkpoint TTL** (24h default) but no general hotness scoring:
- Checkpoints expire after TTL
- No scoring for project/org memories
- No automatic cold memory archiving

### Recommendation for ANDOS

**Add hotness scoring to all memory levels**:

```typescript
interface MemoryLifecycleConfig {
  hotThreshold: number;      // e.g., 0.7
  coldThreshold: number;     // e.g., 0.3
  halfLifeDays: number;      // e.g., 7
  archiveAfterDays: number;  // e.g., 30
}

function calculateHotnessScore(
  accessCount: number,
  lastAccessedAt: Date,
  config: MemoryLifecycleConfig
): number {
  // Sigmoid for frequency
  const frequency = 1.0 / (1.0 + Math.exp(-Math.log1p(accessCount)));

  // Exponential decay for recency
  const ageDays = (Date.now() - lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
  const decayRate = Math.log(2) / config.halfLifeDays;
  const recency = Math.exp(-decayRate * ageDays);

  return frequency * recency;
}
```

**Lifecycle States:**
- **Hot**: Score > 0.7 → Keep in fast storage (Redis)
- **Warm**: Score 0.3-0.7 → Keep in PostgreSQL
- **Cold**: Score < 0.3 → Archive to S3/MinIO

---

## 4. Category-Based Memory Organization (结构借鉴)

### OpenViking's Approach

OpenViking organizes memories by **category** with clear separation:

```python
_USER_CATEGORIES = {"preferences", "entities", "events"}
_AGENT_CATEGORIES = {"cases", "patterns", "tools", "skills"}

def _category_uri_prefix(category: str, user) -> str:
    if category in _USER_CATEGORIES:
        return f"viking://user/{user.user_space_name()}/memories/{category}/"
    elif category in _AGENT_CATEGORIES:
        return f"viking://agent/{user.agent_space_name()}/memories/{category}/"
```

**Categories:**
- **User-scoped**: preferences, entities, events
- **Agent-scoped**: cases, patterns, tools, skills

This enables:
- Scoped vector search (only search user's preferences, not all)
- Different retention policies per category
- Clear ownership and access control

### ANDOS Current State

ANDOS has memory levels but **less explicit categorization**:
- Session, project, organization scopes
- Implicit types in KV store (key prefixes)
- No clear separation between user preferences and learned patterns

### Recommendation for ANDOS

**Add explicit category taxonomy**:

```typescript
type UserMemoryCategory = 'preferences' | 'entities' | 'events' | 'facts';
type AgentMemoryCategory = 'patterns' | 'cases' | 'decisions' | 'errors';
type MemoryCategory = UserMemoryCategory | AgentMemoryCategory;

interface MemoryEntry {
  uri: string;  // andos://{scope}/{category}/{id}
  category: MemoryCategory;
  scope: 'session' | 'project' | 'organization';
  // ...
}
```

**Benefits:**
- Scoped retrieval (search only relevant categories)
- Category-specific prompts for extraction
- Different vector collections per category

---

## 5. Context Builder for Agent Prompts (Prompt工程借鉴)

### OpenViking's Approach

OpenViking's VikingBot (`bot/vikingbot/agent/context.py`) builds context incrementally:

```python
class ContextBuilder:
    BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "TOOLS.md", "IDENTITY.md"]

    async def build_system_prompt(self, session_key, current_message, history):
        parts = []
        parts.append(await self._get_identity(session_key))
        parts.append(self._load_bootstrap_files())
        parts.append(await self._get_memory_context(workspace_id))
        parts.append(self.skills.build_skills_summary())
        return "\n\n---\n\n".join(parts)
```

**Key Features:**
- **Bootstrap files**: Static identity/tools loaded from workspace
- **Progressive loading**: Always-loaded skills + on-demand skill summaries
- **Memory context**: Retrieved from OpenViking with timing logs
- **User profile**: Specific to current user

### ANDOS Current State

ANDOS's agent system (`src/agents/AgentService.ts`) has tool management but less structured context building:
- Tool definitions provided via MCP
- Session memory via checkpoints
- No explicit bootstrap/identity file pattern

### Recommendation for ANDOS

**Implement ContextBuilder for agents**:

```typescript
class AgentContextBuilder {
  async buildSystemPrompt(session: Session, userMessage: string): string {
    const parts = [
      await this.getIdentity(),           // ANDOS agent identity
      await this.getToolsSummary(),       // Available MCP tools
      await this.getMemoryContext(session.id),  // Relevant memories
      await this.getBootstrapFiles(),     // Project-specific AGENTS.md
    ];
    return parts.filter(Boolean).join('\n\n---\n\n');
  }
}
```

---

## Summary: Priority Recommendations

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| **P0** | Unified Context model with URI addressing | High | Medium |
| **P0** | LLM-assisted deduplication | High | Medium |
| **P1** | L0/L1/L2 level granularity for vectors | High | Low |
| **P1** | Hotness scoring for lifecycle management | Medium | Low |
| **P2** | Explicit category taxonomy | Medium | Low |
| **P2** | ContextBuilder for prompts | Medium | Medium |

### Implementation Path

1. **Phase 1**: Add `UnifiedContext` base class with URI addressing
2. **Phase 2**: Implement LLM-based deduplication for memory extraction
3. **Phase 3**: Add hotness scoring and cold/warm/hot lifecycle
4. **Phase 4**: Refine category taxonomy and context building

---

## References

### OpenViking Files Analyzed
- `openviking/core/context.py` - Unified Context model
- `openviking/session/memory_deduplicator.py` - Deduplication logic
- `openviking/retrieve/memory_lifecycle.py` - Hotness scoring
- `bot/vikingbot/agent/context.py` - Context builder for agents

### ANDOS Files Analyzed
- `apps/server/src/types/memory.ts` - Memory type definitions
- `apps/server/src/services/SessionMemoryService.ts` - Session checkpoints
- `apps/server/src/services/KVMemoryService.ts` - KV memory store
- `apps/server/src/services/AutoMemoryExtractionService.ts` - Extraction logic
- `src/agents/AgentService.ts` - Agent execution
