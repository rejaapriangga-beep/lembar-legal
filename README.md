# lembar-legal

Isi situs statis **catetan.gampil.id** untuk aplikasi Lembar: beranda dan kebijakan privasi.
Disajikan oleh Nginx di VPS pengembang dari clone repo ini di `/var/www/lembar`.
Kode aplikasi Android ada di repo private terpisah.

- Beranda: https://catetan.gampil.id/
- Kebijakan privasi: https://catetan.gampil.id/privacy/

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
    root /var/www/lembar;
    index index.html;
    location / { try_files $uri $uri/ =404; }
    location ~ /\.git { deny all; }
}

# Domain lama dialihkan permanen ke domain baru
server {
    listen 80;
    server_name lembar.my.id www.lembar.my.id;
    return 301 https://catetan.gampil.id$request_uri;
}
```

HTTPS untuk kedua domain: `sudo certbot --nginx -d catetan.gampil.id -d lembar.my.id -d www.lembar.my.id`.
