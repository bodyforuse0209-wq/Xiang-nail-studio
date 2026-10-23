/** Firebase 12 modular SDK. Only loaded after project configuration is supplied. */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,setDoc,addDoc,updateDoc,deleteDoc,onSnapshot,query,where,serverTimestamp,writeBatch} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
export function createCloud(config,ownerUid){
 const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
 let user=null,profile=null,unsubscribe=[];
 const reset=()=>{unsubscribe.forEach(fn=>fn());unsubscribe=[]};
 return {
  mode:'cloud',
  async login(email,password){return await signInWithEmailAndPassword(auth,email,password)},
  async logout(){await signOut(auth)},
  watch({onSession,onReports,onStaff,onPrices,onError}){
   onAuthStateChanged(auth,async u=>{
     reset();user=u;profile=null;
     if(!u){onSession(null,null);onReports([]);onStaff([]);onPrices({});return}
     try{
       const p=doc(db,'staff',u.uid);let snap=await getDoc(p);
       if(!snap.exists()&&u.uid===ownerUid){await setDoc(p,{name:u.email?.split('@')[0]||'店主',role:'owner',active:true,createdAt:serverTimestamp()});snap=await getDoc(p)}
       if(!snap.exists()||!snap.data().active){onSession(u,null);onError('此帳號尚未獲店主授權或已停用。');return}
       profile=snap.data();onSession(u,profile);
       const owner=profile.role==='owner';
       unsubscribe.push(onSnapshot(owner?collection(db,'reports'):query(collection(db,'reports'),where('artistUid','==',u.uid)),x=>onReports(x.docs.map(d=>({id:d.id,...d.data()}))),onError));
       if(owner){unsubscribe.push(onSnapshot(collection(db,'staff'),x=>onStaff(x.docs.map(d=>({uid:d.id,...d.data()}))),onError))}
       else onStaff([{uid:u.uid,...profile}]);
       unsubscribe.push(onSnapshot(doc(db,'settings','prices'),x=>onPrices(x.exists()?x.data().overrides||{}:{}),onError));
       // Immediate suspension/revocation sync.
       unsubscribe.push(onSnapshot(p,x=>{if(!x.exists()||!x.data().active){onSession(u,null);onError('帳號權限已被停用，請聯絡店主。')}else{profile=x.data();onSession(u,profile)}},onError));
     }catch(e){onError(e.message||String(e));onSession(u,null)}
   },e=>onError(e.message));
  },
  get currentUser(){return user},get profile(){return profile},
  async saveReport(r,id){if(!user||!profile?.active)throw Error('未登入或無權限');let values={...r,artistUid:id?r.artistUid:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid};if(id){const x=doc(db,'reports',id);await updateDoc(x,values);return id}values.createdAt=serverTimestamp();values.createdBy=user.uid;const x=await addDoc(collection(db,'reports'),values);return x.id},
  async removeReport(id){if(profile?.role!=='owner')throw Error('僅店主可以刪除紀錄');await deleteDoc(doc(db,'reports',id))},
  async saveStaff(uid,entry){if(profile?.role!=='owner')throw Error('僅店主可管理員工');let p=doc(db,'staff',uid),s=await getDoc(p);await setDoc(p,{...entry,...(!s.exists()?{createdAt:serverTimestamp()}:{})},{merge:true})},
  async savePrices(overrides){if(profile?.role!=='owner')throw Error('僅店主可修改價格');await setDoc(doc(db,'settings','prices'),{overrides,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true})},
  async importReports(data,onProgress){if(profile?.role!=='owner')throw Error('僅店主可匯入');let total=0;for(let i=0;i<data.length;i+=200){const batch=writeBatch(db),arr=data.slice(i,i+200);for(const x of arr){const id=String(x.legacyId||'').replace(/[^\w-]/g,'_').slice(0,110);if(!id)continue;const ref=doc(db,'reports','legacy_'+id);const exists=await getDoc(ref);if(exists.exists())continue;const record={...x};delete record.legacyId;batch.set(ref,{...record,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:user.uid,updatedBy:user.uid});total++}await batch.commit();onProgress?.(total,data.length)}return total}
 }
}
