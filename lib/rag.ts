// Knowledge base RAG for Customer Jury, mirroring StratSquad's hybrid approach:
// dense embeddings (SiliconFlow, OpenAI-compatible) + optional BGE reranker.
// Chunks are embedded once at ingest, stored client-side, and passed back into
// /api/ground at run time, where the query is embedded and the top chunks are
// retrieved + reranked, then injected into the four-lens reasoning as evidence.
import type { UserChunk } from './types'

const BASE = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1'
const EMBED_MODEL = process.env.EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-0.6B'
const RERANK_MODEL = process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3'

export function ragEnabled(): boolean {
  return !!process.env.SILICONFLOW_API_KEY
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    // .trim() guards against a trailing newline pasted into a dashboard env var
    Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY?.trim()}`,
  }
}

// Embed a batch of texts -> 2D array of vectors. Batched to stay within API limits.
export async function embed(texts: string[]): Promise<number[][]> {
  if (!ragEnabled()) throw new Error('SILICONFLOW_API_KEY not set')
  const out: number[][] = []
  const BATCH = 16
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const res = await fetch(`${BASE}/embeddings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: EMBED_MODEL, input: slice, encoding_format: 'float' }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text().catch(() => '')}`)
    const data = await res.json()
    if (!data?.data) throw new Error('embed returned no data')
    // SiliconFlow preserves input order; sort by index defensively.
    const vecs = (data.data as { index: number; embedding: number[] }[])
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding)
    out.push(...vecs)
  }
  return out
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// Split raw text into reasonably sized chunks. Prefers paragraph boundaries,
// falls back to hard slicing for very long paragraphs.
export function chunkText(text: string, maxChars = 700): string[] {
  const paras = text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if (p.length > maxChars) {
      if (buf) { chunks.push(buf); buf = '' }
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars))
      continue
    }
    if ((buf + '\n\n' + p).length > maxChars) {
      if (buf) chunks.push(buf)
      buf = p
    } else {
      buf = buf ? buf + '\n\n' + p : p
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

// Fetch a URL and strip it down to readable text (best-effort, no headless browser).
export async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Customer Jury KB ingest)' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Character-bigram overlap, used as a no-embedding fallback. Works for CJK and Latin
// (Chinese has no spaces, so token splitting fails; bigrams degrade gracefully).
function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/\s+/g, '')
  const g = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2))
  return g
}
export function topKByKeyword(query: string, chunks: UserChunk[], k: number): UserChunk[] {
  const q = bigrams(query)
  return chunks
    .map((c) => {
      const cg = bigrams(c.text)
      let overlap = 0
      for (const g of q) if (cg.has(g)) overlap++
      return { c, score: overlap }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c)
}

// Cosine top-k over pre-embedded chunks.
export function topKByCosine(queryVec: number[], chunks: UserChunk[], k: number): UserChunk[] {
  return chunks
    .map((c) => ({ c, score: cosine(queryVec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c)
}

// Optional BGE rerank over candidate chunk texts; returns reordered chunks.
// Best-effort: on any failure, returns the candidates unchanged.
export async function rerank(query: string, candidates: UserChunk[], topN: number): Promise<UserChunk[]> {
  if (!ragEnabled() || candidates.length === 0) return candidates.slice(0, topN)
  try {
    const res = await fetch(`${BASE}/rerank`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: candidates.map((c) => c.text),
        top_n: Math.min(topN, candidates.length),
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return candidates.slice(0, topN)
    const data = await res.json()
    const results = data?.results as { index: number }[] | undefined
    if (!results) return candidates.slice(0, topN)
    return results.map((r) => candidates[r.index]).filter(Boolean).slice(0, topN)
  } catch {
    return candidates.slice(0, topN)
  }
}

// Full retrieval: embed query -> cosine top-(k*3) -> rerank -> top-k.
// Degrades gracefully: if the chunks were never embedded (no SiliconFlow balance at
// ingest) or the query embedding fails, falls back to bigram keyword overlap so the
// knowledge base still grounds the analysis.
export async function retrieve(query: string, chunks: UserChunk[], k = 5): Promise<UserChunk[]> {
  if (chunks.length === 0) return []
  const hasEmbeddings = chunks.every((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
  if (hasEmbeddings) {
    try {
      const [qVec] = await embed([query])
      const candidates = topKByCosine(qVec, chunks, k * 3)
      return await rerank(query, candidates, k)
    } catch {
      // fall through to keyword fallback
    }
  }
  return topKByKeyword(query, chunks, k)
}
