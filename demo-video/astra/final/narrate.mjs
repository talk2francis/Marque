import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));const scenes=JSON.parse(readFileSync(join(root,'scenes.json')));const out=join(root,'voice');mkdirSync(out,{recursive:true});
const key=readFileSync('/root/.marque/video-resume-elevenlabs.env','utf8').trim().split('=',2)[1];
const headers={'xi-api-key':key,'content-type':'application/json'};
const sub=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers,signal:AbortSignal.timeout(20000)});if(!sub.ok)throw Error('Allowance check HTTP '+sub.status);const balance=await sub.json();
const needed=scenes.filter(s=>!existsSync(join(out,s.id+'.json'))).reduce((n,s)=>n+s.vo.length,0);
if(balance.character_limit-balance.character_count<needed)throw Error(`Narration requires ${needed} characters; ${balance.character_limit-balance.character_count} available. No upgrade attempted.`);
const vr=await fetch('https://api.elevenlabs.io/v1/voices',{headers,signal:AbortSignal.timeout(20000)});if(!vr.ok)throw Error('Voices HTTP '+vr.status);const {voices}=await vr.json();
const chosen=voices.find(v=>v.name.startsWith('Sarah'))||voices.find(v=>v.name.startsWith('Rachel'))||voices.find(v=>v.name.startsWith('Adam'));if(!chosen)throw Error('Preferred narrator unavailable');
console.log('Selected',chosen.name);const model='eleven_multilingual_v2';
for(const s of scenes){const path=join(out,s.id);if(existsSync(path+'.json'))continue;const text=s.vo.replaceAll('Marque','Mark');
 const res=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${chosen.voice_id}/with-timestamps?output_format=mp3_44100_128`,{method:'POST',headers,signal:AbortSignal.timeout(90000),body:JSON.stringify({text,model_id:model,voice_settings:{stability:0.5,similarity_boost:0.75,style:0.1,use_speaker_boost:true,speed:1}})});
 if(!res.ok)throw Error('Synthesis HTTP '+res.status);const d=await res.json();writeFileSync(path+'.mp3',Buffer.from(d.audio_base64,'base64'));writeFileSync(path+'.json',JSON.stringify({voice:chosen.name,voiceId:chosen.voice_id,model,text:s.vo,spokenText:text,alignment:d.alignment,normalized_alignment:d.normalized_alignment},null,2));console.log(s.id,'saved');
}
