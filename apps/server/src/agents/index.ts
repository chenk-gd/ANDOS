/**
 * Agents Index - AI-Native DevOps Platform
 * Specialized Agent implementations
 */

// V1.0 Core Agents
export * from './RequirementAgent';
export * from './DesignAgent';
export * from './TaskAgent';

// V1.5 Agents
export * from './CodeAgent';
export * from './TestAgent';
export * from './CompatibilityAgent';
export * from './ImpactAgent';

// Import for initialization
import { initializeRequirementAgent } from './RequirementAgent';
import { initializeDesignAgent } from './DesignAgent';
import { initializeTaskAgent } from './TaskAgent';
import { initializeCodeAgent } from './CodeAgent';
import { initializeTestAgent } from './TestAgent';
import { initializeCompatibilityAgent } from './CompatibilityAgent';
import { initializeImpactAgent } from './ImpactAgent';

/**
 * Initialize all agents
 * Call this on application startup
 */
export async function initializeAllAgents(): Promise<void> {
  console.log('Initializing agents...');

  await Promise.all([
    // V1.0 Core Agents
    initializeRequirementAgent(),
    initializeDesignAgent(),
    initializeTaskAgent(),
    // V1.5 Agents
    initializeCodeAgent(),
    initializeTestAgent(),
    initializeCompatibilityAgent(),
    initializeImpactAgent(),
  ]);

  console.log('All agents initialized');
}

/**
 * Initialize only V1.0 core agents
 */
export async function initializeCoreAgents(): Promise<void> {
  console.log('Initializing core agents...');

  await Promise.all([
    initializeRequirementAgent(),
    initializeDesignAgent(),
    initializeTaskAgent(),
  ]);

  console.log('Core agents initialized');
}
