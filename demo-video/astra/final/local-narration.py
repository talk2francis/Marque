"""Offline fallback; each short caption is synthesized and timed separately."""
import json,pathlib,wave,re
from piper import PiperVoice, SynthesisConfig
root=pathlib.Path(__file__).parent;out=root/'voice-local-timed';out.mkdir(exist_ok=True)
voice=PiperVoice.load(str(root/'../../piper-voices/en_US-lessac-medium.onnx'))
for scene in json.loads((root/'scenes.json').read_text()):
 path=out/(scene['id']+'.wav')
 if path.exists():continue
 sentences=re.split(r'(?<=[.!?])\s+',scene['vo']);phrases=[]
 for sentence in sentences:
  words=sentence.split();part=''
  for word in words:
   if len(part)+len(word)+1>78:phrases.append(part);part=word
   else:part=(part+' '+word).strip()
  if part:phrases.append(part)
 pcm=b'';cues=[];rate=22050
 for phrase in phrases:
  start=len(pcm)/2/rate
  for chunk in voice.synthesize(phrase.replace('Marque','Mark'),SynthesisConfig(length_scale=1.12)):
   rate=chunk.sample_rate;pcm+=chunk.audio_int16_bytes
  end=len(pcm)/2/rate;cues.append({'text':phrase,'start':start,'end':end});pcm+=b'\0\0'*int(rate*.12)
 with wave.open(str(path),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm)
 (out/(scene['id']+'.json')).write_text(json.dumps({'voice':'Piper en_US-lessac-medium','text':scene['vo'],'duration':len(pcm)/2/rate,'cues':cues,'alignment':'Measured phrase-level synthesis boundaries; not forced word alignment'},indent=2))
 print(scene['id'],round(len(pcm)/2/rate,2),flush=True)
