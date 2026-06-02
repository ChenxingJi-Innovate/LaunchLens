import OpenAI from 'openai'
import { DEFAULT_MODEL, MODELS, type DeepSeekModel } from './types'

// Single DeepSeek client for all server-side reasoning, matching the workspace convention
// (StyleForge / SQLForge / StratSquad all point the openai SDK at the DeepSeek endpoint).
// Lazily constructed: building the OpenAI SDK at module load throws when no key is present,
// which breaks `next build` page-data collection. We only need it at request time.
let _client: OpenAI | null = null
export function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    })
  }
  return _client
}

export const MODEL: DeepSeekModel = DEFAULT_MODEL

// Validate a client-supplied model string against the known list; fall back to default.
// Never trust the request body to name an arbitrary model.
export function resolveModel(m?: string): DeepSeekModel {
  return MODELS.some((x) => x.id === m) ? (m as DeepSeekModel) : DEFAULT_MODEL
}

// Blocking JSON-mode call. Returns the parsed object of type T.
// We defensively strip markdown fences in case the model wraps its JSON.
export async function runJson<T>(
  system: string,
  user: string,
  maxTokens = 4000,
  temperature = 0.5,
  model: DeepSeekModel = MODEL,
): Promise<T> {
  const r = await getClient().chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  const raw = (r.choices[0].message.content ?? '').trim()
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  return JSON.parse(cleaned) as T
}

// Clamp a numeric reliability score into the band allowed for its source tier.
// Mirrors StratSquad's source_judge: community/ugc claims can never read as gospel.
export function clampReliability(tier: string, raw: number): number {
  const bands: Record<string, [number, number]> = {
    official: [0.75, 1.0],
    academic: [0.7, 0.95],
    industry: [0.5, 0.85],
    community: [0.3, 0.6],
    ugc: [0.15, 0.45],
    unknown: [0.1, 0.4],
  }
  const [lo, hi] = bands[tier] ?? bands.unknown
  const v = Number.isFinite(raw) ? raw : lo
  return Math.max(lo, Math.min(hi, v))
}
