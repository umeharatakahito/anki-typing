import numpy as np, subprocess
W='/private/tmp/claude-501/-Users-umeharatakahito-anki-typing/f5d39834-ac2f-447a-801e-e171eea8262d/scratchpad'
def run(src,gray,h,w,out,endkeep,audio):
    a=np.fromfile(gray,dtype=np.uint8).reshape(-1,h,w).astype(np.int16)
    c=np.r_[0,(np.abs(np.diff(a,axis=0))>10).sum(axis=(1,2))]; n=len(a)
    mov=c>26
    big=c>1500                                   # 画面が切り替わった（結果・次の問題）
    keep=np.zeros(n,bool)
    for i in np.nonzero(mov)[0]: keep[max(0,i-4):i+10]=True
    for i in np.nonzero(big)[0]: keep[i:i+30]=True   # 切り替わった後は1秒見せる
    keep[n-int(endkeep*30):]=True
    keep[:6]=True
    # 止まっている所は最大0.4秒だけ残す
    i=0
    while i<n:
        if not keep[i]:
            j=i
            while j<n and not keep[j]: j+=1
            keep[i:min(j,i+12)]=True
            i=j
        else: i+=1
    drop=[];i=0
    while i<n:
        if not keep[i]:
            j=i
            while j<n and not keep[j]: j+=1
            drop.append((i,j)); i=j
        else: i+=1
    expr='+'.join(f'between(n,{s},{e-1})' for s,e in drop) or '0'
    cmd=['ffmpeg','-y','-v','error','-i',src]
    if audio: cmd+=['-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-map','0:v','-map','1:a','-shortest','-c:a','aac','-b:a','128k']
    else: cmd+=['-an']
    cmd+=['-vf',f"select='not({expr})',setpts=N/FRAME_RATE/TB",'-c:v','libx264','-preset','veryfast','-crf','19','-r','30','-movflags','+faststart',out]
    subprocess.run(cmd,check=True)
    print(out, round(n/30,1),'->', round(keep.sum()/30,1))
run(W+'/video/reel2.mp4',W+'/r.gray',325,175,W+'/video/reel3.mp4',3.0,False)
run(W+'/video/appstore-preview.mp4',W+'/p.gray',320,177,W+'/video/preview2.mp4',0.8,True)
