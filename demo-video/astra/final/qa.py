import json,pathlib,subprocess,hashlib,re
root=pathlib.Path(__file__).resolve().parent;movie=root/'marque-demo.mp4';timeline=json.loads((root/'timeline.json').read_text());expected=sum(s['duration'] for s in timeline)
p=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)]));v=next(s for s in p['streams'] if s['codec_type']=='video');a=next(s for s in p['streams'] if s['codec_type']=='audio')
decode=subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],capture_output=True,text=True)
loud=subprocess.run(['ffmpeg','-hide_banner','-i',str(movie),'-af','loudnorm=I=-14:TP=-1:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True)
m=re.search(r'\{\s*"input_i".*?\}',loud.stderr,re.S);l=json.loads(m.group()) if m else {}
z=next(s for s in timeline if s['id']=='zero')
silence=subprocess.run(['ffmpeg','-v','error','-ss',str(z['start']+.05),'-t','1.3','-i',str(movie),'-map','0:a','-f','f32le','-'],capture_output=True)
import array
samples=array.array('f',silence.stdout);peak=max(map(abs,samples),default=1)
checks={'durationWithinOneFrame':abs(float(p['format']['duration'])-expected)<.05,'under170Seconds':expected<=170,'resolution':v['width']==1920 and v['height']==1080,'fps30':v['r_frame_rate']=='30/1','bt709':all(v.get(k)=='bt709' for k in ['color_space','color_transfer','color_primaries']),'limitedRange':v.get('color_range')=='tv','pixelFormat':v['pix_fmt']=='yuv420p','stereo48k':a['channels']==2 and a['sample_rate']=='48000','noSubtitleTrack':not any(s['codec_type']=='subtitle' for s in p['streams']),'fullDecode':decode.returncode==0 and not decode.stderr.strip(),'loudness':-15<=float(l.get('input_i',-99))<=-13,'truePeak':float(l.get('input_tp',99))<=-1,'zeroRevealSilent':peak<.00001}
report={'durationSeconds':p['format']['duration'],'expectedSeconds':expected,'checks':checks,'encodedLoudness':l,'zeroRevealPeakLinear':peak,'voice':'Sarah — ElevenLabs Multilingual v2','captionTiming':'ElevenLabs character timestamps grouped into word-based cues','visualMethod':'Editorial graphics and reframed actual product still captures; no grant/revoke interaction is claimed','unassessed':['Human listening on laptop and phone','Full-motion end-to-end human playback','Independent word-level forced alignment against recorded audio'],'sha256':hashlib.sha256(movie.read_bytes()).hexdigest()}
(root/'QA.json').write_text(json.dumps(report,indent=2)+'\n');(root/'SHA256SUMS').write_text(report['sha256']+'  marque-demo.mp4\n');print(json.dumps(report,indent=2))
if not all(checks.values()):raise SystemExit('QA failure')
