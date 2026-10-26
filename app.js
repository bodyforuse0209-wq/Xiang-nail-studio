
/* 香香村美甲雲端管理 V10 - 完整修正版 */
const $=id=>document.getElementById(id),all=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>'NT$ '+Math.max(0,Math.round(Number(x)||0)).toLocaleString('zh-TW');
const n=x=>Math.max(0,Math.min(10000000,Math.round(Number(x)||0)));
const DAY=()=>new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);

const STYLE=[
{id:'clean',name:'極簡日常',english:'CLEAN / MINIMAL',premium:0,recs:['line','matte','geometry']},
{id:'graphic',name:'潮流圖騰',english:'STREET / GRAPHIC',premium:0,recs:['graphic','fire','cross']},
{id:'metal',name:'暗黑金屬',english:'DARK / CHROME',premium:100,recs:['liquid','mirror1','stud']},
{id:'fandom',name:'應援甲',english:'FANDOM / CUSTOM',premium:200,recs:['letters','sticker','logo']}
];

const BASE={
men:{
hand:[
['partial','局部造型',0,'partial'],
['solid','單色凝膠',800,'gel'],
['cat','貓眼凝膠',1000,'gel'],
['mirror','鏡面凝膠',1200,'gel'],
['french','法式凝膠',1300,'gel'],
['care','手部基礎保養',400,'care']
],
foot:[
['partial','局部造型',0,'partial'],
['solid','單色凝膠',900,'gel'],
['cat','貓眼凝膠',1100,'gel'],
['mirror','鏡面凝膠',1300,'gel'],
['french','法式凝膠',1400,'gel'],
['care','足部基礎保養',600,'care']
]
},
women:{
hand:[
['solid','單色光療',800,'gel'],
['cat','貓眼光療',1000,'gel'],
['mirror','鏡面光療',1100,'gel'],
['french','法式光療',1300,'gel'],
['care','手部基礎保養',400,'care']
],
foot:[
['solid','單色光療',900,'gel'],
['cat','貓眼光療',1100,'gel'],
['mirror','鏡面光療',1200,'gel'],
['french','法式光療',1400,'gel'],
['care','足部基礎保養',600,'care']
]
}
};

const GROUP={
men:[
['色彩質感',[
['jump','跳色',50],
['matte','霧面處理',50],
['blend','漸層暈染',80]
]],
['極簡圖騰',[
['line','極簡線條',80],
['geometry','幾何拼色',100],
['graphic','街頭塗鴉',120],
['fire','火焰／閃電',120],
['cross','十字架圖騰',100]
]],
['金屬光感',[
['cat1','局部貓眼',50],
['mirror1','局部鏡面粉',70],
['liquid','液態金屬',150]
]],
['客製應援',[
['letters','字母／數字',100],
['sticker','超薄客製貼紙',80],
['logo','應援 Logo',250],
['custom','精細圖案',350]
]],
['立體配件',[
['gem','鑽飾',10,'顆'],
['stud','金屬飾品',50,'件'],
['sculpt','3D 浮雕',200]
]]
],
women:[
['造型加購',[
['jump','跳色',50],
['blend','暈染',80],
['extend','甲片延甲',100],
['french1','法式(單指)',80],
['mirror1','鏡面粉(單指)',70],
['cat1','貓眼造型(單指)',50],
['gem','鑽(單顆)',10,'顆'],
['decor','鑽飾／飾品',50,'件']
]]
]
};

const EXTRA={
men:[
['extend','甲片延長',100],
['repair','單指修補',100],
['deep','深層保養',600,'次'],
['removeGem','卸大鑽',50,'顆'],
['removeExtend','卸延長甲',100]
],
women:[
['deep','深層保養',600,'次'],
['removeGem','卸大型鑽飾',50,'顆'],
['removeExtend','卸延長甲',100]
]
};

const fingers=['拇指','食指','中指','無名指','小指'];

const emptyZone=()=>({
base:'solid',
qty:{},
extras:{},
rem:'none',
fingers:{}
});

const emptyQuote=()=>({
gender:'men',
mode:'hand',
style:'clean',
hand:emptyZone(),
foot:emptyZone(),
discount:0,
charge:0,
fixed:'',
client:'',
note:''
});

let q=emptyQuote();
let cloud=null;
let actor=null;
let profile=null;
let records=[];
let staff=[];
let prices={};
let editingId=null;
let reportSourceUid=null;
let activePage='quote';
let modalFingers=null;
let modalPositions=new Set();
let demo=true;
let mode='owner';

const sectionsOpen=new Set(['hand:極簡圖騰']);

function notify(s,error=false){
$('notice').textContent=s;
$('notice').classList.remove('hidden');
$('notice').style.borderColor=error?'#b85848':'#b49c6e';
clearTimeout(notify.timer);
notify.timer=setTimeout(
()=>$('notice').classList.add('hidden'),
6500
);
}

function areaKeys(){
return q.mode==='both'?['hand','foot']:[q.mode];
}

function rowFor(z){
return BASE[q.gender][z].find(x=>x[0]===q[z].base)
||BASE[q.gender][z][0];
}

function keyFor(z,cat,id){
return `${q.gender}:${z}:${cat}:${id}`;
}

function unitPrice(z,cat,id,fallback){
return prices[keyFor(z,cat,id)]??fallback;
}

function premium(z){
return q.gender==='men'&&rowFor(z)[3]!=='care'
?STYLE.find(s=>s.id===q.style).premium
:0;
}

function basePrice(z){
const b=rowFor(z);
return unitPrice(z,'base',b[0],b[2])+premium(z);
}

function findAdd(id){
return GROUP[q.gender].flatMap(g=>g[1]).find(x=>x[0]===id);
}

function validAdd(z,row){
let kind=rowFor(z)[3];
if(kind==='care')return false;
if(row[0]==='cat1'&&q[z].base==='cat')return false;
if(row[0]==='mirror1'&&q[z].base==='mirror')return false;
return true;
}

function lines(){
let out=[];

for(const z of areaKeys()){
const b=rowFor(z);

out.push({
zone:z,
name:b[1],
amount:basePrice(z)
});

if(b[3]!=='care'){
for(const grp of GROUP[q.gender]){
for(const row of grp[1]){
const amount=Math.max(0,q[z].qty[row[0]]||0);
if(!amount||!validAdd(z,row))continue;

let lab=row[1]+' × '+amount+' '+(row[3]||'指');

let selection=(q[z].fingers[row[0]]||[])
.slice(0,amount);

if(selection.length&&q.gender==='men'){
lab+='（'+selection.map(
x=>(x[0]==='L'?'左':'右')+fingers[Number(x[1])]
).join('、')+'）';
}

out.push({
zone:z,
name:lab,
amount:amount*unitPrice(z,'addon',row[0],row[2])
});
}
}
}

const rem=q[z].rem;

if(rem!=='none'){
out.push({
zone:z,
name:rem==='continue'?'卸甲續作':'卸甲不續作',
amount:unitPrice(
z,'rem',rem,rem==='continue'?200:400
)
});
}

for(const row of EXTRA[q.gender]){
let amount=q[z].extras[row[0]]||0;

if(!amount||
(row[0].startsWith('remove')&&rem==='none')){
continue;
}

let def=row[0]==='deep'
?(z==='foot'?1300:600)
:row[2];

out.push({
zone:z,
name:row[1]+' × '+amount+' '+(row[3]||'指'),
amount:amount*unitPrice(z,'extra',row[0],def)
});
}

if(q[z].extras.deep){
if(b[3]==='gel'){
out.push({
zone:z,
name:'凝膠＋保養優惠',
amount:-200
});
}else if(rem==='stop'){
out.push({
zone:z,
name:'卸甲＋保養優惠',
amount:-100
});
}
}
}

return out;
}

function amountBeforeAdjust(){
return lines().reduce((t,x)=>t+x.amount,0);
}

