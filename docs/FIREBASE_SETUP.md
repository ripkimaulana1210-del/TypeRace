# Firebase Setup

Fitur akun, chat realtime, status online/offline, dan voice open mic memakai Firebase Authentication + Realtime Database di sisi client.

## 1. Buat Firebase app

1. Buka Firebase Console dan buat project.
2. Aktifkan Authentication dengan provider Google.
3. Buat Realtime Database.
4. Dari Project settings > Your apps > Web app, salin config ke `public/js/firebase-config.js`.

Contoh bentuk config:

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

## 2. Realtime Database rules

Pakai rules ini sebagai baseline development. Chat dan presence bisa dibaca user yang sudah login. Sinyal voice hanya bisa dibaca penerima sinyal.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "rooms": {
      "$roomCode": {
        "messages": {
          ".read": "auth != null",
          "$messageId": {
            ".write": "auth != null && newData.child('uid').val() === auth.uid",
            ".validate": "newData.hasChildren(['uid', 'name', 'text', 'createdAt']) && newData.child('text').isString() && newData.child('text').val().length <= 500"
          }
        },
        "presence": {
          ".read": "auth != null",
          "$uid": {
            ".write": "auth != null && auth.uid === $uid"
          }
        },
        "voice": {
          "peers": {
            ".read": "auth != null",
            "$uid": {
              ".write": "auth != null && auth.uid === $uid"
            }
          },
          "signals": {
            "$uid": {
              ".read": "auth != null && auth.uid === $uid",
              "$signalId": {
                ".write": "auth != null && newData.child('from').val() === auth.uid"
              }
            }
          }
        }
      }
    }
  }
}
```

## 3. Authorized domains

Tambahkan domain deploy kamu di:

```txt
Firebase Console > Authentication > Settings > Authorized domains
```

Contoh:

```txt
localhost
typerace-ashen.vercel.app
```

## 4. Catatan voice

Open mic memakai WebRTC mesh dengan Firebase Realtime Database sebagai signaling. Browser biasanya meminta HTTPS untuk mikrofon, kecuali di `localhost`.
