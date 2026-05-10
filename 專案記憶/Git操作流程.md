__# Git 操作流程：避免 rebase / push 卡住

更新日期：2026-05-08

本流程針對 Project Hina 這次實際遇到的 Git 相容性問題整理，重點是避免在 `rebase`、`push`、Windows PowerShell 與 GitHub 推送時卡住。

## 這次卡住的根因

1. 本地 `main` 與 `origin/main` 分叉，推送前進入 `rebase`。
2. `rebase` 過程出現衝突，但衝突未完成就嘗試推送。
3. Windows / PowerShell 環境下，中文檔名在 Git 輸出中被 escape，看起來像亂碼，容易誤判成檔案損壞。
4. PowerShell execution policy 會擋 `npm.ps1`，導致 `npm run build` 失敗。
5. 某些受限環境不能直接寫 `.git/index`，會讓 `git add`、`rebase --continue`、`commit` 卡在 `index.lock` 或 permission denied。

## 標準操作順序

1. 先確認工作樹是否乾淨。
2. 再確認目前是否卡在 `rebase` / `merge`。
3. 同步遠端變更。
4. 解完衝突後先建置驗證。
5. 驗證通過後才推送。

## 每次推送前先跑

```powershell
git status --short --branch
git branch -vv
git remote -v
```

判讀原則：

- 如果看到 `HEAD (no branch)`，通常代表你正在 `rebase`，不能直接推送。
- 如果看到 `UU`、`AA`、`DU`、`UD`，代表有衝突未解。
- 如果看到 `ahead X, behind Y`，代表本地與遠端已分叉，必須先整合。

## 發現正在 rebase 時

先查狀態：

```powershell
git status
```

如果顯示：

- `You are currently rebasing branch 'main'`
- `fix conflicts and then run "git rebase --continue"`

表示你現在應該做的是解衝突，不是 `git push`。

## 解衝突流程

1. 先找出哪些檔案有衝突。

```powershell
git status
git -c core.quotePath=false ls-files -u
```

2. 搜尋衝突標記。

```powershell
rg -n "^(<<<<<<<|=======|>>>>>>>)" src "專案記憶"
```

3. 逐檔處理：

- 保留兩邊都需要的邏輯時，手動合併。
- 如果是文件雙方都新增，整成單一版本即可。
- 中文路徑若在 Git 輸出中變亂碼，優先用 `git -c core.quotePath=false ...` 重看，不要直接假設檔名壞掉。

4. 確認衝突標記已清乾淨。

```powershell
rg -n "^(<<<<<<<|=======|>>>>>>>)" src "專案記憶"
```

5. 完成後 stage 檔案。

```powershell
git add <resolved-files>
```

6. 繼續 rebase。

```powershell
git rebase --continue
```

## 什麼時候用 `--abort`

只有在下面情況才建議：

- 你還沒開始整理衝突，想退回 rebase 前狀態。
- 你判斷這次整合方向錯了，要重新拉遠端再做一次。

指令：

```powershell
git rebase --abort
```

不要在已經人工整理很多衝突後隨便 `--abort`，否則你剛整理的內容會一起丟掉。

## PowerShell / Windows 相容注意事項

### `npm run build` 被 execution policy 擋住

如果看到 `npm.ps1` 被停用，改用：

```powershell
npm.cmd run build
```

這不是專案程式碼錯誤，是 PowerShell 腳本執行政策造成的。

### 中文檔名顯示亂碼

Git 預設可能把中文路徑 escape 成八進位字串。用這個查看：

```powershell
git -c core.quotePath=false status --short
git -c core.quotePath=false ls-files -u
```

這通常只是顯示問題，不代表實際檔名損壞。

### `.git/index.lock` 或 permission denied

如果 `git add` 失敗，常見原因有兩種：

1. 真的有殘留 lock 檔。
2. 目前環境限制不能寫 `.git`。

先檢查：

```powershell
Get-ChildItem .git\index.lock
```

如果 lock 檔不存在，但 `git add` 還是 permission denied，通常是環境權限問題，不是 Git 衝突本身。

## 推送前驗證

建議至少跑：

```powershell
npm.cmd run build
git status --short --branch
git rev-list --left-right --count origin/main...main
```

判讀原則：

- build 成功才推。
- `git status` 應該是乾淨工作樹。
- `rev-list` 如果結果是 `0 1`，代表本地只比遠端超前 1 個 commit，可以直接推。

## 正常推送流程

```powershell
git fetch origin
git status --short --branch
git rebase origin/main
rg -n "^(<<<<<<<|=======|>>>>>>>)" src "專案記憶"
git add <resolved-files>
git rebase --continue
npm.cmd run build
git push origin main
```

## 這個專案的實務建議

- 推送前先看 `git branch -vv`，不要等 GitHub reject 才發現分叉。
- 文件檔與程式檔一起改時，rebase 衝突很常同時發生，先解程式，再整理文件。
- `README.md` 如果終端機顯示亂碼，不要急著大改；先確認是檔案內容編碼問題還是終端顯示問題。
- 受限環境下若 `.git` 無法寫入，Git 操作需要提權；不要反覆重試同一個 `git add`。

## 最短排錯清單

如果下次又卡住，按這個順序：

1. `git status`
2. `git branch -vv`
3. `git -c core.quotePath=false ls-files -u`
4. `rg -n "^(<<<<<<<|=======|>>>>>>>)" src "專案記憶"`
5. `git add <resolved-files>`
6. `git rebase --continue`
7. `npm.cmd run build`
8. `git push origin main`