function finalTotal(){
return q.fixed!==''
?n(q.fixed)
:n(amountBeforeAdjust()-n(q.discount)+n(q.charge));
}

function billLines(){
let arr=lines();

if(q.discount){
arr.push({
zone:'adjust',
name:'本次優惠折讓',
amount:-n(q.discount)
});
}

if(q.charge){
arr.push({
zone:'adjust',
name:'其他費用調整',
amount:n(q.charge)
});
}

const adjusted=n(
amountBeforeAdjust()-n(q.discount)+n(q.charge)
);

if(q.fixed!==''&&finalTotal()!==adjusted){
arr.push({
zone:'adjust',
name:'成交價調整',
amount:finalTotal()-adjusted
});
}

return arr;
}

const loc=z=>z==='hand'?'手部':'足部';

function billText(){
let x=[
'香香村美妍製造所',
'XIANG BEAUTY STUDIO',
'男／女美甲施作估價',
'',
`類別：${q.gender==='men'?'男士美甲':'女士美甲'}`,
q.client?'客人：'+q.client:''
];

for(const z of areaKeys()){
x.push('',`【${loc(z)}】`);

billLines()
.filter(t=>t.zone===z)
.forEach(t=>x.push(
t.name+'　'+
(t.amount<0?'−':'')+
fmt(Math.abs(t.amount))
));
}

billLines()
.filter(t=>t.zone==='adjust')
.forEach(t=>x.push(
t.name+'　'+
(t.amount<0?'−':'')+
fmt(Math.abs(t.amount))
));

x.push(
'',
`預估總計：${fmt(finalTotal())}`,
q.note?'施作備註：'+q.note:'',
'實際售價依現場確認。',
'LINE：@lry8774x'
);

return x.filter(x=>x!==null).join('\n');
}

function showModal(title,body){
$('modalTitle').textContent=title;
$('modalBody').innerHTML=body;
$('modal').classList.remove('hidden');
$('modal').setAttribute('aria-hidden','false');
}

function closeModal(){
$('modal').classList.add('hidden');
$('modal').setAttribute('aria-hidden','true');
modalFingers=null;
}

async function copy(t){
try{
await navigator.clipboard.writeText(t);
notify('已複製，可貼上到 LINE');
}catch{
showModal(
'複製文字',
'<textarea id="manualCopy" rows="12"></textarea>'+
'<div class="hint">長按文字即可複製</div>'
);
$('manualCopy').value=t;
$('manualCopy').select();
}
}

function renderGuestBill(){
let out=
'<div class="receipt-title">XIANG BEAUTY STUDIO</div>'+
'<p class="receipt-sub">香香村美妍製造所 · '+
(q.gender==='men'?'男士':'女士')+
'美甲估價單</p>'+
(q.client?'<p>'+esc(q.client)+'</p>':'');

for(const z of areaKeys()){
out+='<div class="softtitle">'+loc(z)+'</div>'+
billLines()
.filter(x=>x.zone===z)
.map(x=>`
<div class="billrow">
<span>${esc(x.name)}</span>
<strong>${x.amount<0?'−':''}${fmt(Math.abs(x.amount))}</strong>
</div>
`).join('');
}

out+=billLines()
.filter(x=>x.zone==='adjust')
.map(x=>`
<div class="billrow">
<span>${esc(x.name)}</span>
<strong>${x.amount<0?'−':''}${fmt(Math.abs(x.amount))}</strong>
</div>
`).join('');

out+=`
<div class="sumtotal">
<span>本次預估總計</span>
<strong>${fmt(finalTotal())}</strong>
</div>
`+
(q.note?`
<p class="hint" style="margin:17px 0 0">
施工備註：${esc(q.note)}
</p>
`:'')+
'<p class="hint" style="margin-top:16px">'+
'正式售價以現場確認為準。 LINE @lry8774x</p>'+
'<div class="actionrow">'+
'<button class="button primary" id="copyBill">複製估價單</button>'+
'<button class="button outline" id="printBill">列印／儲存 PDF</button>'+
'</div>';

showModal('客人估價單',out);
}

function renderQuote(){
document.body.dataset.theme=q.gender;

all('[data-gender]').forEach(
b=>b.classList.toggle(
'active',b.dataset.gender===q.gender
)
);

$('areaMode').innerHTML=[
['hand','只做手部'],
['foot','只做足部'],
['both','手＋足一起做']
].map(x=>`
<button class="choice ${q.mode===x[0]?'active':''}"
data-mode="${x[0]}">${x[1]}</button>
`).join('');

$('styleArea').innerHTML=q.gender==='men'
?'<div class="zone">'+
'<div class="zonetitle">'+
'<strong>男士四大風格</strong>'+
'<span class="pill">STYLE SELECT</span>'+
'</div><div class="stylegrid">'+
STYLE.map(s=>`
<button class="style ${q.style===s.id?'active':''}"
data-style="${s.id}">
<strong>${s.name}</strong>
<small>${s.english}</small>
</button>
`).join('')+
'</div>'+
'<p class="hint">依風格智能推薦造型，內部計價不在客人明細中分列。</p>'+
'</div>'
:'';

$('serviceArea').innerHTML=areaKeys().map(z=>`
<div class="zone">
<div class="zonetitle">
<strong>${loc(z)}｜基礎服務</strong>
<span class="pill">${fmt(basePrice(z))}</span>
</div>
<div class="services">
${BASE[q.gender][z].map(x=>`
<button class="service ${q[z].base===x[0]?'active':''}"
data-base="${z}|${x[0]}">
<strong>${x[1]}</strong>
<small>${
x[0]==='partial'&&basePrice(z)===0
?'依加購計價'
:fmt(
unitPrice(z,'base',x[0],x[2])+
(q.gender==='men'&&x[3]!=='care'
?STYLE.find(s=>s.id===q.style).premium
:0)
)
}</small>
</button>
`).join('')}
</div>
${q[z].base==='partial'
?'<p class="hint" style="margin-top:10px">局部造型最低施工費尚未定案，正式計價前請確認。</p>'
:''}
</div>
`).join('');

let detailState={};

all('details[data-accord]').forEach(
x=>detailState[x.dataset.accord]=x.open
);

for(const [k,v] of Object.entries(detailState)){
if(v)sectionsOpen.add(k);
else sectionsOpen.delete(k);
}

$('addonArea').innerHTML=areaKeys().map(z=>{
const b=rowFor(z);

const rec=q.gender==='men'
?'<div class="recommend">'+
STYLE.find(s=>s.id===q.style).recs.map(id=>{
let x=findAdd(id);

return x&&validAdd(z,x)
?`<button data-recommend="${z}|${id}">
＋ ${esc(x[1])} ${fmt(unitPrice(z,'addon',id,x[2]))}
</button>`
:'';
}).join('')+
'</div>'
:'';

return `
<div class="zone">
<div class="zonetitle">
<strong>${loc(z)}造型加購</strong>
<span class="pill">
${Object.values(q[z].qty).reduce((a,b)=>a+b,0)} 項
</span>
</div>
${b[3]==='care'
?'<p class="hint">純保養不適用凝膠造型加購。</p>'
:rec+GROUP[q.gender].map(g=>{
let k=z+':'+g[0];

return `
<details class="accordion"
data-accord="${esc(k)}"
${sectionsOpen.has(k)?'open':''}>
<summary>${esc(g[0])}</summary>
${g[1].map(x=>
validAdd(z,x)
?rowHTML(z,'addon',x)
:`<div class="itemline">
<span class="hint" style="margin:0">
${esc(x[1])} · 已包含於所選底款
</span>
</div>`
).join('')}
</details>
`;
}).join('')}
</div>
`;
}).join('');

$('extraArea').innerHTML=areaKeys().map(z=>`
<div class="zone">
<div class="zonetitle">
<strong>${loc(z)}卸甲與修整</strong>
</div>
<div class="removal">
${[
['none','不卸甲',0],
['continue','卸甲續作',200],
['stop','卸甲不續作',400]
].map(x=>`
<button class="choice ${q[z].rem===x[0]?'active':''}"
data-rem="${z}|${x[0]}">
${x[1]}<br>
<span class="meta">
${fmt(x[0]==='none'
?0
:unitPrice(z,'rem',x[0],x[2]))}
</span>
</button>
`).join('')}
</div>
${EXTRA[q.gender]
.filter(x=>!x[0].startsWith('remove')||q[z].rem!=='none')
.map(x=>rowHTML(z,'extra',x))
.join('')}
</div>
`).join('');

$('quoteCustomer').value=q.client;
$('quoteNote').value=q.note;
$('discount').value=q.discount||'';
$('charge').value=q.charge||'';
$('fixedTotal').value=q.fixed;

updateSummary();
}

