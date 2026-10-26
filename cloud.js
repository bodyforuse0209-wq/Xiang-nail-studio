
/**
 * XIANG BEAUTY STUDIO
 * 香香村美妍製造所
 * V10.2 Firebase Cloud
 *
 * 員工業績與抽成管理
 */

import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

export function createCloud(config, ownerUid) {

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let user = null;
  let profile = null;
  let unsubscribe = [];

  const DEFAULT_RATE = 40;

  function reset() {
    unsubscribe.forEach(fn => fn());
    unsubscribe = [];
  }

  function requireLogin() {
    if (!user || !profile?.active) {
      throw Error('未登入或帳號未獲授權');
    }
  }

  function isOwner() {
    return profile?.role === 'owner';
  }

  function calculateCommission(record) {

    const rate = Number(
      record.commissionRate ?? DEFAULT_RATE
    );

    const amount = Number(record.amount);

    if (
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100
    ) {
      throw Error('抽成比例必須介於 0%～100%');
    }

    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 10000000
    ) {
      throw Error('成交金額不正確');
    }

    const roundedAmount = Math.round(amount);

    const commissionAmount = Math.round(
      roundedAmount * rate / 100
    );

    return {
      amount: roundedAmount,
      commissionRate: rate,
      commissionAmount,
      storeAmount:
        roundedAmount - commissionAmount
    };
  }

  return {

    mode: 'cloud',

    async login(email, password) {
      return signInWithEmailAndPassword(
        auth,
        email,
        password
      );
    },

    async logout() {
      await signOut(auth);
    },

    watch({
      onSession,
      onReports,
      onStaff,
      onPrices,
      onError
    }) {

      onAuthStateChanged(
        auth,
        async u => {

          reset();
          user = u;
          profile = null;

          if (!u) {
            onSession(null, null);
            onReports([]);
            onStaff([]);
            onPrices({});
            return;
          }

          try {

            const p = doc(db, 'staff', u.uid);
            let snap = await getDoc(p);

            // 指定店主首次登入建立資料
            if (
              !snap.exists() &&
              u.uid === ownerUid
            ) {

              await setDoc(p, {
                name: '村長夢娜',
                role: 'owner',
                active: true,
                createdAt: serverTimestamp()
              });

              snap = await getDoc(p);
            }

            if (
              !snap.exists() ||
              !snap.data().active
            ) {

              onSession(u, null);

              onError(
                '此帳號尚未獲店主授權或已停用。'
              );

              return;
            }

            profile = snap.data();

            onSession(u, profile);

            const owner =
              profile.role === 'owner';

            // 業績即時同步
            unsubscribe.push(
              onSnapshot(

                owner
                  ? collection(db, 'reports')
                  : query(
                      collection(db, 'reports'),
                      where(
                        'artistUid',
                        '==',
                        u.uid
                      )
                    ),

                snapshot => {

                  onReports(
                    snapshot.docs.map(d => ({
                      id: d.id,
                      ...d.data()
                    }))
                  );

                },

                e => onError(
                  e.message || String(e)
                )
              )
            );

            // 店主可查看所有員工
            if (owner) {

              unsubscribe.push(
                onSnapshot(

                  collection(db, 'staff'),

                  snapshot => {

                    const unique = new Map();

                    snapshot.docs.forEach(d => {

                      unique.set(d.id, {
                        ...d.data(),
                        uid: d.id
                      });

                    });

                    onStaff([
                      ...unique.values()
                    ]);

                  },

                  e => onError(
                    e.message || String(e)
                  )
                )
              );

            } else {

              onStaff([
                {
                  ...profile,
                  uid: u.uid
                }
              ]);

            }

            // 雲端價格
            unsubscribe.push(
              onSnapshot(

                doc(db, 'settings', 'prices'),

                snapshot => {

                  onPrices(
                    snapshot.exists()
                      ? snapshot.data()
                          .overrides || {}
                      : {}
                  );

                },

                e => onError(
                  e.message || String(e)
                )
              )
            );

            // 監控員工帳號權限
            unsubscribe.push(
              onSnapshot(

                p,

                snapshot => {

                  if (
                    !snapshot.exists() ||
                    !snapshot.data().active
                  ) {

                    profile = null;

                    onSession(u, null);

                    onError(
                      '帳號權限已停用，請聯絡店主。'
                    );

                  } else {

                    profile = snapshot.data();

                    onSession(u, profile);

                  }

                },

                e => onError(
                  e.message || String(e)
                )
              )
            );

          } catch (error) {

            onError(
              error.message || String(error)
            );

            onSession(u, null);

          }

        },

        e => onError(
          e.message || String(e)
        )
      );
    },

    get currentUser() {
      return user;
    },

    get profile() {
      return profile;
    },

    // 新增或修改業績
    async saveReport(record, id) {

      requireLogin();

      const commission =
        calculateCommission(record);

      const values = {
        ...record,
        ...commission,
        schemaVersion: 11,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };

      // 新增紀錄
      if (!id) {

        values.artistUid = user.uid;
        values.createdBy = user.uid;
        values.createdAt = serverTimestamp();
        values.settlementLocked = false;

        const ref = await addDoc(
          collection(db, 'reports'),
          values
        );

        return ref.id;
      }

      // 修改紀錄
      const ref = doc(db, 'reports', id);

      await runTransaction(
        db,
        async transaction => {

          const snapshot =
            await transaction.get(ref);

          if (!snapshot.exists()) {
            throw Error('找不到這筆業績紀錄');
          }

          const existing = snapshot.data();

          if (
            !isOwner() &&
            existing.artistUid !== user.uid
          ) {
            throw Error(
              '不能修改其他美甲師的業績'
            );
          }

          if (
            existing.settlementLocked === true
          ) {
            throw Error(
              '此筆業績已結算，不能修改'
            );
          }

          // 保留原本的員工與建立資訊
          const update = {
            ...values,
            artistUid: existing.artistUid,
            createdBy: existing.createdBy,
            settlementLocked:
              existing.settlementLocked || false
          };

          delete update.createdAt;

          // 修改歷史
          const auditRef = doc(
            collection(db, 'reportAudits')
          );

          transaction.update(ref, update);

          transaction.set(auditRef, {

            reportId: id,
            action: 'update',
            actorUid: user.uid,
            artistUid: existing.artistUid,

            before: {
              amount: existing.amount ?? 0,
              commissionRate:
                existing.commissionRate ?? 40,
              commissionAmount:
                existing.commissionAmount ?? 0,
              status: existing.status ?? ''
            },

            after: {
              amount: commission.amount,
              commissionRate:
                commission.commissionRate,
              commissionAmount:
                commission.commissionAmount,
              status: values.status
            },

            createdAt: serverTimestamp()

          });

        }
      );

      return id;
    },

    // 刪除業績
    async removeReport(id) {

      requireLogin();

      if (!isOwner()) {
        throw Error('僅店主可刪除業績');
      }

      const ref = doc(db, 'reports', id);

      await runTransaction(
        db,
        async transaction => {

          const snapshot =
            await transaction.get(ref);

          if (!snapshot.exists()) {
            throw Error('紀錄不存在');
          }

          const existing = snapshot.data();

          if (
            existing.settlementLocked === true
          ) {
            throw Error(
              '已結算的業績不可刪除'
            );
          }

          const auditRef = doc(
            collection(db, 'reportAudits')
          );

          transaction.set(auditRef, {

            reportId: id,
            action: 'delete',
            actorUid: user.uid,
            artistUid: existing.artistUid,

            before: {
              date: existing.date ?? '',
              amount: existing.amount ?? 0,
              commissionRate:
                existing.commissionRate ?? 40,
              status: existing.status ?? ''
            },

            createdAt: serverTimestamp()

          });

          transaction.delete(ref);

        }
      );
    },

    // 員工權限管理
    async saveStaff(uid, entry) {

      requireLogin();

      if (!isOwner()) {
        throw Error('僅店主可管理員工');
      }

      const ref = doc(db, 'staff', uid);
      const snap = await getDoc(ref);

      await setDoc(
        ref,
        {
          ...entry,
          ...(
            !snap.exists()
              ? {
                  createdAt:
                    serverTimestamp()
                }
              : {}
          )
        },
        { merge: true }
      );
    },

    // 雲端價格管理
    async savePrices(overrides) {

      requireLogin();

      if (!isOwner()) {
        throw Error('僅店主可修改價格');
      }

      await setDoc(
        doc(db, 'settings', 'prices'),
        {
          overrides,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        },
        { merge: true }
      );
    },

    // 舊版紀錄匯入
    async importReports(data, onProgress) {

      requireLogin();

      if (!isOwner()) {
        throw Error('僅店主可匯入資料');
      }

      let total = 0;

      for (
        let i = 0;
        i < data.length;
        i += 200
      ) {

        const batch = writeBatch(db);
        const arr = data.slice(i, i + 200);

        for (const x of arr) {

          const id = String(
            x.legacyId || ''
          )
            .replace(/[^\w-]/g, '_')
            .slice(0, 110);

          if (!id) continue;

          const ref = doc(
            db,
            'reports',
            'legacy_' + id
          );

          const existing =
            await getDoc(ref);

          if (existing.exists()) {
            continue;
          }

          const record = { ...x };

          delete record.legacyId;

          const commission =
            calculateCommission(record);

          batch.set(ref, {
            ...record,
            ...commission,
            schemaVersion: 11,
            settlementLocked: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
            updatedBy: user.uid
          });

          total++;
        }

        await batch.commit();

        onProgress?.(
          total,
          data.length
        );
      }

      return total;
    }
  };
}
