"""60-second cut. Reuses the per-scene clips from build-sarah/ (VO already baked
in with the correct lead), concatenates a subset, then re-mixes the music with
the same treatment as the hero — including the silent zero-pass hold — and
re-burns only the captions that fall inside the kept scenes."""
import pathlib, json, subprocess, math, textwrap

root = pathlib.Path(__file__).resolve().parent
work = root / 'build-sarah'
KEEP = ['question', 'population', 'zero', 'title', 'charter', 'proof', 'close']

timeline = json.loads((root / 'timeline.json').read_text())
by_id = {s['id']: s for s in timeline}

# per-scene durations from the actual encoded clips
def dur(p):
    return float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)]).decode().strip())

segs = []
t = 0.0
for sid in KEEP:
    d = dur(work / f'{sid}.mp4')
    segs.append({'id': sid, 'start': t, 'duration': d, 'lead': by_id[sid]['lead']})
    t += d
total = t

# concat picture+VO
(root / 'short-concat.txt').write_text('\n'.join(f"file '{work / (s['id'] + '.mp4')}'" for s in segs))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(root / 'short-concat.txt'),
                '-c', 'copy', str(root / 'short-picture.mp4')], check=True)

# captions: re-time the hero cues that belong to a kept scene
hero_scenes = json.loads((root / 'scenes.json').read_text())
voice = root / 'voice-timed'
cues = []
for s in segs:
    d = json.loads((voice / (s['id'] + '.json')).read_text())
    for c in d['cues']:
        cues.append({'text': c['text'],
                     'start': s['start'] + s['lead'] + c['start'],
                     'end': s['start'] + s['lead'] + c['end']})

def stamp(x, srt=False):
    ms = round(x * 1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); sec, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{sec:02},{ms:03}' if srt else f'{h}:{m:02}:{sec:02}.{ms // 10:02}'

ass = ('[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n[V4+ Styles]\n'
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, '
       'Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, '
       'MarginR, MarginV, Encoding\n'
       'Style: Default,DejaVu Sans,34,&H00FFFFFF,&H00FFFFFF,&H3312140E,&H3312140E,0,0,0,0,100,100,0,0,3,12,0,2,100,100,38,1\n'
       '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
srt = ''
for i, c in enumerate(cues):
    lines = textwrap.wrap(c['text'], width=42)
    ass += f"Dialogue: 0,{stamp(c['start'])},{stamp(c['end'])},Default,,0,0,0,," + '\\N'.join(lines) + '\n'
    srt += f"{i + 1}\n{stamp(c['start'], True)} --> {stamp(c['end'], True)}\n" + '\n'.join(lines) + '\n\n'
(root / 'marque-demo-60.srt').write_text(srt)
(work / 'short-captions.ass').write_text(ass)

zero = next(s for s in segs if s['id'] == 'zero')
mute = f"between(t,{zero['start']},{zero['start'] + zero['duration']})"
filters = (
    f"[0:a]highpass=f=80,loudnorm=I=-16:TP=-2:LRA=7,asplit=2[vo][key];"
    f"[1:a]atrim=duration={total},asetpts=PTS-STARTPTS,volume=0.09,afade=t=in:d=2,"
    f"afade=t=out:st={total - 4}:d=4,volume=0:enable='{mute}'[music];"
    f"[music][key]sidechaincompress=threshold=0.025:ratio=4:attack=20:release=320[bed];"
    f"[vo][bed]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=7[a]")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(root / 'short-picture.mp4'),
                '-ss', '45', '-i', str(root / '../music/dreams-become-real-source.mp3'),
                '-filter_complex', filters, '-map', '0:v', '-map', '[a]',
                '-vf', f"ass={work / 'short-captions.ass'}", '-t', str(total),
                '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-threads', '2',
                '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-pix_fmt', 'yuv420p',
                '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709',
                '-color_trc', 'bt709', '-movflags', '+faststart', str(root / 'marque-demo-60.mp4')], check=True)
print(f'60s cut: {total:.1f}s, {len(cues)} cues')
