import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));const out=join(root,'captures');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--force-color-profile=srgb']});
const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,colorScheme:'light'});
await ctx.addInitScript(()=>localStorage.setItem('marque-theme','light'));
for(const [name,path] of [['positions','/positions?addr=0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'],['register','/register'],['standard','/standard/MCS-REB-1'],['charter','/app/charter?agent=marque:bound&category=rebalancing'],['receipt','/receipts/latest'],['proof','/pancakeswap/proof'],['ledger','/ledger']]){
 const p=await ctx.newPage();try{await p.goto('https://marque.trade'+path,{waitUntil:'networkidle',timeout:60000});await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:join(out,name+'.png'),fullPage:true});writeFileSync(join(out,name+'.txt'),await p.locator('body').innerText());writeFileSync(join(out,name+'.json'),JSON.stringify({url:p.url(),capturedAt:new Date().toISOString(),viewport:{width:1440,height:900},scale:2,kind:'Actual product capture'},null,2));console.log(name,p.url());}catch(e){console.log(name,e.message.split('\n')[0]);}await p.close();
}
await browser.close();
