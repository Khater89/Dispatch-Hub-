(() => {
  function run(){
    if(!document.body || document.body.dataset.dhGlassInit) return;
    document.body.dataset.dhGlassInit='1';
    document.querySelectorAll('.glass,.glass-card,.glass-panel,.glass-header,.glass-toolbar,.table-wrap.glass').forEach(el=>{ el.classList.add('dh-fx-card','dh-reveal'); });
    document.querySelectorAll('.hero,.header,.topbar,.glass-header').forEach(el=>{ if(el.dataset.dhParallax) return; el.dataset.dhParallax='1'; el.addEventListener('pointermove',e=>{ const r=el.getBoundingClientRect(); if(!r.width||!r.height) return; const x=((e.clientX-r.left)/r.width-.5)*6; const y=((e.clientY-r.top)/r.height-.5)*4; el.style.transform=`translate3d(${x*0.2}px,${y*0.2}px,0)`;}); el.addEventListener('pointerleave',()=>el.style.transform=''); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();
