/**
 * DependencyInferrer
 * Infers dependencies between tickets by matching technical terms.
 * TASK-122
 */

export interface DependencyCandidate {
  ticketId: string;
  confidence: number; // 0-1
  reason: string;     // which keywords matched
}

const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'not',
  'are', 'has', 'have', 'been', 'will', 'can', 'may', 'use', 'used',
  'Task', 'File', 'Type', 'Name', 'Data', 'List', 'Item', 'Node',
  'true', 'false', 'null', 'void', 'async', 'await', 'return',
  'Error', 'Test', 'Base', 'Info', 'Result', 'Value', 'Index',
]);

export class DependencyInferrer {
  extractTechnicalTerms(content: string): string[] {
    const terms = new Set<string>();

    // CamelCase class/interface names
    const camelCase = content.match(/\b[A-Z][a-zA-Z]+\b/g) ?? [];
    for (const t of camelCase) {
      if (!COMMON_WORDS.has(t)) terms.add(t);
    }

    // .ts file references
    const tsFiles = content.match(/\b\w+\.ts\b/g) ?? [];
    for (const t of tsFiles) terms.add(t);

    // function calls (camelCase followed by '()')
    const funcCalls = content.match(/\b[a-z][a-zA-Z]+(?=\()/g) ?? [];
    for (const t of funcCalls) {
      if (!COMMON_WORDS.has(t)) terms.add(t);
    }

    // TASK-xxx references already in content
    const taskRefs = content.match(/\bTASK-\w+\b/g) ?? [];
    for (const t of taskRefs) terms.add(t);

    return Array.from(terms);
  }

  async inferDependencies(
    newTicketContent: string,
    existingTickets: Array<{ id: string; content: string }>,
  ): Promise<DependencyCandidate[]> {
    const newTerms = this.extractTechnicalTerms(newTicketContent);
    if (newTerms.length === 0 || existingTickets.length === 0) return [];

    const newTermSet = new Set(newTerms);
    const candidates: DependencyCandidate[] = [];

    for (const ticket of existingTickets) {
      const existingTerms = this.extractTechnicalTerms(ticket.content);
      const matched = existingTerms.filter((t) => newTermSet.has(t));

      if (matched.length === 0) continue;

      const confidence = Math.min(matched.length / newTerms.length, 1);
      if (confidence < 0.6) continue;

      candidates.push({
        ticketId: ticket.id,
        confidence: Math.round(confidence * 100) / 100,
        reason: matched.slice(0, 5).join(', '),
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates.slice(0, 5);
  }
}
