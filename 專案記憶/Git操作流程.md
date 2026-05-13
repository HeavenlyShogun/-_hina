# Project Hina Git和 firebace與部署流程

更新日期：2026-05-11

## 目前部署結構

- GitHub Pages：
  - 網址：`https://heavenlyshogun.github.io/-_hina/`
  - build 指令：`npm run build:pages`
  - base path：`/-_hina/`
- Firebase Hosting：
  - build 指令：`npm run build:firebase`
  - deploy 指令：`firebase deploy`
  - base path：`/`
  - `firebase.json` 已設定 `predeploy`，執行 `firebase deploy` 前會自動先跑 `npm run build:firebase`

## 日常開發

```powershell
npm run dev
```

如果 PowerShell 擋掉 `npm.ps1`，改用：

```powershell
npm.cmd run dev
```

## GitHub Pages 部署流程

1. 確認工作樹狀態

```powershell
git status --short --branch
```

2. 建置 GitHub Pages 版本

```powershell
npm.cmd run build:pages
```

3. 確認 `dist/index.html` 內資源路徑帶有 `/-_hina/`

4. commit

```powershell
git add .
git commit -m "..."
```

5. push 到 `main`

```powershell
git push origin main
```

## Firebase Hosting 部署流程

1. 確認 `.env` / Firebase 設定完整
2. 直接部署

```powershell
firebase deploy
```

補充：

- `firebase deploy` 會自動先執行 `npm run build:firebase`
- Firebase 版輸出的 `dist/index.html` 應該使用 `/assets/...`

## 兩平台切換原則

- 要發 GitHub Pages：跑 `npm run build:pages`
- 要發 Firebase：跑 `firebase deploy` 或 `npm run build:firebase`
- 不要把 GitHub Pages 版的 `dist` 直接拿去 Firebase
- 不要把 Firebase 版的 `dist` 直接拿去 GitHub Pages

## 推送前最小檢查

```powershell
git status --short --branch
npm.cmd run build:pages
npm.cmd run build:firebase
```

## 目前已知注意事項

- 專案曾有多處中文亂碼與混編碼，之後新增或修改中文文案時，一律維持 UTF-8。
- `dist/` 內容會隨最後一次 build 目標不同而改變，這是正常現象。
- 若只驗證 Firebase，最後 `dist` 會是 root path 版本；若要驗證 GitHub Pages，需再重跑一次 `build:pages`。

##firebace 推送流程:
執行部署指令： 在您的終端機中，直接執行以下指令：

firebase deploy



自動化建置： 這個指令會自動觸發 firebase.json 檔案中設定好的 predeploy 腳本，該腳本會執行 npm run build:firebase。這會為 Firebase Hosting 產生一個優化過的產品建置 (production build)，並將結果放在 dist 資料夾。

上傳與發布： 建置完成後，firebase deploy 會自動將 dist 資料夾的內容上傳到 Firebase Hosting，並將您的網站更新到最新版本。

簡單來說，您只需要 firebase deploy 這一個指令，專案就會自動完成建置和上傳的所有步驟。
