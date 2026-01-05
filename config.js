// config.js

const API_CONFIG = {
  // 1. 請填入您的 Google Apps Script 網頁應用程式網址 (Web App URL)
  apiUrl: "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",

  // 2. 請填入您的前端網頁網址 (例如 GitHub Pages 網址)
  // 注意：此網址必須與 LINE Developers Console 中的 Callback URL 完全一致
  redirectUrl: "YOUR_GITHUB_PAGES_URL_HERE"
};

// 👇 為了兼容性，同時定義全域變數 apiUrl
const apiUrl = API_CONFIG.apiUrl;



