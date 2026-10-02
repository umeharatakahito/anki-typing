import subprocess, os, html
W = os.path.dirname(os.path.abspath(__file__))
RAW = W + '/raw'
OUT = W + '/promo-out'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
SHOTS = [
  # name, raw, tag, headline (｛｝ = orange), sub, accent
  ('01-hero',   'home', 'STUDY TYPE',  '打って、覚えて、<br>｛対戦｝だ。',        '受験・資格・雑学をタイピングで暗記<br>フリックでも、キーボードでも', '#ff6b35'),
  ('02-trivia', 'fish', '雑学',        'この魚、<br>｛なんて名前？｝',          '深海魚・国旗・世界地図・世界遺産<br>写真で「知ってる」が増える', '#22c3e6'),
  ('03-it',     'it',   'IT資格',      'ITパスポートも<br>｛指で覚える｝',        '図やグラフつきの問題を<br>自作フリック入力でサクサク', '#a66bff'),
  ('04-exam',   'en',   '大学受験',    '英単語は<br>｛英字キーボード｝で',        '答えに合わせてキーボードが切り替わる<br>Bluetoothキーボードのローマ字入力もOK', '#3d7bff'),
  ('05-versus', 'vsjp', 'リアルタイム対戦', 'スマホとパソコンで<br>｛リアル対戦｝',        '最大4人までリアルタイム対戦<br>Web版（パソコン）の人とも同じ部屋で', '#ff6b35'),
]
TPL = '''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1284px;height:2778px;overflow:hidden}
body{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;color:#fff;
 background:radial-gradient(1200px 900px at 85% 8%, %ACC%55, transparent 60%),
            radial-gradient(900px 900px at 0% 60%, #22c3e633, transparent 60%),
            linear-gradient(170deg,#1b2a5e 0%,#0e1736 55%,#0a1029 100%);position:relative}
.tag{position:absolute;top:150px;left:0;right:0;text-align:center}
.tag span{display:inline-block;padding:14px 38px;border-radius:999px;background:%ACC%;color:#fff;font-weight:800;font-size:44px;letter-spacing:.08em}
h1{position:absolute;top:270px;left:60px;right:60px;margin:0;text-align:center;font-weight:900;font-size:124px;line-height:1.18;letter-spacing:.01em}
h1 em{font-style:normal;color:%ACC%}
p{position:absolute;top:620px;left:60px;right:60px;margin:0;text-align:center;font-weight:600;font-size:50px;line-height:1.5;color:#c9d4f2}
.dev{position:absolute;top:880px;left:50%;transform:translateX(-50%);width:1000px;padding:24px;border-radius:132px;
 background:linear-gradient(145deg,#3a4366,#12172b);box-shadow:0 40px 120px rgba(0,0,0,.55),0 0 0 4px #4b557d inset}
.dev img{display:block;width:1000px;border-radius:110px}
</style></head><body>
<div class="tag"><span>%TAG%</span></div><h1>%H1%</h1><p>%SUB%</p>
<div class="dev"><img src="file://%IMG%"></div></body></html>'''
for name, raw, tag, h1, sub, acc in SHOTS:
    h = TPL.replace('%ACC%', acc).replace('%TAG%', tag).replace('%H1%', h1.replace('｛','<em>').replace('｝','</em>')) \
           .replace('%SUB%', sub).replace('%IMG%', f'{RAW}/{raw}.png')
    p = f'{OUT}/{name}.html'; open(p,'w').write(h)
    import os as _os
    _png=f'{OUT}/{name}.png'
    if _os.path.exists(_png): _os.remove(_png)
    subprocess.run(['perl','-e','alarm 40; exec @ARGV',CHROME,'--no-first-run','--no-default-browser-check','--disable-extensions','--headless=new','--user-data-dir=/private/tmp/claude-501/-Users-umeharatakahito-anki-typing/f5d39834-ac2f-447a-801e-e171eea8262d/scratchpad/chrome-prof2','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
        '--allow-file-access-from-files', f'--screenshot={OUT}/{name}.png','--window-size=1284,2778', 'file://'+p],
        check=False, capture_output=True)
    assert _os.path.exists(_png), name
    print(name)
