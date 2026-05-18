# Firebase 與雲端曲庫記憶

最後更新：2026-05-18

## 雲端定位

- Firebase 曲庫目前是：
  - 使用者登入
  - Firestore 曲庫同步
  - 摘要列表管理
  - 編輯器存檔入口
  - 轉換器 `Pending Uploads` 的批次上傳入口
- Firebase 曲庫目前不是大型譜面 CDN。
- 獨立 Cloud Library 工作區目前已從主畫面移除；Firestore 操作仍由 hook / service 保留。

## 主要程式位置

- `src/config/appConfig.js`
  - 讀取 Firebase 環境變數
- `src/services/firebase.js`
  - Firebase context、Auth、Firestore CRUD、批次上傳
- `src/hooks/useCloudScores.js`
  - 前端雲端曲庫 hook
- `src/components/ScoreLibrary.jsx`
  - Cloud Library UI 元件仍保留，但目前不在主工作區渲染
- `src/App.jsx`
  - 連線、存檔、轉換器批次上傳入口

## 目前設定與資訊

- Firebase project：`guilty-corn`
- Firebase Hosting public dir：`dist-fb`
- Firebase Console：
  - `https://console.firebase.google.com/project/guilty-corn/overview`
- Staging URL：
  - `https://guilty-corn--staging-7f63ubtj.web.app`
- Production URL：
  - `https://guilty-corn.web.app`

## 目前連線模型

- 使用匿名登入。
- `ensureCloudConnection()` 會建立 Firebase context。
- `useCloudScores()` 會：
  - 維護 `cloudStatus`
  - 維護 `cloudError`
  - 維護 `savedScores`
  - 提供 `saveCloudScore`
  - 提供 `uploadCloudScores`
  - 提供 `loadCloudScore`
  - 提供刪除與清空能力

## 批次上傳邏輯

- 使用者可從：
  - 轉換器 `Pending Uploads`
  將多份譜面上傳到 Firestore。

- 轉換器中的 `uploadCloudScores` 是目前正式批次上傳入口。
- `ScoreConverter.jsx` 的「上傳本批」會把待上傳清單寫入 Firestore，成功後清空本批清單。

## Firestore 限制與策略

- 大型譜面不適合長期直接塞進 Firestore。
- 接近 Firestore 單文件實務限制時，應優先：
  - 先轉成 Slim JSON
  - 或改用 Firebase Storage / Hosting 靜態檔
  - Firestore 只保留 metadata / URL

## 修改 Firebase 流程時要同步更新的記憶

- 本檔：連線、存取、錯誤、限制、上傳策略
- `01_目前系統總覽.md`：若雲端定位改變
- `02_頁面欄位與記憶更新邏輯.md`：若 Cloud Library UI 改變
- `05_GitHub與部署記憶.md`：若部署、環境變數或 Hosting 流程改變
