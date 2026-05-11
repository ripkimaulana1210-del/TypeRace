# TypeRace 3D

TypeRace 3D adalah game typing race realtime bertema Formula 1. Pemain login, masuk lobby, membuat atau join room, lalu balapan dengan mengetik teks secepat dan seakurat mungkin. Mobil bergerak berdasarkan performa typing, dan room mendukung chat, status online, serta voice open mic.

## Fitur Utama

- Login pengguna dengan Firebase Authentication: Email/Password dan Google.
- Multiplayer realtime memakai Socket.IO.
- Room code 6 karakter untuk invite teman.
- Kapasitas room multiplayer maksimal 8 driver.
- Lobby dengan status grid, lap setting, status mic, dan indikator speaking.
- Mode VS AI dengan pilihan difficulty bot.
- Chat realtime per room memakai Firebase Realtime Database.
- Presence online/offline, mic on/off, dan indikator user sedang berbicara.
- Voice open mic memakai WebRTC dengan Firebase sebagai signaling.
- Visual balapan 3D memakai Three.js.
- Deploy full app di Railway: frontend dan backend jalan dari satu server Express.

## Tech Stack

- Node.js
- Express
- Socket.IO
- Three.js
- Firebase Authentication
- Firebase Realtime Database
- WebRTC
- HTML, CSS, JavaScript

## Prasyarat

Pastikan sudah terpasang:

- Node.js 18 atau lebih baru
- npm
- Akun Firebase
- Akun Railway untuk deployment

## Setup Lokal

1. Clone repository:

```bash
git clone https://github.com/ripkimaulana1210-del/TypeRace.git
cd TypeRace
```

2. Install dependency:

```bash
npm install
```

3. Jalankan server:

```bash
npm start
```

4. Buka aplikasi:

```txt
http://localhost:3000
```

Untuk development dengan auto reload:

```bash
npm run dev
```

## Setup Firebase

Aplikasi membutuhkan Firebase agar login, chat, presence, dan voice berjalan.

1. Buka Firebase Console.
2. Buat project Firebase.
3. Aktifkan Authentication.
4. Aktifkan provider:
   - Email/Password
   - Google
5. Buat Realtime Database.
6. Salin config Web App Firebase ke:

```txt
public/js/firebase-config.js
```

Contoh format file:

```js
export const firebaseConfig = {
  apiKey: '...',
  authDomain: 'project-id.firebaseapp.com',
  databaseURL: 'https://project-id-default-rtdb.firebaseio.com',
  projectId: 'project-id',
  storageBucket: 'project-id.appspot.com',
  messagingSenderId: '...',
  appId: '...'
};
```

7. Tambahkan authorized domain:

```txt
Firebase Console > Authentication > Settings > Authorized domains
```

Untuk local development tambahkan:

```txt
localhost
```

Untuk Railway tambahkan domain deploy, contoh:

```txt
typerace-production-8921.up.railway.app
```

8. Terapkan Realtime Database rules dari:

```txt
docs/FIREBASE_SETUP.md
```

## Cara Pakai Aplikasi

1. Buka website.
2. Login terlebih dahulu dengan Email/Password atau Google.
3. Isi driver name.
4. Pilih mode:
   - Multiplayer
   - VS AI
5. Untuk Multiplayer:
   - Host memilih Create Room.
   - Player lain memilih Join Room dan memasukkan room code.
6. Di lobby:
   - Host mengatur lap.
   - Player dapat memakai chat dan mic.
   - Grid menampilkan jumlah player seperti `2/8`.
7. Host menekan Start Race saat siap.
8. Ketik teks yang tampil di race screen.
9. Lihat hasil race di podium/results screen.

Catatan: aplikasi sekarang dikunci agar flow race hanya bisa digunakan setelah login.

## Voice dan Mic Status

Voice open mic berjalan lewat WebRTC. Firebase Realtime Database dipakai untuk signaling dan presence.

Status yang tampil:

- Mic off
- Mic on
- Speaking
- Voice level indicator

Indikator mic muncul di:

- panel chat/online users
- kartu driver di lobby grid

Browser biasanya hanya mengizinkan akses microphone di HTTPS atau `localhost`.

## Struktur Project

```txt
TypeRace/
|-- server.js
|-- package.json
|-- railway.json
|-- public/
|   |-- index.html
|   |-- css/
|   |   |-- style.css
|   |   `-- f1-theme.css
|   |-- js/
|   |   |-- main.js
|   |   |-- network.js
|   |   |-- firebase-config.js
|   |   |-- firebase-service.js
|   |   |-- game3d.js
|   |   |-- typing.js
|   |   |-- sound.js
|   |   |-- car.js
|   |   |-- camera.js
|   |   `-- track.js
|   |-- audio/
|   `-- models/
|-- docs/
|   |-- FIREBASE_SETUP.md
|   `-- RAILWAY_DEPLOYMENT.md
`-- scripts/
    `-- smoke-test.js
```

## Script npm

```bash
npm start
```

Menjalankan server production/local di port `3000`.

```bash
npm run dev
```

Menjalankan server dengan `nodemon`.

```bash
npm test
```

Menjalankan smoke test untuk memastikan server dan flow room dasar masih berjalan.

## Environment

File contoh:

```txt
.env.example
```

Isi saat ini:

```txt
CLIENT_ORIGIN=http://localhost:3000
```

Railway biasanya otomatis memberi `PORT`, jadi tidak perlu hardcode port.

## Deploy ke Railway

Project ini disiapkan untuk full deploy di Railway. Satu service Railway menjalankan:

- frontend dari folder `public/`
- backend Express
- Socket.IO race server
- endpoint healthcheck `/health`

Langkah singkat:

1. Push repo ke GitHub.
2. Railway > New Project > Deploy from GitHub repo.
3. Pilih repository TypeRace.
4. Pastikan start command:

```txt
npm start
```

5. Pastikan healthcheck path:

```txt
/health
```

6. Generate public domain di Railway.
7. Tambahkan domain Railway ke Firebase Authorized domains.

Panduan detail ada di:

```txt
docs/RAILWAY_DEPLOYMENT.md
```

## Troubleshooting

### Website tidak bisa dibuka

- Pastikan `npm start` sedang berjalan.
- Pastikan port `3000` tidak dipakai aplikasi lain.
- Cek `http://localhost:3000/health`.

### Login Google error

- Pastikan Google provider aktif di Firebase Authentication.
- Pastikan domain sudah masuk Authorized domains.
- Jika popup diblokir, izinkan popup untuk domain aplikasi.

### Chat atau presence tidak jalan

- Pastikan user sudah login.
- Pastikan Realtime Database sudah dibuat.
- Pastikan rules di `docs/FIREBASE_SETUP.md` sudah dipasang.

### Mic tidak bisa aktif

- Pastikan browser mendapat izin microphone.
- Gunakan HTTPS saat deploy.
- Untuk lokal, gunakan `localhost`, bukan IP mentah.

### Player tidak bisa join room

- Pastikan room masih dalam state waiting.
- Pastikan room code benar.
- Room multiplayer maksimal 8 driver.
- Room VS AI tidak bisa dimasuki player lain.

## Catatan Pengembangan

- Jangan deploy frontend dan backend terpisah untuk versi ini. Gunakan full Railway deploy.
- Firebase API key untuk web app memang berada di frontend, tetapi tetap batasi Authorized domains dan database rules.
- Voice memakai WebRTC mesh, jadi beban voice terutama ada di browser pemain, bukan server Node.
- Jika server mulai berat, pertimbangkan menurunkan tick rate race server atau membatasi jumlah room aktif.

## Lisensi

MIT