function rowHTML(z,kind,x){
let cnt=kind==='addon'
?(q[z].qty[x[0]]||0)
:(q[z].extras[x[0]]||0);

let unit=x[3]||'指';

let def=kind==='extra'&&x[0]==='deep'
?(z==='foot'?1300:600)
:x[2];

let p=unitPrice(z,kind,x[0],def);

return `
<div class="itemline">
<div class="left">
<div class="itemname">${esc(x[1])}</div>
<div class="unit">${fmt(p)}／${unit}</div>
${q.gender==='men'&&kind==='addon'&&cnt&&unit==='指'
?`<button class="underlink"
data-finger="${z}|${x[0]}">
指定施工指位
</button>`
:''}
</div>
<div class="stepper">
<button ${cnt<=0?'disabled':''}
data-step="${z}|${kind}|${x[0]}|-1"
aria-label="減少${esc(x[1])}">−</button>
<span>${cnt}</span>
<button ${
cnt>=((unit==='指'||kind==='extra'&&unit==='指')
?10:30)
?'disabled':''
}
data-step="${z}|${kind}|${x[0]}|1"
aria-label="增加${esc(x[1])}">＋</button>
</div>
</div>
`;
}

function updateSummary(){
let summary=billLines().map(x=>`
<div class="billrow">
<span>
${x.zone==='hand'
?'手部｜'
:x.zone==='foot'
?'足部｜'
:''}
${esc(x.name)}
</span>
<b>
${x.amount<0?'−':''}${fmt(Math.abs(x.amount))}
</b>
</div>
`).join('');

$('quoteSummary').innerHTML=summary+`
<div class="sumtotal">
<span>預估總額</span>
<strong>${fmt(finalTotal())}</strong>
</div>
`;

$('stickyTotal').textContent=fmt(finalTotal());
}

function step(z,kind,id,delta){
let set=kind==='addon'?q[z].qty:q[z].extras;

let item=kind==='addon'
?findAdd(id)
:EXTRA[q.gender].find(x=>x[0]===id);

if(!item)return;

let unit=item[3]||'指';

let max=id==='deep'?1:unit==='指'?10:30;

set[id]=Math.max(
0,
Math.min(max,(set[id]||0)+delta)
);

q[z].fingers[id]=(q[z].fingers[id]||[])
.slice(0,set[id]);

renderQuote();
}

function fingerDialog(z,id){
let count=q[z].qty[id]||0;

let now=new Set(
(q[z].fingers[id]||[]).slice(0,count)
);

modalFingers={z,id,count};
modalPositions=now;

drawFingerModal();
}

function drawFingerModal(){
let {z,id,count}=modalFingers;

let body=
'<p class="hint">最多選 '+count+
' 指，可以只指定部分指位。</p>'+
['L','R'].map(side=>
'<div class="softtitle">'+
(side==='L'?'左手':'右手')+
'</div>'+
'<div class="fingergrid">'+
fingers.map((f,i)=>`
<button data-position="${side+i}"
class="${modalPositions.has(side+i)?'selected':''}">
${f}
</button>
`).join('')+
'</div>'
).join('')+
'<button id="saveFinger" class="button primary wide">'+
'完成指定</button>';

showModal(`${loc(z)}｜指定施工指位`,body);
}

function openPage(name){
if(!profile&&demo===false&&name!=='quote'){
notify('請先登入已授權的員工帳號',true);
return;
}

if(
name==='staff'&&
profile?.role!=='owner'&&
!(demo&&mode==='owner')
){
notify('店主權限才能進入後台',true);
return;
}

activePage=name;

['quote','report','dashboard','staff'].forEach(
x=>$(x+'Page').classList.toggle('hidden',x!==name)
);

all('.navbtn').forEach(
x=>x.classList.toggle(
'active',x.dataset.page===name
)
);

$('bottomBar').classList.toggle(
'hidden',name!=='quote'
);

if(name==='dashboard')renderDashboard();

if(name==='staff'){
renderStaff();
renderPrices();
}
}

function renderSession(){
let owner=demo
?mode==='owner'
:profile?.role==='owner';

let authorized=demo||!!profile;

document.body.classList.toggle(
'hasAuth',authorized
);

$('accountBtn').textContent=demo
?(mode==='owner'?'展示：店主':'展示：美甲師')
:authorized
?((profile.name||actor?.email||'登入中')+' · 登出')
:'登入';

all('.ownerOnly').forEach(
x=>x.classList.toggle('hidden',!owner)
);

all('.editOnly').forEach(
x=>x.classList.toggle('hidden',!owner)
);

if(!authorized){
$('loginPanel').classList.remove('hidden');
if(activePage!=='quote')openPage('quote');
}else{
$('loginPanel').classList.add('hidden');
}

$('toReport').disabled=!authorized;
$('fillQuote').disabled=!authorized;

$('syncTag').classList.toggle(
'live',!demo&&authorized
);

$('syncTag').textContent=demo
?'● 展示模式｜非雲端'
:authorized
?'● 雲端已登入'
:'● 尚未登入';

if(activePage==='staff'&&!owner){
openPage('quote');
}

renderQuote();
renderDashboard();
}

function getDemo(){
try{
return JSON.parse(
localStorage.getItem('xiang-v10-demo-reports')||'[]'
);
}catch{
return [];
}
}

function saveDemo(){
try{
localStorage.setItem(
'xiang-v10-demo-reports',
JSON.stringify(records)
);
}catch{
notify(
'裝置空間或隱私模式禁止儲存；請先匯出備份',
true
);
}
}

function fieldsReport(){
let map={
date:'reportDate',
artist:'reportArtist',
client:'reportClient',
gender:'reportGender',
areas:'reportAreas',
service:'reportService',
design:'reportDesign',
original:'reportOriginal',
discount:'reportDiscount',
amount:'reportAmount',
payment:'reportPayment',
status:'reportStatus',
note:'reportNote'
};

let o={};

for(let [k,v] of Object.entries(map)){
o[k]=$(v).value;
}

for(let k of ['original','discount','amount']){
o[k]=n(o[k]);
}

return o;
}

function clearReport(){
editingId=null;
reportSourceUid=null;

$('reportForm').reset();
$('reportDate').value=DAY();

$('reportArtist').value=
profile?.name||
(demo
?(mode==='owner'?'村長 Mona':'示範美甲師')
:'');

$('reportHelp').textContent='';

$('saveReport').textContent=demo
?'儲存示範紀錄（本機）'
:'儲存至雲端';
}

function fillQuote(){
clearReport();

$('reportGender').value=q.gender;
$('reportAreas').value=q.mode;
$('reportClient').value=q.client;

$('reportService').value=areaKeys()
.map(z=>loc(z)+rowFor(z)[1])
.join('＋');

$('reportDesign').value=areaKeys()
.map(z=>
loc(z)+'：'+
lines()
.filter(x=>x.zone===z&&x.amount>=0)
.map(x=>x.name)
.join('、')
)
.join('；')+
(q.note?'；'+q.note:'');

$('reportOriginal').value=Math.max(
0,
amountBeforeAdjust()+n(q.charge)
);

$('reportDiscount').value=n(q.discount);
$('reportAmount').value=finalTotal();
$('reportStatus').value='已結帳';

openPage('report');
}

