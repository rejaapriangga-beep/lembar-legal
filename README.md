# lembar-legal

Isi situs **catetan.gampil.id**: **Lembar versi web** (aplikasi catatan), kebijakan privasi, dan
`app-ads.txt`. Disajikan Nginx di VPS pengembang dari clone repo ini di `/var/www/lembar`.
Kode aplikasi Android ada di repo private terpisah.

- Aplikasi web: https://catetan.gampil.id/
- Kebijakan privasi: https://catetan.gampil.id/privacy/
- app-ads.txt (verifikasi AdMob): https://catetan.gampil.id/app-ads.txt

## Lembar versi web

HTML, CSS, dan JavaScript biasa tanpa langkah build (`index.html`, `assets/`, `sw.js`,
`manifest.json`). Catatan disimpan di IndexedDB browser; tidak ada server atau akun.
Format cadangan `.lembar` (termasuk yang berpassword) sama dengan aplikasi Android.

- Iklan AdSense: isi `ADSENSE_CLIENT` dan `ADSENSE_SLOT` di `assets/js/ads.js` setelah situs
  disetujui AdSense. Selama kosong, tidak ada iklan yang dimuat.
- Setiap mengubah berkas aplikasi, naikkan `VERSION` di `sw.js` supaya pengguna mendapat versi baru.
- Coba lokal: `python3 -m http.server` lalu buka http://localhost:8000.

Update situs setelah ada perubahan di repo ini:

```bash
cd /var/www/lembar && sudo git pull
```

## Konfigurasi Nginx

`/etc/nginx/sites-available/lembar.my.id`:

```nginx
# Situs utama
server {
    listen 80;
    server_name catetan.gampil.id;
    access_log off;   # alamat IP pengunjung tidak dicatat
    root /var/www/lembar;
    index index.html;
    location / { try_files $uri $uri/ =404; }
    location ~ /\.git { deny all; }
}

# Domain lama dialihkan permanen ke domain baru
server {
    listen 80;
    server_name lembar.my.id www.lembar.my.id;
    access_log off;
    return 301 https://catetan.gampil.id$request_uri;
}
```

HTTPS untuk kedua domain: `sudo certbot --nginx -d catetan.gampil.id -d lembar.my.id -d www.lembar.my.id`.

Certbot menambahkan blok pengalihan http→https tanpa `access_log off`. Setelah certbot, tambahkan
`access_log off;` di bawah setiap `server_name` yang belum memilikinya, lalu `sudo nginx -t && sudo systemctl reload nginx`.
Cek: `sudo grep -c "access_log off" /etc/nginx/sites-available/lembar.my.id` harus sama dengan jumlah blok `server {`.
