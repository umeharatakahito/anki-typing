import subprocess
W='/private/tmp/claude-501/-Users-umeharatakahito-anki-typing/f5d39834-ac2f-447a-801e-e171eea8262d/scratchpad'; V=W+'/video'; R=V+'/reel'
S=0.6
SEGS=[('mn-raw.mp4',[(78.0,88.0,3),(88.0,95.5,6),(95.5,99.6,1),(129.0,134.0,3.5),(155.0,159.8,1.2)]),
      ('kobun-raw.mp4',[(44.5,51.0,2),(51.5,57.5,2),(68.6,70.2,1.4),(70.2,71.6,1)]),
      ('it-raw.mp4',[(100.5,101.5,S),(101.5,102.2,1)]),
      ('en-raw.mp4',[(34.4,35.5,S),(35.5,36.2,1)]),
      ('study-raw.mp4',[(47.5,49.25,S),(49.25,49.9,1)]),
      ('el-raw.mp4',[(52.3,54.3,1)])]
outs=[];tot=0
for n,(raw,parts) in enumerate(SEGS):
    fs=[];ls=[]
    for i,(s,e,r) in enumerate(parts):
        fs.append(f"[0:v]trim=start={s}:end={e},setpts=(PTS-STARTPTS)/{r},fps=30[s{i}]"); ls.append(f"[s{i}]"); tot+=(e-s)/r
    d=sum((e-s)/r for s,e,r in parts)
    fc=';'.join(fs)+f";{''.join(ls)}concat=n={len(parts)}:v=1:a=0,scale=886:1925,crop=886:1920:0:2,format=yuv420p[o]"
    o=f'{R}/p{n}.mp4'; outs.append(o)
    subprocess.run(['ffmpeg','-y','-v','error','-i',f'{V}/{raw}','-filter_complex',fc,'-map','[o]','-t',f'{d:.2f}','-c:v','libx264','-preset','veryfast','-crf','18','-r','30',o],check=True)
open(f'{R}/plist.txt','w').write(''.join(f"file '{o}'\n" for o in outs))
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',f'{R}/plist.txt','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-shortest','-c:v','copy','-c:a','aac','-b:a','128k','-movflags','+faststart',f'{V}/preview3-raw.mp4'],check=True)
print(round(tot,1))