async function saveReport(e){
e.preventDefault();

if(!demo&&!profile){
notify('必須登入且獲得授權才能儲存',true);
return;
}

if(!$('reportForm').reportValidity())return;

let record=fieldsReport();
record.schemaVersion=10;

let id=editingId;

if(id&&recordSourceOwnerMismatch(id)){
notify('無法修改其他美甲師的回報',true);
return;
}

if(id){
record.artistUid=
reportSourceUid||actor?.uid||'demo_owner';

record.createdBy=
(records.find(r=>r.id===id)||{}).createdBy||
actor?.uid||
'demo_owner';
}else{
record.artistUid=
actor?.uid||
(mode==='owner'?'demo_owner':'demo_staff');
}

record.artist=id
?(records.find(r=>r.id===id)?.artist||
profile?.name||
record.artist)
:(profile?.name||
(demo
?(mode==='owner'?'村長 Mona':'示範美甲師')
:record.artist));

let btn=$('saveReport');
btn.disabled=true;

let original=btn.textContent;
btn.textContent='正在儲存…';

try{
if(demo){
const obj={
...record,
id:id||crypto.randomUUID(),
createdAt:new Date().toISOString(),
updatedAt:new Date().toISOString()
};

if(id){
records=records.map(x=>x.id===id?obj:x);
}else{
records.unshift(obj);
}

saveDemo();
}else{
await cloud.saveReport(record,id);
}

notify(
demo
?'已儲存本機展示紀錄（非雲端）'
:'已同步儲存至雲端'
);

clearReport();
openPage('dashboard');

}catch(err){
notify(
'儲存失敗：'+(err.message||err),
true
);
}finally{
btn.disabled=false;
btn.textContent=original;
}
}

function recordSourceOwnerMismatch(id){
let r=records.find(x=>x.id===id);

if(!r)return true;

return !(demo&&mode==='owner')&&
!(!demo&&profile?.role==='owner')&&
r.artistUid!==(actor?.uid||'demo_staff');
}

function filtered(){
let m=$('filterMonth').value;
let d=$('filterDay').value;
let a=$('filterArtist').value;
let s=$('filterStatus').value;

return records.filter(x=>
(!m||x.date?.slice(0,7)===m)&&
(!d||x.date===d)&&
(a==='all'||x.artistUid===a)&&
(s==='all'||x.status===s)
).sort((a,b)=>
(b.date||'').localeCompare(a.date||'')||
String(b.id).localeCompare(String(a.id))
);
}

function renderDashboard(){
let owner=demo
?mode==='owner'
:profile?.role==='owner';

let art=$('filterArtist').value;

let artistList=[
...new Map(
records.map(x=>[
x.artistUid,
{id:x.artistUid,name:x.artist||x.artistUid}
])
).values()
];

$('filterArtist').innerHTML=
(owner
?'<option value="all">全店</option>'
:'<option value="all">我的紀錄</option>')+
artistList.map(x=>`
<option value="${esc(x.id)}">
${esc(x.name)}
</option>
`).join('');

$('filterArtist').value=[
...$('filterArtist').options
].some(o=>o.value===art)
?art
:'all';

let rr=filtered();

let paid=rr
.filter(x=>x.status==='已結帳')
.reduce((t,x)=>t+n(x.amount),0);

let due=rr
.filter(x=>x.status==='待結帳')
.reduce((t,x)=>t+n(x.amount),0);

$('metrics').innerHTML=[
['回報筆數',rr.length],
['已收營業額',fmt(paid)],
['待收金額',fmt(due)]
].map(x=>`
<div class="metric">
<span>${x[0]}</span>
<strong>${x[1]}</strong>
</div>
`).join('');

let ag=new Map();

rr.filter(x=>x.status==='已結帳')
.forEach(x=>{
let z=ag.get(x.artistUid)||{
name:x.artist,
sum:0,
count:0
};

z.sum+=n(x.amount);
z.count++;

ag.set(x.artistUid,z);
});

$('artistStats').innerHTML=ag.size
?[...ag.values()]
.sort((a,b)=>b.sum-a.sum)
.map(x=>`
<div class="stat">
<span>${esc(x.name)} · ${x.count} 筆</span>
<b>${fmt(x.sum)}</b>
</div>
`).join('')
:'<p class="hint">本期間無已收紀錄。</p>';

$('recordRows').innerHTML=rr.slice(0,500)
.map(x=>`
<tr>
<td>${esc(x.date||'')}</td>
<td>
${esc(x.artist||'')}
<div class="small">
${esc(x.client||'未填客戶')}
</div>
</td>
<td>
${esc(x.service||'')}
<div class="small">
${esc(x.gender==='men'?'男士':'女士')}
· ${esc(x.areas||'')}
</div>
</td>
<td>${fmt(x.amount)}</td>
<td>${esc(x.status)}</td>
<td>
<button class="button text tiny"
data-editreport="${esc(x.id)}">修改</button>
${owner
?`<button class="button text tiny"
data-deletereport="${esc(x.id)}">刪除</button>`
:''}
</td>
</tr>
`).join('')||
'<tr><td colspan="6">尚無紀錄。</td></tr>';

$('recordCaption').textContent=rr.length>500
?'符合條件 '+rr.length+
' 筆，畫面僅顯示前 500 筆，可使用匯出取得全部。'
:`符合條件共 ${rr.length} 筆。${
demo
?'目前為本機展示資料。'
:'從 Firestore 即時同步。'
}`;
}

function editReport(id){
let r=records.find(x=>x.id===id);

if(!r||recordSourceOwnerMismatch(id)){
return notify('無權限編輯此紀錄',true);
}

editingId=id;
reportSourceUid=r.artistUid;

openPage('report');

let map={
date:'reportDate',
client:'reportClient',
gender:'reportGender',
areas:'reportAreas',
service:'reportService',
design:'reportDesign',
original:'reportOriginal',
discount:'reportDiscount',
amount:'reportAmount',
payment:'reportPayment',
status:'reportStatus',
note:'reportNote'
};

for(const [k,v] of Object.entries(map)){
$(v).value=r[k]??'';
}

$('reportArtist').value=r.artist;
$('saveReport').textContent='更新這筆回報';

$('reportHelp').textContent=
'正在編輯既有紀錄：'+r.date+' · '+r.artist;
}

async function removeReport(id){
let r=records.find(x=>x.id===id);

let owner=demo
?mode==='owner'
:profile?.role==='owner';

if(!r||!owner){
return notify('只有店主可刪除',true);
}

if(!confirm(
'確定刪除這筆回報？這會影響業績統計，無法復原。'
))return;

try{
if(demo){
records=records.filter(x=>x.id!==id);
saveDemo();
renderDashboard();
}else{
await cloud.removeReport(id);
}

notify('紀錄已刪除');
}catch(e){
notify('刪除失敗：'+e.message,true);
}
}

