// Temporary diagnostic. Reports the SHAPE of the configured keys as the deployed
// server sees them — never the full secret — so we can tell whether a hosting env
// var is wrong/dirty vs a network problem. Safe to delete once the 401 is resolved.
function shape(v: string | undefined) {
  const raw = v ?? ''
  return {
    present: raw.length > 0,
    len: raw.length,
    trimmedLen: raw.trim().length,
    hasWhitespace: raw.length !== raw.trim().length,
    head: raw.slice(0, 5),
    tail: raw.slice(-4),
  }
}

// Live auth probe from the server's own network (this is what matters on Vercel):
async function probeDeepseek() {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return { ok: false, status: 0, note: 'no key' }
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(20000),
    })
    const body = await r.text()
    return { ok: r.ok, status: r.status, note: r.ok ? 'auth OK from this server' : body.slice(0, 160) }
  } catch (e: any) {
    return { ok: false, status: -1, note: `network error: ${e?.message ?? e}` }
  }
}

export async function GET() {
  return Response.json({
    region: process.env.VERCEL_REGION ?? 'local',
    deepseek: shape(process.env.DEEPSEEK_API_KEY),
    siliconflow: shape(process.env.SILICONFLOW_API_KEY),
    deepseekProbe: await probeDeepseek(),
    expected: { deepseekLen: 35, deepseekHead: 'sk-d3', deepseekTail: 'd377' },
  })
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30
