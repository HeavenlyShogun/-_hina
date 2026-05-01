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

const FIREBASE_REQUIRED_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

function readFirebaseConfigFromFields() {
  const fieldMap = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const hasAnyField = Object.values(fieldMap).some(Boolean);
  return hasAnyField ? fieldMap : null;
}

function parseFirebaseConfig(source) {
  if (!source) {
    return readFirebaseConfigFromFields();
  }

  if (typeof source === 'object') {
    return source;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    console.warn('Firebase Init Error', error);
    return null;
  }
}

export function getFirebaseConfig() {
  return parseFirebaseConfig(firebaseConfigSource);
}

export function getFirebaseConfigError() {
  const firebaseConfig = getFirebaseConfig();

  if (!firebaseConfigSource && !firebaseConfig) {
    return '缺少 Firebase 設定。請在 .env 設定 `VITE_FIREBASE_CONFIG`，或改用 `VITE_FIREBASE_API_KEY` 等拆欄位變數。';
  }

  if (!firebaseConfig) {
    return 'VITE_FIREBASE_CONFIG 不是合法 JSON。請確認內容是單行 JSON，且欄位名稱與字串值都使用雙引號。';
  }

  const missingFields = FIREBASE_REQUIRED_FIELDS.filter((field) => !firebaseConfig[field]);

  if (missingFields.length > 0) {
    return `Firebase config 缺少必要欄位：${missingFields.join(', ')}。`;
  }

  return null;
}