function safeCsvCell(x){
let s=String(x??'');

if(/^[\s]*[=+@\-\t\r]/.test(s)){
s="'"+s;
}

return '"'+s.replace(/"/g,'""')+'"';
}

function download(
filename,
content,
mime='text/plain;charset=utf-8'
){
let b=new Blob([content],{type:mime});
let u=URL.createObjectURL(b);
let a=document.createElement('a');

a.href=u;
a.download=filename;

document.body.appendChild(a);
a.click();
a.remove();

setTimeout(()=>URL.revokeObjectURL(u),2000);
}

function exportCsv(){
let h=[
'日期','美甲師','客戶','類別','區域',
'服務','造型明細','原價','折讓',
'實收','付款方式','狀態','備註'
];

let rows=filtered().map(x=>[
x.date,
x.artist,
x.client,
x.gender,
x.areas,
x.service,
x.design,
x.original,
x.discount,
x.amount,
x.payment,
x.status,
x.note
]);

download(
'香香村_V10_營業紀錄_'+DAY()+'.csv',
'\ufeff'+[h,...rows]
.map(r=>r.map(safeCsvCell).join(','))
.join('\r\n'),
'text/csv;charset=utf-8'
);
}

function exportJson(){
download(
'香香村_V10_雲端備份_'+DAY()+'.json',
JSON.stringify({
app:'xiang-v10',
exportedAt:new Date().toISOString(),
records:filtered().map(x=>{
let y={...x};
delete y.createdAt;
delete y.updatedAt;
return y;
})
},null,2),
'application/json'
);
}

function copyDaily(){
let rr=filtered();

let paid=rr
.filter(x=>x.status==='已結帳')
.reduce((t,x)=>t+n(x.amount),0);

let due=rr
.filter(x=>x.status==='待結帳')
.reduce((t,x)=>t+n(x.amount),0);

copy(
`香香村｜營業統計
日期：${$('filterDay').value||$('filterMonth').value||'目前篩選期間'}
回報：${rr.length} 筆
已收：${fmt(paid)}
待收：${fmt(due)}`
);
}

/* V10 修正：員工清單依 UID 去重 */
function uniqueStaffList(items){
const byUid=new Map();

for(const item of items||[]){
if(!item||!item.uid)continue;

const uid=String(item.uid).trim();
if(!uid)continue;

const previous=byUid.get(uid)||{};

byUid.set(uid,{
...previous,
...item,
uid
});
}

return [...byUid.values()];
}

function renderStaff(){
if(!(demo?mode==='owner':profile?.role==='owner')){
return;
}

const unique=uniqueStaffList(staff);

$('staffList').innerHTML=unique.length
?unique.map(x=>{
const displayName=
actor?.uid===x.uid&&profile?.name
?profile.name
:(x.name||'未命名');

return `
<div class="staff">
<div>
<strong>
${esc(displayName)}
${x.role==='owner'?'· 店主':'· 美甲師'}
</strong>
<small class="meta">
UID：${esc(x.uid)} /
${x.active?'啟用':'停用'}
</small>
</div>
<button
class="button outline tiny"
data-staffedit="${esc(x.uid)}"
>編輯</button>
</div>
`;
}).join('')
:'<p class="hint">尚無授權員工資料。</p>';
}

function renderPrices(){
if(!(demo?mode==='owner':profile?.role==='owner')){
return;
}

let html='';

for(const gender of ['men','women']){
for(const z of ['hand','foot']){
let rows=BASE[gender][z].map(x=>({
key:`${gender}:${z}:base:${x[0]}`,
label:'底款｜'+x[1],
p:x[2]
}));

for(const g of GROUP[gender]){
for(const x of g[1]){
rows.push({
key:`${gender}:${z}:addon:${x[0]}`,
label:'加購｜'+x[1],
p:x[2]
});
}
}

for(const x of EXTRA[gender]){
rows.push({
key:`${gender}:${z}:extra:${x[0]}`,
label:'其他｜'+x[1],
p:x[0]==='deep'
?(z==='foot'?1300:600)
:x[2]
});
}

rows.push(
{
key:`${gender}:${z}:rem:continue`,
label:'卸甲｜續作',
p:200
},
{
key:`${gender}:${z}:rem:stop`,
label:'卸甲｜不續作',
p:400
}
);

html+=`
<details class="accordion">
<summary>
${gender==='men'?'男士':'女士'}
／ ${loc(z)} · ${rows.length} 項定價
</summary>
<div style="padding:5px 14px 14px">
`+
rows.map(x=>`
<div class="priceEdit">
<span class="meta">${esc(x.label)}</span>
<input
data-pricekey="${esc(x.key)}"
inputmode="numeric"
type="number"
min="0"
max="10000000"
value="${prices[x.key]??x.p}">
</div>
`).join('')+
'</div></details>';
}
}

$('priceAdmin').innerHTML=html+
'<p class="hint" style="margin-top:12px">'+
'全部底款、單指加購、卸甲與保養價格可獨立調整。'+
'風格底價依預設規則計算，不在客人明細中分列。'+
'</p>';
}

async function savePrices(){
let next={...prices};

all('[data-pricekey]').forEach(
x=>next[x.dataset.pricekey]=n(x.value)
);

try{
if(demo){
prices=next;
renderQuote();
notify('已更新展示價格（不會上雲端）');
}else{
await cloud.savePrices(next);
notify('基礎價目已同步更新到雲端');
}
}catch(e){
notify('儲存價格失敗：'+e.message,true);
}
}

async function saveStaff(){
if(!demo&&profile?.role!=='owner'){
return notify('權限不足',true);
}

let uid=$('staffUid').value.trim();
let name=$('staffName').value.trim();
let role=$('staffRole').value;
let active=$('staffActive').checked;

if(!/^[A-Za-z0-9_-]{12,128}$/.test(uid)){
return notify(
'請貼上正確的 Firebase Authentication UID',
true
);
}

if(!name){
return notify('請輸入員工名稱',true);
}

if(
actor?.uid===uid&&
(!active||role!=='owner')&&
!demo
){
return notify(
'不能停用或移除自己的店主權限',
true
);
}

try{
if(demo){
staff=[
...staff.filter(x=>x.uid!==uid),
{uid,name,role,active}
];

renderStaff();
notify('已更新展示員工');
}else{
await cloud.saveStaff(uid,{name,role,active});
notify('員工帳號已更新至雲端');
}
}catch(e){
notify('更新權限失敗：'+e.message,true);
}
}

function legacyNormalize(raw){
let a=Array.isArray(raw)
?raw
:(raw.records||raw.reports||[]);

if(!Array.isArray(a)){
throw Error('這不是有效的 JSON 營業紀錄備份');
}

let localStaff=[...staff];

return a.slice(0,10000).map((x,i)=>{
let name=String(
x.artist||x.technician||'舊版美甲師'
).slice(0,80);

let uid=
localStaff.find(s=>s.name===name)?.uid||
actor?.uid;

if(!uid){
throw Error('請先登入雲端店主帳號');
}

return {
legacyId:String(
x.id||('row_'+i+'_'+x.date+'_'+name)
),
date:String(x.date||DAY()).slice(0,10),
artistUid:uid,
artist:name,
client:String(
x.client||x.customer||''
).slice(0,100),
gender:x.gender==='women'?'women':'men',
areas:['hand','foot','both'].includes(x.areas)
?x.areas
:'hand',
service:String(
x.service||'歷史回報'
).slice(0,300),
design:String(x.design||'').slice(0,3000),
original:n(
x.original??x.listAmount??x.amount
),
discount:n(x.discount),
amount:n(x.amount),
payment:[
'現金','轉帳','信用卡','LINE Pay','其他'
].includes(x.payment)
?x.payment
:'其他',
status:x.status==='待結帳'
?'待結帳'
:'已結帳',
note:String(x.note||'').slice(0,2000),
schemaVersion:10,
createdBy:actor.uid,
updatedBy:actor.uid
};
});
}

async function importLegacy(){
if(demo){
return notify(
'請先啟用雲端，才能匯入正式資料',
true
);
}

if(profile?.role!=='owner'){
return notify('僅店主可匯入',true);
}

let f=$('legacyFile').files?.[0];

if(!f){
return notify('請先選擇 JSON 備份',true);
}

if(f.size>6e6){
return notify('檔案超過 6MB，請分批匯入',true);
}

try{
let raw=JSON.parse(await f.text());
let converted=legacyNormalize(raw);

if(!converted.length){
return notify('備份內沒有紀錄',true);
}

if(!confirm(
`準備匯入 ${converted.length} 筆舊紀錄到雲端，確定繼續？`
))return;

let count=await cloud.importReports(
converted,
(c,total)=>{
$('legacyStatus').textContent=
`已匯入 ${c} / ${total}`;
}
);

$('legacyStatus').textContent=
`匯入成功 ${count} 筆；重複 ID 已略過。`;

notify('雲端匯入完成');

}catch(e){
notify('匯入失敗：'+e.message,true);
}
}

function delegateClick(e){
const b=e.target.closest('button');
if(!b)return;

if(b.dataset.page){
return openPage(b.dataset.page);
}

if(b.dataset.gender){
q.gender=b.dataset.gender;

for(let z of ['hand','foot']){
if(!BASE[q.gender][z].some(
x=>x[0]===q[z].base
)){
q[z].base='solid';
}
}

renderQuote();
return;
}

if(b.dataset.mode){
q.mode=b.dataset.mode;
renderQuote();
return;
}

if(b.dataset.style){
q.style=b.dataset.style;

const name={
clean:'極簡圖騰',
graphic:'極簡圖騰',
metal:'金屬光感',
fandom:'客製應援'
}[q.style];

for(const z of areaKeys()){
sectionsOpen.add(z+':'+name);
}

renderQuote();
return;
}

if(b.dataset.base){
let [z,id]=b.dataset.base.split('|');

q[z].base=id;

if(id==='cat')q[z].qty.cat1=0;
if(id==='mirror')q[z].qty.mirror1=0;
if(id==='care')q[z].qty={};

renderQuote();
return;
}

if(b.dataset.rem){
let [z,id]=b.dataset.rem.split('|');
q[z].rem=id;
renderQuote();
return;
}

if(b.dataset.step){
let [z,kind,id,delta]=b.dataset.step.split('|');
step(z,kind,id,Number(delta));
return;
}

if(b.dataset.recommend){
let [z,id]=b.dataset.recommend.split('|');
step(z,'addon',id,1);
return;
}

if(b.dataset.finger){
let [z,id]=b.dataset.finger.split('|');
fingerDialog(z,id);
return;
}

if(b.dataset.position&&modalFingers){
let p=b.dataset.position;

if(modalPositions.has(p)){
modalPositions.delete(p);
}else if(modalPositions.size<modalFingers.count){
modalPositions.add(p);
}

drawFingerModal();
return;
}

if(b.id==='saveFinger'&&modalFingers){
q[modalFingers.z].fingers[modalFingers.id]=[
...modalPositions
];

closeModal();
renderQuote();
return;
}

if(b.id==='modalClose'){
closeModal();
return;
}

if(
b.id==='previewBill'||
b.id==='stickyPreview'
){
return renderGuestBill();
}

if(b.id==='copyBill'){
return copy(billText());
}

if(b.id==='printBill'){
const txt=billText();
const w=window.open('','_blank');

if(!w){
return notify(
'請允許瀏覽器開啟列印視窗，或改用複製估價單',
true
);
}

w.document.open();

w.document.write(
'<!doctype html>'+
'<html lang="zh-Hant">'+
'<meta charset="UTF-8">'+
'<title>香香村估價單</title>'+
'<style>'+
'body{font:14px/1.9 sans-serif;'+
'max-width:590px;margin:45px auto;'+
'padding:0 20px}'+
'pre{white-space:pre-wrap;font:inherit}'+
'</style><pre>'+
esc(txt)+
'</pre></html>'
);

w.document.close();
w.focus();
w.print();
return;
}

if(
b.id==='toReport'||
b.id==='fillQuote'
){
return fillQuote();
}

if(b.id==='resetQuote'){
if(confirm('清除目前所有估價選擇？')){
q=emptyQuote();
renderQuote();
}
return;
}

if(b.id==='clearReport'){
return clearReport();
}

if(b.dataset.editreport){
return editReport(b.dataset.editreport);
}

if(b.dataset.deletereport){
return removeReport(b.dataset.deletereport);
}

if(b.id==='exportCsv')return exportCsv();
if(b.id==='exportJson')return exportJson();
if(b.id==='copyDaily')return copyDaily();

if(b.dataset.staffedit){
let x=staff.find(
s=>s.uid===b.dataset.staffedit
);

if(x){
$('staffUid').value=x.uid;
$('staffName').value=x.name;
$('staffRole').value=x.role;
$('staffActive').checked=x.active;

scrollTo({
top:$('staffUid').getBoundingClientRect().top+
scrollY-110,
behavior:'smooth'
});
}

return;
}

if(b.id==='saveStaff'){
return saveStaff();
}

if(b.id==='savePrices'){
return savePrices();
}

if(b.id==='resetPrices'){
if(confirm(
'恢復基礎價目至 V9 預設並同步嗎？'
)){
prices={};
renderPrices();
savePrices();
}
return;
}

if(b.id==='importLegacy'){
return importLegacy();
}

if(b.id==='accountBtn'){
if(demo){
mode=mode==='owner'?'staff':'owner';
renderSession();
clearReport();

notify(
'目前切換的是展示權限，不是 Firebase 正式帳號'
);
}else if(actor){
cloud.logout().catch(
x=>notify(x.message,true)
);
}else{
$('loginPanel').classList.remove('hidden');
$('loginEmail').focus();
}

return;
}
}

function setup(){
document.addEventListener(
'click',
delegateClick
);

$('modal').addEventListener('click',e=>{
if(e.target===$('modal'))closeModal();
});

$('reportForm').addEventListener(
'submit',
saveReport
);

$('loginForm').addEventListener(
'submit',
async e=>{
e.preventDefault();

try{
await cloud.login(
$('loginEmail').value,
$('loginPassword').value
);

$('loginPassword').value='';
}catch(err){
notify(
'登入失敗：'+err.message,
true
);
}
}
);

for(const [id,field] of [
['quoteCustomer','client'],
['quoteNote','note'],
['discount','discount'],
['charge','charge'],
['fixedTotal','fixed']
]){
$(id).addEventListener('input',e=>{
q[field]=['discount','charge'].includes(field)
?n(e.target.value)
:e.target.value;

updateSummary();
});
}

for(const id of [
'filterMonth',
'filterDay',
'filterArtist',
'filterStatus'
]){
$(id).addEventListener(
'change',
renderDashboard
);
}

$('reportDate').value=DAY();
$('filterMonth').value=DAY().slice(0,7);

$('reportOriginal').addEventListener(
'input',
()=>{
$('reportAmount').value=Math.max(
0,
n($('reportOriginal').value)-
n($('reportDiscount').value)
);
}
);

$('reportDiscount').addEventListener(
'input',
()=>{
$('reportAmount').value=Math.max(
0,
n($('reportOriginal').value)-
n($('reportDiscount').value)
);
}
);

renderQuote();
renderSession();
clearReport();
}

async function start(){
setup();

let cfg=window.XIANG_FIREBASE_CONFIG||{};

if(
!cfg.apiKey||
!cfg.projectId||
Object.values(cfg).some(
x=>typeof x==='string'&&x.startsWith('REPLACE_')
)
){
demo=true;
records=getDemo();

staff=[
{
uid:'demo_owner',
name:'村長 Mona',
role:'owner',
active:true
},
{
uid:'demo_staff',
name:'示範美甲師',
role:'staff',
active:true
}
];

renderSession();

notify(
'目前為展示模式：可測試估價與回報，'+
'但不會傳到雲端。請完成 Firebase 設定與部署。'
);

return;
}

try{
const module=await import('./cloud.js');

cloud=module.createCloud(
cfg,
window.XIANG_OWNER_UID
);

demo=false;
renderSession();

cloud.watch({
onSession:(u,p)=>{
actor=u;
profile=p;
renderSession();
if(p)clearReport();
},

onReports:a=>{
records=a;
renderDashboard();
},

onStaff:a=>{
staff=uniqueStaffList(a);
renderStaff();
},

onPrices:a=>{
prices=a;
renderQuote();
renderPrices();
},

onError:e=>notify(
'雲端服務：'+(e.message||e),
true
)
});

}catch(err){
demo=true;
records=getDemo();
renderSession();

notify(
'雲端 SDK 載入失敗，目前僅能展示：'+
err.message,
true
);
}
}

start();

/* ===== XIANG V10.1 一次升級：貼在 app.js 最後 ===== */
(function upgradeV101(){
  const NEW_BASE = [
    ['gradient','漸層凝膠',1200],
    ['mirrorCat','鏡面貓眼',1400],
    ['gradientCat','漸層貓眼',1400]
  ];

  for (const gender of ['men','women']) {
    for (const zone of ['hand','foot']) {
      const rows = BASE[gender][zone];

      for (const [id,label,handPrice] of NEW_BASE) {
        if (!rows.some(row=>row[0]===id)) {
          rows.splice(
            rows.findIndex(row=>row[0]==='care'),
            0,
            [
              id,
              label,
              handPrice+(zone==='foot'?100:0),
              'gel'
            ]
          );
        }
      }

      const mirror=rows.find(row=>row[0]==='mirror');

      if (mirror) {
        mirror[2]=zone==='hand'?1200:1300;
      }
    }
  }

  function zoneData(zone){
    const x=q[zone];

    if(!Array.isArray(x.customItems)){
      x.customItems=[];
    }

    if(typeof x.extraCare!=='boolean'){
      x.extraCare=false;
    }

    return x;
  }

  function isGel(zone){
    return rowFor(zone)[3]==='gel';
  }

  const originalLines=lines;

  lines=function(){
    const result=originalLines();

    for(const zone of areaKeys()){
      const x=zoneData(zone);

      if(isGel(zone)&&x.extraCare){
        const careRow=BASE[q.gender][zone]
          .find(row=>row[0]==='care');

        result.push({
          zone,
          name:careRow[1],
          amount:unitPrice(
            zone,
            'base',
            'care',
            careRow[2]
          )
        });

        if(!x.extras.deep){
          result.push({
            zone,
            name:'凝膠＋保養組合優惠',
            amount:-200
          });
        }
      }

      for(const item of x.customItems){
        const title=String(item.name||'').trim();

        const qty=Math.max(
          0,
          Math.min(
            999,
            Math.floor(Number(item.qty)||0)
          )
        );

        const price=n(item.price);

        if(title&&qty>0){
          result.push({
            zone,
            name:`${title} × ${qty}`,
            amount:price*qty
          });
        }
      }
    }

    return result;
  };

  const originalRenderQuote=renderQuote;

  renderQuote=function(){
    for(const zone of areaKeys()){
      zoneData(zone);
    }

    originalRenderQuote();

    document.getElementById(
      'xiangV101Extras'
    )?.remove();

    const wrap=document.createElement('div');
    wrap.id='xiangV101Extras';

    wrap.innerHTML=areaKeys().map(zone=>{
      const x=zoneData(zone);

      const careRow=BASE[q.gender][zone]
        .find(row=>row[0]==='care');

      const isPureCare=rowFor(zone)[3]==='care';

      const carePrice=unitPrice(
        zone,
        'base',
        'care',
        careRow[2]
      );

      return `
      <section class="zone" style="margin-top:16px">
        <div class="zonetitle">
          <strong>${loc(zone)}｜自由搭配保養</strong>
          <span class="pill">V10.1</span>
        </div>

        <label class="itemline"
          style="display:flex;gap:12px;align-items:center;cursor:pointer">

          <input
            type="checkbox"
            data-v101-care="${zone}"
            ${isPureCare||x.extraCare?'checked':''}
            ${isPureCare?'disabled':''}
            style="width:20px;height:20px;flex:none"
          >

          <span class="left">
            <strong>
              基礎保養 ${fmt(carePrice)}
            </strong>

            <small class="meta" style="display:block">
              ${
                isPureCare
                ? '已選為純保養底款'
                : isGel(zone)
                ? '可與凝膠一起做，自動折 NT$200'
                : '選擇凝膠底款後可搭配優惠'
              }
            </small>
          </span>
        </label>

        <p class="hint">
          深層保養仍在下方「卸甲與修整」加購；
          同部位凝膠搭配基礎／深層保養，
          最多只折 NT$200。
        </p>
      </section>

      <section class="zone" style="margin-top:16px">
        <div class="zonetitle">
          <strong>${loc(zone)}｜自訂收費項目</strong>
          <span class="pill">自由報價</span>
        </div>

        <p class="hint">
          特殊造型、局部光療、手繪與應援甲
          都可以自己填。金額會自動加入估價單
          及營業回報。
        </p>

        ${x.customItems.map((item,i)=>`
          <div class="itemline"
            style="display:block;padding:12px 0;border-bottom:1px solid #ddd">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>自訂項目 ${i+1}</strong>

              <button
                type="button"
                class="button outline tiny"
                data-v101-remove="${zone}|${i}"
              >
                刪除
              </button>
            </div>

            <input
              data-v101-field="${zone}|${i}|name"
              placeholder="項目名稱，例如：局部貓眼"
              value="${esc(item.name)}"
              style="width:100%;margin-bottom:8px;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #bbb"
            >

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <label class="meta">
                單價 NT$

                <input
                  type="number"
                  min="0"
                  inputmode="numeric"
                  data-v101-field="${zone}|${i}|price"
                  value="${esc(item.price)}"
                  style="display:block;width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #bbb"
                >
              </label>

              <label class="meta">
                數量

                <input
                  type="number"
                  min="1"
                  max="999"
                  inputmode="numeric"
                  data-v101-field="${zone}|${i}|qty"
                  value="${esc(item.qty)}"
                  style="display:block;width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #bbb"
                >
              </label>
            </div>
          </div>
        `).join('')}

        <button
          type="button"
          class="button outline wide"
          data-v101-add="${zone}"
          style="margin-top:12px"
        >
          ＋ 新增自訂收費項目
        </button>
      </section>
      `;
    }).join('');

    $('extraArea').insertAdjacentElement(
      'afterend',
      wrap
    );

    updateSummary();
  };

  document.addEventListener('change',e=>{
    const zone=e.target?.dataset?.v101Care;

    if(!zone)return;

    zoneData(zone).extraCare=!!e.target.checked;

    renderQuote();
  });

  document.addEventListener('input',e=>{
    const info=e.target?.dataset?.v101Field;

    if(!info)return;

    const [zone,index,field]=info.split('|');

    const item=zoneData(zone)
      .customItems[Number(index)];

    if(!item)return;

    item[field]=e.target.value;

    updateSummary();
  });

  document.addEventListener('click',e=>{
    const add=e.target.closest('[data-v101-add]');

    if(add){
      zoneData(add.dataset.v101Add)
        .customItems.push({
          name:'',
          price:'',
          qty:'1'
        });

      renderQuote();
      return;
    }

    const remove=e.target.closest(
      '[data-v101-remove]'
    );

    if(remove){
      const [zone,index]=
        remove.dataset.v101Remove.split('|');

      zoneData(zone)
        .customItems.splice(Number(index),1);

      renderQuote();
    }
  });

  renderQuote();
})();

/* ===== XIANG V10.1 全站名稱統一：光療 → 凝膠 ===== */
(function normalizeGelNaming(){

  const rename = text =>
    typeof text === 'string'
      ? text.replace(/光療/g, '凝膠')
      : text;

  // 基礎服務
  for (const gender of ['men', 'women']) {
    for (const zone of ['hand', 'foot']) {
      for (const row of BASE[gender][zone]) {
        row[1] = rename(row[1]);
      }
    }

    // 造型加購
    for (const group of GROUP[gender]) {
      group[0] = rename(group[0]);

      for (const row of group[1]) {
        row[1] = rename(row[1]);
      }
    }

    // 其他加購
    for (const row of EXTRA[gender]) {
      row[1] = rename(row[1]);
    }
  }

  // 頁面文字：包含估價明細及動態產生的內容
  function replaceVisibleText(root) {
    if (!root) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    let node;

    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes('光療')) {
        node.nodeValue = rename(node.nodeValue);
      }
    }

    root.querySelectorAll?.(
      'input[placeholder], textarea[placeholder]'
    ).forEach(el => {
      el.placeholder = rename(el.placeholder);
    });
  }

  replaceVisibleText(document.body);

  // 自動處理重新渲染後的畫面
  const observer = new MutationObserver(mutations => {
    observer.disconnect();

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const node = mutation.target;

        if (node.nodeValue.includes('光療')) {
          node.nodeValue = rename(node.nodeValue);
        }
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          replaceVisibleText(node);
        }
      }
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  console.log('XIANG：凝膠名稱統一完成');

})();

