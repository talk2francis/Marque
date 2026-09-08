/**
 * Voice audition for the demo film (Phase V0, gate 4).
 *
 * Synthesises the same ~20s cold-open passage with three OpenAI voices so
 * Francis can pick by listening. gpt-4o-mini-tts, ~$0.015/min — the three
 * samples together cost about two cents.
 *
 *   OPENAI_API_KEY=... node demo-video/tts-audition.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const KEY = process.env.OPENAI_API_KEY
if (!KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1) }

const OUT = join(process.cwd(), 'demo-video', 'voice-samples')
mkdirSync(OUT, { recursive: true })

const PASSAGE = [
  'Two hundred and ninety-eight thousand agents are registered on BNB Smart Chain.',
  'We tried to hire them.',
  'Thirty thousand declare a service we can read. Thirty thousand answer when we knock.',
  'Six thousand expose something a buyer could actually hire.',
  'And then we ran the test. Six hundred and eighty-four conformance runs against third-party agents on this chain.',
  'Passes: zero.',
].join(' ')

const INSTRUCTIONS =
  'Measured, unhurried, dry. A documentary narrator, not an advertisement. ' +
  'Lower register. Real pauses at sentence ends with a slight downward inflection. ' +
  'A deliberate, weighted pause before "Passes: zero." Never enthusiastic, never salesy.'

// gpt-4o-mini-tts voices that can carry a low, measured read.
const VOICES = ['onyx', 'ash', 'sage', 'echo']

const synth = async (voice) => {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: PASSAGE,
      instructions: INSTRUCTIONS,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    console.error(`  ${voice}: ${res.status} ${(await res.text()).slice(0, 300)}`)
    return
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const file = join(OUT, `voice-${voice}.mp3`)
  writeFileSync(file, buf)
  console.log(`  ok  ${voice.padEnd(6)} ${(buf.length / 1024).toFixed(0)} KB  -> ${file}`)
}

console.log('Synthesising voice samples (gpt-4o-mini-tts):')
for (const v of VOICES) await synth(v)
console.log('\nDone. Listen and pick one; that decision gates the rest of the film.')
