import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface RagPipelineInput {
  domain: string;
  documentTypes?: string;
  queryVolume?: string;
}

export interface RagPipelineOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const ragPipelineSkill: Skill<RagPipelineInput, RagPipelineOutput> = {
  name: 'rag-pipeline',
  category: SkillCategory.DATA,
  description: 'End-to-end RAG pipeline design: chunking, embedding, vector store, retrieval, reranking, and evaluation.',
  version: '1.0.0',
  async execute(input: SkillInput<RagPipelineInput>): Promise<SkillOutput<RagPipelineOutput>> {
    const data = input as unknown as RagPipelineInput;
    const start = Date.now();
    const domain = data.domain || 'target domain';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Document Chunking Strategy',
            description: 'Design a chunking approach that preserves semantic coherence and optimizes retrieval precision.',
            actions: [
              'Choose chunking strategy: fixed-size, sentence, paragraph, or semantic',
              'Set chunk size (512-1024 tokens) and overlap (10-20%) for context continuity',
              'Implement recursive text splitting for hierarchical documents',
              'Add metadata to chunks: source, page, section, timestamp',
              'Test chunking quality on representative document samples',
            ],
          },
          {
            step: 2,
            title: 'Embedding Model Selection',
            description: 'Select and configure an embedding model optimized for the target domain and query types.',
            actions: [
              'Benchmark embedding models: text-embedding-3-large, BGE-M3, E5-large',
              'Evaluate on domain-specific retrieval benchmarks (MTEB)',
              'Consider multilingual requirements and context window size',
              'Implement batch embedding with retry and rate limit handling',
              'Cache embeddings to avoid redundant API costs on re-indexing',
            ],
          },
          {
            step: 3,
            title: 'Vector Store Setup',
            description: 'Configure and optimize a vector database for efficient similarity search at scale.',
            actions: [
              'Select vector store: Pinecone, Weaviate, Qdrant, or pgvector',
              'Configure index type: HNSW for speed, IVF for large-scale recall',
              'Set up metadata filtering for pre-retrieval scoping',
              'Implement namespace isolation per tenant or document collection',
              'Test query latency at P50, P95, P99 under expected load',
            ],
          },
          {
            step: 4,
            title: 'Retrieval Optimization',
            description: 'Implement hybrid retrieval combining dense vector search with sparse keyword matching.',
            actions: [
              'Implement hybrid search: BM25 + vector search with RRF fusion',
              'Add query expansion using LLM-generated sub-questions (HyDE)',
              'Configure top-k retrieval (k=20) with score threshold filtering',
              'Implement parent-child chunking: retrieve parent for full context',
              'A/B test retrieval strategies on query evaluation set',
            ],
          },
          {
            step: 5,
            title: 'Reranking Stage',
            description: 'Apply a cross-encoder reranker to improve relevance precision before feeding context to LLM.',
            actions: [
              'Integrate cross-encoder reranker: Cohere Rerank, BGE-reranker, or FlashRank',
              'Rerank top-k (20) results down to final context window (5-10)',
              'Measure latency impact and set timeout fallback to initial ranking',
              'Tune reranker threshold to balance precision vs recall',
              'Log reranker score distributions for ongoing monitoring',
            ],
          },
          {
            step: 6,
            title: 'RAG Pipeline Evaluation',
            description: 'Establish continuous evaluation of retrieval and generation quality using automated metrics.',
            actions: [
              'Build evaluation dataset: 100+ question-answer-context triples',
              'Measure retrieval: recall@k, MRR, NDCG on evaluation set',
              'Measure generation: faithfulness, answer relevance via RAGAS',
              'Set up automated eval pipeline in CI on dataset updates',
              'Create dashboard tracking retrieval and generation metrics over time',
            ],
          },
        ],
        summary: `RAG pipeline for ${domain} designed: 6-step process from chunking through evaluation ensures high-precision retrieval-augmented generation at production scale.`,
      },
      duration: Date.now() - start,
    };
  },
};
