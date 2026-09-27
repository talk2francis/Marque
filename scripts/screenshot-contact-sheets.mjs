// Inspection aid only: combine existing page screenshots, never product artwork.
import sharp from 'sharp'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
if (!dir) throw new Error('Pass the screenshot directory')
for (const theme of ['night','day']) for (const width of [390,768,1440]) {
  const files = readdirSync(dir).filter(f => f.endsWith(`.${width}.${theme}.png`)).sort()
  const cells = []
  for (let i=0;i<files.length;i++) {
    const f=files[i], x=(i%7)*180, y=Math.floor(i/7)*520
    const resized = await sharp(join(dir,f)).resize({width:170,height:485,fit:'inside'}).toBuffer()
    const label=f.replace(`.${width}.${theme}.png`,'').replace(/[<>&]/g,'').slice(0,26)
    cells.push({input:resized,left:x+5,top:y+28})
    cells.push({input:Buffer.from(`<svg width="180" height="26"><text x="5" y="18" font-size="11" font-family="sans-serif" fill="white">${label}</text></svg>`),left:x,top:y})
  }
  const output=join(dir,`contact-${width}-${theme}.jpg`)
  await sharp({create:{width:1260,height:Math.ceil(files.length/7)*520,channels:3,background:'#303630'}}).composite(cells).jpeg({quality:85}).toFile(output)
  console.log(`${files.length} screenshots: ${output}`)
}
