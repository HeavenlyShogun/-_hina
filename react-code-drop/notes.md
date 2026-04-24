# Notes

- 你目前貼上的是單頁 HTML 原型，不是 React 元件檔。
- 原始內容在 `if (noise) no...` 這裡中斷，代表程式碼不完整。
- 如果要轉 React，建議至少拆成：
  - `App.jsx`
  - `components/Header.jsx`
  - `components/KeyboardPanel.jsx`
  - `components/Controls.jsx`
  - `components/LibraryPanel.jsx`
  - `components/EditorPanel.jsx`
  - `components/ConfirmModal.jsx`
  - `services/audioEngine.js`
  - `services/firebase.js`
