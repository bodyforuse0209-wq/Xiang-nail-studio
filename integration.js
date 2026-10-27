
/* 香香村 V15.1｜客戶管理與錢包連動準備｜UTF-8｜錢包安全預覽 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const DEFAULT_CATS=[{id:'regular',name:'常客',active:true},{id:'vip',name:'VIP',active:true},{id:'stored',name:'儲值會員（尚未啟用）',active:true}];
const META={source:'crm_source',service:'crm_service',firstVisit:'crm_firstVisit',contactPreference:'crm_contactPreference'};
const money=n=>'NT$ '+Number(n||0).toLocaleString('zh-TW');
let db,fire,auth,staff=null,owner=false,customers=[],chosen=null,config={categories:DEFAULT_CATS,fields:[]},ready=false;
const css=`#xiangCRM{max-width:850px;margin:auto;padding:14px;color:#352e29;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif}#xiangCRM *{box-sizing:border-box}#xiangCRM .xc{background:white;border:1px solid #e8dfd5;border-radius:18px;padding:18px;margin:12px 0}#xiangCRM button{border:0;border-radius:11px;padding:12px 16px;background:#3e332d;color:white;font-size:15px;cursor:pointer}#xiangCRM button.alt{background:#eee7df;color:#3e332d}#xiangCRM button:disabled{opacity:.55}#xiangCRM label{display:block;margin:13px 0 5px;font-size:13px;color:#6f6258}#xiangCRM input,#xiangCRM select,#xiangCRM textarea{display:block;width:100%;border:1px solid #d9cec4;border-radius:10px;padding:12px;background:white;font-size:16px}#xiangCRM .xr{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#xiangCRM .xr>*{flex:1}#xiangCRM .muted{color:#85796e;font-size:13px}#xiangCRM .item{display:block;width:100%;text-align:left;background:#f5f0e9;color:#382f29;margin:7px 0}#xiangCRM .big{font-size:23px;font-weight:700}#xiangCRM .warn{background:#fff7e8;border:1px solid #e7d0a5;padding:12px;border-radius:12px;font-size:13px}#xiangCRM [hidden]{display:none!important}`;
function say(s){$('crmStatus').textContent=s}
function view(id){for(const x of ['list','form','detail'])$('crm_'+x).hidden=x!==id}
function option(value,name){const o=document.createElement('option');o.value=value;o.textContent=name;return o}
function activeCats(){return config.categories.filter(c=>c.active!==false)}
function renderCats(value='regular'){
 const s=$('crmCategory');s.replaceChildren();for(const c of activeCats())s.add(option(c.id,c.name));
 if(value&&![...s.options].some(o=>o.value===value))s.add(option(value,value+'（舊分類）'));
 s.value=value||activeCats()[0]?.id||'regular';
 const f=$('crmFilter'),old=f.value;f.replaceChildren(option('','所有會員分類'));
 for(const c of config.categories)f.add(option(c.id,c.name+(c.active===false?'（已隱藏）':'')));
 f.value=[...f.options].some(o=>o.value===old)?old:'';
}
function renderExtra(values={}){
 const root=$('crmExtras');root.replaceChildren();
 for(const f of config.fields.filter(x=>x.active!==false)){
  const label=document.createElement('label');label.textContent=f.name;
  const input=document.createElement(f.type==='textarea'?'textarea':'input');
  if(f.type!=='textarea')input.type=f.type==='date'?'date':'text';
  input.maxLength=500;input.dataset.fieldId=f.id;input.value=String(values[f.id]??'');root.append(label,input);
 }
}
function catName(id){return config.categories.find(x=>x.id===id)?.name||'未分類'}
function list(){
 const term=$('crmSearch').value.trim().toLowerCase(),cat=$('crmFilter').value;
 const rows=customers.filter(c=>c.archived!==true&&(!cat||c.categoryId===cat)&&[c.name,c.phone,c.line,catName(c.categoryId)].some(v=>String(v||'').toLowerCase().includes(term)));
 $('crmCount').textContent=`有效客戶 ${customers.filter(c=>c.archived!==true).length} 位`;
 const root=$('crmRows');root.replaceChildren();
 for(const c of rows){const b=document.createElement('button');b.className='item';b.textContent=`${c.name}｜${catName(c.categoryId)}｜${c.phone||'無電話'}`;b.onclick=()=>openCustomer(c.id);root.append(b)}
 if(!rows.length)root.textContent='沒有符合條件的客戶';
}
async function refresh(){
 const s=await fire.getDocs(fire.collection(db,'customers'));customers=s.docs.map(d=>({id:d.id,...d.data()}));list();say('資料已同步，共 '+customers.length+' 筆客戶紀錄');
}
async function loadConfig(){
 const s=await fire.getDoc(fire.doc(db,'settings','customerConfig'));
 if(s.exists()){
  const d=s.data();config={categories:Array.isArray(d.categories)?d.categories:DEFAULT_CATS,fields:Array.isArray(d.fields)?d.fields.filter(f=>['text','textarea','date'].includes(f.type)):[]};
 }
 renderCats();renderExtra();
}
function form(c=null){
 chosen=c;
 $('crmFormTitle').textContent=c?'編輯客戶':'新增客戶';
 for(const k of ['name','phone','line','birthday','notes'])$('crm_'+k).value=c?.[k]||'';
 renderCats(c?.categoryId||'regular');
 const custom=c?.customFields&&typeof c.customFields==='object'?c.customFields:{};
 for(const [key,id] of Object.entries(META))$('crm_'+key).value=String(custom[id]||'');
 renderExtra(custom);view('form');window.scrollTo(0,0);
}
async function save(){
 const btn=$('crmSave');btn.disabled=true;
 try{
  const user=auth.currentUser;if(!user||!staff)throw Error('請先登入授權員工帳號');
  const name=$('crm_name').value.trim(),phone=$('crm_phone').value.trim(),line=$('crm_line').value.trim(),birthday=$('crm_birthday').value,notes=$('crm_notes').value.trim();
  if(!name||name.length>80)throw Error('姓名必須為 1–80 字');
  if(phone.length>30||line.length>100||notes.length>3000)throw Error('欄位長度超過限制');
  const custom={...(chosen?.customFields||{})};
  for(const [key,id] of Object.entries(META))custom[id]=$('crm_'+key).value.trim();
  for(const el of $('crmExtras').querySelectorAll('[data-field-id]'))custom[el.dataset.fieldId]=el.value.trim();
  if(Object.keys(custom).length>30)throw Error('自訂欄位超過 30 個');
  const data={name,phone,line,birthday,notes,categoryId:$('crmCategory').value,customFields:custom,updatedAt:fire.serverTimestamp(),updatedBy:user.uid};
  if(chosen){await fire.updateDoc(fire.doc(db,'customers',chosen.id),data)}
  else{await fire.addDoc(fire.collection(db,'customers'),{...data,archived:false,createdAt:fire.serverTimestamp(),createdBy:user.uid})}
  await refresh();view('list');say(chosen?'客戶資料已更新':'新增客戶成功');chosen=null;
 }catch(e){say('儲存失敗：'+e.message)}finally{btn.disabled=false}
}
async function openCustomer(id){
 const c=customers.find(x=>x.id===id);if(!c)return;chosen=c;view('detail');
 $('crmWho').textContent=c.name;$('crmInfo').textContent=`${catName(c.categoryId)}｜${c.phone||'無電話'}｜${c.line||'無 LINE'}`;
 $('crmBalance').textContent='尚未開放讀取錢包';$('crmHistory').textContent='正式交易功能尚未啟用';
 $('crmTopup').value='';$('crmGift').value='';$('crmAmount').value='';calculate();
 // V15.1: link by Firestore customer document ID, never by name.
 const wp=$('v15Panel'),ws=$('v15Customer');
 if(wp&&ws){
  $('crm_detail').append(wp);
  if([...ws.options].some(o=>o.value===id)){ws.value=id;ws.dispatchEvent(new Event('change'));}
  else ws.value='';
 }
 try{
  const s=await fire.getDoc(fire.doc(db,'wallets',id));
  if(s.exists()){
   const w=s.data();if(!Number.isSafeInteger(w.principalBalance)||!Number.isSafeInteger(w.bonusBalance)||w.principalBalance<0||w.bonusBalance<0)throw Error('餘額資料異常');
   $('crmBalance').textContent=`${money(w.principalBalance+w.bonusBalance)}（本金 ${money(w.principalBalance)}／贈送 ${money(w.bonusBalance)}）`;
  }else $('crmBalance').textContent='尚未建立錢包';
 }catch(e){$('crmBalance').textContent='錢包尚未開放讀取權限'}
 window.scrollTo(0,0);
}
function calculate(){
 const p=Number($('crmTopup').value||0),b=Number($('crmGift').value||0);
 $('crmTopupResult').textContent=Number.isSafeInteger(p)&&Number.isSafeInteger(b)&&p>=0&&b>=0?`預計入帳 ${money(p+b)}（僅試算）`:'請輸入非負整數';
 $('crmDebitResult').textContent='正式餘額尚未開放，暫不提供扣款試算，避免誤認已完成交易。';
}
async function setup(){
 if(ready)return;ready=true;
 try{
  const [a,f,au]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js'),
   import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js')]);
  const app=a.getApps().length?a.getApp():a.initializeApp(window.XIANG_FIREBASE_CONFIG);
  fire=f;db=f.getFirestore(app);auth=au.getAuth(app);
  au.onAuthStateChanged(auth,async user=>{
   if(!user){$('crmContent').hidden=true;say('請先使用首頁右上角登入員工帳號');return}
   try{
    const s=await f.getDoc(f.doc(db,'staff',user.uid));if(!s.exists()||s.data().active!==true)throw Error('沒有員工權限');
    staff=s.data();owner=user.uid===window.XIANG_OWNER_UID&&staff.role==='owner';
    await loadConfig();await refresh();$('crmContent').hidden=false;view('list');
   }catch(e){$('crmContent').hidden=true;say('讀取失敗：'+e.message)}
  });
 }catch(e){say('系統載入失敗：'+e.message)}
}
function init(){
 const nav=$('nav'),app=document.querySelector('.container.app'),bar=$('bottomBar');if(!nav||!app)return;
 const style=document.createElement('style');style.textContent=css;document.head.append(style);
 const panel=document.createElement('div');panel.id='xiangCRM';panel.hidden=true;
 panel.innerHTML=`<div class="xr"><h2>香香村｜客戶與會員管理</h2><button class="alt" id="crmBack">← 回智慧估價</button></div><p class="muted" id="crmStatus">準備載入…</p>
 <div id="crmContent" hidden>
 <section id="crm_list" class="xc"><div class="xr"><strong id="crmCount">客戶管理</strong><button id="crmAdd">＋ 新增客戶</button></div><label>搜尋姓名、電話、LINE、分類</label><input id="crmSearch" placeholder="搜尋客戶"><label>會員分類</label><select id="crmFilter"></select><div id="crmRows"></div></section>
 <section id="crm_form" class="xc" hidden><h3 id="crmFormTitle">新增客戶</h3><label>姓名 *</label><input id="crm_name" maxlength="80"><label>電話</label><input id="crm_phone" maxlength="30"><label>LINE</label><input id="crm_line" maxlength="100"><label>生日</label><input id="crm_birthday" type="date"><label>會員分類</label><select id="crmCategory"></select><label>客戶來源</label><input id="crm_source" placeholder="例如：IG、朋友介紹"><label>偏好服務</label><input id="crm_service" placeholder="例如：美甲、美睫"><label>首次到店日期</label><input id="crm_firstVisit" type="date"><label>偏好聯繫方式</label><input id="crm_contactPreference" placeholder="例如：LINE"><div id="crmExtras"></div><label>備註</label><textarea id="crm_notes" rows="3" maxlength="3000"></textarea><div class="xr"><button class="alt" id="crmCancel">取消</button><button id="crmSave">儲存客戶</button></div></section>
 <section id="crm_detail" hidden><div class="xc"><button class="alt" id="crmReturn">← 返回客戶列表</button><h3 id="crmWho"></h3><p class="muted" id="crmInfo"></p><button id="crmEdit">編輯客戶資料</button><p class="muted">會員錢包餘額</p><div id="crmBalance" class="big">尚未讀取</div></div>
 <div class="xc"><h3>儲值規劃</h3><div class="warn">正式儲值尚未啟用。以下金額只供試算，不會寫入帳務。</div><label>預計儲值本金</label><input id="crmTopup" type="number" min="0" step="1" placeholder="例如 3000"><label>預計贈送金</label><input id="crmGift" type="number" min="0" step="1" placeholder="例如 300"><p id="crmTopupResult" class="big"></p><button disabled>確認儲值（尚未啟用）</button></div>
 <div class="xc"><h3>消費扣款｜先扣贈送金</h3><label>本次消費金額</label><input id="crmAmount" type="number" min="1" step="1" placeholder="例如 800"><p id="crmDebitResult" class="warn"></p><button disabled>確認扣款（尚未啟用）</button></div>
 <div class="xc"><h3>交易紀錄</h3><p id="crmHistory" class="muted">尚未啟用</p></div></section></div>`;
 app.after(panel);
 const btn=document.createElement('button');btn.className='navbtn';btn.type='button';btn.textContent='♙ 客戶／會員管理';nav.append(btn);
 function close(){panel.hidden=true;app.hidden=false;if(bar)bar.hidden=false;btn.classList.remove('active');window.scrollTo(0,0)}
 btn.onclick=()=>{app.hidden=true;panel.hidden=false;if(bar)bar.hidden=true;btn.classList.add('active');setup();window.scrollTo(0,0)};
 nav.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',close));
 $('crmBack').onclick=close;$('crmAdd').onclick=()=>form();$('crmCancel').onclick=()=>view('list');$('crmReturn').onclick=()=>view('list');
 $('crmSave').onclick=save;$('crmEdit').onclick=()=>form(chosen);$('crmSearch').oninput=list;$('crmFilter').onchange=list;
 $('crmTopup').oninput=calculate;$('crmGift').oninput=calculate;$('crmAmount').oninput=calculate;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
