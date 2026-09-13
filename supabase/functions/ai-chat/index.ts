import { createClient } from 'npm:@supabase/supabase-js@2.106.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Supabase Edge Functions run on a Deno runtime that can tear the isolate
// down the instant the returned Response finishes flushing to the caller. A
// bare unawaited promise for the usage-logging write would risk being killed
// mid-flight; EdgeRuntime.waitUntil keeps the isolate alive until the promise
// settles, without making the caller wait for it.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Session 1 cost meter. This is the ONLY place in the app that calls
// Anthropic directly (compute-slice's Stage 2 selection routes back through
// this function server-to-server) — so this is the one place usage needs to
// be captured. See llm_usage migration for the call_type whitelist.
const MODEL = 'claude-sonnet-4-5'
const INPUT_RATE_PER_MTOK = 3
const OUTPUT_RATE_PER_MTOK = 15

const KNOWN_CALL_TYPES = new Set([
  'build-chat',
  'reflection',
  'constraints-parse',
  'taste-profile',
  'grocery-enrich',
  'slice',
  'step-title-backfill',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeUserId(raw: unknown): string | null {
  return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null
}

// Drains the internal tee branch to extract usage from the raw Anthropic SSE
// stream, then writes one llm_usage row. Never throws out to its caller —
// this always runs detached via EdgeRuntime.waitUntil, so nothing here can
// ever affect the response already sent to the actual caller.
async function logUsage(
  meterStream: ReadableStream<Uint8Array>,
  callType: string | undefined,
  userId: string | null
): Promise<void> {
  try {
    const reader = meterStream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let inputTokens = 0
    let outputTokens = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'message_start') {
              inputTokens = parsed.message?.usage?.input_tokens ?? 0
            } else if (parsed.type === 'message_delta') {
              outputTokens = parsed.usage?.output_tokens ?? outputTokens
            }
          } catch {
            // Same tolerant behavior as every other SSE parser in this app: skip an unparseable line.
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const costUsd = (inputTokens / 1_000_000) * INPUT_RATE_PER_MTOK + (outputTokens / 1_000_000) * OUTPUT_RATE_PER_MTOK

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { error } = await adminClient.from('llm_usage').insert({
      user_id: userId,
      call_type: callType,
      model: MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    })
    if (error) {
      console.error('llm_usage insert failed:', error.message, { callType, userId })
    }
  } catch (error) {
    console.error('logUsage failed:', error instanceof Error ? error.message : error)
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }

  try {
    // Parse request body. call_type/user_id are the Session 1 cost-meter
    // tags — optional so a legacy/stale client bundle never breaks the
    // underlying AI call, only loses attribution for that one call.
    const { messages, systemPrompt, call_type, user_id } = await req.json()

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid messages array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid systemPrompt' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (typeof call_type !== 'string' || !KNOWN_CALL_TYPES.has(call_type)) {
      console.error('ai-chat: missing or unrecognized call_type — usage will not be attributable', call_type)
    }
    const normalizedUserId = normalizeUserId(user_id)

    // Get API key from environment
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Call Anthropic API with streaming
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: messages,
      }),
    })

    // Handle Anthropic API errors
    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text()
      return new Response(
        JSON.stringify({
          error: 'Anthropic API error',
          details: errorText,
          status: anthropicResponse.status
        }),
        {
          status: anthropicResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Tee the stream: one branch goes to the caller completely untouched
    // (identical bytes/timing to before this change), the other is drained
    // internally, off the response path, purely to capture usage.
    const [clientStream, meterStream] = anthropicResponse.body!.tee()
    EdgeRuntime.waitUntil(logUsage(meterStream, call_type, normalizedUserId))

    // Stream the response back to the client
    return new Response(clientStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
