# Firebase 與雲端曲庫記憶

最後更新：2026-06-05

本檔記錄 Firebase 設定、Auth、Firestore 曲庫、分享連結、離線快取、自動同步與上傳限制。

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
- 編輯器雲端操作 UI：`src/components/SheetDisplay.jsx`
- 轉檔後待上傳 UI：`src/components/ScoreConverter.jsx`
- Firebase rules：`firestore.rules`
- Storage rules：`storage.rules`
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
- 公開分享譜面：`artifacts/{appId}/publicScores/{publicId}`
- 公開分享摘要：`artifacts/{appId}/publicScoreSummaries/{publicId}`
- 預設 `appId`：`universe-rhythm-recorder`，可由 `VITE_APP_ID` 覆寫。

## 前端連線流程

1. `appConfig.js` 從 Vite env 解析 Firebase config。
2. `firebase.js` 建立 Firebase app、Auth、Firestore context。
3. Firestore 以 `initializeFirestore(app, { localCache: persistentLocalCache() })` 啟用 IndexedDB 持久化快取；若瀏覽器不支援或已有 instance，fallback 到 `getFirestore(app)`。
4. 匿名登入或初始 token 成功後，`useCloudScores.js` 才提供儲存、載入、刪除、分享、公開載入、複製公開譜面與批次上傳。
5. UI 透過 `cloudStatus`、`cloudError`、`autoSyncStatus` 顯示目前可用狀態。
6. 上傳前由 `createScoreDocumentData()` 建立完整文件，再由 `assertCloudScoreSize()` 擋下過大內容。

## 儲存策略

- `scores` 保存完整文件與可重新載入的內容。
- `scoreSummaries` 保存列表需要的 metadata，避免列表載入大型內容。
- Firestore 單筆文件需保守控制大小；目前程式以約 `850 KB` 作為安全上限。
- 大型譜面優先使用 Slim JSON；若仍過大，改以 Firebase Storage 或 Hosting 存檔，再於 Firestore 保存 URL 與 metadata。
- 內建 slim 譜面 metadata 可包含 `libraryPath` 與 `defaultMidiPath`；雲端保存時不要假設所有使用者譜面都有本機預設曲庫路徑。

## 分享與社群譜庫

- 一鍵分享由 `shareCloudScore()` 呼叫 `publishScore()`。
- 分享時會先保存私有譜面，再同步寫入 `publicScores/{publicId}` 與 `publicScoreSummaries/{publicId}`。
- 分享 URL 格式為 `https://guilty-corn.web.app/?scoreId={publicId}`；GitHub Pages preview 也會保留目前 pathname 生成對應 URL。
- App 初始化時若 URL 帶有 `scoreId`，會呼叫 `loadSharedScore()` 從公開譜庫載入該譜面。
- `ScoreLibrary.jsx` 有「我的樂譜」與「玩家共享」分頁；公開譜面可直接載入，也可用 `copyPublicScore()` 複製到自己的私有曲庫。
- 公開譜面讀取對所有人開放；建立、更新、刪除必須由 `ownerUid` 對應的登入使用者執行。

## 自動同步

- `App.jsx` 使用 3 秒 debounce 監聽目前譜面 snapshot、BPM、拍號、音色、調性、固定音高與參考資料。
- 停止操作後自動呼叫 `saveCloudScore()` 寫入 Firestore。
- UI 顯示「雲端同步排程中 / 雲端同步中 / 雲端已同步 / 雲端同步失敗」。
- 載入雲端或分享譜面後會重設 autosave signature，避免剛載入就立刻重寫同一份內容。

## 與 GitHub / Hosting 的分工

- Firebase Hosting 是正式 web app 發佈目標之一，輸出目錄為 `dist-fb`，base path 是 `/`。
- GitHub Pages 只負責 Pages 發佈，輸出目錄為 `dist-gh`，base path 是 `/-_hina/`。
- Firestore 資料路徑不應依部署平台改變；若平台差異造成讀寫錯誤，先檢查 env 與 appId，而不是改資料 schema。

## 除錯入口

- 無法初始化：檢查 `getFirebaseConfigError()` 與 `.env` 欄位。
- Auth 失敗：檢查 anonymous auth 是否啟用，或 `VITE_INITIAL_AUTH_TOKEN` 是否有效。
- 曲庫列表空白：檢查 `useCloudScores.js` 的 `cloudStatus`、`cloudError` 與 Firestore rules。
- 分享連結失敗：檢查 `publicScores` / `publicScoreSummaries` rules、`ownerUid`、`isPublic` 與 `publicId`。
- 離線同步異常：檢查 Firestore persistent local cache 是否 fallback、瀏覽器 IndexedDB 是否可用。
- 公共譜庫空白：檢查 `subscribeToPublicScores()`、`sharedAt` orderBy 與 rules 的公開讀取條件。
- 上傳失敗：檢查文件大小、`createScoreDocumentData()`、`assertCloudScoreSize()`。
- 部署後 Firebase 初始化失敗：檢查建置目標是否混用 Pages/Firebase base path，以及環境變數是否進入該 build。
