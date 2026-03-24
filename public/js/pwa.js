// PWA Install prompt handler
(function () {
  let deferredPrompt = null;

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function getBanner()  { return document.getElementById('pwa-install-banner'); }
  function getInstallBtn() { return document.getElementById('btn-pwa-install'); }
  function getDismissBtn() { return document.getElementById('btn-pwa-dismiss'); }
  function getIOSTip()  { return document.getElementById('pwa-ios-tip'); }
  function getInstallBtnWrap() { return document.getElementById('pwa-install-btn-wrap'); }

  function showBanner() {
    const banner = getBanner();
    if (!banner) return;
    if (sessionStorage.getItem('pwa_dismissed')) return;
    setTimeout(() => banner.classList.add('visible'), 2200);
  }

  function hideBanner() {
    const banner = getBanner();
    if (banner) banner.classList.remove('visible');
  }

  // Android / Chrome / Edge: listen for the native prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner();
  });

  // After install: hide banner
  window.addEventListener('appinstalled', () => {
    hideBanner();
    deferredPrompt = null;
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (isInstalled()) return; // already running as PWA

    const installBtn  = getInstallBtn();
    const dismissBtn  = getDismissBtn();
    const iosTip      = getIOSTip();
    const installWrap = getInstallBtnWrap();

    // iOS: show manual instructions, hide the "Instalar" button
    if (isIOS()) {
      if (iosTip)      iosTip.classList.remove('hidden');
      if (installWrap) installWrap.classList.add('hidden');
      showBanner();
    }

    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      hideBanner();
      if (typeof gta === 'function') gta('pwa_install_' + outcome);
    });

    dismissBtn?.addEventListener('click', () => {
      hideBanner();
      sessionStorage.setItem('pwa_dismissed', '1');
      if (typeof gta === 'function') gta('pwa_install_dismissed');
    });
  });
})();
