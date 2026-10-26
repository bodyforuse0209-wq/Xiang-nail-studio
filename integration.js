/* 香香村統一管理中心：保留原有 V10.1 程式，新增客戶管理與錢包頁籤 */
(function(){
'use strict';
function init(){
 const nav=document.getElementById('nav');
 const app=document.querySelector('.container.app');
 const bar=document.getElementById('bottomBar');
 if(!nav||!app)return;
 const links=[['customers','♙ 客戶管理','./customers.html'],['wallet','◈ 會員錢包','./wallet.html']];
 const holder=document.createElement('section');
 holder.id='xiangIntegratedPanel';holder.hidden=true;
 holder.style.cssText='max-width:1100px;margin:0 auto;padding:12px 10px 28px';
 const heading=document.createElement('div');heading.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px';
 const title=document.createElement('strong');title.style.cssText='font-size:18px';
 const back=document.createElement('button');back.type='button';back.textContent='← 回智慧估價';back.className='button ghost tiny';
 const frame=document.createElement('iframe');frame.title='香香村整合功能';frame.style.cssText='display:block;width:100%;height:calc(100dvh - 190px);min-height:620px;border:1px solid #e8e0d7;border-radius:14px;background:#faf8f5';
 frame.setAttribute('loading','eager');
 heading.append(title,back);holder.append(heading,frame);app.after(holder);
 const buttons=[];
 function close(){holder.hidden=true;app.hidden=false;if(bar)bar.hidden=false;buttons.forEach(b=>b.classList.remove('active'));frame.removeAttribute('src');window.scrollTo(0,0)}
 back.addEventListener('click',close);
 for(const [id,label,url] of links){
  const b=document.createElement('button');b.type='button';b.className='navbtn';b.textContent=label;
  b.addEventListener('click',()=>{app.hidden=true;holder.hidden=false;if(bar)bar.hidden=true;buttons.forEach(x=>x.classList.remove('active'));b.classList.add('active');title.textContent=label;frame.src=url;window.scrollTo(0,0)});
  nav.append(b);buttons.push(b);
 }
 // 既有估價、回報、看板、店主後台切換時，關閉整合面板
 nav.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',close));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