/* =====================================================
 XIANG BEAUTY STUDIO
 V10.2｜員工業績抽成管理
 保留原有 V10 / V10.1 全部功能
 ===================================================== */

(function installCommissionV102() {
  'use strict';

  const DEFAULT_RATE = 40;

  function rateOf(record) {
    const value = Number(
      record.commissionRate ?? DEFAULT_RATE
    );

    return Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : DEFAULT_RATE;
  }

  function commissionOf(record) {
    const amount = n(record.amount);
    const rate = rateOf(record);

    return Math.round(amount * rate / 100);
  }

  function storeOf(record) {
    return n(record.amount) - commissionOf(record);
  }

  function syncCommissionInputs() {
    const amount = Number(
      $('reportAmount')?.value || 0
    );

    const input = $('reportCommissionRate');
    const result = $('reportCommissionAmount');

    if (!input || !result) return;

    const rate = Number(input.value);

    if (
      input.value.trim() === '' ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100
    ) {
      result.value = '';
      return;
    }

    result.value = String(
      Math.round(amount * rate / 100)
    );
  }

  // 1. 擴充原本的業績資料讀取
  const originalFieldsReport = fieldsReport;

  fieldsReport = function() {
    const record = originalFieldsReport();

    const input = $('reportCommissionRate');
    const raw = input?.value ?? String(DEFAULT_RATE);
    const rate = Number(raw);

    if (
      raw.trim() === '' ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100
    ) {
      throw new Error(
        '抽成比例必須介於 0% 至 100%'
      );
    }

    record.commissionRate = rate;
    record.commissionAmount = Math.round(
      n(record.amount) * rate / 100
    );

    record.storeAmount =
      n(record.amount) - record.commissionAmount;

    return record;
  };

  // 2. 新增回報時，預設 40%
  const originalClearReport = clearReport;

  clearReport = function() {
    originalClearReport();

    if ($('reportCommissionRate')) {
      $('reportCommissionRate').value =
        String(DEFAULT_RATE);
    }

    syncCommissionInputs();
  };

  // 3. 編輯時恢復該筆原有抽成
  const originalEditReport = editReport;

  editReport = function(id) {
    const record = records.find(
      item => item.id === id
    );

    if (!record) {
      return notify('找不到這筆業績', true);
    }

    if (record.settlementLocked === true) {
      return notify(
        '這筆業績已完成月結算，不能修改',
        true
      );
    }

    originalEditReport(id);

    if (editingId !== id) return;

    $('reportCommissionRate').value =
      String(rateOf(record));

    syncCommissionInputs();
  };

  // 4. 儲存前驗證抽成與結算狀態
  const originalSaveReport = saveReport;

  saveReport = async function(event) {
    const input = $('reportCommissionRate');
    const rate = Number(input?.value);

    if (
      !input ||
      input.value.trim() === '' ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100
    ) {
      event.preventDefault();

      notify(
        '請輸入 0% 至 100% 的抽成比例',
        true
      );

      return;
    }

    if (editingId) {
      const existing = records.find(
        item => item.id === editingId
      );

      if (existing?.settlementLocked === true) {
        event.preventDefault();

        notify(
          '此筆紀錄已結算，無法修改',
          true
        );

        return;
      }
    }

    return originalSaveReport(event);
  };

  // 5. 更新看板，顯示每位員工抽成
  const originalRenderDashboard = renderDashboard;

  renderDashboard = function() {
    originalRenderDashboard();

    const rows = filtered();
    const paid = rows.filter(
      item => item.status === '已結帳'
    );

    const totalCommission = paid.reduce(
      (sum, item) => sum + commissionOf(item),
      0
    );

    const totalStore = paid.reduce(
      (sum, item) => sum + storeOf(item),
      0
    );

    const metrics = $('metrics');

    if (metrics) {
      metrics.insertAdjacentHTML(
        'beforeend',
        `
        <div class="metric">
          <span>員工抽成總計</span>
          <strong>${fmt(totalCommission)}</strong>
        </div>

        <div class="metric">
          <span>店家分潤總計</span>
          <strong>${fmt(totalStore)}</strong>
        </div>
        `
      );
    }

    // 每位美甲師抽成統計
    const summary = new Map();

    for (const item of paid) {
      const uid = item.artistUid || 'unknown';

      const current = summary.get(uid) || {
        name: item.artist || '未命名',
        amount: 0,
        commission: 0,
        count: 0
      };

      current.amount += n(item.amount);
      current.commission += commissionOf(item);
      current.count++;

      summary.set(uid, current);
    }

    const artistStats = $('artistStats');

    if (artistStats) {
      artistStats.innerHTML = [...summary.values()]
        .sort((a, b) => b.amount - a.amount)
        .map(item => `
          <div class="stat">
            <span>
              ${esc(item.name)}
              · ${item.count} 筆
            </span>

            <div>
              <b>${fmt(item.amount)}</b>

              <div class="small">
                應計抽成：
                ${fmt(item.commission)}
              </div>
            </div>
          </div>
        `)
        .join('') ||
        '<p class="hint">本期間無已收紀錄。</p>';
    }

    // 每筆業績顯示抽成
    const tableRows = $('recordRows');

    if (tableRows) {
      const displayed = rows.slice(0, 500);

      tableRows.querySelectorAll('tr').forEach(
        (tr, index) => {
          const record = displayed[index];

          if (!record) return;

          const amountCell = tr.children[3];

          if (amountCell) {
            amountCell.innerHTML = `
              <strong>${fmt(record.amount)}</strong>

              <div class="small">
                抽成 ${rateOf(record)}%
                · ${fmt(commissionOf(record))}
              </div>

              <div class="small">
                店家 ${fmt(storeOf(record))}
              </div>
            `;
          }

          if (record.settlementLocked === true) {
            const actions = tr.children[5];

            if (actions) {
              actions.innerHTML =
                '<span class="pill">已結算鎖定</span>';
            }
          }
        }
      );
    }
  };

  // 6. CSV 加入抽成明細
  const originalExportCsv = exportCsv;

  exportCsv = function() {
    const rows = filtered();

    const headers = [
      '日期',
      '美甲師',
      '客戶',
      '服務項目',
      '實收金額',
      '抽成比例%',
      '抽成金額',
      '店家分潤',
      '收款狀態',
      '月結算鎖定'
    ];

    const data = rows.map(item => [
      item.date || '',
      item.artist || '',
      item.client || '',
      item.service || '',
      n(item.amount),
      rateOf(item),
      commissionOf(item),
      storeOf(item),
      item.status || '',
      item.settlementLocked === true
        ? '已鎖定'
        : '未鎖定'
    ]);

    const csv = '\ufeff' +
      [headers, ...data]
        .map(row =>
          row.map(safeCsvCell).join(',')
        )
        .join('\r\n');

    download(
      '香香村_員工抽成業績_' + DAY() + '.csv',
      csv,
      'text/csv;charset=utf-8'
    );
  };

  // 7. 監聽金額及比例變化
  document.addEventListener('input', event => {
    if (
      [
        'reportAmount',
        'reportOriginal',
        'reportDiscount',
        'reportCommissionRate'
      ].includes(event.target?.id)
    ) {
      queueMicrotask(syncCommissionInputs);
    }
  });

  console.log(
    'XIANG V10.2 員工抽成管理已載入'
  );

})();


