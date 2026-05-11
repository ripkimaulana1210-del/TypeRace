export const firebaseConfig = {
  apiKey: 'AIzaSyDWA_KZj2yETCOO3wUkTxQ9fPHwo0nwqI0',
  authDomain: 'typeracef1.firebaseapp.com',
  databaseURL: 'https://typeracef1-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'typeracef1',
  storageBucket: 'typeracef1.firebasestorage.app',
  messagingSenderId: '755744245667',
  appId: '1:755744245667:web:53da1736cc4699a61d7c16',
  measurementId: 'G-HCYK1QYCSN'
};

const requiredKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];

export const isFirebaseConfigured = requiredKeys.every((key) => {
  const value = String(firebaseConfig[key] || '').trim();
  return value && !value.includes('YOUR_') && !value.includes('PASTE_');
});
