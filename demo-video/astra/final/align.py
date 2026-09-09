"""Build word-timed caption cues from ElevenLabs character alignment."""
import json,pathlib,subprocess,re
root=pathlib.Path(__file__).resolve().parent;out=root/'voice-timed';out.mkdir(exist_ok=True)
for s in json.loads((root/'scenes.json').read_text()):
 src=root/'voice'/s['id'];d=json.loads(src.with_suffix('.json').read_text());a=d.get('normalized_alignment') or d['alignment'];chars=a['characters'];starts=a['character_start_times_seconds'];ends=a['character_end_times_seconds'];text=''.join(chars);words=[]
 for m in re.finditer(r'\S+',text):words.append({'text':m.group().replace('Mark','Marque'),'start':starts[m.start()],'end':ends[m.end()-1]})
 cues=[];group=[]
 for word in words:
  prospective=' '.join(w['text'] for w in group+[word])
  if group and (len(prospective)>74 or word['end']-group[0]['start']>5):
   cues.append({'text':' '.join(w['text'] for w in group),'start':group[0]['start'],'end':min(group[-1]['end']+.12,word['start'])});group=[]
  group.append(word)
  if re.search(r'[.!?]$',word['text']):cues.append({'text':' '.join(w['text'] for w in group),'start':group[0]['start'],'end':group[-1]['end']+.12});group=[]
 if group:cues.append({'text':' '.join(w['text'] for w in group),'start':group[0]['start'],'end':group[-1]['end']+.12})
 for i in range(len(cues)-1):cues[i]['end']=min(cues[i]['end'],cues[i+1]['start'])
 target=out/(s['id']+'.wav');subprocess.run(['ffmpeg','-v','error','-y','-i',str(src.with_suffix('.mp3')),'-ar','48000','-ac','1',str(target)],check=True)
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(target)]))
 (out/(s['id']+'.json')).write_text(json.dumps({'voice':d['voice'],'model':d['model'],'text':s['vo'],'duration':duration,'cues':cues,'words':words,'alignment':'ElevenLabs generated character timestamps, grouped to words and captions'},indent=2))
 print(s['id'],round(duration,2))
