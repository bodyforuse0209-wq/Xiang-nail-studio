
/* XIANG BEAUTY V15.1 — wallet module, staged for testing.
 * Requires index.html to load this file after integration.js.
 * IMPORTANT: Current production Firestore rules deny all wallet reads/writes.
 * Do not publish permissive wallet rules or use real balances until emulator tests pass.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = n => 'NT$ ' + n.toLocaleString('zh-TW');
  const MAX = 10000000;
  const valid = n => Number.isSafeInteger(n) && n >= 0 && n <= MAX;
  const parse = (id, allowZero = false) => {
    const raw = $(id).value.trim();
    if (!/^\d+$/.test(raw)) throw Error('金額請填整數');
    const n = Number(raw);
    if (!valid(n) || (!allowZero && n === 0)) throw Error('金額必須介於 ' + (allowZero ? 0 : 1) + ' 至 1,000 萬元');
    return n;
  };
  let fs, db, auth, owner = false, staff = false, selectedId = '', busy = false, pendingId = null;
  let lastLoaded = 0;
  const status = msg => { if ($('v15Status')) $('v15Status').textContent = msg; };
  const controls = () => ['v15Topup','v15Debit','v15Refund','v15Adjust'].forEach(id => {if ($(id)) $(id).disabled = busy || !staff || (['v15Refund','v15Adjust'].includes(id) && !owner);});
  const requireCustomer = () => {if (!selectedId) throw Error('請先從客戶編號清單選擇客戶'); return selectedId;};
  function install() {
    const panel = $('xiangCRM');
    if (!panel || $('v15Panel')) return;
    const wrap = document.createElement('section');
    wrap.id = 'v15Panel'; wrap.className = 'xc';
    wrap.innerHTML = `<h3>V15.1｜會員錢包（安全測試版）</h3>
      <p class="warn">正式帳務尚未啟用。請先在 Firebase Emulator 驗證權限及交易規則；不可拿真實客戶金額測試。</p>
      <label>客戶（使用 Firestore 文件 ID，避免同名入錯帳）</label><select id="v15Customer"><option value="">選擇客戶</option></select>
      <p id="v15Status" class="muted">等待登入</p><div id="v15Balance" class="big">—</div>
      <div class="xc"><h3>儲值</h3><label>本金</label><input id="v15Principal" type="number" min="1" step="1"><label>贈送金</label><input id="v15Bonus" type="number" min="0" step="1" value="0"><label>付款方式</label><select id="v15Payment"><option>現金</option><option>轉帳</option><option>信用卡</option><option>LINE Pay</option><option>其他</option></select><label>備註</label><input id="v15TopupNote" maxlength="200"><button id="v15Topup" disabled type="button">確認儲值</button></div>
      <div class="xc"><h3>消費扣款｜先扣贈送金</h3><label>金額</label><input id="v15Amount" type="number" min="1" step="1"><label>備註</label><input id="v15DebitNote" maxlength="200"><button id="v15Debit" disabled type="button">確認扣款</button></div>
      <div class="xc" id="v15Owner" hidden><h3>店主專用</h3><label>原扣款交易 ID（整筆退款）</label><input id="v15Original" maxlength="150"><button id="v15Refund" disabled type="button">退款原扣款</button><label>人工調整本金</label><input id="v15AdjustAmount" type="number" min="1" step="1"><label>調整方向</label><select id="v15AdjustDirection"><option value="plus">增加</option><option value="minus">減少</option></select><label>調整原因</label><input id="v15Reason" maxlength="200"><button id="v15Adjust" disabled type="button">確認調整</button></div>
      <div class="xc"><h3>最近交易</h3><div id="v15History" class="muted">—</div></div>`;
    panel.append(wrap);
    $('v15Customer').onchange = async () => {selectedId = $('v15Customer').value; lastLoaded++; await reload();};
    $('v15Topup').onclick = () => submit('topup');
    $('v15Debit').onclick = () => submit('debit');
    $('v15Refund').onclick = () => submit('refund');
    $('v15Adjust').onclick = () => submit($('v15AdjustDirection').value === 'plus' ? 'adjustPlus' : 'adjustMinus');
  }
  async function loadCustomers() {
    const snap = await fs.getDocs(fs.collection(db, 'customers'));
    const sel = $('v15Customer'); const previous = selectedId;
    sel.replaceChildren(new Option('選擇客戶', ''));
    snap.docs.filter(d => d.data().archived !== true).sort((a,b) => String(a.data().name).localeCompare(String(b.data().name),'zh-TW')).forEach(d => sel.add(new Option(`${d.data().name || '未命名'}｜${d.data().phone || '無電話'}｜${d.id.slice(0,8)}`, d.id)));
    if ([...sel.options].some(o => o.value === previous)) sel.value = previous;
    else selectedId = '';
  }
  async function reload() {
    const id = selectedId, seq = ++lastLoaded;
    if (!id) { $('v15Balance').textContent = '請選擇客戶'; $('v15History').textContent = '—'; return; }
    try {
      const [w, t] = await Promise.all([
        fs.getDoc(fs.doc(db,'wallets',id)),
        fs.getDocs(fs.query(fs.collection(db,'walletTransactions'),fs.where('customerId','==',id),fs.limit(100)))
      ]);
      if (id !== selectedId || seq !== lastLoaded) return;
      const d = w.exists() ? w.data() : {principalBalance:0,bonusBalance:0};
      if (!valid(d.principalBalance) || !valid(d.bonusBalance)) throw Error('錢包資料異常');
      $('v15Balance').textContent = `本金 ${money(d.principalBalance)}｜贈送 ${money(d.bonusBalance)}｜合計 ${money(d.principalBalance+d.bonusBalance)}`;
      const root = $('v15History'); root.replaceChildren();
      t.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).forEach(x=>{
        const p=document.createElement('p');p.textContent=`${x.createdAt?.toDate?.().toLocaleString('zh-TW')||'待同步'}｜${x.type}｜${money(x.amount)}｜${x.id}`;root.append(p);
      });
      if (!t.size) root.textContent = '尚無交易';
      status('帳務讀取成功');
    } catch(e) { if (id===selectedId) { $('v15Balance').textContent='不可用';status('讀取未完成：'+e.message); } }
  }
  async function submit(type) {
    if (busy || !staff) return;
    try {
      const customerId = requireCustomer();
      if (['refund','adjustPlus','adjustMinus'].includes(type) && !owner) throw Error('此操作限店主');
      let principal=0, bonus=0, amount=0, originalId='', note='', payment='';
      if (type==='topup') {principal=parse('v15Principal');bonus=parse('v15Bonus',true);amount=principal+bonus;payment=$('v15Payment').value;note=$('v15TopupNote').value.trim();}
      else if (type==='debit') {amount=parse('v15Amount');note=$('v15DebitNote').value.trim();}
      else if (type==='refund') {originalId=$('v15Original').value.trim();if(!/^[\w-]{1,150}$/.test(originalId))throw Error('原交易編號不正確');note='原扣款整筆退款';}
      else {amount=parse('v15AdjustAmount');note=$('v15Reason').value.trim();if(!note)throw Error('請填調整原因');}
      if (amount>MAX) throw Error('單筆超過上限');
      const txId=type==='refund' ? 'refund_'+originalId : (pendingId?.type===type && pendingId.customerId===customerId ? pendingId.id : crypto.randomUUID());
      if (txId.length>220) throw Error('交易編號過長');
      if (!confirm(`確認${type}？\n客戶 ID：${customerId}\n金額：${type==='refund'?'依原交易':money(amount)}\n此操作可能更動實際帳務。`)) return;
      pendingId={type,customerId,id:txId};busy=true;controls();status('交易處理中，請勿重複送出');
      const user=auth.currentUser;if(!user)throw Error('請先登入');
      const wr=fs.doc(db,'wallets',customerId),tr=fs.doc(db,'walletTransactions',txId);
      const cr=fs.doc(db,'customers',customerId),sr=fs.doc(db,'staff',user.uid);
      await fs.runTransaction(db, async tx=>{
        // All reads precede all writes, including refund idempotency check.
        const refs=[wr,tr,cr,sr];
        if(type==='refund') refs.push(fs.doc(db,'walletTransactions',originalId));
        const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
        const [ws,existing,cs,ss,orig]=snaps;
        if(existing.exists()) throw Error('這筆交易已處理，請重新讀取紀錄');
        if(!cs.exists()||cs.data().archived===true)throw Error('客戶不存在或已封存');
        if(!ss.exists()||ss.data().active!==true)throw Error('員工未獲授權');
        const isOwner=user.uid===window.XIANG_OWNER_UID&&ss.data().role==='owner';
        if(['refund','adjustPlus','adjustMinus'].includes(type)&&!isOwner)throw Error('店主專用');
        const w=ws.exists()?ws.data():{principalBalance:0,bonusBalance:0,version:0};
        const p=w.principalBalance,b=w.bonusBalance,v=w.version||0;
        if(!valid(p)||!valid(b)||!Number.isSafeInteger(v)||v<0)throw Error('原餘額資料異常');
        let dp=0,dbonus=0;
        if(type==='topup'){dp=principal;dbonus=bonus;}
        if(type==='debit'){if(amount>p+b)throw Error('餘額不足');dbonus=-Math.min(b,amount);dp=-(amount+dbonus);}
        if(type==='refund'){
          if(!orig.exists()||orig.data().type!=='debit'||orig.data().customerId!==customerId)throw Error('原扣款交易不存在');
          const o=orig.data();
          if(!valid(o.amount)||!Number.isSafeInteger(o.principalDelta)||!Number.isSafeInteger(o.bonusDelta)||o.principalDelta>0||o.bonusDelta>0||o.principalDelta+o.bonusDelta!==-o.amount)throw Error('原扣款紀錄異常');
          amount=o.amount;dp=-o.principalDelta;dbonus=-o.bonusDelta;
        }
        if(type==='adjustPlus')dp=amount;
        if(type==='adjustMinus'){if(amount>p)throw Error('本金不足');dp=-amount;}
        if(!valid(p+dp)||!valid(b+dbonus)||p+dp+b+dbonus>MAX)throw Error('交易後餘額超過限制');
        const next={principalBalance:p+dp,bonusBalance:b+dbonus,version:v+1,lastTransactionId:txId,updatedAt:fs.serverTimestamp(),updatedBy:user.uid};
        const record={customerId,type,amount,principalDelta:dp,bonusDelta:dbonus,principalBefore:p,bonusBefore:b,principalAfter:p+dp,bonusAfter:b+dbonus,version:v+1,actorUid:user.uid,note,payment,originalId,createdAt:fs.serverTimestamp()};
        tx.set(wr,next);tx.set(tr,record);
      });
      pendingId=null;status('交易已提交：'+txId);await reload();
    } catch(e) {status('未確認交易成功：'+e.message+'。如遇網路中斷，請先查交易紀錄，勿立即重新提交。');}
    finally {busy=false;controls();}
  }
  async function start() {
    if(!$('xiangCRM'))return;
    install();
    try {
      const [app,fsModule,au]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js')
      ]);
      fs=fsModule;const a=app.getApps().length?app.getApp():app.initializeApp(window.XIANG_FIREBASE_CONFIG);
      db=fs.getFirestore(a);auth=au.getAuth(a);
      au.onAuthStateChanged(auth,async user=>{
        staff=false;owner=false;selectedId='';pendingId=null;controls();$('v15Customer').replaceChildren(new Option('選擇客戶',''));
        if(!user){status('請先登入');return;}
        try {
          const s=await fs.getDoc(fs.doc(db,'staff',user.uid));
          if(!s.exists()||s.data().active!==true)throw Error('無員工權限');
          staff=true;owner=user.uid===window.XIANG_OWNER_UID&&s.data().role==='owner';
          $('v15Owner').hidden=!owner;await loadCustomers();controls();status('已登入；正式帳務尚未開通');
        } catch(e){status('初始化失敗：'+e.message);}
      });
    } catch(e){status('載入失敗：'+e.message);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
