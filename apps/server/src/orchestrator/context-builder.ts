import { agentRepo } from '../db/repositories/index.js';
import { memoryRepo } from '../db/repositories/index.js';
import { messageRepo } from '../db/repositories/index.js';

export interface ContextOptions {
  agent_id: string;
  session_id: string;
  current_message: string;
  max_memories?: number;   // default 10
  max_history?: number;    // default 20
}

export interface AssembledContext {
  prompt: string;
  agent_name: string;
  system_prompt: string | null;
  memories: string[];
  history_count: number;
}

export function buildContext(options: ContextOptions): AssembledContext {
  const { agent_id, session_id, current_message, max_memories = 10, max_history = 20 } = options;

  // 1. Get agent and system prompt
  const agent = agentRepo.findById(agent_id);
  const agent_name = agent?.name ?? 'Assistant';
  const system_prompt = agent?.system_prompt ?? null;

  // 2. Get top memories by relevance
  const memoryRecords = memoryRepo.findByAgent(agent_id, undefined, max_memories);
  const memories = memoryRecords.map((m) => m.content);

  // 3. Touch each memory used
  for (const m of memoryRecords) {
    memoryRepo.touch(m.id);
  }

  // 4. Get recent history messages
  const historyMessages = messageRepo.findBySession(session_id, max_history, 0);

  // 5. Assemble prompt
  const parts: string[] = [];

  parts.push(`[System: ${system_prompt ?? 'You are a helpful assistant.'}]`);

  if (memories.length > 0) {
    parts.push(`[Memory: ${memories.join(', ')}]`);
  }

  if (historyMessages.length > 0) {
    parts.push('[History]');
    for (const m of historyMessages) {
      parts.push(`${m.role}: ${m.content}`);
    }
    parts.push('[/History]');
  }

  parts.push(`[User: ${current_message}]`);

  const prompt = parts.join('\n');

  return {
    prompt,
    agent_name,
    system_prompt,
    memories,
    history_count: historyMessages.length,
  };
}
