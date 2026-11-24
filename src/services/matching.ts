import { keywordMatches, type Candidate, type Match } from '../data';

export async function findMatches(candidates: Candidate[], description: string, count: number): Promise<Match[]> {
  // UI prototype: no request is sent to Gemini or to an external server.
  // Next stage: POST an authenticated request to a Node API; keep Gemini credentials on the server.
  await new Promise(resolve => setTimeout(resolve, 750));
  return keywordMatches(candidates, description, count);
}
