// Mobile header behavior: keep navigation handy without the large logo row taking over the screen.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 760px) {
      .topbar {
        transition: box-shadow .18s ease;
      }
      .topinner {
        display: grid !important;
        grid-template-columns: 1fr auto;
        gap: 8px 10px !important;
        padding: 10px 12px 6px !important;
      }
      .topinner > .brand,
      .topinner > .linkbtn {
        max-height: 34px;
        opacity: 1;
        overflow: hidden;
        transform: translateY(0);
        transition: max-height .2s ease, opacity .16s ease, transform .2s ease, margin .2s ease, padding .2s ease;
      }
      .topinner > nav {
        grid-column: 1 / -1;
        order: initial !important;
        width: 100%;
        margin: 0;
        padding: 2px 0 4px;
        gap: 4px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .topinner > nav::-webkit-scrollbar { display: none; }
      .navbtn {
        padding: 8px 9px !important;
        font-size: 13px;
      }
      .topbar.mobile-scrolled .topinner {
        padding-top: 5px !important;
      }
      .topbar.mobile-scrolled .topinner > .brand,
      .topbar.mobile-scrolled .topinner > .linkbtn {
        max-height: 0;
        opacity: 0;
        transform: translateY(-8px);
        margin: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        pointer-events: none;
      }
      .topbar.mobile-scrolled {
        box-shadow: 0 8px 22px rgba(0,0,0,.22);
      }
    }
  `;
  document.head.appendChild(style);

  const update = () => {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    bar.classList.toggle('mobile-scrolled', mobile && window.scrollY > 28);
  };

  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  };

  window.addEventListener('scroll', requestUpdate, {passive:true});
  window.addEventListener('resize', requestUpdate, {passive:true});
  window.addEventListener('orientationchange', requestUpdate, {passive:true});
  update();
})();
