/* Shared dismissible overview shell. Closing never stops or changes a journey. */
(function(root){
 'use strict';
 function create({host,content,key='circuits',onShow=()=>{},onHide=()=>{}}){
  const storageKey='admira.cenital.closed.'+key;
  host.classList.add('cenital-host');
  const panel=document.createElement('section');panel.className='cenital-panel';panel.setAttribute('aria-label','Plano cenital');
  const bar=document.createElement('div');bar.className='cenital-heading';
  const title=document.createElement('span');title.textContent='Plano cenital';
  const close=document.createElement('button');close.type='button';close.className='cenital-close';close.textContent='×';close.setAttribute('aria-label','Cerrar plano cenital');
  const body=document.createElement('div');body.className='cenital-body';body.append(content);
  const reopen=document.createElement('button');reopen.type='button';reopen.className='cenital-reopen';reopen.textContent='Mostrar plano';reopen.setAttribute('aria-label','Mostrar plano cenital');
  bar.append(title,close);panel.append(bar,body);host.append(panel,reopen);
  let hidden=false;try{hidden=sessionStorage.getItem(storageKey)==='1';}catch{}
  function render(focus=false){panel.hidden=hidden;reopen.hidden=!hidden;reopen.setAttribute('aria-expanded',String(!hidden));if(hidden)onHide();else onShow();if(focus)(hidden?reopen:close).focus();}
  function setHidden(value){hidden=value;try{sessionStorage.setItem(storageKey,hidden?'1':'0');}catch{}render(true);}
  close.addEventListener('click',()=>setHidden(true));reopen.addEventListener('click',()=>setHidden(false));render();
  return {get visible(){return !hidden;},show(){setHidden(false);},hide(){setHidden(true);},destroy(){host.replaceChildren();}};
 }
 root.CenitalPanel={create};
})(typeof globalThis!=='undefined'?globalThis:this);
