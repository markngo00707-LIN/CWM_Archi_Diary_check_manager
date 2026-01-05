# 出勤系統安裝與部署指南 (SETUP_GUIDE)

本指南將引導您一步步完成「出勤管家」系統的架設。您需要設定 **Google Apps Script (後端)**、**LINE Login (身分驗證)** 以及 **GitHub Pages (前端網頁)**。

---

## 第一階段：後端設定 (Google Apps Script)

這個階段的目標是建立後端伺服器，用來處理打卡資料和連接 Google 試算表。

1.  **建立 Google 試算表**
    *   前往 [Google 試算表](https://docs.google.com/spreadsheets/)。
    *   建立一個新的空白試算表，命名為 `Attendance-System` (或其他您喜歡的名字)。

2.  **開啟 Apps Script 編輯器**
    *   在試算表選單中，點選 `擴充功能` > `Apps Script`。
    *   這會開啟一個新的視窗，進入程式碼編輯介面。

3.  **複製程式碼**
    *   您電腦中的 `GS` 資料夾內有許多 `.gs` 檔案（例如 `Main.gs`, `DbOperations.gs` 等）。
    *   請將 `GS` 資料夾內 **所有檔案的內容**，分別複製到 Apps Script 專案中。
    *   *提示：您可以在 Apps Script 左側點擊 `+` 號新增對應檔名的 `.gs` 檔案，然後貼上程式碼。*

4.  **初次部署 (取得網址)**
    *   點擊右上角的 `部署` 按鈕 > `新增部署`。
    *   點選左側齒輪圖示 > 選擇 `網頁應用程式`。
    *   輸入說明（例如：`v1`）。
    *   **執行身分**：選擇 `我 (Me)`。
    *   **誰可以存取**：選擇 `任何人 (Anyone)`。**(重要：否則 LINE Login 無法呼叫)**
    *   點擊 `部署`。
    *   **複製網頁應用程式網址 (Web App URL)**。這個網址非常重要，我們先叫它 `GAS_URL`。

---

## 第二階段：LINE Login 設定

這個階段的目標是讓員工可以使用 LINE 帳號登入系統。

1.  **建立 LINE Channel**
    *   前往 [LINE Developers Console](https://developers.line.biz/console/) 並登入您的 LINE 帳號。
    *   建立一個新的 Provider (如果還沒有的話)。
    *   建立一個新的 Channel，類型選擇 **LINE Login**。
    *   填寫必要的資訊（App Name, Description 等）並建立。

2.  **取得 Channel ID 與 Secret**
    *   在 `Basic settings` 分頁中，找到 **Channel ID** 和 **Channel Secret**。
    *   請先記下來，稍後會用到。

3.  **設定後端 (回填 LINE 設定)**
    *   回到剛才的 **Google Apps Script** 編輯器。
    *   找到 `Script Properties` (指令碼屬性) 設定，或者直接在程式碼全域變數中填入 Channel ID 與 Secret (視您的程式碼實作方式而定，通常在 `config.js` 或是後端 `Constants.gs` 中設定，請檢查 `GS` 資料夾中的 `Constants.gs` 或 `Main.gs` 是否有相關變數需要修改)。
    *   *(注意：若您的程式碼是透過 `PropertiesService` 讀取，您需要在 Apps Script 的「專案設定」>「指令碼屬性」中新增 `CHANNEL_ID` 和 `CHANNEL_SECRET`)*。

4.  **設定 LINE Login 回呼網址 (Callback URL)**
    *   我們先跳過這步，等到第三階段取得前端網址後再回來設定。

---

## 第三階段：前端設定與上架 (GitHub Pages)

這個階段的目標是將網頁介面公開到網路上。

1.  **修改 `config.js`**
    *   打開您電腦專案資料夾中的 `config.js` 檔案。
    *   將 `apiUrl` 修改為第一階段取得的 `GAS_URL`。
    *   將 `redirectUrl` 修改為您預計要託管的網址。
        *   如果您使用 GitHub Pages，網址通常是 `https://<您的帳號>.github.io/<專案名稱>/`。

2.  **上傳程式碼**
    *   將整個專案資料夾上傳到 GitHub Repository (儲存庫)。
    *   確認 `index.html`, `style.css`, `script.js`, `image` 資料夾等都在根目錄或正確位置。

3.  **開啟 GitHub Pages**
    *   在 GitHub Repository 頁面，點選 `Settings` > `Pages`。
    *   在 `Build and deployment` > `Source` 選擇 `Deploy from a branch`。
    *   Branch 選擇 `main` (或 `master`) > `/ (root)`，然後點擊 `Save`。
    *   等待幾分鐘後，GitHub 會給您一個公開的網址，例如 `https://eric693.github.io/CWM_Archi_check_manager-release/`。

---

## 第四階段：最終串接

1.  **完成 LINE Login 設定**
    *   回到 [LINE Developers Console](https://developers.line.biz/console/)。
    *   進入 `LINE Login` 分頁。
    *   找到 `Callback URL` (回呼網址)。
    *   點擊 `Edit`，輸入您在第三階段取得的 **GitHub Pages 網址** (注意：網址最後面不需要 index.html，但通常需要斜線 `/`)。
    *   *重要：LINE Login 的 Callback URL 必須與您程式碼中 `redirectUrl` 完全一致。*

2.  **完成 Apps Script 設定**
    *   若您在 `config.js` 中有設定 `redirectUrl`，請確認它與 GitHub Pages 網址一致。
    *   若後端程式碼有檢查 `redirectUrl`，請記得更新後端並**重新部署** (Manage Deployments > Edit > New Version > Deploy)。

3.  **測試**
    *   用手機或電腦瀏覽器打開您的 GitHub Pages 網址。
    *   點擊「LINE 登入」。
    *   若能成功跳轉並顯示打卡介面，即表示架設成功！
