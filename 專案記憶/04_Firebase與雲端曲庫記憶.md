# Firebase 與雲端曲庫記憶

最後更新：2026-05-29

本檔記錄 Firebase 設定、Auth、Firestore 曲庫與上傳限制。

## Firebase 專案資訊

- Firebase project：`guilty-corn`
- Firebase Hosting public dir：`dist-fb`
- Firebase Console：`https://console.firebase.google.com/project/guilty-corn/overview`
- Staging URL：`https://guilty-corn--staging-7f63ubtj.web.app`
- Production URL：`https://guilty-corn.web.app`

## 作業位置

- Firebase config 讀取：`src/config/appConfig.js`
- Firebase context/Auth/Firestore：`src/services/firebase.js`
- 雲端曲庫 hook：`src/hooks/useCloudScores.js`
- 雲端曲庫 UI：`src/components/ScoreLibrary.jsx`
- 轉檔後待上傳 UI：`src/components/ScoreConverter.jsx`
- Firebase rules：`firestore.rules`
- Hosting 設定：`firebase.json`
- 本機環境範例：`.env.example`

## 環境變數

可使用單一 JSON：

- `VITE_FIREBASE_CONFIG`
- `VITE_PUBLIC_FIREBASE_CONFIG`

或使用拆開欄位：

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Firestore 資料路徑

- 完整譜面：`artifacts/{appId}/users/{uid}/scores/{scoreId}`
- 摘要列表：`artifacts/{appId}/users/{uid}/scoreSummaries/{scoreId}`
- 預設 `appId`：`universe-rhythm-recorder`，可由 `VITE_APP_ID` 覆寫。

## 前端連線流程

1. `appConfig.js` 從 Vite env 解析 Firebase config。
2. `firebase.js` 建立 Firebase app、Auth、Firestore context。
3. 匿名登入或初始 token 成功後，`useCloudScores.js` 才提供儲存、載入、刪除與批次上傳。
4. UI 透過 `cloudStatus` 與 `cloudError` 顯示目前可用狀態。
5. 上傳前由 `createScoreDocumentData()` 建立完整文件，再由 `assertCloudScoreSize()` 擋下過大內容。

## 儲存策略

- `scores` 保存完整文件與可重新載入的內容。
- `scoreSummaries` 保存列表需要的 metadata，避免列表載入大型內容。
- Firestore 單筆文件需保守控制大小；目前程式以約 `850 KB` 作為安全上限。
- 大型譜面優先使用 Slim JSON；若仍過大，改以 Firebase Storage 或 Hosting 存檔，再於 Firestore 保存 URL 與 metadata。

## 與 GitHub / Hosting 的分工

- Firebase Hosting 是正式 web app 發佈目標之一，輸出目錄為 `dist-fb`，base path 是 `/`。
- GitHub Pages 只負責 Pages 發佈，輸出目錄為 `dist-gh`，base path 是 `/-_hina/`。
- Firestore 資料路徑不應依部署平台改變；若平台差異造成讀寫錯誤，先檢查 env 與 appId，而不是改資料 schema。

## 除錯入口

- 無法初始化：檢查 `getFirebaseConfigError()` 與 `.env` 欄位。
- Auth 失敗：檢查 anonymous auth 是否啟用，或 `VITE_INITIAL_AUTH_TOKEN` 是否有效。
- 曲庫列表空白：檢查 `useCloudScores.js` 的 `cloudStatus`、`cloudError` 與 Firestore rules。
- 上傳失敗：檢查文件大小、`createScoreDocumentData()`、`assertCloudScoreSize()`。
- 部署後 Firebase 初始化失敗：檢查建置目標是否混用 Pages/Firebase base path，以及環境變數是否進入該 build。
