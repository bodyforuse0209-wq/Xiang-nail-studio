/* XIANG V14: repair UTF-8 text that was decoded as Latin-1 in the integration script. */
(()=>{
  'use strict';
  const decoder = new TextDecoder('utf-8', {fatal:true});
  function repair(value){
    if(!value || !/[\u0080-\u00ff]/.test(value)) return value;
    return value.replace(/[\u0080-\u00ff]{2,}/g, segment=>{
      try{
        const bytes=Uint8Array.from(segment,ch=>ch.charCodeAt(0));
        return decoder.decode(bytes);
      }catch{return segment;}
    });
  }
  function scan(root){
    if(!root || !(root instanceof Node))return;
    if(root.nodeType===Node.TEXT_NODE){
      const fixed=repair(root.nodeValue);
      if(fixed!==root.nodeValue)root.nodeValue=fixed;
      return;
    }
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    if(root.matches('script,style'))return;
    for(const name of ['placeholder','title','aria-label']){
      if(root.hasAttribute(name)){
        const v=root.getAttribute(name),f=repair(v);
        if(v!==f)root.setAttribute(name,f);
      }
    }
    for(const child of Array.from(root.childNodes))scan(child);
  }
  function start(){
    const root=document.body;
    scan(root);
    let working=false;
    const observer=new MutationObserver(records=>{
      if(working)return;
      working=true;
      observer.disconnect();
      for(const r of records){
        if(r.type==='characterData')scan(r.target);
        else if(r.type==='attributes')scan(r.target);
        else for(const node of r.addedNodes)scan(node);
      }
      observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
      working=false;
    });
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
