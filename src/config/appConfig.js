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
