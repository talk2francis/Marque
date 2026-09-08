/**
 * VO for the film v2. Cleaner voice (Brian — deep, resonant), NO <break> tags
 * (they were producing the clicks/breath artifacts Francis heard); real silence
 * goes in the assembly instead. Natural full sentences, one file per line.
 *
 *   node demo-video/tts2.mjs [voiceId]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) { console.error('ELEVENLABS_API_KEY not set'); process.exit(1) }

const VOICE = process.argv[2] || 'nPczCjzI2devNBz1zQrb' // Brian — Deep, Resonant and Comforting
const MODEL = 'eleven_multilingual_v2'
const SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 0.96 }

const LINES = [
  ['01a', 'Two hundred and ninety-eight thousand agents are registered on BNB Smart Chain.'],
  ['01b', 'We tried to hire them.'],
  ['02a', 'Thirty thousand declare a service we can read. Thirty thousand answer when we knock.'],
  ['02b', 'Six thousand expose something a buyer could actually hire.'],
  ['02c', 'Five hundred and eight fall into a category that matters here. Rebalancing. Grid trading. Yield. Health factor.'],
  ['03a', 'Then we ran the test. Six hundred and eighty-four conformance runs against third-party agents.'],
  ['03b', 'Passes: zero.'],
  ['03c', 'That is not an opinion about the ecosystem. It is a count.'],
  ['04',  'Marque is the marketplace that tells you which ones work.'],
  ['05a', 'It starts with what you hold. Paste any address. No wallet, nothing connected, nothing signed.'],
  ['05b', 'This position is one point one from liquidation, read straight from chain, with the block it came from.'],
  ['06a', 'A registration is not a résumé. So Marque computes the correct answer itself, from chain state at a pinned block, and grades every agent field by field.'],
  ['06b', 'Including the ones that fail. A directory that only listed its passes would be a brochure.'],
  ['07a', 'To hire one, you grant a charter. One allowlist of contracts. One spending cap. One expiry.'],
  ['07b', 'Outside those bounds it cannot act, and it is refused before it signs, not audited after. Revoking is a single transaction.'],
  ['08',  'Every hire leaves a receipt. What was quoted, what was permitted, what ran, what it produced. Anchored on chain.'],
  ['09a', 'And one real rebalance. On mainnet. Under a sixty-dollar charter.'],
  ['09b', 'Four transactions. Under one basis point of slippage. Ten cents of gas.'],
  ['10a', 'Almost none of them work.'],
  ['10b', 'Marque is how you find out which ones do, before you pay.'],
]

const dir = join(process.cwd(), 'demo-video', 'vo2')
mkdirSync(dir, { recursive: true })

for (const [id, text] of LINES) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  })
  if (!res.ok) { console.error(`FAIL ${id}: ${res.status} ${(await res.text()).slice(0, 160)}`); continue }
  writeFileSync(join(dir, `${id}.mp3`), Buffer.from(await res.arrayBuffer()))
  console.log(`ok  ${id}`)
}
