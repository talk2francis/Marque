import pathlib,json,subprocess,math,textwrap,shutil
root=pathlib.Path(__file__).resolve().parent;work=root/'build-sarah';work.mkdir(exist_ok=True)
scenes=json.loads((root/'scenes.json').read_text());voice=root/'voice-timed';timeline=[];cues=[];t=0
for s in scenes:
 d=json.loads((voice/(s['id']+'.json')).read_text());lead=1.5 if s['id']=='zero' else .35;tail=4 if s['id']=='close' else .65
 duration=math.ceil((d['duration']+lead+tail)*30)/30
 timeline.append(dict(s,start=t,duration=duration,lead=lead))
 for c in d['cues']:cues.append(dict(text=c['text'],start=t+lead+c['start'],end=t+lead+c['end']))
 t+=duration
(root/'timeline.json').write_text(json.dumps(timeline,indent=2))
def run(args):subprocess.run(args,check=True)
def stamp(t,srt=False):
 ms=round(t*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);sec,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{sec:02},{ms:03}' if srt else f'{h}:{m:02}:{sec:02}.{ms//10:02}'
ass='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,34,&H00FFFFFF,&H00FFFFFF,&H3312140E,&H3312140E,0,0,0,0,100,100,0,0,3,12,0,2,100,100,38,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
srt=''
for i,c in enumerate(cues):
 lines=textwrap.wrap(c['text'],width=42);assert len(lines)<=2,(c,lines)
 ass+=f"Dialogue: 0,{stamp(c['start'])},{stamp(c['end'])},Default,,0,0,0,,"+'\\N'.join(lines)+'\n'
 srt+=f"{i+1}\n{stamp(c['start'],True)} --> {stamp(c['end'],True)}\n"+'\n'.join(lines)+'\n\n'
(root/'marque-demo.srt').write_text(srt);(work/'captions.ass').write_text(ass)
for s in timeline:
 target=work/(s['id']+'.mp4')
 if target.exists():continue
 run(['ffmpeg','-v','error','-y','-loop','1','-framerate','30','-i',str(root/'frames'/(s['id']+'.png')),'-i',str(voice/(s['id']+'.wav')),'-t',str(s['duration']),'-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p','-af',f"adelay={round(s['lead']*1000)}:all=1,apad",'-c:v','libx264','-preset','fast','-crf','18','-threads','2','-c:a','aac','-ar','48000','-b:a','256k','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',str(target)])
 print('Encoded',s['id'],flush=True)
(work/'concat.txt').write_text('\n'.join("file '"+str(work/(s['id']+'.mp4'))+"'" for s in timeline))
run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(work/'concat.txt'),'-c','copy',str(work/'picture.mp4')])
z=next(s for s in timeline if s['id']=='zero');mute=f"between(t,{z['start']},{z['start']+z['duration']})"
filters=f"[0:a]highpass=f=80,loudnorm=I=-16:TP=-2:LRA=7,asplit=2[vo][key];[1:a]atrim=duration={t},asetpts=PTS-STARTPTS,volume=0.09,afade=t=in:d=2,afade=t=out:st={t-4}:d=4,volume=0:enable='{mute}'[music];[music][key]sidechaincompress=threshold=0.025:ratio=4:attack=20:release=320[bed];[vo][bed]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=7[a]"
run(['ffmpeg','-v','error','-y','-i',str(work/'picture.mp4'),'-ss','45','-i',str(root/'../music/dreams-become-real-source.mp3'),'-filter_complex',filters,'-map','0:v','-map','[a]','-vf',f"ass={work/'captions.ass'}",'-t',str(t),'-c:v','libx264','-crf','18','-preset','fast','-threads','2','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(root/'marque-demo.mp4')])
shutil.copyfile(root/'frames/close.png',root/'marque-poster.png')
print('Completed',t,'seconds',len(cues),'cues',flush=True)
