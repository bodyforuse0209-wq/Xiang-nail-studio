
/** 香香村美妍製造所 V10 — Firebase Cloud */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';

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
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

export function createCloud(config, ownerUid) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let user = null;
  let profile = null;
  let unsubscribe = [];

  const reset = () => {
    unsubscribe.forEach(fn => fn());
    unsubscribe = [];
  };

  return {
    mode: 'cloud',

    async login(email, password) {
      return await signInWithEmailAndPassword(auth, email, password);
    },

    async logout() {
      await signOut(auth);
    },

    watch({ onSession, onReports, onStaff, onPrices, onError }) {
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

            // 初次登入時，允許指定的店主建立自己的資料。
            if (!snap.exists() && u.uid === ownerUid) {
              await setDoc(p, {
                name: '村長夢娜',
                role: 'owner',
                active: true,
                createdAt: serverTimestamp()
              });

              snap = await getDoc(p);
            }

            if (!snap.exists() || !snap.data().active) {
              onSession(u, null);
              onError('此帳號尚未獲店主授權或已停用。');
              return;
            }

            profile = snap.data();
            onSession(u, profile);

            const owner = profile.role === 'owner';

            // 營業紀錄：店主看全部，美甲師只看自己的。
            unsubscribe.push(
              onSnapshot(
                owner
                  ? collection(db, 'reports')
                  : query(
                      collection(db, 'reports'),
                      where('artistUid', '==', u.uid)
                    ),
                snapshot => {
                  onReports(
                    snapshot.docs.map(d => ({
                      id: d.id,
                      ...d.data()
                    }))
                  );
                },
                onError
              )
            );

            // 員工清單：以 Firestore 文件 ID 為準。
            // 避免文件內的 uid 欄位覆蓋真正的帳號識別。
            if (owner) {
              unsubscribe.push(
                onSnapshot(
                  collection(db, 'staff'),
                  snapshot => {
                    const unique = new Map();

                    snapshot.docs.forEach(d => {
                      const data = d.data();
                      const uid = d.id;

                      unique.set(uid, {
                        ...data,
                        uid
                      });
                    });

                    onStaff([...unique.values()]);
                  },
                  onError
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

            // 雲端價格。
            unsubscribe.push(
              onSnapshot(
                doc(db, 'settings', 'prices'),
                snapshot => {
                  onPrices(
                    snapshot.exists()
                      ? snapshot.data().overrides || {}
                      : {}
                  );
                },
                onError
              )
            );

            // 即時確認帳號是否仍有權限。
            unsubscribe.push(
              onSnapshot(
                p,
                snapshot => {
                  if (!snapshot.exists() || !snapshot.data().active) {
                    profile = null;
                    onSession(u, null);
                    onError('帳號權限已被停用，請聯絡店主。');
                  } else {
                    profile = snapshot.data();
                    onSession(u, profile);
                  }
                },
                onError
              )
            );
          } catch (e) {
            onError(e.message || String(e));
            onSession(u, null);
          }
        },
        e => onError(e.message)
      );
    },

    get currentUser() {
      return user;
    },

    get profile() {
      return profile;
    },

    // 新增或修改營業紀錄。
    async saveReport(r, id) {
      if (!user || !profile?.active) {
        throw Error('未登入或無權限');
      }

      const values = {
        ...r,
        artistUid: id ? r.artistUid : user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };

      if (id) {
        const ref = doc(db, 'reports', id);
        await updateDoc(ref, values);
        return id;
      }

      values.createdAt = serverTimestamp();
      values.createdBy = user.uid;

      const ref = await addDoc(
        collection(db, 'reports'),
        values
      );

      return ref.id;
    },

    // 刪除營業紀錄。
    async removeReport(id) {
      if (profile?.role !== 'owner') {
        throw Error('僅店主可以刪除紀錄');
      }

      await deleteDoc(doc(db, 'reports', id));
    },

    // 新增或修改員工權限。
    async saveStaff(uid, entry) {
      if (profile?.role !== 'owner') {
        throw Error('僅店主可管理員工');
      }

      const ref = doc(db, 'staff', uid);
      const snap = await getDoc(ref);

      await setDoc(
        ref,
        {
          ...entry,
          ...(!snap.exists()
            ? { createdAt: serverTimestamp() }
            : {})
        },
        { merge: true }
      );
    },

    // 儲存雲端價目表。
    async savePrices(overrides) {
      if (profile?.role !== 'owner') {
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

    // 匯入舊版營業紀錄。
    async importReports(data, onProgress) {
      if (profile?.role !== 'owner') {
        throw Error('僅店主可匯入');
      }

      let total = 0;

      for (let i = 0; i < data.length; i += 200) {
        const batch = writeBatch(db);
        const arr = data.slice(i, i + 200);

        for (const x of arr) {
          const id = String(x.legacyId || '')
            .replace(/[^\w-]/g, '_')
            .slice(0, 110);

          if (!id) continue;

          const ref = doc(db, 'reports', 'legacy_' + id);
          const existing = await getDoc(ref);

          if (existing.exists()) continue;

          const record = { ...x };
          delete record.legacyId;

          batch.set(ref, {
            ...record,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
            updatedBy: user.uid
          });

          total++;
        }

        await batch.commit();
        onProgress?.(total, data.length);
      }

      return total;
    }
  };
}
