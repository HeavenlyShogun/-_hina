Firebase 與雲端曲庫記憶

最後更新：2026-09-20

本檔記錄 Firebase 設定、Auth 非同步鎖、Firestore 曲庫、Storage 靜態分離、分享連結與自動同步等核心雲端機制。

Firebase 專案資訊

Firebase project：guilty-corn

Firebase Hosting public dir：dist-fb

專案總覽：https://console.firebase.google.com/project/guilty-corn/overview

Production URL：https://guilty-corn.web.app

App ID 預設值：universe-rhythm-recorder (可由 VITE_APP_ID 覆寫)

作業位置

Firebase 核心與 Auth 鎖：src/services/firebase.js

雲端曲庫 hook (消費者)：src/hooks/useCloudScores.js

雲端曲庫 UI：src/components/ScoreLibrary.jsx

Storage 上傳產線 (後端工具)：scripts/upload-scores-to-storage.mjs

Firebase rules：firestore.rules 與 storage.rules

Hosting 設定：firebase.json

核心機制 1：Auth 非同步鎖 (anonymousUserPromise)

這是解決 Missing or insufficient permissions 的關鍵設計。
由於 Firestore 的讀寫規則極度依賴 request.auth.uid，在前端元件掛載時，絕不可直接使用 auth.currentUser?.uid（因為可能尚未完成初始化或登入）。

實作方式：在 firebase.js 中封裝了 anonymousUserPromise，利用 onAuthStateChanged 確保登入狀態確立（若無 user 則呼叫 signInAnonymously）。

呼叫規範：任何 Firestore 的讀寫（如 useCloudScores.js 裡的 loadScores 或 saveScore），第一步都必須 await anonymousUserPromise，確認拿到有效 UID 後才建構 doc 或 collection 參考。

核心機制 2：Firestore 資料路徑與快取

完整譜面：artifacts/{appId}/users/{uid}/scores/{scoreId}

公開分享譜面：artifacts/{appId}/publicScores/{publicId}

初始化時，firebase.js 預設啟用 IndexedDB 持久化快取 (persistentLocalCache)，支援離線優先。

儲存大小限制：Firestore 單筆文件建議不超過 850 KB。超過此限制的大型譜面應走 Slim JSON，或轉存 Storage。

核心機制 3：Storage 曲庫分離 (Firebase Hosting)

內建曲庫有 47 首 Slim JSON。Firebase build 會把 JSON 從 dist-fb 移除，並將該 build 的 manifest localPath 設為 null；GitHub Pages 與本機 build 仍保留靜態曲譜。曲譜載入先使用 CacheStorage，未命中時以 Firebase Storage SDK 依 storagePath 取得下載 URL。

批次上傳腳本：scripts/upload-scores-to-storage.mjs，使用 firebase-admin 的 Application Default Credentials。

上傳路徑：score-library/slim-json/<filename>。Storage rules 僅允許此路徑公開讀取，禁止前端寫入。

上傳 Metadata：contentType: "application/json"；cacheControl: "public,max-age=3600"。

安全驗證：先執行 npm run scores:upload:storage -- --dry-run；正式上傳前設定 FIREBASE_STORAGE_BUCKET 與 GOOGLE_APPLICATION_CREDENTIALS，再執行 npm run scores:upload:storage。憑證應放在專案外，勿提交至 Git。

注意：移除 Hosting 曲譜 JSON 可減少部署靜態檔案；目前 Vite >500kB 警告來自主應用程式 JS chunk，需另行做 code splitting 才能消除。

自動同步與分享

編輯器自動存檔：App.jsx 監聽譜面變更，使用 3 秒 debounce 自動呼叫 saveCloudScore() 背景寫入 Firestore，防範資料遺失。

一鍵分享：呼叫 publishScore() 將譜面複製到 publicScores，並生成 ?scoreId={publicId} 的專屬網址。其他人開啟網址即可自動載入譜面。

部署與除錯入口

GitHub Pages 與 Firebase Hosting 的 base path 不同（/-_hina/ vs /），跨環境 fetch 需使用 import.meta.env.BASE_URL。

權限不足 (Permission Denied)：

檢查 Firebase Console 是否開啟「匿名登入」。

檢查 firestore.rules 是否成功 deploy (firebase deploy --only firestore:rules)。

檢查送出的請求是否確實經過 await anonymousUserPromise 取得了有效 UID。

上傳 Storage 失敗：檢查 FIREBASE_STORAGE_BUCKET 變數是否正確（如 your-project.firebasestorage.app），以及 Admin SDK 金鑰路徑是否生效。