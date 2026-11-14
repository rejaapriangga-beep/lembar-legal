// Banner Google AdSense di baris paling bawah halaman daftar catatan.
// Selama ADSENSE_CLIENT / ADSENSE_SLOT kosong (situs belum disetujui AdSense), tidak ada iklan
// yang dimuat dan tidak ada ruang kosong yang ditampilkan.

export const ADSENSE_CLIENT = ''; // contoh: 'ca-pub-6278959551618441'
export const ADSENSE_SLOT = '';   // ID unit iklan display dari AdSense

let scriptLoaded = false;

export function adsEnabled() {
  return Boolean(ADSENSE_CLIENT && ADSENSE_SLOT);
}

/** Mengisi wadah dengan satu unit iklan responsif. Dipanggil sekali per wadah. */
export function mountAd(container) {
  if (!adsEnabled() || container.dataset.mounted) return;
  container.dataset.mounted = '1';
  if (!scriptLoaded) {
    scriptLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    document.head.append(s);
  }
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = ADSENSE_CLIENT;
  ins.dataset.adSlot = ADSENSE_SLOT;
  ins.dataset.adFormat = 'horizontal';
  ins.dataset.fullWidthResponsive = 'true';
  container.append(ins);
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}
