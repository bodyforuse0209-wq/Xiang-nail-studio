import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const app=getApps().length?getApp():initializeApp(window.XIANG_FIREBASE_CONFIG);
const auth=getAuth(app), db=getFirestore(app);
const money=n=>'NT$ '+Number(n||0).toLocaleString('zh-TW');
let selected=null,owner=false,staff=null,customers=[];
const text=(id,s)=>{$(id).textContent=s};
function validAmount(n){return Number.isSafeInteger(n)&&n>=0&&n<=100000000;}
export function calculateDebit(principal,bonus,amount){
  if(![principal,bonus,amount].every(validAmount))throw Error('金額必須是有效的非負整數');
  if(amount===0)throw Error('消費金額必須大於 0');
  if(amount>principal+bonus)throw Error('餘額不足，不允許負餘額');
  const bonusUsed=Math.min(amount,bonus),principalUsed=amount-bonusUsed;
  return {bonusUsed,principalUsed,principalAfter:principal-principalUsed,bonusAfter:bonus-bonusUsed,totalAfter:principal+bonus-amount};
}
function safeError(e){text('status','操作失敗：'+(e?.message||String(e)))}
function customerOption(c){const o=document.createElement('option');o.value=c.id;o.textContent=c.name||'未命名';return o}
async function refreshCustomer(){
 const id=$('customer').value; selected=customers.find(x=>x.id===id)||null;
 if(!selected){text('who','請選擇客戶');return}
 text('who',selected.name+' · '+(selected.phone||'無電話'));
 $('principal').value=0;$('bonus').value=0;
 text('balance','尚無錢包資料');text('transactions','尚未讀取');
 try{
   const snap=await getDoc(doc(db,'wallets',id));
   if(snap.exists()){
     const w=snap.data();
     const p=w.principalBalance,b=w.bonusBalance;
     if(!validAmount(p)||!validAmount(b))throw Error('錢包金額資料異常，請停止操作');
     $('principal').value=p;$('bonus').value=b;
     text('balance',`${money(p+b)}（本金 ${money(p)}／贈送 ${money(b)}）`);
   }else text('balance','尚未建立錢包（餘額視為 0，未寫入資料庫）');
   const tx=await getDocs(query(collection(db,'wallets',id,'transactions'),orderBy('createdAt','desc'),limit(30)));
   text('transactions',tx.empty?'尚無交易紀錄':tx.docs.map(d=>{
     const x=d.data();return `${x.type||'交易'} · ${money(x.amount)} · ${x.createdAt?.toDate?.().toLocaleString('zh-TW')||'待同步'} · ${x.actorUid||''}`;
   }).join('\n'));
   text('status','錢包資料讀取完成（安全預覽模式）');
 }catch(e){safeError(e)}
 calculate();
}
function calculate(){
 try{
 const p=Number($('principal').value),b=Number($('bonus').value),a=Number($('amount').value);
 if(!a){text('simulation','請輸入模擬消費金額');return}
 const r=calculateDebit(p,b,a);
 text('simulation',`先扣贈送金 ${money(r.bonusUsed)}，再扣本金 ${money(r.principalUsed)}。扣款後本金 ${money(r.principalAfter)}，贈送金 ${money(r.bonusAfter)}，總餘額 ${money(r.totalAfter)}。`);
 }catch(e){text('simulation',e.message)}
}
$('amount').addEventListener('input',calculate);
$('customer').addEventListener('change',refreshCustomer);
$('login').onclick=async()=>{try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(e){safeError(e)}};
$('logout').onclick=()=>signOut(auth);
$('copy').onclick=async()=>{
 const msg=`香香村美妍製造所｜會員餘額通知\n${selected?.name||'會員'}您好，\n目前系統顯示餘額：${$('balance').textContent}\n實際金額請以店內確認為準。`;
 try{await navigator.clipboard.writeText(msg);text('status','通知文字已複製')}catch(e){safeError(e)}
};
onAuthStateChanged(auth,async user=>{
 $('main').hidden=true;$('auth').hidden=!!user;selected=null;
 if(!user){text('status','請先登入員工帳號');return}
 try{
 const s=await getDoc(doc(db,'staff',user.uid));
 if(!s.exists()||s.data().active!==true)throw Error('此帳號沒有員工權限');
 staff=s.data();owner=user.uid===window.XIANG_OWNER_UID&&staff.role==='owner';
 const rows=await getDocs(query(collection(db,'customers'),orderBy('name')));
 customers=rows.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.archived!==true);
 const select=$('customer');select.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='選擇客戶';select.append(placeholder);
 customers.forEach(c=>select.append(customerOption(c)));
 $('main').hidden=false;text('role',owner?'店主 Mona':'員工');
 text('status','登入成功。V13 目前只讀取錢包與模擬扣款，不會更動任何餘額。');
 }catch(e){safeError(e);$('main').hidden=true}
});
