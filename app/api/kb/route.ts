import { randomUUID } from 'crypto'
import { embed, chunkText, fetchUrlText, ragEnabled } from '@/lib/rag'
import type { UserChunk } from '@/lib/types'

// ============================================================================
// KB INGEST — turn pasted text or a URL into embedded UserChunk[].
//
// The chunks (with their vectors) are returned to the client, which keeps them
// and passes them back into /api/ground at run time. This keeps the server
// stateless (Vercel-friendly): no database, the knowledge base lives with the
// user's session. Mirrors StratSquad's client-stored chunk pattern.
// ============================================================================

export async function POST(req: Request) {
  try {
    if (!ragEnabled()) return new Response('SILICONFLOW_API_KEY not configured', { status: 503 })

    const { text, url, source } = (await req.json()) as { text?: string; url?: string; source?: string }

    let raw = (text || '').trim()
    let label = (source || '').trim()
    if (!raw && url) {
      raw = await fetchUrlText(url)
      if (!label) label = url
    }
    if (!label) label = '粘贴文本 / Pasted text'
    if (!raw) return new Response('Missing text or url', { status: 400 })

    const pieces = chunkText(raw).slice(0, 80) // cap per document to keep payloads sane
    if (pieces.length === 0) return new Response('No usable text extracted', { status: 400 })

    // Try to embed; if the embedding provider is unavailable (e.g. insufficient
    // balance), still store the raw chunks so the KB grounds the analysis via the
    // keyword fallback at retrieval time. Never fail the ingest just for embeddings.
    let vectors: number[][] = []
    let embedded = true
    try {
      vectors = await embed(pieces)
    } catch {
      embedded = false
    }
    const chunks: UserChunk[] = pieces.map((t, i) => ({
      id: randomUUID(),
      text: t,
      source: label,
      embedding: embedded ? vectors[i] : [],
    }))

    return Response.json({ chunks, source: label, count: chunks.length, embedded })
  } catch (e: any) {
    return new Response(e?.message ?? 'kb ingest failed', { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
