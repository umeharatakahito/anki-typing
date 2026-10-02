import subprocess, os
W='/private/tmp/claude-501/-Users-umeharatakahito-anki-typing/f5d39834-ac2f-447a-801e-e171eea8262d/scratchpad'; V=W+'/video'; R=V+'/reel'; os.makedirs(R,exist_ok=True)
CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CSS='''html,body{margin:0;width:1080px;height:1920px;overflow:hidden;font-family:"Hiragino Sans",sans-serif;color:#fff}
body{background:radial-gradient(900px 700px at 85% 5%, ACC55, transparent 60%),radial-gradient(700px 700px at 0% 70%, #22c3e633, transparent 60%),linear-gradient(170deg,#1b2a5e,#0e1736 55%,#0a1029)}'''
def shot(name,html):
    p=f'{R}/{name}.html'; open(p,'w').write(html); png=f'{R}/{name}.png'
    if os.path.exists(png): os.remove(png)
    subprocess.run(['perl','-e','alarm 40; exec @ARGV',CH,'--headless=new',f'--user-data-dir={W}/chrome-prof2','--no-first-run','--disable-extensions','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',f'--screenshot={png}','--window-size=1080,1920','file://'+p],capture_output=True)
    assert os.path.exists(png),name
def bg(name,acc,tag,h1,sub):
    shot(name,f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS.replace('ACC',acc)}
.tag{{position:absolute;top:40px;width:100%;text-align:center}}.tag span{{display:inline-block;padding:8px 26px;border-radius:999px;background:{acc};font-weight:800;font-size:30px;letter-spacing:.08em}}
h1{{position:absolute;top:118px;width:100%;margin:0;text-align:center;font-weight:900;font-size:80px;line-height:1.15}} h1 em{{font-style:normal;color:{acc}}}
p{{position:absolute;top:228px;width:100%;margin:0;text-align:center;font-weight:600;font-size:34px;color:#c9d4f2}}
.bez{{position:absolute;left:176px;top:292px;width:728px;height:1549px;border-radius:96px;background:linear-gradient(145deg,#3a4366,#12172b);box-shadow:0 30px 90px rgba(0,0,0,.55)}}
.foot{{position:absolute;bottom:22px;width:100%;text-align:center;font-weight:800;font-size:34px}} .foot b{{color:#ff6b35}}
</style></head><body><div class="tag"><span>{tag}</span></div><h1>{h1}</h1><p>{sub}</p><div class="bez"></div><div class="foot">STUDY <b>TYPE</b></div></body></html>''')

#bg('c1','#ff6b35','早押し対戦','地図が<em>引いていく</em>…','どこの国？ 最大4人・Web版の人とも対戦')
#bg('c2','#e8b04a','古文なぞなぞ','問題文が<em>少しずつ</em>','わかった瞬間に打つ、早押しモード')
#bg('c3','#a66bff','IT資格','資格の勉強も<em>指で</em>','ITパスポート・基本情報・生成AI')
#bg('c4','#3d7bff','大学受験','英単語は<em>英字キー</em>で','Bluetoothキーボードもそのまま使える')
#bg('c5','#22c3e6','雑学','この魚、<em>なんて名前？</em>','写真で覚える魚・鳥・花・昆虫')
#bg('c6','#2fbf71','理科','元素記号も<em>サクサク</em>','受験・資格・雑学 7,600問')
#shot('end2', open(R+'/end.html').read().replace('5,800問','7,600問'))
def seg(out,raw,bgn,parts):
    fs=[];ls=[];tot=0
    for i,(s,e,r) in enumerate(parts):
        fs.append(f"[0:v]trim=start={s}:end={e},setpts=(PTS-STARTPTS)/{r},fps=30[s{i}]"); ls.append(f"[s{i}]"); tot+=(e-s)/r
    fc=';'.join(fs)+f";{''.join(ls)}concat=n={len(parts)}:v=1:a=0,scale=700:1521,format=rgba[v];[1:v]format=gray,scale=700:1521[m];[v][m]alphamerge[vm];[2:v][vm]overlay=190:306:eof_action=repeat,format=yuv420p[o]"
    subprocess.run(['ffmpeg','-y','-v','error','-i',f'{V}/{raw}','-loop','1','-i',f'{V}/mask.png','-loop','1','-i',f'{R}/{bgn}.png','-filter_complex',fc,'-map','[o]','-t',f'{tot:.2f}','-c:v','libx264','-preset','veryfast','-crf','21','-r','30',f'{R}/{out}.mp4'],check=True)
    return tot

S=0.6
t=[]
t.append(seg('t1','map-raw.mp4','c1',[(29.7,40.0,2.2),(40.0,50.0,4),(50.0,53.6,1),(201.0,205.2,1),(206.0,208.6,1)]))
t.append(0) or 0 #seg('t2','kobun-raw.mp4','c2',[(44.5,51.0,1.6),(51.5,57.5,1.5),(70.4,72.4,1)]))
t.append(0) or 0 #seg('t3','it-raw.mp4','c3',[(100.8,102.5,S),(102.5,103.8,1)]))
t.append(0) or 0 #seg('t4','en-raw.mp4','c4',[(34.8,35.2,1),(35.2,36.7,S),(36.7,37.6,1)]))
t.append(0) or 0 #seg('t5','study-raw.mp4','c5',[(47.8,48.2,1),(48.2,50.3,S),(50.3,51.2,1)]))
t.append(0) or 0 #seg('t6','el-raw.mp4','c6',[(52.8,53.3,1),(53.3,54.6,S),(54.6,55.6,1)]))
subprocess.run(['ffmpeg','-y','-v','error','-loop','1','-i',f'{R}/end2.png','-t','3','-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','21','-r','30',f'{R}/t7.mp4'],check=True)
open(f'{R}/list2.txt','w').write(''.join(f"file 't{i}.mp4'\n" for i in range(1,8)))
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',f'{R}/list2.txt','-c','copy','-movflags','+faststart',f'{V}/reel2.mp4'],check=True)
print([round(x,1) for x in t], round(sum(t)+3,1))
