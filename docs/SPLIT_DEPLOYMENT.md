# Split Deployment: Vercel Frontend + Render Backend

Project ini bisa dipisah menjadi:

- Frontend static di Vercel: `public/`
- Backend realtime di Render/Railway: `server.js`
- Firebase tetap untuk login, chat, presence, dan voice signaling.

## 1. Deploy Backend Ke Render

1. Push repo ke GitHub.
2. Render > New > Web Service.
3. Pilih repo TypeRace.
4. Set:

```txt
Runtime: Node
Build Command: npm ci
Start Command: npm start
```

5. Environment variable backend:

```txt
CLIENT_ORIGIN=https://nama-project.vercel.app
```

Untuk awal boleh pakai `CLIENT_ORIGIN=*`, tapi production lebih baik isi domain frontend Vercel.

6. Setelah deploy, cek:

```txt
https://nama-backend.onrender.com/health
```

Harus mengembalikan JSON `ok: true`.

## 2. Deploy Frontend Ke Vercel

1. Vercel > Add New Project.
2. Import repo yang sama.
3. Vercel akan membaca `vercel.json`.
4. Set environment variable frontend:

```txt
TYPERACE_SOCKET_URL=https://nama-backend.onrender.com
```

5. Deploy.

Build Vercel akan menjalankan:

```bash
npm run build:frontend
```

Script itu membuat `public/js/runtime-config.js`, sehingga frontend tahu alamat backend Socket.IO.

## 3. Firebase Yang Perlu Diatur

Firebase Auth berjalan dari domain frontend, jadi tambahkan domain Vercel ke:

```txt
Firebase Console > Authentication > Settings > Authorized domains
```

Tambahkan:

```txt
nama-project.vercel.app
```

Kalau pakai custom domain, tambahkan juga domain itu.

Realtime Database rules tetap gunakan panduan di `docs/FIREBASE_SETUP.md`.

## 4. Local Development

Jalankan backend lokal:

```bash
npm install
npm start
```

Buka:

```txt
http://localhost:3000
```

Untuk mencoba frontend static yang diarahkan ke backend lain, isi `TYPERACE_SOCKET_URL`, lalu jalankan:

```bash
npm run build:frontend
```

## 5. Catatan Penting

- Jangan deploy `server.js` sebagai Vercel Function untuk multiplayer utama.
- Frontend Vercel menggunakan Socket.IO client dari CDN.
- Three.js juga menggunakan CDN supaya frontend static tidak bergantung pada route `/vendor/three` dari Express.
- Backend Render tetap bisa serve frontend juga untuk testing, tapi domain utama user bisa memakai Vercel.
