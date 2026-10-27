
/* XIANG V15 wallet extension — TEST ONLY
   Requires integration.js V14.2 and Firebase 12.4.0.
   Do not enable production wallet writes before security testing.
*/
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const money = n => 'NT$ ' + Number(n || 0).toLocaleString('zh-TW');

  let db, f, auth;
  let customerId = null;
  let owner = false;
  let enabled = false;
  let working = false;

  const valid = n =>
    Number.isSafeInteger(n) && n >= 0 && n <= 10000000;

  const num = id => {
    const s = $(id).value.trim();
    if (!/^\d+$/.test(s)) {
      throw Error('請輸入非負整數');
    }
    const n = Number(s);
    if (!valid(n)) {
      throw Error('單筆金額不可超過 1,000 萬元');
    }
    return n;
  };

  const status = s => {
    $('crmWalletStatus').textContent = s;
  };

  function install() {
    const detail = $('crm_detail');
    if (!detail) return;

    const blocks = detail.querySelectorAll('.xc');
    if (blocks.length < 4) return;

    blocks[1].innerHTML = `
      <h3>會員儲值</h3>
      <p class="muted">
        本金與贈送金分開記帳。
        測試版請勿輸入真實收款。
      </p>

      <label>儲值本金</label>
      <input id="v15Principal"
        type="number" min="1" step="1"
        placeholder="3000">

      <label>贈送金</label>
      <input id="v15Bonus"
        type="number" min="0" step="1" value="0">

      <label>付款方式</label>
      <select id="v15Payment">
        <option>現金</option>
        <option>轉帳</option>
        <option>信用卡</option>
        <option>LINE Pay</option>
        <option>其他</option>
      </select>

      <label>備註</label>
      <input id="v15Note" maxlength="200"
        placeholder="可留空">

      <button id="v15Topup" type="button">
        測試儲值入帳
      </button>
    `;

    blocks[2].innerHTML = `
      <h3>消費扣款</h3>
      <p class="muted">
        優先扣贈送金，餘額不足禁止扣款。
      </p>

      <label>本次消費</label>
      <input id="v15Amount"
        type="number" min="1" step="1"
        placeholder="800">

      <label>備註</label>
      <input id="v15DebitNote"
        maxlength="200"
        placeholder="施作內容／收據編號">

      <button id="v15Debit" type="button">
        測試扣款
      </button>

      <div id="v15Owner" hidden>
        <h3>店主專用｜退款與餘額調整</h3>

        <label>退款／調整金額</label>
        <input id="v15AdjustAmount"
          type="number" min="1" step="1">

        <label>處理方式</label>
        <select id="v15AdjustType">
          <option value="refund">
            退回先前扣款
          </option>
          <option value="adjustPlus">
            增加餘額（更正）
          </option>
          <option value="adjustMinus">
            減少餘額（更正）
          </option>
        </select>

        <label>原交易編號（退款必填）</label>
        <input id="v15Original"
          placeholder="請填入扣款交易編號">

        <label>原因（必填）</label>
        <input id="v15Reason" maxlength="200">

        <button id="v15Adjust" type="button">
          店主確認執行
        </button>
      </div>
    `;

    blocks[3].innerHTML = `
      <h3>交易紀錄</h3>
      <div id="v15History" class="muted">
        讀取中
      </div>
    `;

    const p = document.createElement('p');
    p.id = 'crmWalletStatus';
    p.className = 'warn';
    p.textContent = '測試版錢包初始化中';
    blocks[0].append(p);

    $('v15Topup').onclick = () => act('topup');
    $('v15Debit').onclick = () => act('debit');
    $('v15Adjust').onclick = () =>
      act($('v15AdjustType').value);

    new MutationObserver(async () => {
      if (detail.hidden || !$('crmWho').textContent) {
        return;
      }

      const name = $('crmWho').textContent;

      try {
        const q = await f.getDocs(
          f.query(
            f.collection(db, 'customers'),
            f.where('name', '==', name)
          )
        );

        if (q.size !== 1) {
          customerId = null;
          status(
            '同名客戶或查無客戶：為避免入錯帳，' +
            '測試版不允許操作'
          );
          return;
        }

        await select(q.docs[0].id);

      } catch (e) {
        status('無法確認客戶：' + e.message);
      }

    }).observe($('crmWho'), {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  async function select(id) {
    customerId = id;
    await reload();
  }

  async function reload() {
    if (!customerId || !db) return;

    const id = customerId;

    try {
      const w = await f.getDoc(
        f.doc(db, 'wallets', id)
      );

      if (id !== customerId) return;

      const d = w.exists()
        ? w.data()
        : {
            principalBalance: 0,
            bonusBalance: 0
          };

      $('crmBalance').textContent =
        money(d.principalBalance || 0) +
        ' 本金 + ' +
        money(d.bonusBalance || 0) +
        ' 贈送 = ' +
        money(
          (d.principalBalance || 0) +
          (d.bonusBalance || 0)
        );

      const q = await f.getDocs(
        f.query(
          f.collection(db, 'walletTransactions'),
          f.where('customerId', '==', id),
          f.limit(100)
        )
      );

      const records = q.docs
        .map(x => ({
          id: x.id,
          ...x.data()
        }))
        .sort(
          (x, y) =>
            (y.createdAt?.seconds || 0) -
            (x.createdAt?.seconds || 0)
        );

      $('v15History').replaceChildren();

      for (const t of records) {
        const row = document.createElement('p');

        row.textContent =
          (t.createdAt?.toDate?.()
            .toLocaleString('zh-TW') || '處理中') +
          '｜' + t.type +
          '｜' + money(t.amount) +
          '｜本金 ' + money(t.principalAfter) +
          '／贈送 ' + money(t.bonusAfter) +
          '｜' + t.id;

        $('v15History').append(row);
      }

      if (!records.length) {
        $('v15History').textContent = '尚無交易';
      }

      status('帳務資料已同步');

    } catch (e) {
      status('帳務讀取失敗：' + e.message);
    }
  }

  async function act(type) {
    if (working || !enabled || !customerId) {
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      return status('請先登入');
    }

    if (
      ['refund', 'adjustPlus', 'adjustMinus']
        .includes(type) &&
      !owner
    ) {
      return status('此操作限店主');
    }

    let principal = 0;
    let bonus = 0;
    let amount = 0;
    let note = '';
    let payment = '';
    let originalId = '';

    try {
      if (type === 'topup') {
        principal = num('v15Principal');
        bonus = num('v15Bonus');
        amount = principal + bonus;
        payment = $('v15Payment').value;
        note = $('v15Note').value.trim();

        if (principal < 1 || amount > 10000000) {
          throw Error('儲值本金至少 1 元');
        }

      } else if (type === 'debit') {
        amount = num('v15Amount');
        note = $('v15DebitNote').value.trim();

      } else {
        amount = num('v15AdjustAmount');
        note = $('v15Reason').value.trim();
        originalId = $('v15Original').value.trim();

        if (!note) {
          throw Error('必須填寫原因');
        }

        if (type === 'refund' && !originalId) {
          throw Error('退款必須填原扣款交易編號');
        }
      }

      if (amount < 1) {
        throw Error('金額至少 1 元');
      }

      if (!confirm(
        '確定對「' +
        $('crmWho').textContent +
        '」執行 ' + type +
        ' ' + money(amount) + '？'
      )) {
        return;
      }

      working = true;

      for (const id of [
        'v15Topup',
        'v15Debit',
        'v15Adjust'
      ]) {
        $(id).disabled = true;
      }

      status('正在送出交易，請勿重新操作');

      const id = customerId;
      const txId = type === 'refund'
        ? 'refund_' + originalId
        : crypto.randomUUID();

      const wr = f.doc(db, 'wallets', id);
      const tr = f.doc(
        db,
        'walletTransactions',
        txId
      );

      await f.runTransaction(db, async tx => {
        const [ws, cs, ss, orig] =
          await Promise.all([
            tx.get(wr),
            tx.get(f.doc(db, 'customers', id)),
            tx.get(f.doc(db, 'staff', user.uid)),
            type === 'refund'
              ? tx.get(
                  f.doc(
                    db,
                    'walletTransactions',
                    originalId
                  )
                )
              : Promise.resolve(null)
          ]);

        if (
          !cs.exists() ||
          cs.data().archived === true
        ) {
          throw Error('客戶不存在或已封存');
        }

        if (
          !ss.exists() ||
          ss.data().active !== true
        ) {
          throw Error('員工權限失效');
        }

        const isOwner =
          user.uid === window.XIANG_OWNER_UID &&
          ss.data().role === 'owner';

        if (
          ['refund', 'adjustPlus', 'adjustMinus']
            .includes(type) &&
          !isOwner
        ) {
          throw Error('限店主操作');
        }

        const before = ws.exists()
          ? ws.data()
          : {
              principalBalance: 0,
              bonusBalance: 0,
              version: 0
            };

        const p = before.principalBalance;
        const b = before.bonusBalance;

        if (!valid(p) || !valid(b)) {
          throw Error('錢包餘額異常');
        }

        let dp = 0;
        let dbonus = 0;

        if (type === 'topup') {
          dp = principal;
          dbonus = bonus;

        } else if (type === 'debit') {
          if (amount > p + b) {
            throw Error('餘額不足');
          }

          dbonus = -Math.min(amount, b);
          dp = -(amount + dbonus);

        } else if (type === 'refund') {
          if (
            !orig.exists() ||
            orig.data().customerId !== id ||
            orig.data().type !== 'debit' ||
            orig.data().amount !== amount
          ) {
            throw Error('退款僅支援整筆原扣款金額');
          }

          const o = orig.data();

          dp = -o.principalDelta;
          dbonus = -o.bonusDelta;

          const refunded = await tx.get(tr);

          if (refunded.exists()) {
            throw Error('此筆交易已退款');
          }

        } else if (type === 'adjustPlus') {
          dp = amount;

        } else if (type === 'adjustMinus') {
          if (amount > p) {
            throw Error(
              '本金不足；人工減額僅允許扣本金'
            );
          }

          dp = -amount;
        }

        if (
          !valid(p + dp) ||
          !valid(b + dbonus)
        ) {
          throw Error('交易後餘額不合法');
        }

        const next = {
          principalBalance: p + dp,
          bonusBalance: b + dbonus,
          version: (before.version || 0) + 1,
          lastTransactionId: txId,
          updatedAt: f.serverTimestamp(),
          updatedBy: user.uid
        };

        const record = {
          customerId: id,
          type,
          amount,
          principalDelta: dp,
          bonusDelta: dbonus,
          principalBefore: p,
          bonusBefore: b,
          principalAfter: p + dp,
          bonusAfter: b + dbonus,
          version: next.version,
          actorUid: user.uid,
          note,
          payment,
          originalId,
          createdAt: f.serverTimestamp()
        };

        tx.set(wr, next);
        tx.set(tr, record);
      });

      status('交易成功，編號：' + txId);
      await reload();

    } catch (e) {
      status('交易未完成：' + e.message);

    } finally {
      working = false;

      for (const id of [
        'v15Topup',
        'v15Debit',
        'v15Adjust'
      ]) {
        $(id).disabled = false;
      }
    }
  }

  async function start() {
    if (!$('crm_detail')) return;

    const [a, fs, au] = await Promise.all([
      import(
        'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'
      ),
      import(
        'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js'
      ),
      import(
        'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'
      )
    ]);

    f = fs;

    db = f.getFirestore(
      a.getApps().length
        ? a.getApp()
        : a.initializeApp(
            window.XIANG_FIREBASE_CONFIG
          )
    );

    auth = au.getAuth();

    install();

    au.onAuthStateChanged(auth, async u => {
      enabled = false;

      if (!u) return;

      try {
        const s = await f.getDoc(
          f.doc(db, 'staff', u.uid)
        );

        enabled =
          s.exists() &&
          s.data().active === true;

        owner =
          enabled &&
          u.uid === window.XIANG_OWNER_UID &&
          s.data().role === 'owner';

        $('v15Owner').hidden = !owner;

        status(
          enabled
            ? '已登入，請選擇客戶'
            : '未獲授權'
        );

      } catch (e) {
        status(e.message);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start
    );
  } else {
    start();
  }
})();
