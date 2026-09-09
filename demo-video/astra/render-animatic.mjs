import {chromium} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const scenes=JSON.parse(readFileSync(join(root,'storyboard.json'),'utf8'));
const facts=JSON.parse(readFileSync(join(root,'FACTS.json'),'utf8'));
const out=join(root,'boards');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--force-color-profile=srgb']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await page.goto(pathToFileURL(join(root,'board.html')).href);
await page.evaluate(()=>document.fonts.ready);
const list=[];const checks=[];
for(let i=0;i<scenes.length;i++){
 const s=scenes[i];
 await page.evaluate(({s,i,scenes,facts})=>window.renderBoard(s,i,scenes,facts),{s,i,scenes,facts});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
 const file=join(out,s.id+'.png');await page.screenshot({path:file});
 checks.push(await page.evaluate(()=>({id:document.querySelector('#chapter').textContent,voBottom:document.querySelector('#vo').getBoundingClientRect().bottom,imagesLoaded:[...document.images].every(x=>x.complete&&x.naturalWidth>0)})));
 list.push(`file '${file}'\nduration ${s.duration}`);console.log(s.id,'rendered');
}
await browser.close();
if(checks.some(c=>c.voBottom>1062||!c.imagesLoaded))throw Error('Board overflow or missing images: '+JSON.stringify(checks));
list.push(`file '${join(out,scenes.at(-1).id+'.png')}'`);
writeFileSync(join(out,'concat.txt'),list.join('\n')+'\n');
execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',join(out,'concat.txt'),'-t','160','-vf','fps=30,scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',join(root,'marque-animatic-v0.mp4')],{stdio:'inherit'});
writeFileSync(join(root,'ANIMATIC-QA.json'),JSON.stringify({kind:'V0 silent storyboard, not final film',durationSeconds:160,voice:'Not yet selected. Text is script, not aligned captions.',checks,review:'Frame inspection required; auditory and full-motion review unassessed.'},null,2)+'\n');
console.log('160-second animatic ready');
