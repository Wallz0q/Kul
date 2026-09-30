# SC UNSERBOT TARGET V2

Telegram userbot Node.js dengan target grup, Auto-Share terkontrol, Owner ID, dan Premium/User Allowlist.

## Akses

Hanya `OWNER_ID` dan user yang ditambahkan sebagai Premium yang dapat menjalankan command userbot.

Owner dapat mengelola Premium:
- `/addpremium <user_id>`
- `/delpremium <user_id>`
- `/premiumlist`

Command:
- `/menu`
- `/groups`
- `/shareadd <nomor>`
- `/sharedel <nomor>`
- `/sharelist`
- `/sharemsg <pesan>`
- `/shareint <detik>`
- `/shareon`
- `/shareoff`
- `/status`

Owner/Premium juga bisa menggunakan command lainnya.

## Install

```bash
npm install
cp .env.example .env
nano .env
npm start
```

Isi `OWNER_ID` dengan Telegram numeric user ID milik owner. Jangan membagikan session.txt, API Hash, atau file .env.

Grup baru dapat terdeteksi otomatis, tetapi tidak otomatis dijadikan target.

Gunakan Auto-Share hanya pada grup yang memang Anda berwenang/diizinkan untuk kirimi pesan.
