import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const out=join(root,'recon');mkdirSync(out,{recursive:true});
// V0 location scouting stills, not final footage. No wallet actions or writes.
const browser=await chromium.launch({args:['--force-color-profile=srgb']});
const ctx=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2,colorScheme:'light'});
await ctx.addInitScript(()=>localStorage.setItem('marque-theme','light'));
const shots=[['positions','/positions?addr=0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'],['register','/register'],['standard','/standard'],['charter','/app/charter?agent=marque:bound&category=rebalancing'],['proof','/pancakeswap/proof'],['ledger','/ledger']];
for(const [name,path] of shots){
 const page=await ctx.newPage();
 try{
  await page.goto('https://marque.trade'+path,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
  await page.waitForTimeout(2000);
  const text=await page.locator('body').innerText();
  writeFileSync(join(out,name+'.txt'),text);
  await page.screenshot({path:join(out,name+'.png'),fullPage:true});
  writeFileSync(join(out,name+'.source.json'),JSON.stringify({url:page.url(),capturedAt:new Date().toISOString(),viewport:{width:1600,height:1000},deviceScaleFactor:2,kind:'V0 scouting still',theme:await page.locator('html').getAttribute('data-theme')},null,2));
  console.log(name,'scouted');
 }catch(e){console.log(name,e.message.split('\n')[0]);}
 await page.close();
}
await browser.close();
