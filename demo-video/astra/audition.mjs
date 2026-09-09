import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const key=readFileSync('/root/.marque/astra-elevenlabs.env','utf8').trim().split('=',2)[1];
const text='Before an agent touches your money, what should it have to prove? A registration gives you a name. It does not give you an answer. We tried to hire them. Six hundred and eighty-four conformance runs against third-party agents. Passes: zero. Evidence before authority. That is Marque.';
const voices=[['daniel','onwK4e9ZLuTAKqWW03F9'],['george','JBFqnCBsd6RMkjVDRZzb'],['bill','pqHfZKP75CvOlQylNhV4']];
const settings={stability:0.42,similarity_boost:0.75,style:0.12,use_speaker_boost:true,speed:1};
const model='eleven_multilingual_v2';
const out=join(root,'auditions');mkdirSync(out,{recursive:true});
const sub=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':key}});
if(!sub.ok) throw Error(`credit check HTTP ${sub.status}`);
const balance=await sub.json();
const needed=text.length*voices.length;
if(balance.character_limit-balance.character_count<needed) throw Error(`Need ${needed} existing characters; only ${balance.character_limit-balance.character_count} remain. No upgrade attempted.`);
console.log(`Three auditions: ${needed} characters, existing allowance only, no plan change.`);
for(const [name,id] of voices){
 const payload={text,model_id:model,voice_settings:settings};
 const hash=createHash('sha256').update(JSON.stringify({id,...payload,format:'mp3_44100_128'})).digest('hex');
 const file=join(out,`${name}-${hash.slice(0,12)}`);
 if(existsSync(file+'.mp3')){console.log(`${name}: cached`);continue;}
 const res=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}/with-timestamps?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify(payload)});
 if(!res.ok)throw Error(`${name}: HTTP ${res.status}; stopped without printing provider body or credentials`);
 const data=await res.json();
 writeFileSync(file+'.mp3',Buffer.from(data.audio_base64,'base64'));
 writeFileSync(file+'.json',JSON.stringify({voice:name,voiceId:id,model,settings,text,hash,createdAt:new Date().toISOString(),alignment:data.alignment,normalized_alignment:data.normalized_alignment,review:'Awaiting Francis listening and selection; synthetic voice.'},null,2)+'\n');
 console.log(`${name}: saved`);
}
