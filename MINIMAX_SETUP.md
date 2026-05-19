# Minimax API Setup

1) 本地開發（前端 Vite）

- 在專案根目錄建立 `\.env.local`（不要把真金鑰推到 git）：

```
VITE_MINIMAX_API_KEY=YOUR_MINIMAX_API_KEY_HERE
```

- 在 PowerShell 設定（臨時 session）：

```powershell
$env:VITE_MINIMAX_API_KEY = "YOUR_MINIMAX_API_KEY_HERE"
```

或永久設定：

```powershell
setx VITE_MINIMAX_API_KEY "YOUR_MINIMAX_API_KEY_HERE"
```

2) 前端使用方式（示範）

- 已提供 `src/utils/minimax.js`：此 helper 會使用 `VITE_MINIMAX_API_KEY`，並向預設 Minimax endpoint 發出請求：

```
Endpoint: https://api.minimax.ai/v1/chat
```

範例呼叫：

```js
import { callMinimax } from './utils/minimax';
const res = await callMinimax({ prompt: 'Hello' });
```

3) 後端（若有）

- 範例檔案： `server/minimax-proxy.example.js`，在 server 環境中使用 `MINIMAX_API_KEY`（不需 VITE_ 前綴）。後端 proxy 會把請求轉發到：

```
Endpoint: https://api.minimax.ai/v1/chat
```

運行範例（PowerShell）：

```powershell
$env:MINIMAX_API_KEY = "YOUR_MINIMAX_API_KEY_HERE"
node server/minimax-proxy.example.js
```

4) 測試

- 前端：啟動 Vite (`npm run dev`) 並在應用中呼叫 `callMinimax()`。
- 若使用 proxy：使用 curl 或 Postman 呼叫 `http://localhost:3000/api/minimax` 傳 JSON payload，proxy 會把請求轉發到 Minimax。
- 直接向 Minimax API 測試（後端或 Postman）：

```bash
curl -X POST "https://api.minimax.ai/v1/chat" \
	-H "Authorization: Bearer YOUR_MINIMAX_API_KEY" \
	-H "Content-Type: application/json" \
	-d '{"prompt":"Hello"}'
```

5) 安全建議

- 永遠把 `\.env.local` 加入 `.gitignore`。
- 佈署到雲端時使用平台 secret 管理（Vercel/Netlify/Azure/AWS 等）。
