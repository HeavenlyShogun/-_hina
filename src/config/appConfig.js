export const appId =
  typeof globalThis.__app_id !== 'undefined'
    ? globalThis.__app_id
    : import.meta.env.VITE_APP_ID || 'genshin-lyre-studio';

const firebaseConfigSource =
  typeof globalThis.__firebase_config !== 'undefined'
    ? globalThis.__firebase_config
    : import.meta.env.VITE_FIREBASE_CONFIG;

export const initialAuthToken =
  typeof globalThis.__initial_auth_token !== 'undefined'
    ? globalThis.__initial_auth_token
    : import.meta.env.VITE_INITIAL_AUTH_TOKEN;

export function getFirebaseConfig() {
  try {
    return firebaseConfigSource ? JSON.parse(firebaseConfigSource) : null;
  } catch (error) {
    console.warn('Firebase Init Error', error);
    return null;
  }
}

export function getFirebaseConfigError() {
  if (!firebaseConfigSource) {
    return '缺少 VITE_FIREBASE_CONFIG，請先在 .env 設定 Firebase Web App config。';
  }

  let firebaseConfig;
  try {
    firebaseConfig = JSON.parse(firebaseConfigSource);
  } catch {
    return 'VITE_FIREBASE_CONFIG 不是合法 JSON，請確認雙引號與大括號格式。';
  }

  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missingFields = requiredFields.filter((field) => !firebaseConfig?.[field]);

  if (missingFields.length > 0) {
    return `Firebase config 缺少欄位：${missingFields.join(', ')}。`;
  }

  return null;
}
