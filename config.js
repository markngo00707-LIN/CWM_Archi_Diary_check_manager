// config.js

const API_CONFIG = {
  // 1. 請填入您的 Google Apps Script 網頁應用程式網址 (Web App URL)
  apiUrl: "https://script.google.com/macros/s/AKfycbxECOmyZ2g53qpD85I71zco-m2nqY-IEGtKpoMTp0K2Q0FsTRWGsWZObkIzK2g1RBKb/exec",

  // 2. 請填入您的前端網頁網址 (例如 GitHub Pages 網址)
  // 注意：此網址必須與 LINE Developers Console 中的 Callback URL 完全一致
  redirectUrl: "https://markngo00707-lin.github.io/CWM_Archi_Diary_check_manager/"
};

// 👇 為了兼容性，同時定義全域變數 apiUrl
const apiUrl = API_CONFIG.apiUrl;



