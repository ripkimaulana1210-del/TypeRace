# Railway Deployment

Project ini sekarang dideploy sebagai satu aplikasi penuh di Railway.

Railway menjalankan `server.js`, lalu Express akan melayani:

- frontend dari `public/`
- Socket.IO realtime race
- file audio
- model 3D
- endpoint healthcheck `/health`

## 1. Deploy Ke Railway

1. Push repo ke GitHub.
2. Railway > New Project > Deploy from GitHub repo.
3. Pilih repo TypeRace.
4. Railway akan membaca `package.json` dan `railway.json`.
5. Pastikan service punya public domain di Settings > Networking > Generate Domain.

Config yang dipakai:

```txt
Start Command: npm start
Healthcheck Path: /health
```

## 2. Cek Deploy

Setelah deploy, buka:

```txt
https://nama-backend.up.railway.app/health
```

Harus mengembalikan:

```json
{
  "ok": true,
  "service": "typerace-backend"
}
```

Lalu buka domain Railway utamanya untuk menjalankan game.

## 3. Firebase

Firebase Auth berjalan dari domain Railway. Tambahkan domain Railway ke:

```txt
Firebase Console > Authentication > Settings > Authorized domains
```

Contoh:

```txt
typerace-production-8921.up.railway.app
```

Aktifkan provider:

- Email/Password
- Google

Realtime Database rules tetap gunakan panduan di `docs/FIREBASE_SETUP.md`.

## 4. Local Development

Jalankan:

```bash
npm install
npm start
```

Buka:

```txt
http://localhost:3000
```
