import { memoryRepo } from '../db/repositories/index.js';

// TODO: Replace heuristic extraction with LLM-based extraction for higher quality facts
export function extractAndSaveMemories(
  agent_id: string,
  assistant_response: string,
  _user_message: string
): { facts_saved: number; facts: string[] } {
  const factualIndicators = /\b(is|are|was|has|have|had|user|uses|called|named|works|lives|prefers|likes|knows|does)\b/i;

  const sentences = assistant_response
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 200)
    .filter((s) => factualIndicators.test(s))
    .slice(0, 3);

  for (const sentence of sentences) {
    memoryRepo.create({
      agent_id,
      type: 'episode',
      content: sentence,
    });
  }

  return { facts_saved: sentences.length, facts: sentences };
}

export function decayMemories(agent_id: string): { decayed: number; pruned: number } {
  memoryRepo.decayAll(agent_id, 0.95);
  const pruned = memoryRepo.prune(agent_id, 0.05);
  return { decayed: 1, pruned };
}
