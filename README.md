# lembar-legal

Isi situs statis **catetan.gampil.id** untuk aplikasi Lembar: beranda dan kebijakan privasi.
Disajikan oleh Nginx di VPS pengembang dari clone repo ini di `/var/www/lembar`.
Kode aplikasi Android ada di repo private terpisah.

- Beranda: https://catetan.gampil.id/
- Kebijakan privasi: https://catetan.gampil.id/privacy/
- app-ads.txt (verifikasi AdMob): https://catetan.gampil.id/app-ads.txt

Update situs setelah ada perubahan di repo ini:

```bash
cd /var/www/lembar && sudo git pull
```

## Konfigurasi Nginx

`/etc/nginx/sites-available/lembar`:

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
Cek: `sudo grep -c "access_log off" /etc/nginx/sites-available/lembar` harus sama dengan jumlah blok `server {`.
