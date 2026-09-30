# Firebase Storage production setup

## Built-in score library

Firebase Hosting builds remove the bundled `score-library/slim-json` files and set each manifest entry to its Firebase Storage `storagePath`. The web app reads those objects with the Firebase client SDK. `storage.rules` allows public reads for that path and rejects client writes.

Upload the 47 validated slim scores with the Admin SDK:

1. Select Firebase project `guilty-corn` and its Storage bucket in the deployment environment.
2. Provide Google Application Default Credentials with Storage Object Creator/Viewer access to that bucket. For local work, set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON kept outside this repository. In CI, prefer workload identity or the CI platform's secret store.
3. Set `FIREBASE_PROJECT_ID=guilty-corn` and `FIREBASE_STORAGE_BUCKET` to the exact bucket name. The uploader refuses to run if the project ID is missing or differs.
4. Run `npm run scores:upload:storage -- --dry-run`, then `npm run scores:upload:storage` to upload to `score-library/slim-json/`.

Never commit Admin credentials. `VITE_FIREBASE_*` values are client configuration included in browser builds; they are not Admin credentials and must not be used to grant privileged access.

## Production web build

Provide the six `VITE_FIREBASE_*` client values from the Firebase project's Web App configuration to the Firebase Hosting build environment. Set `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_STORAGE_BUCKET` to the same project and bucket used by the Admin upload. Build with `npm run build:firebase`; Firebase Hosting's predeploy uses this command.

## Shared user scores

User scores and public shares use Firebase Auth and Firestore. Large score payloads are placed in Storage under the authenticated user's `artifacts/{appId}/users/{uid}/scores/...` path; Firestore stores the owner and share metadata. Storage and Firestore security rules enforce owner writes and public share reads. Public sharing does not require Admin credentials in the browser.
