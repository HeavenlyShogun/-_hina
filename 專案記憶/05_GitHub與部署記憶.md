# GitHub 與部署記憶

最後更新：2026-06-03

本檔記錄 Git remote、GitHub Pages、Firebase Hosting 與常用部署指令。

## GitHub

- remote name：`origin`
- fetch URL：`git@github.com:HeavenlyShogun/-_hina.git`
- push URL：`git@github.com:HeavenlyShogun/-_hina.git`
- GitHub Pages URL：`https://heavenlyshogun.github.io/-_hina/`

## GitHub Pages

- build 指令：`npm.cmd run build:pages`
- 輸出目錄：`dist-gh`
- base path：`/-_hina/`
- 預覽指令：`npm.cmd run preview:pages`
- 注意：Pages build 不可使用 Firebase Hosting 的 `/` base path。

## Firebase Hosting

- build 指令：`npm.cmd run build:firebase`
- 輸出目錄：`dist-fb`
- base path：`/`
- production deploy：`firebase deploy --only hosting --project guilty-corn`
- staging deploy：`firebase hosting:channel:deploy staging --project guilty-corn --expires 7d`
- 預覽指令：`npm.cmd run preview:firebase`

## 雙部署規則

- Pages 與 Firebase 的 build 產物不可互換，因為 asset URL base path 不同。
- 部署前至少跑一次對應 build；同時改到 routing、public assets、Vite config 時，兩種 build 都要跑。
- `firebase.json` 的 public dir 應指向 `dist-fb`；GitHub Pages 發佈應取 `dist-gh`。
- `.env` / `.env.local` 可供本機使用，但 GitHub Actions 或 Firebase 部署環境需另行配置 secrets/env。

## 常用檢查指令

```powershell
git status --short --branch
npm.cmd run build:firebase
npm.cmd run build:pages
npm.cmd run preview:firebase
npm.cmd run preview:pages
```

## 2026-05-29 驗證結果

- `npm.cmd run build:firebase`：成功產生 `dist-fb`。
- `npm.cmd run build:pages`：成功產生 `dist-gh`。
- 兩者皆有 Vite 警告：`surges-slim.json` 同時被靜態與動態 import。
- 在目前沙盒環境直接跑 build 會出現 `commonjs--resolver spawn EPERM`；需用允許的本機權限重跑，不視為程式碼錯誤。

## 2026-06-03 驗證結果

- 最新音訊引擎修正後，`npm.cmd run build:vite` 已通過。
- `npm.cmd run build:firebase` 與 `npm.cmd run build:pages` 已通過；兩者仍只有既有的空 `firebase-vendor` chunk、`surges-slim.json` 分包與 chunk size 警告。
- `firebase.cmd deploy --only hosting --project guilty-corn` 已成功部署 Firebase Hosting。
- Hosting URL：`https://guilty-corn.web.app`
- PowerShell 內仍建議使用 `npm.cmd`，避免 `npm.ps1` execution policy 問題。
- Firebase Hosting deploy 前仍由 `firebase.json` predeploy 自動重跑 `npm run build:firebase`。

## 除錯規則

- PowerShell 可能擋 `npm.ps1`，優先使用 `npm.cmd run <script>`。
- Pages 路徑錯誤時先檢查 `vite.config.js` 與 `scripts/build-github-pages.mjs`。
- Firebase 路徑錯誤時先檢查 `scripts/build-firebase-hosting.mjs` 與 `firebase.json`。
- deploy 失敗時先確認 Firebase CLI 登入狀態與目前 project。
# 2026-06-05 最新覆蓋記憶

本次 Firebase build 使用 `npm run build` 成功輸出 `dist-fb`。本機 preview 已在 `http://127.0.0.1:4173/` 回應 HTTP 200。Vite 在此沙盒環境執行 build/preview 可能遇到 Windows `spawn EPERM`，需用允許子程序的升權方式執行。`tone@15.1.22` 必須存在於 `node_modules`，否則 production build 會無法解析 `src/services/audioEngine.js` 的 `tone` import。
