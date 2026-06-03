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
      // .trim() guards against a trailing space/newline pasted into a hosting
      // dashboard env var (a common cause of spurious 401s in production).
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
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

// Pull a parseable JSON payload out of a raw model response. Models occasionally wrap their
// output in markdown fences, prepend a sentence, or leave a trailing comma; this strips the
// fences, slices to the outermost {...} / [...], and drops trailing commas before } or ].
// It does NOT fix genuinely malformed strings (unescaped quotes/newlines) — that is what the
// retry in runJson is for.
export function extractJson(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const firstObj = s.indexOf('{')
  const firstArr = s.indexOf('[')
  const candidates = [firstObj, firstArr].filter((i) => i >= 0)
  if (candidates.length) {
    const start = Math.min(...candidates)
    if (start > 0) s = s.slice(start)
  }
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (end >= 0) s = s.slice(0, end + 1)
  return s.replace(/,(\s*[}\]])/g, '$1') // drop trailing commas
}

// Blocking JSON-mode call. Returns the parsed object of type T.
// DeepSeek occasionally emits invalid JSON even in json_object mode (an unescaped quote or
// newline inside a string value). We extract defensively and, if parsing still fails, retry
// once at a lower temperature with a reinforced "strict JSON only" instruction before giving up.
export async function runJson<T>(
  system: string,
  user: string,
  maxTokens = 4000,
  temperature = 0.5,
  model: DeepSeekModel = MODEL,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await getClient().chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: attempt === 0 ? temperature : Math.min(temperature, 0.3),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            attempt === 0
              ? system
              : system +
                '\n\n只输出一个合法的 JSON，不要任何多余文字或解释；字符串值内部的引号和换行必须正确转义。',
        },
        { role: 'user', content: user },
      ],
    })
    const raw = (r.choices[0].message.content ?? '').trim()
    try {
      return JSON.parse(extractJson(raw)) as T
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

// Clamp a numeric reliability score into the band allowed for its source tier.
// Mirrors StratSquad's source_judge: community/ugc claims can never read as gospel.
export function clampReliability(tier: string, raw: number): number {
  const bands: Record<string, [number, number]> = {
    internal: [0.8, 1.0],
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
