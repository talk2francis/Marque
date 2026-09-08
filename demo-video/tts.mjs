/**
 * ElevenLabs narration for the demo film.
 *
 *   node demo-video/tts.mjs audition                 # 3 voice samples of the cold open
 *   node demo-video/tts.mjs full <voiceId>           # every VO line, one wav per line
 *
 * Key is read from ELEVENLABS_API_KEY (in /root/.marque/secrets.env, never committed).
 * Model: eleven_multilingual_v2 (highest quality for English narration).
 * Delivery: high stability + zero style = flat, measured, documentary — the
 * film's voice is "measured, not asserted", so no expressiveness.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) { console.error('ELEVENLABS_API_KEY not set (source /root/.marque/secrets.env)'); process.exit(1) }

const MODEL = 'eleven_multilingual_v2'
const SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true, speed: 0.94 }

const VOICES = {
  daniel: 'onwK4e9ZLuTAKqWW03F9', // Steady Broadcaster, British — the documentary pick
  brian: 'nPczCjzI2devNBz1zQrb',  // Deep, Resonant and Comforting
  bill: 'pqHfZKP75CvOlQylNhV4',   // Wise, Mature, Balanced
  george: 'JBFqnCBsd6RMkjVDRZzb', // Warm storyteller (backup)
}

const COLD_OPEN =
  'Two hundred and ninety-eight thousand agents are registered on BNB Smart Chain. ' +
  '<break time="0.6s" /> We tried to hire them. <break time="0.8s" /> ' +
  'Thirty thousand declare a service we can read. Thirty thousand answer when we knock. ' +
  'Six thousand expose something a buyer could actually hire. ' +
  'And then we ran the test. Six hundred and eighty-four conformance runs against third-party agents on this chain. ' +
  '<break time="1.4s" /> Passes: zero.'

// The full script, one entry per delivered line. `id` names the wav.
const LINES = [
  ['01_open_a', 'Two hundred and ninety-eight thousand agents are registered on BNB Smart Chain.'],
  ['01_open_b', '<break time="0.7s" /> We tried to hire them.'],
  ['02_count_a', 'Thirty thousand declare a service we can read. Thirty thousand answer when we knock. Six thousand expose something a buyer could actually hire.'],
  ['02_count_c', 'Then we ran the test. Six hundred and eighty-four conformance runs against third-party agents on this chain.'],
  ['02_count_d', '<break time="1.5s" /> Passes: zero.'],
  ['02_count_e', '<break time="0.5s" /> That is not an opinion about the ecosystem. It is a count.'],
  ['03_title', 'Marque is the marketplace that will tell you that.'],
  ['04_read_a', 'It starts with what you hold. Paste any BNB Chain address — no wallet, nothing signed — and every number is read from chain, with the block it came from.'],
  ['05_find_a', 'Then Marque ranks the agents that can act on it — by whether they answer, and whether they passed. Not by stars.'],
  ['05_find_b', 'One operator registering forty identities is one row, not forty.'],
  ['05_find_c', 'Compare them on the ten things that decide a hire. Then preview one, free, before you pay anything.'],
  ['06_test_a', 'A registration is not a résumé. So Marque publishes the test, computes the answer itself from chain state at a pinned block, and grades every agent field by field.'],
  ['06_test_b', 'Including the ones that fail. A directory that only listed its passes would be a brochure.'],
  ['07_bound_a', 'Evidence tells you how good an agent has been. It does not tell you how bad this run can get.'],
  ['07_bound_b', 'So authority arrives with an edge. One contract. One function. A spending cap. An expiry — refused before it is signed.'],
  ['07_bound_c', 'And a revoke that fires a real transaction.'],
  ['08_proof_a', 'Every hire leaves a receipt — what was quoted, what was permitted, what ran, what it produced — anchored on chain.'],
  ['08_proof_b', 'PLACEHOLDER — ledger comparison line, fill after blind grading.'],
  ['08_proof_c', 'And one real rebalance, on mainnet, under a sixty-dollar charter. Four transactions. Under one basis point of slippage. Fees resumed nine blocks later.'],
  ['09_close_a', 'Two hundred and ninety-eight thousand registered. Almost none of them work. Marque is how you find out which ones do — before you pay.'],
  ['09_close_b', '<break time="0.5s" /> Marque.'],
]

const synth = async (voiceId, text, outFile) => {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  })
  if (!res.ok) { console.error(`  FAIL ${outFile}: ${res.status} ${(await res.text()).slice(0, 200)}`); return false }
  writeFileSync(outFile, Buffer.from(await res.arrayBuffer()))
  return true
}

const mode = process.argv[2]
if (mode === 'audition') {
  const dir = join(process.cwd(), 'demo-video', 'voice-samples'); mkdirSync(dir, { recursive: true })
  for (const [name, id] of Object.entries(VOICES)) {
    const ok = await synth(id, COLD_OPEN, join(dir, `el_${name}.mp3`))
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`)
  }
} else if (mode === 'full') {
  const voiceId = process.argv[3]
  if (!voiceId) { console.error('usage: node demo-video/tts.mjs full <voiceId>'); process.exit(1) }
  const dir = join(process.cwd(), 'demo-video', 'vo'); mkdirSync(dir, { recursive: true })
  for (const [id, text] of LINES) {
    if (text.startsWith('PLACEHOLDER')) { console.log(`  skip ${id} (placeholder)`); continue }
    const ok = await synth(voiceId, text, join(dir, `${id}.mp3`))
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id}`)
  }
} else {
  console.error('usage: node demo-video/tts.mjs audition | full <voiceId>')
  process.exit(1)
}
