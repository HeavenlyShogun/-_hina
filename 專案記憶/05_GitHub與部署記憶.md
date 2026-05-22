# GitHub 與部署記憶

最後更新：2026-05-22

## Git 倉庫資訊

- remote name：`origin`
- fetch URL：`git@github.com:HeavenlyShogun/-_hina.git`
- push URL：`git@github.com:HeavenlyShogun/-_hina.git`

## GitHub Pages

- 預設網址：
  - `https://heavenlyshogun.github.io/-_hina/`
- build 指令：
  - `npm.cmd run build:pages`
- base path：
  - `/-_hina/`
- 自動部署：
  - push 到 `main` 後由 GitHub Actions 處理

## Firebase Hosting

- build 指令：
  - `npm.cmd run build`
  - 或 `npm.cmd run build:firebase`（若 package script 仍保留）
- deploy 指令：
  - `firebase deploy --only hosting --project guilty-corn`
- staging deploy：
  - `firebase hosting:channel:deploy staging --project guilty-corn --expires 7d`
- base path：
  - `/`
- Hosting 輸出目錄：
  - `dist-fb`
- 2026-05-22 狀態：
  - `npm run build:firebase` 可成功產生 `dist-fb`。
  - 本機 Firebase CLI 帳號顯示為 `u308008@gmail.com`，但 credentials 已過期；正式 deploy 需先在互動式終端執行 `firebase login --reauth` 或提供 CI token。

## 部署時的重要規則

- 不要把 GitHub Pages build 結果直接拿去 Firebase。
- 不要把 Firebase Hosting build 結果直接拿去 GitHub Pages。
- `dist` / `dist-fb` 內容依最後一次 build 目標而定，發佈前要確認目標正確。

## 本機常用指令

```powershell
git status --short --branch
npm.cmd run dev
npm.cmd run build
npm.cmd run build:pages
firebase deploy --only hosting --project guilty-corn
firebase hosting:channel:deploy staging --project guilty-corn --expires 7d
git push origin main
```

## PowerShell 注意事項

- 若 PowerShell 擋下 `npm.ps1`，改用：
  - `npm.cmd run <script>`

## 修改部署流程時要同步更新的記憶

- 本檔：build、deploy、remote、網址、base path
- `04_Firebase與雲端曲庫記憶.md`：若 Firebase project / hosting / env 需求改動
- `01_目前系統總覽.md`：若部署型態影響產品定位
