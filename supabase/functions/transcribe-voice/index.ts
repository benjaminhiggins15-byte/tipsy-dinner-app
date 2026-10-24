import { createClient } from 'npm:@supabase/supabase-js@2.106.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

// 10MB is well under both OpenAI's 25MB /audio/transcriptions file cap and
// the platform's own request-body limit. 60s of compressed speech audio is a
// few hundred KB at most, so this only ever rejects malformed/oversized input.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

const ALLOWED_TYPES = ['audio/mp4', 'audio/webm']

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function baseMimeType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'missing authorization header' }, 401)
  }

  // CALLER client — used only to verify the caller is a real authenticated
  // user, same pattern as copy-received-recipe-photo. This function has no
  // DB/storage use at all beyond this check.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'not authenticated' }, 401)
  }

  const mimeType = baseMimeType(req.headers.get('Content-Type') ?? '')
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return jsonResponse({ error: `unsupported content type: ${mimeType || '(none)'}` }, 400)
  }

  const contentLengthHeader = req.headers.get('Content-Length')
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: 'audio clip too large' }, 413)
  }

  const audioBuffer = await req.arrayBuffer()
  if (audioBuffer.byteLength === 0) {
    return jsonResponse({ error: 'empty audio body' }, 400)
  }
  // Re-checked against the real byte count — Content-Length can be absent or wrong.
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: 'audio clip too large' }, 413)
  }

  const extension = mimeType === 'audio/mp4' ? 'mp4' : 'webm'
  const openaiForm = new FormData()
  openaiForm.append('file', new Blob([audioBuffer], { type: mimeType }), `voice-input.${extension}`)
  openaiForm.append('model', 'gpt-4o-transcribe')
  openaiForm.append('response_format', 'json')

  let openaiResponse: Response
  try {
    openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: openaiForm,
    })
  } catch (error) {
    console.error('transcribe-voice: network error calling OpenAI', error)
    return jsonResponse({ error: 'transcription service unreachable' }, 502)
  }

  if (!openaiResponse.ok) {
    // This is OpenAI's own error message about the request (e.g. bad format,
    // rate limit) — never audio or transcript content — safe to log.
    const errorText = await openaiResponse.text().catch(() => '')
    console.error('transcribe-voice: OpenAI returned error', openaiResponse.status, errorText)
    return jsonResponse({ error: 'transcription failed' }, 502)
  }

  let result: { text?: string }
  try {
    result = await openaiResponse.json()
  } catch {
    return jsonResponse({ error: 'transcription failed' }, 502)
  }

  if (typeof result.text !== 'string') {
    return jsonResponse({ error: 'transcription failed' }, 502)
  }

  // Deliberately not logged: this is the one value in this function that is
  // transcript content.
  return jsonResponse({ text: result.text }, 200)
})
