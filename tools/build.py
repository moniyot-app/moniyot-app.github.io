import json,os,re
cfg=json.load(open('tools/prod_config.json')) if os.path.exists('tools/prod_config.json') else {"url":"__SB_URL__","key":"__SB_KEY__"}
s=open('src/app.html').read()
SRC=s
def rep(o,n):
    global s
    assert s.count(o)==1,o[:60]; s=s.replace(o,n)
rep("const PROD=false,SB_URL='',SB_KEY='';",f"const PROD=true,SB_URL={json.dumps(cfg['url'])},SB_KEY={json.dumps(cfg['key'])};")
rep("const KEY='taxi-quota-proto-v1';","const KEY='mi-panui-prod-v1';")
a=s.index('function seed(){');b=s.index('let S; try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}')
s=s[:a]+"function seed(){return {clients:[],employees:[],destinations:[],rides:[],seq:1,paxReq:[],north:[],prices:{south:2000,north:2500},mins:{},freeDays:[],restricted:[],blocked:[],nightSamples:1,bigCities:1,bigCities2:1}}\n"+s[b:]
for o,n in [("<span>· נתוני דוגמה</span>",""),('● ניסיון משותף · מסונכרן','● מסונכרן'),
  ("S.rides.forEach(r=>{if(r.status==='pending'&&(r.needs||[]).includes&&(r.needs||[]).includes('night')&&!r.reason)r.reason='(דוגמה) '+R[i++%R.length]})",""),
  ('<button class="btn danger" id="reset">איפוס לנתוני הדוגמה</button>','')]:
    rep(o,n)

for o,n in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'guide_pairs.json'))):
    rep(o,n)
# drop artifact-only meta, wrap as full document
s=s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
head='<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32.png">\n<link rel="apple-touch-icon" href="icons/icon-180.png">\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="apple-mobile-web-app-title" content="רמוניות">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="theme-color" content="#1f2a44">\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n</head>\n<body>\n'
s=head+s+'\n</body>\n</html>\n'

open('index.html','w').write(s)
c=open('src/c.html').read().replace('__SB_URL__',cfg['url']).replace('__SB_KEY__',cfg['key'])
open('c.html','w').write(c)
print('ok',len(s))

# training sandbox: the prototype build (fictional seed, local storage only) with no passwords
t=SRC
for o,n in [("const TRAIN=false;","const TRAIN=true;"),("const KEY='taxi-quota-proto-v1';","const KEY='ramoniyot-train-v1';"),
            ("name:`${first[(ci*3+k)%16]} ${last[(ci*5+k)%12]}`","name:`${first[(ci*3+k)%16]} ${last[(ci*5+k)%12][0]}.`"),
            ('⚠ מצב מקומי: השינויים לא נשמרים לכולם','🎯 מצב אימון · נשמר רק במכשיר הזה'),
            ('<title>רמוניות</title>','<title>רמוניות · אימון</title>'),
            ("const names=['אורן מערכות','גלבוע הנדסה','תמר לוגיסטיקה','כרמל שירותים','נחשון תפעול','שקד פיתוח','ארבל ייצור','דקל מחקר'];","const names=['נגב','כריש','עטלף','רפאים','צרעה','יבא','מגדל'];"),
            ('<span class="roof">TAXI</span>רמוניות</div>','<span class="roof">TAXI</span>רמוניות · אימון</div>'),
            ("pax:[prem(7)[0].id,prem(7)[1].id]","pax:[prem(6)[0].id,prem(6)[1].id]")]:
    assert t.count(o)==1,o[:50]; t=t.replace(o,n)
t=t.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
thead=head.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n','').replace('<link rel="manifest" href="manifest.webmanifest">\n','')
open('train.html','w').write(thead+t+'\n</body>\n</html>\n')
print('train ok',len(t))
