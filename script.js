// 使用 CDN 或絕對路徑來載入 JSON 檔案
// 注意：本檔案需要依賴 config.js，請確保它在腳本之前被載入。

let currentLang = localStorage.getItem("lang");
let currentMonthDate = new Date();
let translations = {};
let monthDataCache = {}; // 新增：用於快取月份打卡資料
let userId = localStorage.getItem("sessionUserId");
let todayShiftCache = null; // 快取今日排班
let weekShiftCache = null;  // 快取本週排班
// 載入語系檔
async function loadTranslations(lang) {
    try {
        const res = await fetch(`https://eric693.github.io/Allianz_check_manager/i18n/${lang}.json`);
        if (!res.ok) {
            throw new Error(`HTTP 錯誤: ${res.status}`);
        }
        translations = await res.json();
        currentLang = lang;
        localStorage.setItem("lang", lang);
        renderTranslations();
    } catch (err) {
        console.error("載入語系失敗:", err);
    }
}

// 翻譯函式
function t(code, params = {}) {
    let text = translations[code] || code;
    
    // 檢查並替換參數中的變數
    for (const key in params) {
        // 在替換之前，先翻譯參數的值
        let paramValue = params[key];
        if (paramValue in translations) {
            paramValue = translations[paramValue];
        }
        
        text = text.replace(`{${key}}`, paramValue);
    }
    return text;
}

// renderTranslations 可接受一個容器參數
function renderTranslations(container = document) {
    // 翻譯網頁標題（只在整頁翻譯時執行）
    if (container === document) {
        document.title = t("APP_TITLE");
    }

    // 處理靜態內容：[data-i18n]
    const elementsToTranslate = container.querySelectorAll('[data-i18n]');
    elementsToTranslate.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translatedText = t(key);
        
        // 檢查翻譯結果是否為空字串，或是否回傳了原始鍵值
        if (translatedText !== key) {
            if (element.tagName === 'INPUT') {
                element.placeholder = translatedText;
            } else {
                element.textContent = translatedText;
            }
        }
    });

    // ✨ 新增邏輯：處理動態內容的翻譯，使用 [data-i18n-key]
    const dynamicElements = container.querySelectorAll('[data-i18n-key]');
    dynamicElements.forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        if (key) {
             const translatedText = t(key);
             
             // 只有當翻譯結果不是原始鍵值時才進行更新
             if (translatedText !== key) {
                 element.textContent = translatedText;
             }
        }
    });

    // 👇 新增：處理 select option 的翻譯
    const selectElements = container.querySelectorAll('select');
    selectElements.forEach(select => {
        const options = select.querySelectorAll('option[data-i18n-option]');
        options.forEach(option => {
            const key = option.getAttribute('data-i18n-option');
            if (key) {
                const translatedText = t(key);
                if (translatedText !== key) {
                    option.textContent = translatedText;
                }
            }
        });
    });
}
/**
 * 透過 fetch API 呼叫後端 API。
 * @param {string} action - API 的動作名稱。
 * @param {string} [loadingId="loading"] - 顯示 loading 狀態的 DOM 元素 ID。
 * @returns {Promise<object>} - 回傳一個包含 API 回應資料的 Promise。
 */
async function callApifetch(action, loadingId = "loading") {
    const token = localStorage.getItem("sessionToken");
    const url = `${API_CONFIG.apiUrl}?action=${action}&token=${token}`;
    
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.style.display = "block";
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP 錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        
        // ✅✅✅ 雙向格式統一（關鍵修正）
        // 1. 如果後端回傳 success，轉換為 ok
        if (data.success !== undefined && data.ok === undefined) {
            data.ok = data.success;
        }
        
        // 2. 如果後端回傳 ok，轉換為 success
        if (data.ok !== undefined && data.success === undefined) {
            data.success = data.ok;
        }
        
        // 3. 如果後端回傳 data，轉換為 records
        if (data.data !== undefined && data.records === undefined) {
            data.records = data.data;
        }
        
        // 4. 如果後端回傳 records，轉換為 data
        if (data.records !== undefined && data.data === undefined) {
            data.data = data.records;
        }
        
        return data;
    } catch (error) {
        showNotification(t("CONNECTION_FAILED"), "error");
        console.error("API 呼叫失敗:", error);
        throw error;
    } finally {
        if (loadingEl) loadingEl.style.display = "none";
    }
}

// ==================== 📊 管理員匯出所有員工報表功能 ====================

/**
 * 管理員匯出所有員工的出勤報表
 * @param {string} monthKey - 月份，格式: "YYYY-MM"
 */
async function exportAllEmployeesReport(monthKey) {
    const exportBtn = document.getElementById('admin-export-all-btn');
    const loadingText = t('EXPORT_LOADING') || '正在準備報表...';
    
    showNotification(loadingText, 'warning');
    
    if (exportBtn) {
        generalButtonState(exportBtn, 'processing', loadingText);
    }
    
    try {
        // 呼叫 API 取得所有員工的出勤資料（不傳 userId）
        const res = await callApifetch(`getAttendanceDetails&month=${monthKey}`);
        
        if (!res.ok || !res.records || res.records.length === 0) {
            showNotification(t('EXPORT_NO_DATA') || '本月沒有出勤記錄', 'warning');
            return;
        }
        
        // 👇 修正：先檢查資料結構
        console.log('API 回傳的資料:', res.records[0]); // 除錯用
        
        // 按員工分組
        const employeeData = {};
        
        res.records.forEach(record => {
            // 👇 修正：確保正確讀取 userId 和 name
            const userId = record.userId || 'unknown';
            const userName = record.name || '未知員工';
            
            if (!employeeData[userId]) {
                employeeData[userId] = {
                    name: userName,
                    records: []
                };
            }
            
            // 找出上班和下班的記錄
            const punchIn = record.record ? record.record.find(r => r.type === '上班') : null;
            const punchOut = record.record ? record.record.find(r => r.type === '下班') : null;
            
            // 計算工時
            let workHours = '-';
            if (punchIn && punchOut) {
                try {
                    const inTime = new Date(`${record.date} ${punchIn.time}`);
                    const outTime = new Date(`${record.date} ${punchOut.time}`);
                    const diffMs = outTime - inTime;
                    const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                    workHours = diffHours > 0 ? diffHours : '-';
                } catch (e) {
                    console.error('計算工時失敗:', e);
                    workHours = '-';
                }
            }
            
            const statusText = t(record.reason) || record.reason;
            
            const notes = record.record
                ? record.record
                    .filter(r => r.note && r.note !== '系統虛擬卡')
                    .map(r => r.note)
                    .join('; ')
                : '';
            
            employeeData[userId].records.push({
                '日期': record.date,
                '上班時間': punchIn?.time || '-',
                '上班地點': punchIn?.location || '-',
                '下班時間': punchOut?.time || '-',
                '下班地點': punchOut?.location || '-',
                '工作時數': workHours,
                '狀態': statusText,
                '備註': notes || '-'
            });
        });
        
        // 建立工作簿
        const wb = XLSX.utils.book_new();
        
        // 為每位員工建立一個工作表
        for (const userId in employeeData) {
            const employee = employeeData[userId];
            const ws = XLSX.utils.json_to_sheet(employee.records);
            
            const wscols = [
                { wch: 12 },  // 日期
                { wch: 10 },  // 上班時間
                { wch: 20 },  // 上班地點
                { wch: 10 },  // 下班時間
                { wch: 20 },  // 下班地點
                { wch: 10 },  // 工作時數
                { wch: 15 },  // 狀態
                { wch: 30 }   // 備註
            ];
            ws['!cols'] = wscols;
            
            const sheetName = employee.name.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
        
        const [year, month] = monthKey.split('-');
        const fileName = `所有員工出勤記錄_${year}年${month}月.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showNotification(t('EXPORT_SUCCESS') || '報表已成功匯出！', 'success');
        
    } catch (error) {
        console.error('匯出失敗:', error);
        showNotification(t('EXPORT_FAILED') || '匯出失敗，請稍後再試', 'error');
        
    } finally {
        if (exportBtn) {
            generalButtonState(exportBtn, 'idle');
        }
    }
}

// ==================== 📊 管理員匯出功能結束 ====================

// ==================== 📊 匯出出勤報表功能 ====================

/**
 * 匯出指定月份的出勤報表為 Excel 檔案
 * @param {Date} date - 要匯出的月份日期物件
 */
async function exportAttendanceReport(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const userId = localStorage.getItem("sessionUserId");
    
    // 取得匯出按鈕
    const exportBtn = document.getElementById('export-attendance-btn');
    const loadingText = t('EXPORT_LOADING') || '正在準備報表...';
    
    // 顯示載入提示
    showNotification(loadingText, 'warning');
    
    // 按鈕進入處理中狀態
    if (exportBtn) {
        generalButtonState(exportBtn, 'processing', loadingText);
    }
    
    try {
        // 呼叫 API 取得出勤資料
        const res = await callApifetch(`getAttendanceDetails&month=${monthKey}&userId=${userId}`);
        
        if (!res.ok || !res.records || res.records.length === 0) {
            showNotification(t('EXPORT_NO_DATA') || '本月沒有出勤記錄', 'warning');
            return;
        }
        
        // 整理資料為 Excel 格式
        const exportData = [];
        
        res.records.forEach(record => {
            // 找出上班和下班的記錄
            const punchIn = record.record.find(r => r.type === '上班');
            const punchOut = record.record.find(r => r.type === '下班');
            
            // 計算工時
            let workHours = '-';
            if (punchIn && punchOut) {
                try {
                    const inTime = new Date(`${record.date} ${punchIn.time}`);
                    const outTime = new Date(`${record.date} ${punchOut.time}`);
                    const diffMs = outTime - inTime;
                    const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                    workHours = diffHours > 0 ? diffHours : '-';
                } catch (e) {
                    console.error('計算工時失敗:', e);
                    workHours = '-';
                }
            }
            
            // 翻譯狀態
            const statusText = t(record.reason) || record.reason;
            
            // 處理備註
            const notes = record.record
                .filter(r => r.note && r.note !== '系統虛擬卡')
                .map(r => r.note)
                .join('; ');
            
            exportData.push({
                '日期': record.date,
                '上班時間': punchIn?.time || '-',
                '上班地點': punchIn?.location || '-',
                '下班時間': punchOut?.time || '-',
                '下班地點': punchOut?.location || '-',
                '工作時數': workHours,
                '狀態': statusText,
                '備註': notes || '-'
            });
        });
        
        // 使用 SheetJS 建立 Excel 檔案
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // 設定欄位寬度
        const wscols = [
            { wch: 12 },  // 日期
            { wch: 10 },  // 上班時間
            { wch: 20 },  // 上班地點
            { wch: 10 },  // 下班時間
            { wch: 20 },  // 下班地點
            { wch: 10 },  // 工作時數
            { wch: 15 },  // 狀態
            { wch: 30 }   // 備註
        ];
        ws['!cols'] = wscols;
        
        // 建立工作簿
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${month}月出勤記錄`);
        
        // 下載檔案
        const fileName = `出勤記錄_${year}年${month}月.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showNotification(t('EXPORT_SUCCESS') || '報表已成功匯出！', 'success');
        
    } catch (error) {
        console.error('匯出失敗:', error);
        showNotification(t('EXPORT_FAILED') || '匯出失敗，請稍後再試', 'error');
        
    } finally {
        // 恢復按鈕狀態
        if (exportBtn) {
            generalButtonState(exportBtn, 'idle');
        }
    }
}

// ==================== 📊 匯出功能結束 ====================

/* ===== 共用訊息顯示 ===== */
const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    notificationMessage.textContent = message;
    notification.className = 'notification'; // reset classes
    if (type === 'success') {
        notification.classList.add('bg-green-500', 'text-white');
    } else if (type === 'warning') {
        notification.classList.add('bg-yellow-500', 'text-white');
    } else {
        notification.classList.add('bg-red-500', 'text-white');
    }
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
};

// 確保登入
// script.js - 完整替換 ensureLogin 函數
async function ensureLogin() 
{
    return new Promise(async (resolve) => {
      const token = localStorage.getItem("sessionToken");
      
      if (!token) {
        showLoginUI();
        resolve(false);
        return;
      }
      
      // ⭐⭐⭐ 關鍵新增：檢查本地快取
      const cachedUser = localStorage.getItem("cachedUser");
      const cacheTime = localStorage.getItem("cacheTime");
      const now = Date.now();
      
      // 如果快取存在且未過期（5 分鐘內）
      if (cachedUser && cacheTime && (now - parseInt(cacheTime)) < 5 * 60 * 1000) {
        console.log('✅ 使用快取，秒速登入');
        
        const user = JSON.parse(cachedUser);
        
        // 直接顯示 UI（不等待 API）
        if (user.dept === "管理員") {
          document.getElementById('tab-admin-btn').style.display = 'block';
        }
        
        document.getElementById("user-name").textContent = user.name;
        document.getElementById("profile-img").src = user.picture;
        localStorage.setItem("sessionUserId", user.userId);
        
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('user-header').style.display = 'flex';
        document.getElementById('main-app').style.display = 'block';
        
        // 背景驗證（不阻塞 UI）
        checkSessionInBackground(token);
        
        // 背景載入異常記錄
        loadAbnormalRecordsInBackground();
        
        resolve(true);
        return;
      }
      
      // 快取過期或不存在，正常流程
      document.getElementById("status").textContent = t("CHECKING_LOGIN");
      
      try {
        const res = await callApifetch("initApp");
        
        if (res.ok) {
          console.log('✅ initApp 成功，儲存快取');
          
          // ⭐ 儲存快取
          localStorage.setItem("cachedUser", JSON.stringify(res.user));
          localStorage.setItem("cacheTime", Date.now().toString());
          
          if (res.user.dept === "管理員") {
            document.getElementById('tab-admin-btn').style.display = 'block';
          }
          
          document.getElementById("user-name").textContent = res.user.name;
          document.getElementById("profile-img").src = res.user.picture || res.user.rate;
          localStorage.setItem("sessionUserId", res.user.userId);
          
          showNotification(t("LOGIN_SUCCESS"));
          
          document.getElementById('login-section').style.display = 'none';
          document.getElementById('user-header').style.display = 'flex';
          document.getElementById('main-app').style.display = 'block';
          
          renderAbnormalRecords(res.abnormalRecords);
          
          resolve(true);
        } else {
          console.error('❌ initApp 失敗');
          
          // 清除快取
          localStorage.removeItem("cachedUser");
          localStorage.removeItem("cacheTime");
          
          showLoginUI();
          showNotification(`❌ ${t(res.code || "UNKNOWN_ERROR")}`, "error");
          resolve(false);
        }
      } catch (err) {
        console.error('❌ ensureLogin 錯誤:', err);
        
        localStorage.removeItem("cachedUser");
        localStorage.removeItem("cacheTime");
        
        showLoginUI();
        resolve(false);
      }
    });


/**
 * 背景驗證 Session（不阻塞 UI）
 */
async function checkSessionInBackground(token) {
    try {
      const res = await callApifetch("checkSession&token=" + token);
      
      if (!res.ok) {
        console.log('⚠️ Session 已失效');
        localStorage.removeItem("cachedUser");
        localStorage.removeItem("cacheTime");
        showNotification('登入已過期，請重新登入', 'warning');
        
        setTimeout(() => {
          showLoginUI();
        }, 2000);
      }
    } catch (error) {
      console.error('背景驗證失敗:', error);
    }
}}

/**
 * 背景載入異常記錄（不阻塞 UI）
 */
async function loadAbnormalRecordsInBackground() {
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const userId = localStorage.getItem('sessionUserId');
      
      const res = await callApifetch(`getAbnormalRecords&month=${month}&userId=${userId}`);
      
      if (res.ok) {
        renderAbnormalRecords(res.records);
      }
    } catch (error) {
      console.error('載入異常記錄失敗:', error);
    }
}
  
function showLoginUI() {
    document.getElementById('login-btn').style.display = 'block';
    document.getElementById('user-header').style.display = 'none';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById("status").textContent = t("SUBTITLE_LOGIN");
}

/**
 * ⭐ 渲染異常記錄（從 initApp 返回的資料）
 */
function renderAbnormalRecords(records) {
    console.log('📋 renderAbnormalRecords 開始', records);
    
    const recordsLoading = document.getElementById("abnormal-records-loading");
    const abnormalRecordsSection = document.getElementById("abnormal-records-section");
    const abnormalList = document.getElementById("abnormal-list");
    const recordsEmpty = document.getElementById("abnormal-records-empty");
    
    if (!recordsLoading || !abnormalRecordsSection || !abnormalList || !recordsEmpty) {
        console.error('❌ 找不到必要的 DOM 元素');
        return;
    }
    
    recordsLoading.style.display = 'none';
    abnormalRecordsSection.style.display = 'block';
    
    if (records && records.length > 0) {
        console.log(`✅ 有 ${records.length} 筆異常記錄`);
        
        recordsEmpty.style.display = 'none';
        abnormalList.innerHTML = '';
        
        const sortedRecords = records.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });
        
        sortedRecords.forEach((record, index) => {
            console.log(`   ${index + 1}. ${record.date} - ${record.reason}`);
            
            let reasonClass, displayReason, buttonHtml;
            
            // ⭐⭐⭐ 新增翻譯映射函數
            function translatePunchTypes(punchTypes) {
                if (!punchTypes) return '';
                
                const translations = {
                    '補上班審核中': t('STATUS_REPAIR_PENDING_IN') || 'Punch In Review Pending',
                    '補下班審核中': t('STATUS_REPAIR_PENDING_OUT') || 'Punch Out Review Pending',
                    '補上班通過': t('STATUS_REPAIR_APPROVED_IN') || 'Punch In Approved',
                    '補下班通過': t('STATUS_REPAIR_APPROVED_OUT') || 'Punch Out Approved',
                    '補上班被拒絕': t('STATUS_REPAIR_REJECTED_IN') || 'Punch In Rejected',
                    '補下班被拒絕': t('STATUS_REPAIR_REJECTED_OUT') || 'Punch Out Rejected'
                };
                
                return translations[punchTypes] || punchTypes;
            }
            
            switch(record.reason) {
                case 'STATUS_REPAIR_PENDING':
                    reasonClass = 'text-yellow-600 dark:text-yellow-400';
                    displayReason = translatePunchTypes(record.punchTypes);
                    buttonHtml = `
                        <span class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                            ⏳ ${translatePunchTypes(record.punchTypes)}
                        </span>
                    `;
                    break;
                    
                case 'STATUS_REPAIR_APPROVED':
                    reasonClass = 'text-green-600 dark:text-green-400';
                    displayReason = translatePunchTypes(record.punchTypes);
                    buttonHtml = `
                        <span class="text-sm font-semibold text-green-600 dark:text-green-400">
                            ✓ ${translatePunchTypes(record.punchTypes)}
                        </span>
                    `;
                    break;
                
                case 'STATUS_REPAIR_REJECTED':
                    reasonClass = 'text-orange-600 dark:text-orange-400';
                    displayReason = translatePunchTypes(record.punchTypes);
                    
                    // ⭐ 判斷是上班還是下班
                    const isIn = record.punchTypes && record.punchTypes.includes('上班');
                    const punchType = isIn ? '上班' : '下班';
                    
                    buttonHtml = `
                        <button data-date="${record.date}" 
                                data-type="${punchType}"
                                class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-orange-600 dark:bg-orange-500 rounded-md hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors">
                            ${t('REAPPLY') || 'Reapply'}
                        </button>
                    `;
                    break;
                    
                case 'STATUS_PUNCH_IN_MISSING':
                    reasonClass = 'text-red-600 dark:text-red-400';
                    displayReason = t('STATUS_PUNCH_IN_MISSING');
                    buttonHtml = `
                        <button data-date="${record.date}" 
                                data-type="上班"
                                class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors">
                            ${t('BTN_ADJUST_IN')}
                        </button>
                    `;
                    break;
                    
                case 'STATUS_PUNCH_OUT_MISSING':
                    reasonClass = 'text-red-600 dark:text-red-400';
                    displayReason = t('STATUS_PUNCH_OUT_MISSING');
                    buttonHtml = `
                        <button data-date="${record.date}" 
                                data-type="下班"
                                class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-purple-600 dark:bg-purple-500 rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors">
                            ${t('BTN_ADJUST_OUT')}
                        </button>
                    `;
                    break;
                    
                default:
                    reasonClass = 'text-gray-600 dark:text-gray-400';
                    displayReason = t(record.reason) || record.reason;
                    buttonHtml = '';
            }
            
            const li = document.createElement('li');
            li.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center dark:bg-gray-700';
            
            li.innerHTML = `
                <div>
                    <p class="font-medium text-gray-800 dark:text-white">${record.date}</p>
                    <p class="text-sm ${reasonClass}">
                        ${displayReason}
                    </p>
                </div>
                ${buttonHtml}
            `;
            
            abnormalList.appendChild(li);
        });
        
        console.log('✅ 渲染完成');
        
    } else {
        console.log('ℹ️  沒有異常記錄');
        recordsEmpty.style.display = 'block';
        abnormalList.innerHTML = '';
    }
}
/**
/**
 * ✅ 檢查本月打卡異常（完整修正版 - 支援多語言）
 */
async function checkAbnormal() {
    const now = new Date();
    const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const userId = localStorage.getItem("sessionUserId");
    
    console.log('🔍 開始檢查異常記錄');
    
    const recordsLoading = document.getElementById("abnormal-records-loading");
    const abnormalRecordsSection = document.getElementById("abnormal-records-section");
    const abnormalList = document.getElementById("abnormal-list");
    const recordsEmpty = document.getElementById("abnormal-records-empty");
    
    if (!recordsLoading || !abnormalRecordsSection || !abnormalList || !recordsEmpty) {
        console.error('❌ 找不到必要的 DOM 元素');
        return;
    }
    
    recordsLoading.style.display = 'block';
    abnormalRecordsSection.style.display = 'none';
    
    // ⭐⭐⭐ 翻譯映射函數
    function translatePunchTypes(punchTypes) {
        if (!punchTypes) return '';
        
        const translations = {
            '補上班審核中': t('STATUS_REPAIR_PENDING_IN') || 'Punch In Review Pending',
            '補下班審核中': t('STATUS_REPAIR_PENDING_OUT') || 'Punch Out Review Pending',
            '補上班通過': t('STATUS_REPAIR_APPROVED_IN') || 'Punch In Approved',
            '補下班通過': t('STATUS_REPAIR_APPROVED_OUT') || 'Punch Out Approved',
            '補上班被拒絕': t('STATUS_REPAIR_REJECTED_IN') || 'Punch In Rejected',
            '補下班被拒絕': t('STATUS_REPAIR_REJECTED_OUT') || 'Punch Out Rejected'
        };
        
        return translations[punchTypes] || punchTypes;
    }
    
    try {
        const res = await callApifetch(`getAbnormalRecords&month=${month}&userId=${userId}`);
        
        console.log('📤 API 回傳結果:', res);
        console.log('   記錄數量:', res.records?.length || 0);
        
        recordsLoading.style.display = 'none';
        
        if (res.ok) {
            abnormalRecordsSection.style.display = 'block';
            
            if (res.records && res.records.length > 0) {
                console.log('✅ 有異常記錄，開始渲染');
                
                recordsEmpty.style.display = 'none';
                abnormalList.innerHTML = '';
                
                // ✅ 按日期排序（由新到舊）
                const sortedRecords = res.records.sort((a, b) => {
                    return new Date(b.date) - new Date(a.date);
                });
                
                sortedRecords.forEach((record, index) => {
                    console.log(`   渲染第 ${index + 1} 筆: ${record.date} - ${record.reason}`);
                    
                    let reasonClass, displayReason, buttonHtml;
                    
                    switch(record.reason) {
                        case 'STATUS_REPAIR_PENDING':
                            // 審核中 - 黃色，按鈕禁用
                            reasonClass = 'text-yellow-600 dark:text-yellow-400';
                            displayReason = translatePunchTypes(record.punchTypes);
                            buttonHtml = `
                                <span class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                                    ⏳ ${translatePunchTypes(record.punchTypes)}
                                </span>
                            `;
                            break;
                            
                        case 'STATUS_REPAIR_APPROVED':
                            // 已通過 - 綠色，按鈕禁用
                            reasonClass = 'text-green-600 dark:text-green-400';
                            displayReason = translatePunchTypes(record.punchTypes);
                            buttonHtml = `
                                <span class="text-sm font-semibold text-green-600 dark:text-green-400">
                                    ✓ ${translatePunchTypes(record.punchTypes)}
                                </span>
                            `;
                            break;
                            
                        case 'STATUS_PUNCH_IN_MISSING':
                            // 缺上班卡 - 紅色，可補打卡
                            reasonClass = 'text-red-600 dark:text-red-400';
                            displayReason = t('STATUS_PUNCH_IN_MISSING');
                            buttonHtml = `
                                <button data-date="${record.date}" 
                                        data-type="上班"
                                        class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors">
                                    ${t('BTN_ADJUST_IN')}
                                </button>
                            `;
                            break;
                            
                        case 'STATUS_PUNCH_OUT_MISSING':
                            // 缺下班卡 - 紅色，可補打卡
                            reasonClass = 'text-red-600 dark:text-red-400';
                            displayReason = t('STATUS_PUNCH_OUT_MISSING');
                            buttonHtml = `
                                <button data-date="${record.date}" 
                                        data-type="下班"
                                        class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-purple-600 dark:bg-purple-500 rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors">
                                    ${t('BTN_ADJUST_OUT')}
                                </button>
                            `;
                            break;

                        case 'STATUS_REPAIR_REJECTED':
                            // ❌ 被拒絕 - 橘色，可重新申請
                            reasonClass = 'text-orange-600 dark:text-orange-400';
                            displayReason = translatePunchTypes(record.punchTypes);
                            
                            // ⭐ 判斷是上班還是下班
                            const isIn = record.punchTypes && record.punchTypes.includes('上班');
                            const punchType = isIn ? '上班' : '下班';
                            
                            buttonHtml = `
                                <button data-date="${record.date}" 
                                        data-type="${punchType}"
                                        class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-orange-600 dark:bg-orange-500 rounded-md hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors">
                                    ${t('REAPPLY') || 'Reapply'}
                                </button>
                            `;
                            break;
                            
                        default:
                            reasonClass = 'text-gray-600 dark:text-gray-400';
                            displayReason = t(record.reason) || record.reason;
                            buttonHtml = '';
                    }
                    
                    const li = document.createElement('li');
                    li.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center dark:bg-gray-700';
                    
                    li.innerHTML = `
                        <div>
                            <p class="font-medium text-gray-800 dark:text-white">${record.date}</p>
                            <p class="text-sm ${reasonClass}">
                                ${displayReason}
                            </p>
                        </div>
                        ${buttonHtml}
                    `;
                    
                    abnormalList.appendChild(li);
                });
                
                console.log('✅ 渲染完成');
                
            } else {
                console.log('ℹ️  沒有異常記錄');
                recordsEmpty.style.display = 'block';
                abnormalList.innerHTML = '';
            }
        } else {
            console.error("❌ API 返回失敗:", res.msg || res.code);
            showNotification(t("ERROR_FETCH_RECORDS") || "無法取得記錄", "error");
        }
    } catch (err) {
        console.error('❌ 發生錯誤:', err);
        recordsLoading.style.display = 'none';
        showNotification(t("ERROR_FETCH_RECORDS") || "無法取得記錄", "error");
    }
}
// 渲染日曆的函式
async function renderCalendar(date) {
    const monthTitle = document.getElementById('month-title');
    const calendarGrid = document.getElementById('calendar-grid');
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    
    // 生成 monthKey
    const monthkey = currentMonthDate.getFullYear() + "-" + String(currentMonthDate.getMonth() + 1).padStart(2, "0");
    
    // 檢查快取中是否已有該月份資料
    if (monthDataCache[monthkey]) {
        // 如果有，直接從快取讀取資料並渲染
        const records = monthDataCache[monthkey];
        renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
        
        // ✨ 新增：更新統計資料
        updateMonthlyStats(records);
        
    } else {
        // 如果沒有，才發送 API 請求
        // 清空日曆，顯示載入狀態，並確保置中
        calendarGrid.innerHTML = '<div data-i18n="LOADING" class="col-span-full text-center text-gray-500 dark:text-gray-400 py-4">正在載入...</div>';
        renderTranslations(calendarGrid);
        try {
            const res = await callApifetch(`getAttendanceDetails&month=${monthkey}&userId=${userId}`);
            if (res.ok) {
                // 將資料存入快取
                monthDataCache[monthkey] = res.records;
                
                // 收到資料後，清空載入訊息
                calendarGrid.innerHTML = '';
                
                // 從快取取得本月資料
                const records = monthDataCache[monthkey] || [];
                renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
                
                // ✨ 新增：更新統計資料
                updateMonthlyStats(records);
                
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

/**
 * ✅ 更新本月出勤統計（已移除總工時）
 */
async function updateMonthlyStats(records) {
    const workDaysEl = document.getElementById('stats-work-days-value');
    const abnormalCountEl = document.getElementById('stats-abnormal-count-value');
    const normalDaysEl = document.getElementById('stats-normal-days-value');
    const overtimeHoursEl = document.getElementById('stats-overtime-hours-value');
    
    if (!workDaysEl || !abnormalCountEl || !normalDaysEl) {
        console.warn('找不到統計元素');
        return;
    }
    
    // ⭐ 統計數據全部使用前端計算
    let workDays = 0;
    let abnormalCount = 0;
    let normalDays = 0;
    let totalOvertimeHours = 0;
    
    records.forEach(record => {
        // 計算工作天數
        const punchIn = record.record ? record.record.find(r => r.type === '上班') : null;
        const punchOut = record.record ? record.record.find(r => r.type === '下班') : null;
        
        if (punchIn && punchOut) {
            workDays++;
        }
        
        // 計算加班時數
        let overtimeFromPunch = 0;
        if (punchIn && punchOut) {
            try {
                const inTime = new Date(`${record.date} ${punchIn.time}`);
                const outTime = new Date(`${record.date} ${punchOut.time}`);
                const diffMs = outTime - inTime;
                const totalHoursRaw = diffMs / (1000 * 60 * 60);
                
                if (totalHoursRaw > 0) {
                    const lunchBreak = 1;
                    const netHours = totalHoursRaw - lunchBreak;
                    overtimeFromPunch = Math.max(0, netHours - 8);
                }
            } catch (e) {
                console.error('計算工時失敗:', e);
            }
        }
        
        // 檢查手動申請的加班
        let overtimeFromApplication = 0;
        if (record.overtime) {
            const status = String(
                record.overtime.status || 
                record.overtime.reviewStatus || 
                record.overtime.approvalStatus || 
                ''
            ).toLowerCase().trim();
            
            if (status === 'approved' || status === '已核准') {
                overtimeFromApplication = parseFloat(record.overtime.hours) || 0;
            } else if (status === '' && record.overtime.hours) {
                overtimeFromApplication = parseFloat(record.overtime.hours) || 0;
            }
        }
        
        const dayOvertimeHours = Math.max(overtimeFromPunch, overtimeFromApplication);
        totalOvertimeHours += dayOvertimeHours;
        
        // 判斷異常記錄
        const abnormalReasons = [
            'STATUS_PUNCH_IN_MISSING',
            'STATUS_PUNCH_OUT_MISSING',
            'STATUS_REPAIR_PENDING',
            'STATUS_REPAIR_REJECTED'
        ];
        
        if (abnormalReasons.includes(record.reason)) {
            abnormalCount++;
        } else if (record.reason === 'STATUS_PUNCH_NORMAL' || record.reason === 'STATUS_REPAIR_APPROVED') {
            normalDays++;
        }
    });
    
    // 更新 DOM
    workDaysEl.textContent = workDays;
    abnormalCountEl.textContent = abnormalCount;
    normalDaysEl.textContent = normalDays;
    
    if (overtimeHoursEl) {
        overtimeHoursEl.textContent = totalOvertimeHours > 0 ? totalOvertimeHours.toFixed(1) : '0';
    }
}

async function submitAdjustPunch(date, type, note) {
    try {
        showNotification("正在提交補打卡...", "info");
        
        const sessionToken = localStorage.getItem("sessionToken");
        
        // 取得當前位置
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // 設定預設時間
        const datetime = `${date}T${type === '上班' ? '09:00:00' : '18:00:00'}`;
        
        const params = new URLSearchParams({
            token: sessionToken,
            type: type,
            lat: lat,
            lng: lng,
            datetime: datetime,
            note: note || `補打卡 - ${type}`
        });
        
        const res = await callApifetch(`adjustPunch&${params.toString()}`);
        
        if (res.ok) {
            showNotification("補打卡申請成功！等待管理員審核", "success");
            
            // ⭐⭐⭐ 關鍵：補打卡成功後，重新檢查異常記錄
            await checkAbnormal();
            
            // 關閉對話框
            closeAdjustDialog();
        } else {
            showNotification(t(res.code) || "補打卡失敗", "error");
        }
    } catch (err) {
        console.error('補打卡錯誤:', err);
        showNotification("補打卡失敗", "error");
    }
}

// 新增一個獨立的渲染函式，以便從快取或 API 回應中調用
// 在 script.js 中找到 renderCalendarWithData 函數，並修改如下：

function renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle) {
    calendarGrid.innerHTML = '';
    monthTitle.textContent = t("MONTH_YEAR_TEMPLATE", {
        year: year,
        month: month+1
    });
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell';
        calendarGrid.appendChild(emptyCell);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        const cellDate = new Date(year, month, i);
        dayCell.textContent = i;
        let dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        let dateClass = 'normal-day';
        
        const todayRecords = records.filter(r => r.date === dateKey);
        
        // ✅ 移除：不再添加 emoji 圖示
        // const statusIcons = [];
        
        if (todayRecords.length > 0) {
            const record = todayRecords[0];
            const reason = record.reason;
            
            // 👉 判斷打卡狀態
            switch (reason) {
                case "STATUS_PUNCH_IN_MISSING":
                case "STATUS_PUNCH_OUT_MISSING":
                    dateClass = 'abnormal-day';
                    break;
                case "STATUS_PUNCH_NORMAL":
                    dateClass = 'day-off';
                    break;
                case "STATUS_REPAIR_PENDING":
                    dateClass = 'pending-virtual';
                    break;
                case "STATUS_REPAIR_APPROVED":
                    dateClass = 'approved-virtual';
                    break;
                case "STATUS_NO_RECORD":
                    // 如果有加班或請假，則顯示為特殊狀態
                    if (record.overtime || record.leave) {
                        dateClass = 'day-off';
                    }
                    break;
                default:
                    if (reason && reason !== "") {
                        dateClass = 'pending-adjustment';
                    }
                    break;
            }
            
            // ✅ 移除：不再添加加班和請假的 emoji
            /*
            // 👉 如果有加班記錄，加上特殊標記
            if (record.overtime) {
                statusIcons.push('⏰');
            }
            
            // 👉 如果有請假記錄，加上特殊標記
            if (record.leave) {
                const leaveStatus = record.leave.status;
                
                // 根據請假狀態設定不同圖示
                if (leaveStatus === 'APPROVED') {
                    statusIcons.push('🏖️');
                    dateClass = 'leave-day'; // 新的 CSS 類別
                } else if (leaveStatus === 'PENDING') {
                    statusIcons.push('⏳');
                } else if (leaveStatus === 'REJECTED') {
                    statusIcons.push('❌');
                }
            }
            */
        }
        
        const isToday = (year === today.getFullYear() && month === today.getMonth() && i === today.getDate());
        if (isToday) {
            dayCell.classList.add('today');
        } else if (cellDate > today) {
            dayCell.classList.add('future-day');
            dayCell.style.pointerEvents = 'none';
        } else {
            dayCell.classList.add(dateClass);
        }
        
        // ✅ 移除：不再顯示 emoji 圖示
        /*
        // 👉 將日期和圖示組合顯示
        if (statusIcons.length > 0) {
            dayCell.innerHTML = `
                <div class="day-cell-content">
                    <span class="day-number">${i}</span>
                    <div class="status-icons">
                        ${statusIcons.map(icon => `<span class="status-icon">${icon}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        */
        
        dayCell.classList.add('day-cell');
        dayCell.dataset.date = dateKey;
        dayCell.dataset.records = JSON.stringify(todayRecords);
        calendarGrid.appendChild(dayCell);
    }
}

/**
 * ✅ 渲染每日打卡記錄（改進版 - 請假資訊顯示在打卡記錄下方）
 * 
 * 修改說明：
 * 1. 添加標題區塊，清楚標示日期
 * 2. 打卡記錄使用卡片樣式，更清晰
 * 3. 請假資訊緊接在打卡記錄下方，而非獨立區塊
 * 4. 優化視覺層次，使用圖標和顏色增強可讀性
 */

async function renderDailyRecords(dateKey) {
    const dailyRecordsCard = document.getElementById('daily-records-card');
    const dailyRecordsTitle = document.getElementById('daily-records-title');
    const dailyRecordsList = document.getElementById('daily-records-list');
    const dailyRecordsEmpty = document.getElementById('daily-records-empty');
    const recordsLoading = document.getElementById("daily-records-loading");
    const adjustmentFormContainer = document.getElementById('daily-adjustment-form-container');
    
    if (!dailyRecordsCard || !dailyRecordsTitle || !dailyRecordsList || !dailyRecordsEmpty) {
        console.error('❌ renderDailyRecords: 找不到必要的 DOM 元素');
        showNotification('介面元素載入失敗，請重新整理頁面', 'error');
        return;
    }
    
    dailyRecordsTitle.textContent = t("DAILY_RECORDS_TITLE", { dateKey: dateKey });
    dailyRecordsList.innerHTML = '';
    dailyRecordsEmpty.style.display = 'none';
    
    if (adjustmentFormContainer) {
        adjustmentFormContainer.innerHTML = '';
    }
    
    if (recordsLoading) {
        recordsLoading.style.display = 'block';
    }
    
    const dateObject = new Date(dateKey);
    const month = dateObject.getFullYear() + "-" + String(dateObject.getMonth() + 1).padStart(2, '0');
    const userId = localStorage.getItem("sessionUserId");
    
    if (monthDataCache[month]) {
        renderRecords(monthDataCache[month]);
        if (recordsLoading) {
            recordsLoading.style.display = 'none';
        }
    } else {
        try {
            const res = await callApifetch(`getAttendanceDetails&month=${month}&userId=${userId}`);
            if (recordsLoading) {
                recordsLoading.style.display = 'none';
            }
            if (res.ok) {
                monthDataCache[month] = res.records;
                renderRecords(res.records);
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
            if (recordsLoading) {
                recordsLoading.style.display = 'none';
            }
        }
    }
    
    function renderRecords(records) {
        const dailyRecords = records.filter(record => record.date === dateKey);
        
        if (dailyRecords.length > 0) {
            dailyRecordsEmpty.style.display = 'none';
            
            dailyRecords.forEach(recordData => {
                const li = document.createElement('li');
                li.className = 'p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3';
                
                let workHoursDecimal = 0;
                let overtimeHours = 0;
                let hasOvertime = false;
                let punchInRecord = null;
                let punchOutRecord = null;
                // 📋 標題區塊
                const titleHtml = `
                    <div class="flex items-center justify-between mb-3 pb-2 border-b-2 border-gray-300 dark:border-gray-600">
                        <h4 class="text-lg font-bold text-gray-800 dark:text-white">
                            📅 ${dateKey} <span data-i18n="DAILY_ATTENDANCE_TITLE">出勤記錄</span>
                        </h4>
                    </div>
                `;
                
                // ⏰ 打卡記錄區塊
                let recordHtml = '';
                if (recordData.record && recordData.record.length > 0) {
                    recordHtml = `
                        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                            <h5 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                                </svg>
                                <span data-i18n="PUNCH_RECORDS_TITLE">打卡紀錄</span>
                            </h5>
                            <div class="space-y-2">
                                ${recordData.record.map(r => {
                                    const typeKey = r.type === '上班' ? 'PUNCH_IN' : 'PUNCH_OUT';
                                    const typeColor = r.type === '上班' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                                    return `
                                        <div class="flex items-start space-x-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                            <span class="${typeColor} font-bold text-sm">●</span>
                                            <div class="flex-1">
                                                <p class="font-medium text-gray-800 dark:text-white">
                                                    ${r.time} - <span data-i18n="${typeKey}">${t(typeKey)}</span>
                                                </p>
                                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                                    📍 ${r.location}
                                                </p>
                                                ${r.note ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">💭 ${r.note}</p>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join("")}
                            </div>
                        </div>
                    `;
                } else {
                    recordHtml = `
                        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                            <p class="text-sm text-gray-500 dark:text-gray-400 italic text-center py-2">
                                ⚠️ <span data-i18n="DAILY_RECORDS_EMPTY">該日沒有打卡紀錄</span>
                            </p>
                        </div>
                    `;
                }
                
                // 加班資訊區塊
                let overtimeHtml = '';
                if (recordData.overtime) {
                    const ot = recordData.overtime;
                    overtimeHtml = `
                        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                                <h5 class="text-sm font-semibold flex items-center">
                                    <svg class="w-4 h-4 mr-2 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                                    </svg>
                                    <span data-i18n="OVERTIME_PERIOD">加班時段</span>
                                </h5>
                                <span class="px-2 py-1 bg-orange-600 text-white text-xs font-bold rounded-full">
                                    ${ot.hours} <span data-i18n="UNIT_HOURS">小時</span>
                                </span>
                            </div>
                            <div class="space-y-1 pl-6">
                                <p class="text-sm text-orange-700 dark:text-orange-400">
                                    <span data-i18n="TIME_LABEL">時間</span>：<span class="font-semibold">${ot.startTime} - ${ot.endTime}</span>
                                </p>
                                ${ot.reason ? `
                                    <p class="text-sm text-orange-600 dark:text-orange-300">
                                        <span data-i18n="REASON_LABEL">原因</span>：${ot.reason}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }
                
                let overtimeAlertHtml = '';
                if (hasOvertime && overtimeHours > 0) {
                    overtimeAlertHtml = `
                        <div class="mt-3 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="flex items-center mb-2">
                                        <svg class="w-5 h-5 text-orange-600 dark:text-orange-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                                        </svg>
                                        <h4 class="text-sm font-bold text-orange-800 dark:text-orange-300">
                                            偵測到加班時數
                                        </h4>
                                    </div>
                                    <div class="ml-7 space-y-1">
                                        <p class="text-sm text-orange-700 dark:text-orange-400">
                                            <span class="font-semibold">總工時：</span>${workHoursDecimal.toFixed(2)} 小時
                                        </p>
                                        <p class="text-sm text-orange-700 dark:text-orange-400">
                                            <span class="font-semibold">標準工時：</span>8 小時（已扣除午休 1 小時）
                                        </p>
                                        <p class="text-sm font-bold text-orange-800 dark:text-orange-200">
                                            <span class="text-orange-600 dark:text-orange-400"> 加班時數：</span>${overtimeHours.toFixed(2)} 小時
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onclick="quickApplyOvertime('${recordData.date}', '${punchInRecord.time}', '${punchOutRecord.time}', ${overtimeHours.toFixed(2)})"
                                    class="ml-4 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-sm font-bold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center space-x-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                    </svg>
                                    <span>快速申請</span>
                                </button>
                            </div>
                        </div>
                    `;
                }
                // 請假資訊區塊
                let leaveHtml = '';
                if (recordData.leave) {
                    const leave = recordData.leave;
                    let statusClass = 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700';
                    let statusBadgeClass = 'bg-yellow-600 text-white';
                    let statusText = t('PENDING');
                    let statusIcon = '⏳';
                    
                    if (leave.status === 'APPROVED') {
                        statusClass = 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700';
                        statusBadgeClass = 'bg-green-600 text-white';
                        statusText = t('APPROVED');
                        statusIcon = '✅';
                    } else if (leave.status === 'REJECTED') {
                        statusClass = 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700';
                        statusBadgeClass = 'bg-red-600 text-white';
                        statusText = t('REJECTED');
                        statusIcon = '❌';
                    }
                    
                    leaveHtml = `
                        <div class="${statusClass} border-2 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                                <h5 class="text-sm font-semibold flex items-center">
                                    <svg class="w-4 h-4 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                                        <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
                                    </svg>
                                    <span data-i18n="LEAVE_INFO_TITLE">請假資訊</span>
                                </h5>
                                <span class="px-2 py-1 text-xs font-bold rounded-full ${statusBadgeClass}">
                                    ${statusIcon} ${statusText}
                                </span>
                            </div>
                            <div class="space-y-1 pl-6">
                                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <span data-i18n="LEAVE_TYPE">假別</span>：<span class="text-blue-600 dark:text-blue-400 font-semibold" data-i18n="${leave.leaveType}">${t(leave.leaveType)}</span>
                                </p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">
                                    <span data-i18n="LEAVE_DAYS_COUNT">天數</span>：<span class="font-semibold">${leave.days}</span> <span data-i18n="UNIT_DAYS">天</span>
                                </p>
                                ${leave.reason ? `
                                    <p class="text-sm text-gray-600 dark:text-gray-400">
                                        <span data-i18n="LEAVE_REASON_DISPLAY">原因</span>：${leave.reason}
                                    </p>
                                ` : ''}
                                ${leave.reviewComment ? `
                                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <span data-i18n="REVIEW_COMMENT">審核意見</span>：${leave.reviewComment}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }
                
                // 📊 系統判斷狀態
                const statusHtml = `
                    <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 text-center">
                        <p class="text-sm text-gray-600 dark:text-gray-400">
                            <span data-i18n="SYSTEM_JUDGMENT">系統判斷</span>：
                            <span class="font-semibold text-gray-800 dark:text-white" data-i18n="${recordData.reason}">${t(recordData.reason)}</span>
                        </p>
                    </div>
                `;
                
                li.innerHTML = titleHtml + recordHtml + overtimeHtml + leaveHtml + statusHtml;
                dailyRecordsList.appendChild(li);
                renderTranslations(li);
            });
        } else {
            dailyRecordsEmpty.style.display = 'block';
        }
        
        dailyRecordsCard.style.display = 'block';
    }
}

// ==================== 地點搜尋功能 ====================

/**
 * 使用 Nominatim API 搜尋地點
 */
async function searchLocation(query) {
    if (!query || query.trim() === '') {
        return [];
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=zh-TW`
        );
        
        if (!response.ok) {
            throw new Error('搜尋失敗');
        }
        
        const results = await response.json();
        return results;
        
    } catch (error) {
        console.error('地點搜尋錯誤:', error);
        showNotification('搜尋失敗，請檢查網路連線', 'error');
        return [];
    }
}

/**
 * 顯示搜尋結果
 */
function displaySearchResults(results) {
    const resultsList = document.getElementById('search-results-list');
    const resultsContainer = document.getElementById('search-results');
    
    if (!resultsList || !resultsContainer) return;
    
    resultsList.innerHTML = '';
    
    if (results.length === 0) {
        resultsContainer.classList.add('hidden');
        showNotification('找不到相關地點', 'warning');
        return;
    }
    
    resultsContainer.classList.remove('hidden');
    
    results.forEach(result => {
        const li = document.createElement('li');
        li.className = 'text-sm text-gray-800 dark:text-gray-200';
        li.innerHTML = `
            <div class="font-semibold">${result.display_name}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ${parseFloat(result.lat).toFixed(6)}, ${parseFloat(result.lon).toFixed(6)}
            </div>
        `;
        
        li.addEventListener('click', () => {
            selectSearchResult(result);
        });
        
        resultsList.appendChild(li);
    });
}

/**
 * 選擇搜尋結果
 */
function selectSearchResult(result) {
    const nameInput = document.getElementById('location-name');
    const latInput = document.getElementById('location-lat');
    const lngInput = document.getElementById('location-lng');
    const addBtn = document.getElementById('add-location-btn');
    const resultsContainer = document.getElementById('search-results');
    
    if (nameInput) nameInput.value = result.display_name.split(',')[0].trim();
    if (latInput) latInput.value = parseFloat(result.lat).toFixed(6);
    if (lngInput) lngInput.value = parseFloat(result.lon).toFixed(6);
    if (addBtn) addBtn.disabled = false;
    if (resultsContainer) resultsContainer.classList.add('hidden');
    
    // 更新地圖標記
    if (mapInstance && marker) {
        const coords = [parseFloat(result.lat), parseFloat(result.lon)];
        currentCoords = coords;
        mapInstance.setView(coords, 18);
        marker.setLatLng(coords);
        
        // 更新圓形範圍
        const radius = parseInt(document.getElementById('location-radius').value);
        if (circle) {
            circle.setLatLng(coords);
            circle.setRadius(radius);
        } else {
            circle = L.circle(coords, {
                color: 'blue',
                fillColor: '#30f',
                fillOpacity: 0.2,
                radius: radius
            }).addTo(mapInstance);
        }
    }
    
    showNotification('已選擇地點', 'success');
}

// ==================== 範圍調整拉桿 ====================

/**
 * 初始化範圍拉桿
 */
function initRadiusSlider() {
    const slider = document.getElementById('location-radius');
    const valueDisplay = document.getElementById('radius-value');
    
    if (!slider || !valueDisplay) return;
    
    slider.addEventListener('input', (e) => {
        const value = e.target.value;
        valueDisplay.textContent = value;
        
        // 即時更新地圖上的圓形範圍
        if (circle && currentCoords) {
            circle.setRadius(parseInt(value));
        }
    });
}
document.addEventListener('DOMContentLoaded', async () => {
    
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const punchInBtn = document.getElementById('punch-in-btn');
    const punchOutBtn = document.getElementById('punch-out-btn');
    const tabDashboardBtn = document.getElementById('tab-dashboard-btn');
    const tabMonthlyBtn = document.getElementById('tab-monthly-btn');
    const tabLocationBtn = document.getElementById('tab-location-btn');
    const tabAdminBtn = document.getElementById('tab-admin-btn');
    const tabOvertimeBtn = document.getElementById('tab-overtime-btn');
    const tabLeaveBtn = document.getElementById('tab-leave-btn'); // 👈 新增請假按鈕
    const tabSalaryBtn = document.getElementById('tab-salary-btn'); // 👈 新增
    const abnormalList = document.getElementById('abnormal-list');
    const adjustmentFormContainer = document.getElementById('adjustment-form-container');
    const calendarGrid = document.getElementById('calendar-grid');
    // 取得當前位置按鈕事件
    const getLocationBtn = document.getElementById('get-location-btn');
    const locationLatInput = document.getElementById('location-lat');
    const locationLngInput = document.getElementById('location-lng');
    const addLocationBtn = document.getElementById('add-location-btn');
    // 👇 新增：綁定用戶管理按鈕
    const refreshUsersBtn = document.getElementById('refresh-users-btn');
    if (refreshUsersBtn) {
        refreshUsersBtn.addEventListener('click', loadAllUsers);
    }

    // 👇 新增：綁定搜尋功能
    const searchUsersInput = document.getElementById('search-users-input');
    if (searchUsersInput) {
        searchUsersInput.addEventListener('input', (e) => {
            filterUsersList(e.target.value);
        });
    }
    let pendingRequests = []; // 新增：用於快取待審核的請求
    
    // 全域變數，用於儲存地圖實例
    let mapInstance = null;
    let mapLoadingText = null;
    let currentCoords = null;
    let marker = null;
    let circle = null;
    /**
     * 從後端取得所有打卡地點，並將它們顯示在地圖上。
     */
    // 全域變數，用於儲存地點標記和圓形
    let locationMarkers = L.layerGroup();
    let locationCircles = L.layerGroup();
    
    /**
     * 取得並渲染所有待審核的請求。
     */
    async function fetchAndRenderReviewRequests() {
        const loadingEl = document.getElementById('requests-loading');
        const emptyEl = document.getElementById('requests-empty');
        const listEl = document.getElementById('pending-requests-list');
        
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        try {
            const res = await callApifetch("getReviewRequest");
            
            if (res.ok && Array.isArray(res.reviewRequest)) {
                pendingRequests = res.reviewRequest; // 快取所有請求
                
                if (pendingRequests.length === 0) {
                    emptyEl.style.display = 'block';
                } else {
                    renderReviewRequests(pendingRequests);
                }
            } else {
                showNotification("取得待審核請求失敗：" + res.msg, "error");
                emptyEl.style.display = 'block';
            }
        } catch (error) {
            showNotification("取得待審核請求失敗，請檢查網路。", "error");
            emptyEl.style.display = 'block';
            console.error("Failed to fetch review requests:", error);
        } finally {
            loadingEl.style.display = 'none';
        }
    }
    
    /**
     * 根據資料渲染待審核列表。
     * @param {Array<Object>} requests - 請求資料陣列。
     */
    function renderReviewRequests(requests) {
        const listEl = document.getElementById('pending-requests-list');
        listEl.innerHTML = '';
        
        requests.forEach((req, index) => {
            const li = document.createElement('li');
            li.className = 'p-4 bg-gray-50 rounded-lg shadow-sm flex flex-col space-y-3 dark:bg-gray-700';
            
            // 👇 優化顯示布局
            li.innerHTML = `
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <span class="font-bold text-gray-800 dark:text-white">${req.name}</span>
                            <span class="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                ${req.remark}
                            </span>
                        </div>
                        
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            <span data-i18n-key="${req.type}"></span>
                        </p>
                        
                        <p class="text-xs text-gray-500 dark:text-gray-500">
                            ${req.applicationPeriod}
                        </p>
                        
                        <!-- 👇 新增：顯示補打卡理由 -->
                        ${req.note ? `
                            <div class="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 rounded">
                                <p class="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                                    📝 補打卡理由：
                                </p>
                                <p class="text-sm text-yellow-700 dark:text-yellow-400">
                                    ${req.note}
                                </p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="flex justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <button data-i18n="ADMIN_APPROVE_BUTTON" 
                            data-index="${index}" 
                            class="approve-btn px-4 py-2 rounded-md text-sm font-bold btn-primary">
                        核准
                    </button>
                    <button data-i18n="ADMIN_REJECT_BUTTON" 
                            data-index="${index}" 
                            class="reject-btn px-4 py-2 rounded-md text-sm font-bold btn-warning">
                        拒絕
                    </button>
                </div>
            `;
            
            listEl.appendChild(li);
            renderTranslations(li);
        });
        
        // 保持原有的按鈕事件綁定
        listEl.querySelectorAll('.approve-btn').forEach(button => {
            button.addEventListener('click', (e) => handleReviewAction(e.currentTarget, e.currentTarget.dataset.index, 'approve'));
        });
        
        listEl.querySelectorAll('.reject-btn').forEach(button => {
            button.addEventListener('click', (e) => handleReviewAction(e.currentTarget, e.currentTarget.dataset.index, 'reject'));
        });
    }
    
    /**
     * 處理審核動作（核准或拒絕）。
     * @param {HTMLElement} button - 被點擊的按鈕元素。
     * @param {number} index - 請求在陣列中的索引。
     * @param {string} action - 'approve' 或 'reject'。
     */
    async function handleReviewAction(button, index, action) {
        const request = pendingRequests[index];
        if (!request) {
            showNotification("找不到請求資料。", "error");
            return;
        }

        const recordId = request.id;
        const endpoint = action === 'approve' ? 'approveReview' : 'rejectReview';
        const loadingText = t('LOADING') || '處理中...';
        
        // A. 進入處理中狀態
        generalButtonState(button, 'processing', loadingText);
        
        try {
            const res = await callApifetch(`${endpoint}&id=${recordId}`);
            
            if (res.ok) {
                const translationKey = action === 'approve' ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED';
                showNotification(t(translationKey), "success");
                
                // 由於成功後列表會被重新整理，這裡可以不立即恢復按鈕狀態
                // 但是為了保險起見，我們仍然在 finally 中恢復。
                
                // 延遲執行，讓按鈕的禁用狀態能被看到
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 列表重新整理會渲染新按鈕，覆蓋舊的按鈕
                fetchAndRenderReviewRequests();
            } else {
                showNotification(t('REVIEW_FAILED', { msg: res.msg }), "error");
            }
            
        } catch (err) {
            showNotification(t("REVIEW_NETWORK_ERROR"), "error");
            console.error(err);
            
        } finally {
            // B. 無論成功或失敗，都需要將按鈕恢復到可點擊狀態
            // 只有在列表沒有被重新整理時，這個恢復才有意義
            generalButtonState(button, 'idle');
        }
    }
    /**
     * 從後端取得所有打卡地點，並將它們顯示在地圖上。
     */
    async function fetchAndRenderLocationsOnMap() {
        try {
            const res = await callApifetch("getLocations");
            
            // 清除舊的地點標記和圓形
            locationMarkers.clearLayers();
            locationCircles.clearLayers();
            
            if (res.ok && Array.isArray(res.locations)) {
                // 遍歷所有地點並在地圖上放置標記和圓形
                res.locations.forEach(loc => {
                    // 如果沒有容許誤差，則預設為 50 公尺
                    const punchInRadius = loc.scope || 50;
                    
                    // 加入圓形範圍
                    const locationCircle = L.circle([loc.lat, loc.lng], {
                        color: 'red',
                        fillColor: '#f03',
                        fillOpacity: 0.2,
                        radius: punchInRadius
                    });
                    locationCircle.bindPopup(`<b>${loc.name}</b><br>可打卡範圍：${punchInRadius}公尺`);
                    locationCircles.addLayer(locationCircle);
                });
                
                // 將所有地點標記和圓形一次性加到地圖上
                locationMarkers.addTo(mapInstance);
                locationCircles.addTo(mapInstance);
                
                console.log("地點標記和範圍已成功載入地圖。");
            } else {
                showNotification("取得地點清單失敗：" + res.msg, "error");
                console.error("Failed to fetch locations:", res.msg);
            }
        } catch (error) {
            showNotification("取得地點清單失敗，請檢查網路。", "error");
            console.error("Failed to fetch locations:", error);
        }
    }
    // 初始化地圖並取得使用者位置
    function initLocationMap(forceReload = false){
        const mapContainer = document.getElementById('map-container');
        const statusEl = document.getElementById('location-status');
        const coordsEl = document.getElementById('location-coords');
        console.log(mapInstance && !forceReload);
        // 取得載入文字元素
        if (!mapLoadingText) {
            mapLoadingText = document.getElementById('map-loading-text');
        }
        // 檢查地圖實例是否已存在
        if (mapInstance) {
            // 如果已經存在，並且沒有被要求強制重新載入，則直接返回
            if (!forceReload) {
                mapInstance.invalidateSize();
                return;
            }
            
            // 如果被要求強制重新載入，則先徹底銷毀舊的地圖實例
            mapInstance.remove();
            mapInstance = null;
        }
        
        
        // 顯示載入中的文字
        mapLoadingText.style.display = 'block'; // 或 'block'，根據你的樣式決定
        
        // 建立地圖
        mapInstance = L.map('map-container', {
            center: [25.0330, 121.5654], // 預設中心點為台北市
            zoom: 13
        });
        
        // 加入 OpenStreetMap 圖層
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance);
        
        // 讓地圖在完成載入後隱藏載入中的文字
        mapInstance.whenReady(() => {
            mapLoadingText.style.display = 'none';
            // 確保地圖的尺寸正確
            mapInstance.invalidateSize();
        });
        
        // 顯示載入狀態
        //mapContainer.innerHTML = t("MAP_LOADING");
        statusEl.textContent = t('DETECTING_LOCATION');
        coordsEl.textContent = t('UNKNOWN_LOCATION');
        
        // 取得使用者地理位置
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                                                     (position) => {
                                                         const { latitude, longitude } = position.coords;
                                                         currentCoords = [latitude, longitude];
                                                         
                                                         // 更新狀態顯示
                                                         statusEl.textContent = t('DETECTION_SUCCESS');
                                                         coordsEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                                                         
                                                         // 設定地圖視圖
                                                         mapInstance.setView(currentCoords, 18);
                                                         
                                                         // 在地圖上放置標記
                                                         if (marker) mapInstance.removeLayer(marker);
                                                         marker = L.marker(currentCoords).addTo(mapInstance)
                                                         .bindPopup(t('CURRENT_LOCATION'))
                                                         .openPopup();
                                                         
                                                         
                                                     },
                                                     (error) => {
                                                         // 處理定位失敗
                                                         statusEl.textContent = t('ERROR_GEOLOCATION_PERMISSION_DENIED');
                                                         console.error("Geolocation failed:", error);
                                                         
                                                         let message;
                                                         switch(error.code) {
                                                             case error.PERMISSION_DENIED:
                                                                 message = t('ERROR_GEOLOCATION_PERMISSION_DENIED');
                                                                 break;
                                                             case error.POSITION_UNAVAILABLE:
                                                                 message = t('ERROR_GEOLOCATION_UNAVAILABLE');
                                                                 break;
                                                             case error.TIMEOUT:
                                                                 message = t('ERROR_GEOLOCATION_TIMEOUT');
                                                                 break;
                                                             case error.UNKNOWN_ERROR:
                                                                 message = t('ERROR_GEOLOCATION_UNKNOWN');
                                                                 break;
                                                         }
                                                         showNotification(`定位失敗：${message}`, "error");
                                                     }
                                                     );
            // 成功取得使用者位置後，載入所有打卡地點
            fetchAndRenderLocationsOnMap();
        } else {
            showNotification(t('ERROR_BROWSER_NOT_SUPPORTED'), "error");
            statusEl.textContent = '不支援定位';
        }
    }
    
    
    // 處理 API 測試按鈕事件
    document.getElementById('test-api-btn').addEventListener('click', async () => {
        // 這裡替換成您想要測試的 API action 名稱
        const testAction = "testEndpoint";
        
        try {
            // 使用 await 等待 API 呼叫完成並取得回應
            const res = await callApifetch(testAction);
            
            // 檢查 API 回應中的 'ok' 屬性
            if (res && res.ok) {
                showNotification("API 測試成功！回應：" + JSON.stringify(res), "success");
            } else {
                // 如果 res.ok 為 false，表示後端處理失敗
                showNotification("API 測試失敗：" + (res ? res.msg : "無回應資料"), "error");
            }
        } catch (error) {
            // 捕捉任何在 callApifetch 函式中拋出的錯誤（例如網路連線問題）
            console.error("API 呼叫發生錯誤:", error);
            showNotification("API 呼叫失敗，請檢查網路連線或後端服務。", "error");
        }
    });
    
    getLocationBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showNotification(t("ERROR_GEOLOCATION", { msg: t('ERROR_BROWSER_NOT_SUPPORTED') }), "error");
            return;
        }
        
        getLocationBtn.textContent = '取得中...';
        getLocationBtn.disabled = true;
        
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const radius = parseInt(document.getElementById('location-radius').value); // 新增
            
            locationLatInput.value = lat.toFixed(6);
            locationLngInput.value = lng.toFixed(6);
            getLocationBtn.textContent = '已取得';
            addLocationBtn.disabled = false;
            
            // 新增：更新地圖和圓形範圍
            if (mapInstance) {
                const coords = [lat, lng];
                currentCoords = coords;
                mapInstance.setView(coords, 18);
                
                if (marker) {
                    marker.setLatLng(coords);
                } else {
                    marker = L.marker(coords).addTo(mapInstance);
                }
                
                // 顯示圓形範圍
                if (circle) {
                    circle.setLatLng(coords);
                    circle.setRadius(radius);
                } else {
                    circle = L.circle(coords, {
                        color: 'blue',
                        fillColor: '#30f',
                        fillOpacity: 0.2,
                        radius: radius
                    }).addTo(mapInstance);
                }
            }
            
            showNotification('位置已成功取得！', 'success');
        }, (err) => {
            showNotification(t("ERROR_GEOLOCATION", { msg: err.message }), "error");
            getLocationBtn.textContent = '取得當前位置';
            getLocationBtn.disabled = false;
        });
    });
    // 處理新增打卡地點
    document.getElementById('add-location-btn').addEventListener('click', async () => {
        const name = document.getElementById('location-name').value;
        const lat = document.getElementById('location-lat').value;
        const lng = document.getElementById('location-lng').value;
        const radius = document.getElementById('location-radius').value; // 新增
        
        if (!name || !lat || !lng) {
            showNotification("請填寫所有欄位並取得位置", "error");
            return;
        }
        
        try {
            // 加入 radius 參數
            const res = await callApifetch(`addLocation&name=${encodeURIComponent(name)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${radius}`);
            if (res.ok) {
                showNotification("地點新增成功！", "success");
                
                // 清空輸入欄位
                document.getElementById('location-name').value = '';
                document.getElementById('location-lat').value = '';
                document.getElementById('location-lng').value = '';
                document.getElementById('location-search').value = ''; // 新增
                document.getElementById('location-radius').value = 200; // 新增
                document.getElementById('radius-value').textContent = '200'; // 新增
                
                // 重設按鈕狀態
                getLocationBtn.textContent = '取得當前位置';
                getLocationBtn.disabled = false;
                addLocationBtn.disabled = true;
                
                // 新增：清除地圖上的圓形
                if (circle) {
                    mapInstance.removeLayer(circle);
                    circle = null;
                }
            } else {
                showNotification("新增地點失敗：" + res.msg, "error");
            }
        } catch (err) {
            console.error(err);
        }
    });
    // UI切換邏輯
    const switchTab = (tabId) => {
        // 修改這一行，加入 'shift-view'
        const tabs = ['dashboard-view', 'monthly-view', 'location-view', 'shift-view', 'admin-view', 'overtime-view', 'leave-view', 'salary-view'];
        
        // 修改這一行，加入 'tab-shift-btn'
        const btns = ['tab-dashboard-btn', 'tab-monthly-btn', 'tab-location-btn', 'tab-shift-btn', 'tab-admin-btn', 'tab-overtime-btn', 'tab-leave-btn', 'tab-salary-btn'];
    
        // 1. 移除舊的 active 類別和 CSS 屬性
        tabs.forEach(id => {
            const tabElement = document.getElementById(id);
            tabElement.style.display = 'none';
            tabElement.classList.remove('active');
        });
        
        // 2. 移除按鈕的選中狀態
        btns.forEach(id => {
            const btnElement = document.getElementById(id);
            if (btnElement) {
                btnElement.classList.replace('bg-indigo-600', 'bg-gray-200');
                btnElement.classList.replace('text-white', 'text-gray-600');
                btnElement.classList.add('dark:text-gray-300', 'dark:bg-gray-700');
            }
        });
        
        // 3. 顯示新頁籤並新增 active 類別
        const newTabElement = document.getElementById(tabId);
        newTabElement.style.display = 'block';
        newTabElement.classList.add('active');
        
        // 4. 設定新頁籤按鈕的選中狀態
        const newBtnElement = document.getElementById(`tab-${tabId.replace('-view', '-btn')}`);
        if (newBtnElement) {
            newBtnElement.classList.replace('bg-gray-200', 'bg-indigo-600');
            newBtnElement.classList.replace('text-gray-600', 'text-white');
            newBtnElement.classList.remove('dark:text-gray-300', 'dark:bg-gray-700');
            newBtnElement.classList.add('dark:bg-indigo-500');
        }
        
        // 5. 根據頁籤 ID 執行特定動作
        if (tabId === 'monthly-view') {
            renderCalendar(currentMonthDate);
        } else if (tabId === 'location-view') {
            initLocationMap();
        } else if (tabId === 'shift-view') { // 新增：排班分頁初始化
            initShiftTab();
        } else if (tabId === 'admin-view') {
            fetchAndRenderReviewRequests();
            loadPendingOvertimeRequests();
            loadPendingLeaveRequests();
            displayAdminAnnouncements();
            initAdminAnalysis();
            loadAllUsers();
        } else if (tabId === 'overtime-view') {
            initOvertimeTab();
        } else if (tabId === 'leave-view') {
            initLeaveTab();
        } else if (tabId === 'salary-view') { // 👈 新增
            initSalaryTab();
        }
        
    };
    
    // 初始化拉桿
    initRadiusSlider();
    
    // 🔍 搜尋功能事件綁定
    const searchBtn = document.getElementById('search-location-btn');
    const searchInput = document.getElementById('location-search');
    
    if (searchBtn && searchInput) {
        // 點擊搜尋按鈕
        searchBtn.addEventListener('click', async () => {
            const query = searchInput.value.trim();
            if (query) {
                const results = await searchLocation(query);
                displaySearchResults(results);
            }
        });
        
        // Enter 鍵搜尋
        searchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    const results = await searchLocation(query);
                    displaySearchResults(results);
                }
            }
        });
    }
    
    // 點擊外部關閉搜尋結果
    document.addEventListener('click', (e) => {
        const resultsContainer = document.getElementById('search-results');
        const searchInput = document.getElementById('location-search');
        const searchBtn = document.getElementById('search-location-btn');
        
        if (resultsContainer && 
            !resultsContainer.contains(e.target) && 
            e.target !== searchInput && 
            e.target !== searchBtn) {
            resultsContainer.classList.add('hidden');
        }
    });
    // 語系初始化
    let currentLang = localStorage.getItem("lang"); // 先從 localStorage 讀取上次的設定
    
    // 如果 localStorage 沒有紀錄，才根據瀏覽器設定判斷
    if (!currentLang) {
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang.startsWith("zh")) {
            currentLang = "zh-TW";
        } else if (browserLang.startsWith("ja")) {
            currentLang = "ja"; // 建議使用 ja.json，所以這裡可以只用 'ja'
        } else if (browserLang.startsWith("vi")) {
            currentLang = "vi";
        } else if (browserLang.startsWith("id")) {
            currentLang = "id";
        } else if (browserLang.startsWith("ko")) {
            currentLang = "ko";
        } else if (browserLang.startsWith("th")) {
            currentLang = "th";
        } else {
            currentLang = "en-US";
        }
    }
    // 在這裡設定語言切換器的值
    document.getElementById('language-switcher').value = currentLang;
    // 將最終確定的語言存入 localStorage 並載入翻譯
    localStorage.setItem("lang", currentLang);
    await loadTranslations(currentLang);
    
    
    
    const params = new URLSearchParams(window.location.search);
    const otoken = params.get('code');
    const translationPromise = loadTranslations(currentLang);
    if (otoken) {
        try {
            const res = await callApifetch(`getProfile&otoken=${otoken}`);
            if (res.ok && res.sToken) {
                // 儲存 Session Token
                localStorage.setItem("sessionToken", res.sToken);
                
                // ⭐ 新增：儲存使用者快取
                localStorage.setItem("cachedUser", JSON.stringify(res.user));
                localStorage.setItem("cacheTime", Date.now().toString());
                localStorage.setItem("sessionUserId", res.user.userId);
                
                // 清除 URL 參數
                history.replaceState({}, '', window.location.pathname);
                
                // ⭐⭐⭐ 關鍵：不需要再呼叫 ensureLogin 或 initApp
                // 直接顯示介面
                
                if (res.user.dept === "管理員") {
                  document.getElementById('tab-admin-btn').style.display = 'block';
                }
                
                document.getElementById("user-name").textContent = res.user.name;
                document.getElementById("profile-img").src = res.user.picture;
                
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('user-header').style.display = 'flex';
                document.getElementById('main-app').style.display = 'block';
                
                // ⭐ 直接渲染異常記錄（資料已經在 res 裡）
                if (res.abnormalRecords) {
                  renderAbnormalRecords(res.abnormalRecords);
                }
                
                showNotification(t("LOGIN_SUCCESS"), "success");

                // ⭐⭐⭐ 關鍵：UI 顯示後才載入異常記錄（不阻塞登入）
                loadAbnormalRecordsInBackground();
                
                // 初始化生物辨識（背景執行）
                initBiometricPunch();
                
            } else {
                showNotification(t("ERROR_LOGIN_FAILED", { msg: res.msg || t("UNKNOWN_ERROR") }), "error");
                loginBtn.style.display = 'block';
            }

        } catch (err) {
            console.error(err);
            loginBtn.style.display = 'block';
        }
    } else {
        ensureLogin();
        initBiometricPunch();
    }
    
    // 綁定按鈕事件
    loginBtn.onclick = async () => {
        const res = await callApifetch("getLoginUrl");
        if (res.url) window.location.href = res.url;
    };
    
    logoutBtn.onclick = () => {
        localStorage.removeItem("sessionToken");
        window.location.href = "/Allianz_check_manager"
    };
    
    /* ===== 打卡功能 ===== */
    function generalButtonState(button, state, loadingText = '處理中...') {
        if (!button) return;
        const loadingClasses = 'opacity-50 cursor-not-allowed';

        if (state === 'processing') {
            // --- 進入處理中狀態 ---
            
            // 1. 儲存原始文本 (用於恢復)
            button.dataset.originalText = button.textContent;
            
            // 2. 儲存原始類別 (用於恢復樣式)
            // 這是為了在恢復時移除我們為了禁用而添加的類別
            button.dataset.loadingClasses = 'opacity-50 cursor-not-allowed';

            // 3. 禁用並設置處理中文字
            button.disabled = true;
            button.textContent = loadingText; // 使用傳入的 loadingText
            
            // 4. 添加視覺反饋 (禁用時的樣式)
            button.classList.add(...loadingClasses.split(' '));
            
            // 可選：移除 hover 效果，防止滑鼠移動時顏色變化
            // 假設您的按鈕有 hover:opacity-100 之類的類別，這裡需要調整
            
        } else {
            // --- 恢復到原始狀態 ---
            
            // 1. 移除視覺反饋
            if (button.dataset.loadingClasses) {
                button.classList.remove(...button.dataset.loadingClasses.split(' '));
            }

            // 2. 恢復禁用狀態
            button.disabled = false;
            
            // 3. 恢復原始文本
            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText; // 清除儲存，讓它在下一次點擊時再次儲存
            }
        }
    }

        /**
     * 輔助函數：計算時間差（分鐘）
     * @param {string} time1 - 時間 1，格式 "HH:MM"
     * @param {string} time2 - 時間 2，格式 "HH:MM"
     * @returns {number} - 時間差（分鐘），正數表示 time1 晚於 time2
     */
    function getTimeDifference(time1, time2) {
        const [h1, m1] = time1.split(':').map(Number);
        const [h2, m2] = time2.split(':').map(Number);
        
        const minutes1 = h1 * 60 + m1;
        const minutes2 = h2 * 60 + m2;
        
        return minutes1 - minutes2;
    }

    punchInBtn.addEventListener('click', () => doPunch("上班"));
    punchOutBtn.addEventListener('click', () => doPunch("下班"));

    // 處理補打卡表單
    abnormalList.addEventListener('click', (e) => {
        const button = e.target.closest('.adjust-btn');
        
        if (button) {
            const date = button.dataset.date;
            const type = button.dataset.type;
            
            console.log(`點擊補打卡: ${date} - ${type}`);
            
            const typeText = t(type === '上班' ? 'PUNCH_IN' : 'PUNCH_OUT');
            
            const formHtml = `
                <div class="p-4 border-t border-gray-200 dark:border-gray-600 fade-in">
                    <p class="font-semibold mb-2 dark:text-white">
                        ${t('MAKEUP_PUNCH_TITLE', { date: date, type: typeText })}
                    </p>
                    
                    <!-- 選擇時間 -->
                    <div class="form-group mb-3">
                        <label for="adjustDateTime" class="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                            ${t('SELECT_PUNCH_TIME', { type: typeText })}
                        </label>
                        <input id="adjustDateTime" 
                            type="datetime-local" 
                            class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500">
                    </div>
                    
                    <!-- 補打卡理由 -->
                    <div class="form-group mb-3">
                        <label for="adjustReason" class="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                            <span data-i18n="ADJUST_REASON_LABEL">補打卡理由</span>
                            <span class="text-red-500">*</span>
                        </label>
                        <textarea id="adjustReason" 
                                  rows="3" 
                                  required
                                  placeholder="${t('ADJUST_REASON_PLACEHOLDER') || '請說明補打卡原因...'}"
                                  class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"></textarea>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2">
                        <button id="cancel-adjust-btn" 
                                data-i18n="BTN_CANCEL"
                                class="py-2 px-4 rounded-lg font-bold bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500">
                            ${t('BTN_CANCEL')}
                        </button>
                        <button id="submit-adjust-btn" 
                                data-type="${type}"
                                data-date="${date}"
                                class="py-2 px-4 rounded-lg font-bold btn-primary">
                            ${t(type === '上班' ? 'BTN_SUBMIT_PUNCH_IN' : 'BTN_SUBMIT_PUNCH_OUT')}
                        </button>
                    </div>
                </div>
            `;
            
            adjustmentFormContainer.innerHTML = formHtml;
            
            const adjustDateTimeInput = document.getElementById("adjustDateTime");
            const defaultTime = type === '上班' ? '09:00' : '18:00';
            adjustDateTimeInput.value = `${date}T${defaultTime}`;
            
            // 👇 新增：平滑滾動到補打卡表單
            setTimeout(() => {
                adjustmentFormContainer.scrollIntoView({ 
                    behavior: 'smooth',  // 平滑滾動
                    block: 'start'       // 滾動到元素頂部
                });
                
                // 可選：讓理由輸入框自動聚焦
                const reasonInput = document.getElementById('adjustReason');
                if (reasonInput) {
                    reasonInput.focus();
                }
            }, 100); // 稍微延遲，確保表單已渲染
            
            // 綁定取消按鈕
            document.getElementById('cancel-adjust-btn').addEventListener('click', () => {
                adjustmentFormContainer.innerHTML = '';
            });
        }
    });
    
    function validateAdjustTime(value) {
        const selected = new Date(value);
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (selected < monthStart) {
            showNotification(t("ERR_BEFORE_MONTH_START"), "error");
            return false;
        }
        // 不允許選今天以後
        if (selected > today) {
            showNotification(t("ERR_AFTER_TODAY"), "error");
            return false;
        }
        return true;
    }


    adjustmentFormContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('#submit-adjust-btn');
        
        if (button) {
            const loadingText = t('LOADING') || '處理中...';
            
            const datetime = document.getElementById("adjustDateTime").value;
            const reason = document.getElementById("adjustReason")?.value.trim();
            const type = button.dataset.type;
            const date = button.dataset.date;
            
            if (!datetime) {
                showNotification("請選擇補打卡日期時間", "error");
                return;
            }
            
            // 👇 修改：改為至少 2 個字
            if (!reason || reason.length < 2) {
                showNotification(t('ADJUST_REASON_REQUIRED') || "請填寫補打卡理由（至少 2 個字）", "error");
                return;
            }
            
            if (!validateAdjustTime(datetime)) return;
            
            generalButtonState(button, 'processing', loadingText);
            
            try {
                const sessionToken = localStorage.getItem("sessionToken");
                
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });
                
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                const params = new URLSearchParams({
                    token: sessionToken,
                    type: type,
                    lat: lat,
                    lng: lng,
                    datetime: datetime,
                    note: reason
                });
                
                const res = await callApifetch(`adjustPunch&${params.toString()}`);
                console.log('📤 前端提交補打卡:', {
                    type: type,
                    datetime: datetime,
                    reason: reason,
                    response: res
                });
                
                if (res.ok) {
                    showNotification("補打卡申請成功！等待管理員審核", "success");
                    await checkAbnormal();
                    adjustmentFormContainer.innerHTML = '';
                } else {
                    showNotification(t(res.code) || "補打卡失敗", "error");
                }
                
            } catch (err) {
                console.error('補打卡錯誤:', err);
                showNotification("補打卡失敗", "error");
                
            } finally {
                if (adjustmentFormContainer.innerHTML !== '') {
                    generalButtonState(button, 'idle');
                }
            }
        }
    });
    

    // 頁面切換事件
    const tabShiftBtn = document.getElementById('tab-shift-btn');

    // 在現有的分頁按鈕事件後面加入：
    tabShiftBtn.addEventListener('click', () => {switchTab('shift-view');});


    tabSalaryBtn.addEventListener('click', () => {switchTab('salary-view');});
    tabDashboardBtn.addEventListener('click', () => switchTab('dashboard-view'));
    
    tabLocationBtn.addEventListener('click', () => switchTab('location-view'));
    tabMonthlyBtn.addEventListener('click', () => switchTab('monthly-view'));
    tabOvertimeBtn.addEventListener('click', () => {
        switchTab('overtime-view');
        initOvertimeTab();
    });

    // 👈 新增請假按鈕事件
    tabLeaveBtn.addEventListener('click', () => {
        switchTab('leave-view');
        initLeaveTab();
    });

    tabAdminBtn.addEventListener('click', async () => {
    
        // 獲取按鈕元素和處理中文字
        const button = tabAdminBtn;
        const loadingText = t('CHECKING') || '檢查中...';
        
        // A. 進入處理中狀態
        generalButtonState(button, 'processing', loadingText);
        
        try {
            // ✅ 修正：改用 initApp（與 ensureLogin 一致）
            const res = await callApifetch("initApp");
            
            console.log('🔍 管理員權限檢查:', res);
            console.log('   - ok:', res.ok);
            console.log('   - user:', res.user);
            console.log('   - dept:', res.user?.dept);
            
            // 檢查回傳的結果和權限
            if (res.ok && res.user && res.user.dept === "管理員") {
                console.log('✅ 管理員權限驗證通過');
                // 如果 Session 有效且是管理員，執行頁籤切換
                switchTab('admin-view');
            } else {
                console.log('❌ 權限驗證失敗');
                console.log('   實際部門:', res.user?.dept);
                // 如果權限不足或 Session 無效，給予錯誤提示
                showNotification(t("ERR_NO_PERMISSION") || "您沒有權限執行此操作", "error");
            }
            
        } catch (err) {
            // 處理網路錯誤或 API 呼叫失敗
            console.error('❌ API 呼叫錯誤:', err);
            showNotification(t("NETWORK_ERROR") || '網絡錯誤', "error");
            
        } finally {
            // B. 無論 API 成功、失敗或網路錯誤，都要恢復按鈕狀態
            generalButtonState(button, 'idle');
        }
    });

    // 👇 新增：綁定查詢按鈕
    const loadAnalysisBtn = document.getElementById('load-punch-analysis-btn');
    if (loadAnalysisBtn) {
        loadAnalysisBtn.addEventListener('click', loadPunchAnalysis);
    }
    // 👇 新增：綁定匯出按鈕
    const exportEmployeePunchBtn = document.getElementById('export-employee-punch-btn');
    if (exportEmployeePunchBtn) {
        exportEmployeePunchBtn.addEventListener('click', exportEmployeePunchReport);
    }
    // 月曆按鈕事件
    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
        renderCalendar(currentMonthDate);
    });
    
    document.getElementById('next-month').addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
        renderCalendar(currentMonthDate);
    });

    const exportAttendanceBtn = document.getElementById('export-attendance-btn');
    if (exportAttendanceBtn) {
        exportAttendanceBtn.addEventListener('click', () => {
            exportAttendanceReport(currentMonthDate);
        });
    }

    const adminExportAllBtn = document.getElementById('admin-export-all-btn');
    const adminExportMonthInput = document.getElementById('admin-export-month');

    if (adminExportAllBtn && adminExportMonthInput) {
        // 設定預設月份為當月
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        adminExportMonthInput.value = defaultMonth;
        
        // 綁定按鈕點擊事件
        adminExportAllBtn.addEventListener('click', () => {
            const selectedMonth = adminExportMonthInput.value;
            
            if (!selectedMonth) {
                showNotification('請選擇要匯出的月份', 'error');
                return;
            }
            
            exportAllEmployeesReport(selectedMonth);
        });
    }
    // 語系切換事件
    document.getElementById('language-switcher').addEventListener('change', (e) => {
        const newLang = e.target.value;
        loadTranslations(newLang);
        // 取得當前顯示的標籤頁ID
        const currentTab = document.querySelector('.active');
        const currentTabId = currentTab ? currentTab.id : null;
        console.log(currentTabId);
        // 如果當前頁面是「地圖」頁籤，則重新載入地圖
        if (currentTabId === 'location-view') {
            initLocationMap(true); // 重新載入地圖
        }
    });
    // 點擊日曆日期的事件監聽器
    calendarGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('day-cell') && e.target.dataset.date) {
            const date = e.target.dataset.date;
            renderDailyRecords(date);
        }
    });

    // 👇 加入公告事件綁定
    const submitAnnouncementBtn = document.getElementById('submit-announcement-btn');
    if (submitAnnouncementBtn) {
        submitAnnouncementBtn.addEventListener('click', () => {
            const title = document.getElementById('announcement-title').value.trim();
            const content = document.getElementById('announcement-content').value.trim();
            const priority = document.getElementById('announcement-priority').value;
            
            if (!title || !content) {
                showNotification('請填寫標題和內容', 'error');
                return;
            }
            
            const announcements = loadAnnouncements();
            const newAnnouncement = {
                id: Date.now().toString(),
                title: title,
                content: content,
                priority: priority,
                createdAt: new Date().toISOString()
            };
            
            announcements.unshift(newAnnouncement);
            saveAnnouncements(announcements);
            
            document.getElementById('announcement-title').value = '';
            document.getElementById('announcement-content').value = '';
            document.getElementById('announcement-priority').value = 'normal';
            
            displayAdminAnnouncements();
            displayAnnouncements();
            
            showNotification('公告發布成功！', 'success');
        });
    }
    displayAnnouncements();
});

/**
 * 初始化排班分頁
 */
function initShiftTab() {
    loadTodayShift();
    loadWeekShift();
}

/**
 * 載入今日排班
 */
async function loadTodayShift() {
    const loadingEl = document.getElementById('today-shift-loading');
    const emptyEl = document.getElementById('today-shift-empty');
    const infoEl = document.getElementById('today-shift-info');
    
    // 如果有快取，直接使用
    if (todayShiftCache !== null) {
        displayTodayShift(todayShiftCache);
        return;
    }
    
    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        infoEl.style.display = 'none';
        
        const userId = localStorage.getItem('sessionUserId');
        const today = new Date().toISOString().split('T')[0];
        
        const res = await callApifetch(`getEmployeeShiftForDate&employeeId=${userId}&date=${today}`);
        
        loadingEl.style.display = 'none';
        
        // 快取結果
        todayShiftCache = res;
        displayTodayShift(res);
        
    } catch (error) {
        console.error('載入今日排班失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}

/**
 * 顯示今日排班
 */
function displayTodayShift(res) {
    const emptyEl = document.getElementById('today-shift-empty');
    const infoEl = document.getElementById('today-shift-info');
    
    if (res.ok && res.hasShift) {
        document.getElementById('shift-type').textContent = res.data.shiftType;
        document.getElementById('shift-time').textContent = 
            `${res.data.startTime} - ${res.data.endTime}`;
        document.getElementById('shift-location').textContent = res.data.location;
        infoEl.style.display = 'block';
    } else {
        emptyEl.style.display = 'block';
    }
}

/**
 * ✅ 載入未來 7 天排班（完全修正版 - 強制清除舊快取）
 */
async function loadWeekShift() {
    const loadingEl = document.getElementById('week-shift-loading');
    const emptyEl = document.getElementById('week-shift-empty');
    const listEl = document.getElementById('week-shift-list');
    
    // ✅ 步驟 1: 計算「今天到未來 7 天」的範圍
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const startOfWeek = today;
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);
    
    const startDateStr = startOfWeek.toISOString().split('T')[0];
    const endDateStr = endOfWeek.toISOString().split('T')[0];
    
    console.log('📅 未來排班範圍:', {
        today: today.toISOString().split('T')[0],
        startOfWeek: startDateStr,
        endOfWeek: endDateStr
    });
    
    // ✅ 步驟 2: 生成快取鍵值
    const cacheKey = `${startDateStr}_${endDateStr}`;
    
    // ✅ 步驟 3: 檢查快取（但只有在「分頁初次載入」時才使用）
    // 如果快取存在且日期範圍相同，才使用快取
    if (weekShiftCache !== null && 
        weekShiftCache.cacheKey === cacheKey &&
        Date.now() - weekShiftCache.timestamp < 60000) { // 快取 1 分鐘有效
        
        console.log('✅ 使用有效快取（1 分鐘內）');
        displayWeekShift(weekShiftCache.data);
        return;
    }
    
    // ✅ 步驟 4: 清除舊快取，強制重新載入
    console.log('🗑️ 清除舊快取，重新載入');
    weekShiftCache = null;
    
    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        const userId = localStorage.getItem('sessionUserId');
        
        const filters = {
            employeeId: userId,
            startDate: startDateStr,
            endDate: endDateStr
        };
        
        console.log('📡 呼叫 API，篩選條件:', filters);
        
        const res = await callApifetch(`getShifts&filters=${encodeURIComponent(JSON.stringify(filters))}`);
        
        console.log('📤 API 回應:', res);
        
        loadingEl.style.display = 'none';
        
        // ✅ 步驟 5: 快取新資料
        weekShiftCache = {
            cacheKey: cacheKey,
            data: res,
            timestamp: Date.now()
        };
        
        console.log('💾 已快取新資料:', weekShiftCache);
        
        // ✅ 步驟 6: 顯示資料
        displayWeekShift(res);
        
    } catch (error) {
        console.error('❌ 載入未來排班失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}
/**
 * 顯示本週排班
 */
function displayWeekShift(res) {
    const emptyEl = document.getElementById('week-shift-empty');
    const listEl = document.getElementById('week-shift-list');
    
    console.log('📋 displayWeekShift 收到的資料:', res);
    
    if (res.ok && res.data && res.data.length > 0) {
        listEl.innerHTML = '';
        
        console.log('✅ 開始渲染', res.data.length, '筆排班');
        
        res.data.forEach((shift, index) => {
            console.log(`   ${index + 1}. ${shift.date} - ${shift.shiftType}`);
            
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center text-sm bg-white dark:bg-gray-800 p-2 rounded-md';
            item.innerHTML = `
                <div>
                    <span class="font-semibold text-purple-900 dark:text-purple-200">
                        ${formatShiftDate(shift.date)}
                    </span>
                    <span class="text-purple-700 dark:text-purple-400 ml-2">
                        ${shift.shiftType}
                    </span>
                </div>
                <div class="text-purple-700 dark:text-purple-400">
                    ${shift.startTime} - ${shift.endTime}
                </div>
            `;
            listEl.appendChild(item);
        });
        
        emptyEl.style.display = 'none';
    } else {
        console.log('⚠️ 沒有排班資料或資料格式錯誤');
        emptyEl.style.display = 'block';
        listEl.innerHTML = '';
    }
}

/**
 * 格式化排班日期
 */
function formatShiftDate(dateString) {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = [
        t('WEEK_SUNDAY'),
        t('WEEK_MONDAY'),
        t('WEEK_TUESDAY'),
        t('WEEK_WEDNESDAY'),
        t('WEEK_THURSDAY'),
        t('WEEK_FRIDAY'),
        t('WEEK_SATURDAY')
    ];
    const weekday = weekdays[date.getDay()];
    
    return `${month}/${day} (${weekday})`;
}

/**
 * 清除排班快取（當有更新時使用）
 */
function clearShiftCache() {
    todayShiftCache = null;
    weekShiftCache = null;
}

// ==================== 📢 佈告欄功能 ====================

function  loadAnnouncements() {
    const data = localStorage.getItem('announcements');
    return data ? JSON.parse(data) : [];
}

function saveAnnouncements(announcements) {
    localStorage.setItem('announcements', JSON.stringify(announcements));
}

function displayAnnouncements() {
    const list = document.getElementById('announcements-list');
    const empty = document.getElementById('announcements-empty');
    const announcements = loadAnnouncements().slice(0, 3);
    
    if (!list) return;
    
    if (announcements.length === 0) {
        if (empty) empty.style.display = 'block';
        list.innerHTML = '';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    list.innerHTML = '';
    
    announcements.forEach(a => {
        const icon = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🔵';
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-3';
        div.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <h3 class="font-bold text-gray-800 dark:text-white">${icon} ${a.title}</h3>
                <span class="text-xs text-gray-500">${new Date(a.createdAt).toLocaleDateString()}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300">${a.content}</p>
        `;
        list.appendChild(div);
    });
}

function displayAdminAnnouncements() {
    const list = document.getElementById('admin-announcements-list');
    if (!list) return;
    
    const announcements = loadAnnouncements();
    list.innerHTML = '';
    
    announcements.forEach(a => {
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <h3 class="font-bold text-gray-800 dark:text-white mb-1">${a.title}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${a.content}</p>
                    <span class="text-xs text-gray-500">${new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <button class="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded ml-4" 
                        data-i18n="BTN_DELETE"
                        onclick="deleteAnnouncement('${a.id}')">
                    刪除
                </button>
            </div>
        `;
        list.appendChild(div);
        renderTranslations(div);
    });
}

function deleteAnnouncement(id) {
    if (!confirm(t('DELETE_ANNOUNCEMENT_CONFIRM'))) return;
    
    let announcements = loadAnnouncements();
    announcements = announcements.filter(a => a.id !== id);
    saveAnnouncements(announcements);
    displayAdminAnnouncements();
    displayAnnouncements();
    showNotification(t('ANNOUNCEMENT_DELETED'), 'success');
}

// ==================== 管理員打卡分析功能 ====================

let workHoursChart = null;
let punchTimeChart = null;

/**
 * 初始化管理員分析功能
 */
async function initAdminAnalysis() {
    await loadEmployeeListForAnalysis();
    
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthInput = document.getElementById('analysis-month');
    if (monthInput) {
        monthInput.value = defaultMonth;
    }
}

/**
 * 載入員工列表到下拉選單
 */
async function loadEmployeeListForAnalysis() {
    try {
        const res = await callApifetch('getAllUsers');
        
        if (res.ok && res.users) {
            const select = document.getElementById('analysis-employee');
            if (!select) return;
            
            select.innerHTML = '<option value="">請選擇員工</option>';
            
            res.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.userId;
                option.textContent = `${user.name} (${user.dept || '未分類'})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('載入員工列表失敗:', error);
    }
}

/**
 * 載入打卡分析資料並繪製圖表
 */
async function loadPunchAnalysis() {
    const employeeId = document.getElementById('analysis-employee')?.value;
    const yearMonth = document.getElementById('analysis-month')?.value;
    
    if (!employeeId) {
        showNotification('請選擇員工', 'error');
        return;
    }
    
    if (!yearMonth) {
        showNotification('請選擇月份', 'error');
        return;
    }
    
    const loadingEl = document.getElementById('punch-analysis-loading');
    const containerEl = document.getElementById('punch-analysis-container');
    const emptyEl = document.getElementById('punch-analysis-empty');
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (containerEl) containerEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        
        const res = await callApifetch(`getEmployeeMonthlyPunchData&employeeId=${employeeId}&yearMonth=${yearMonth}`);
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.data && res.data.length > 0) {
            if (containerEl) containerEl.style.display = 'block';
            renderCharts(res.data);
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('載入分析失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        showNotification('載入失敗，請稍後再試', 'error');
    }
}

/**
 * 繪製圖表
 */
function renderCharts(data) {
    const dates = data.map(d => d.date.substring(5));
    const workHours = data.map(d => d.workHours || 0);
    const punchInTimes = data.map(d => d.punchIn ? timeToDecimal(d.punchIn) : null);
    const punchOutTimes = data.map(d => d.punchOut ? timeToDecimal(d.punchOut) : null);
    
    renderWorkHoursChart(dates, workHours);
    renderPunchTimeChart(dates, punchInTimes, punchOutTimes);
}

/**
 * 繪製工作時數圖表
 */
function renderWorkHoursChart(dates, workHours) {
    const canvas = document.getElementById('work-hours-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (workHoursChart) {
        workHoursChart.destroy();
    }
    
    workHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: '工作時數',
                data: workHours,
                backgroundColor: 'rgba(79, 70, 229, 0.6)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '小時'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y.toFixed(2)} 小時`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 繪製打卡時間分布圖
 */
function renderPunchTimeChart(dates, punchInTimes, punchOutTimes) {
    const canvas = document.getElementById('punch-time-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (punchTimeChart) {
        punchTimeChart.destroy();
    }
    
    punchTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: '上班打卡',
                    data: punchInTimes,
                    borderColor: 'rgba(34, 197, 94, 1)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: false,
                    tension: 0.1
                },
                {
                    label: '下班打卡',
                    data: punchOutTimes,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    min: 6,
                    max: 22,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return `${Math.floor(value)}:${String(Math.round((value % 1) * 60)).padStart(2, '0')}`;
                        }
                    },
                    title: {
                        display: true,
                        text: '時間'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const hours = Math.floor(value);
                            const minutes = Math.round((value % 1) * 60);
                            return `${context.dataset.label}: ${hours}:${String(minutes).padStart(2, '0')}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 匯出員工打卡報表（含時分秒和每日總時數）
 */
async function exportEmployeePunchReport() {
    const employeeSelect = document.getElementById('analysis-employee');
    const monthInput = document.getElementById('analysis-month');
    const exportBtn = document.getElementById('export-employee-punch-btn');
    
    if (!employeeSelect || !monthInput) return;
    
    const employeeId = employeeSelect.value;
    const yearMonth = monthInput.value;
    
    if (!employeeId) {
        showNotification('請選擇員工', 'error');
        return;
    }
    
    if (!yearMonth) {
        showNotification('請選擇月份', 'error');
        return;
    }
    
    const loadingText = t('EXPORT_LOADING') || '正在準備報表...';
    showNotification(loadingText, 'warning');
    
    if (exportBtn) {
        generalButtonState(exportBtn, 'processing', loadingText);
    }
    
    try {
        // 取得員工名稱
        const employeeName = employeeSelect.options[employeeSelect.selectedIndex].text.split(' (')[0];
        
        // 呼叫後端 API 取得詳細打卡資料
        const res = await callApifetch(`getAttendanceDetails&month=${yearMonth}&userId=${employeeId}`);
        
        if (!res.ok || !res.records || res.records.length === 0) {
            showNotification(t('EXPORT_NO_DATA') || '本月沒有出勤記錄', 'warning');
            return;
        }
        
        // 整理資料為 Excel 格式
        const exportData = [];
        
        res.records.forEach(record => {
            // 找出上班和下班的記錄
            const punchInRecord = record.record ? record.record.find(r => r.type === '上班') : null;
            const punchOutRecord = record.record ? record.record.find(r => r.type === '下班') : null;
            
            // 計算工時
            let workHours = '-';
            let workHoursDecimal = 0;
            let overtimeHours = 0;
            let hasOvertime = false;

            if (punchInRecord && punchOutRecord) {
                try {
                    // 使用完整的日期時間來計算
                    const inTime = new Date(`${record.date} ${punchInRecord.time}`);
                    const outTime = new Date(`${record.date} ${punchOutRecord.time}`);
                    const diffMs = outTime - inTime;
                    
                    if (diffMs > 0) {
                        // 計算總工時（小時）
                        const totalHours = diffMs / (1000 * 60 * 60);
                        
                        // 扣除午休 1 小時
                        const lunchBreak = 1;
                        const netWorkHours = totalHours - lunchBreak;
                        
                        // 計算加班時數（超過標準工時 8 小時的部分）
                        const standardWorkHours = 8;
                        overtimeHours = Math.max(0, netWorkHours - standardWorkHours);
                        
                        // 格式化顯示
                        workHoursDecimal = netWorkHours;
                        const hours = Math.floor(netWorkHours);
                        const minutes = Math.round((netWorkHours - hours) * 60);
                        workHours = `${hours}小時${minutes}分`;
                        
                        // 標記是否有加班
                        hasOvertime = overtimeHours > 0.5; // 超過 30 分鐘才算加班
                        
                        console.log(`工時計算:`, {
                            date: record.date,
                            總時長: totalHours.toFixed(2),
                            扣除午休: lunchBreak,
                            淨工時: netWorkHours.toFixed(2),
                            加班時數: overtimeHours.toFixed(2)
                        });
                    }
                } catch (e) {
                    console.error('計算工時失敗:', e);
                    workHours = '計算錯誤';
                }
            }
                        
            // 翻譯狀態
            const statusText = t(record.reason) || record.reason;
            
            // 處理備註
            const notes = record.record
                ? record.record
                    .filter(r => r.note && r.note !== '系統虛擬卡')
                    .map(r => r.note)
                    .join('; ')
                : '';
            
            exportData.push({
                '日期': record.date,
                '星期': getDayOfWeek(record.date),
                '上班時間': punchInRecord ? `${punchInRecord.time}:00` : '-',
                '上班地點': punchInRecord?.location || '-',
                '下班時間': punchOutRecord ? `${punchOutRecord.time}:00` : '-',
                '下班地點': punchOutRecord?.location || '-',
                '工作時數': workHours,
                '工時（小時）': workHoursDecimal > 0 ? workHoursDecimal.toFixed(2) : '-',
                '狀態': statusText,
                '備註': notes || '-'
            });
        });
        
        // 計算統計資料
        const totalWorkHours = exportData.reduce((sum, row) => {
            const hours = parseFloat(row['工時（小時）']);
            return sum + (isNaN(hours) ? 0 : hours);
        }, 0);
        
        const totalDays = exportData.filter(row => row['工時（小時）'] !== '-').length;
        const avgWorkHours = totalDays > 0 ? (totalWorkHours / totalDays).toFixed(2) : 0;
        
        // 新增統計行
        exportData.push({});
        exportData.push({
            '日期': '統計',
            '星期': '',
            '上班時間': '',
            '上班地點': '',
            '下班時間': '',
            '下班地點': '',
            '工作時數': `共 ${totalDays} 天`,
            '工時（小時）': totalWorkHours.toFixed(2),
            '狀態': `平均: ${avgWorkHours}`,
            '備註': ''
        });
        
        // 使用 SheetJS 建立 Excel 檔案
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // 設定欄位寬度
        const wscols = [
            { wch: 12 },  // 日期
            { wch: 8 },   // 星期
            { wch: 12 },  // 上班時間
            { wch: 25 },  // 上班地點
            { wch: 12 },  // 下班時間
            { wch: 25 },  // 下班地點
            { wch: 15 },  // 工作時數
            { wch: 12 },  // 工時（小時）
            { wch: 18 },  // 狀態
            { wch: 30 }   // 備註
        ];
        ws['!cols'] = wscols;
        
        // 建立工作簿
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${yearMonth.split('-')[1]}月出勤`);
        
        // 下載檔案
        const [year, month] = yearMonth.split('-');
        const fileName = `${employeeName}_${year}年${month}月_打卡記錄.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showNotification(t('EXPORT_SUCCESS') || '報表已成功匯出！', 'success');
        
    } catch (error) {
        console.error('匯出失敗:', error);
        showNotification(t('EXPORT_FAILED') || '匯出失敗，請稍後再試', 'error');
        
    } finally {
        if (exportBtn) {
            generalButtonState(exportBtn, 'idle');
        }
    }
}

/**
 * 取得星期幾
 */
function getDayOfWeek(dateString) {
    const date = new Date(dateString);
    const weekdays = [
        t('WEEKDAY_SUNDAY') || 'Sunday',
        t('WEEKDAY_MONDAY') || 'Monday',
        t('WEEKDAY_TUESDAY') || 'Tuesday',
        t('WEEKDAY_WEDNESDAY') || 'Wednesday',
        t('WEEKDAY_THURSDAY') || 'Thursday',
        t('WEEKDAY_FRIDAY') || 'Friday',
        t('WEEKDAY_SATURDAY') || 'Saturday'
    ];
    return weekdays[date.getDay()];
}

/**
 * 將時間字串轉換為小數
 */
function timeToDecimal(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
}

// ==================== 生物辨識快速打卡功能 ====================

/**
 * 檢查瀏覽器是否支援 WebAuthn
 */
function checkBiometricSupport() {
    return window.PublicKeyCredential !== undefined && 
           navigator.credentials !== undefined;
}

/**
 * 初始化生物辨識打卡功能
 */
async function initBiometricPunch() {
    const setupBtn = document.getElementById('setup-biometric-btn');
    const biometricInBtn = document.getElementById('biometric-punch-in-btn');
    const biometricOutBtn = document.getElementById('biometric-punch-out-btn');
    const notSetupStatus = document.getElementById('biometric-not-setup');
    const readyStatus = document.getElementById('biometric-ready');
    const biometricButtons = document.getElementById('biometric-punch-buttons');
    
    if (!setupBtn) return;
    
    // 檢查支援度
    if (!checkBiometricSupport()) {
        setupBtn.textContent = '您的瀏覽器不支援生物辨識';
        setupBtn.disabled = true;
        setupBtn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }
    
    // 檢查是否已設定
    const credentialId = localStorage.getItem('biometric_credential_id');
    if (credentialId) {
        setupBtn.classList.add('hidden');
        biometricButtons.classList.remove('hidden');
        notSetupStatus.classList.add('hidden');
        readyStatus.classList.remove('hidden');
    }
    
    // 設定生物辨識
    setupBtn.addEventListener('click', async () => {
        try {
            showNotification('請使用 Face ID 或指紋進行驗證...', 'info');
            
            const userId = localStorage.getItem('sessionUserId');
            if (!userId) {
                showNotification('請先登入', 'error');
                return;
            }
            
            // 建立 credential
            const credential = await registerBiometric(userId);
            
            if (credential) {
                // 儲存 credential ID
                localStorage.setItem('biometric_credential_id', credential.id);
                localStorage.setItem('biometric_user_id', userId);
                
                // 更新 UI
                setupBtn.classList.add('hidden');
                biometricButtons.classList.remove('hidden');
                notSetupStatus.classList.add('hidden');
                readyStatus.classList.remove('hidden');
                
                showNotification('生物辨識設定成功！', 'success');
            }
            
        } catch (error) {
            console.error('生物辨識設定失敗:', error);
            showNotification('設定失敗，請稍後再試', 'error');
        }
    });
    
    // 生物辨識上班打卡
    if (biometricInBtn) {
        biometricInBtn.addEventListener('click', () => biometricPunch('上班'));
    }
    
    // 生物辨識下班打卡
    if (biometricOutBtn) {
        biometricOutBtn.addEventListener('click', () => biometricPunch('下班'));
    }
}

/**
 * 註冊生物辨識
 */
async function registerBiometric(userId) {
    try {
        // 產生隨機 challenge
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        const publicKeyCredentialCreationOptions = {
            challenge: challenge,
            rp: {
                name: "出勤管家",
                id: window.location.hostname
            },
            user: {
                id: Uint8Array.from(userId, c => c.charCodeAt(0)),
                name: userId,
                displayName: document.getElementById('user-name')?.textContent || userId
            },
            pubKeyCredParams: [
                { alg: -7, type: "public-key" },  // ES256
                { alg: -257, type: "public-key" } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: "platform", // 使用裝置內建的生物辨識
                userVerification: "required"
            },
            timeout: 60000,
            attestation: "none"
        };
        
        const credential = await navigator.credentials.create({
            publicKey: publicKeyCredentialCreationOptions
        });
        
        return credential;
        
    } catch (error) {
        console.error('註冊失敗:', error);
        throw error;
    }
}

/**
 * 使用生物辨識進行打卡
 */
async function biometricPunch(type) {
    try {
        const credentialId = localStorage.getItem('biometric_credential_id');
        const storedUserId = localStorage.getItem('biometric_user_id');
        const currentUserId = localStorage.getItem('sessionUserId');
        
        if (!credentialId || storedUserId !== currentUserId) {
            showNotification('請重新設定生物辨識', 'error');
            return;
        }
        
        showNotification(`請使用 Face ID 或指紋驗證...`, 'info');
        
        // 驗證生物辨識
        const verified = await verifyBiometric(credentialId);
        
        if (verified) {
            // 驗證成功，執行打卡
            await doPunch(type);
        } else {
            showNotification('驗證失敗', 'error');
        }
        
    } catch (error) {
        console.error('生物辨識打卡失敗:', error);
        
        if (error.name === 'NotAllowedError') {
            showNotification('您取消了驗證', 'warning');
        } else {
            showNotification('驗證失敗，請使用一般打卡', 'error');
        }
    }
}

/**
 * 驗證生物辨識
 */
async function verifyBiometric(credentialId) {
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        const publicKeyCredentialRequestOptions = {
            challenge: challenge,
            allowCredentials: [{
                id: Uint8Array.from(atob(credentialId), c => c.charCodeAt(0)),
                type: 'public-key'
            }],
            timeout: 60000,
            userVerification: "required"
        };
        
        const assertion = await navigator.credentials.get({
            publicKey: publicKeyCredentialRequestOptions
        });
        
        return assertion !== null;
        
    } catch (error) {
        console.error('驗證失敗:', error);
        throw error;
    }
}

/**
 * 重置生物辨識設定
 */
function resetBiometric() {
    localStorage.removeItem('biometric_credential_id');
    localStorage.removeItem('biometric_user_id');
    
    const setupBtn = document.getElementById('setup-biometric-btn');
    const biometricButtons = document.getElementById('biometric-punch-buttons');
    const notSetupStatus = document.getElementById('biometric-not-setup');
    const readyStatus = document.getElementById('biometric-ready');
    
    if (setupBtn) setupBtn.classList.remove('hidden');
    if (biometricButtons) biometricButtons.classList.add('hidden');
    if (notSetupStatus) notSetupStatus.classList.remove('hidden');
    if (readyStatus) readyStatus.classList.add('hidden');
    
    showNotification('生物辨識已重置', 'success');
}

/**
     * 執行打卡
     */
async function doPunch(type) {
    const punchButtonId = type === '上班' ? 'punch-in-btn' : 'punch-out-btn';
    
    const button = document.getElementById(punchButtonId);
    const loadingText = t('LOADING') || '處理中...';

    if (!button) return;

    generalButtonState(button, 'processing', loadingText);
    
    // ==================== 上班打卡前檢查排班 ====================
    if (type === '上班') {
        try {
            const userId = localStorage.getItem('sessionUserId');
            const today = new Date().toISOString().split('T')[0];
            
            const shiftRes = await callApifetch(`getEmployeeShiftForDate&employeeId=${userId}&date=${today}`);
            
            if (shiftRes.ok && shiftRes.hasShift) {
                const shift = shiftRes.data;
                
                showNotification(
                    t('SHIFT_INFO_NOTIFICATION', {
                        shiftType: shift.shiftType,
                        startTime: shift.startTime,
                        endTime: shift.endTime
                    }) || `今日排班：${shift.shiftType} (${shift.startTime}-${shift.endTime})`,
                    'info'
                );
                
                const now = new Date();
                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                
                if (shift.startTime) {
                    const timeDiff = getTimeDifference(currentTime, shift.startTime);
                    
                    if (timeDiff < -30) {
                        showNotification(
                            t('EARLY_PUNCH_WARNING') || `注意：您的排班時間是 ${shift.startTime}，目前提前超過 30 分鐘打卡。`,
                            'warning'
                        );
                    }
                    else if (timeDiff > 30) {
                        showNotification(
                            t('LATE_PUNCH_WARNING') || `注意：您的排班時間是 ${shift.startTime}，目前已遲到超過 30 分鐘。`,
                            'warning'
                        );
                    }
                }
            }
        } catch (error) {
            console.error('檢查排班失敗:', error);
        }
    }
    
    if (!navigator.geolocation) {
        showNotification(t("ERROR_GEOLOCATION", { msg: "您的瀏覽器不支援地理位置功能。" }), "error");
        generalButtonState(button, 'idle');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const action = `punch&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&note=${encodeURIComponent(navigator.userAgent)}`;
        
        try {
            const res = await callApifetch(action);
            const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});
            showNotification(msg, res.ok ? "success" : "error");
            
            if (res.ok && type === '上班') {
                clearShiftCache();
            }
            
            generalButtonState(button, 'idle');
        } catch (err) {
            console.error(err);
            generalButtonState(button, 'idle');
        }
        
    }, (err) => {
        showNotification(t("ERROR_GEOLOCATION", { msg: err.message }), "error");
        generalButtonState(button, 'idle');
    });
}

/**
 * 輔助函數：計算時間差（分鐘）
 */
function getTimeDifference(time1, time2) {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    
    const minutes1 = h1 * 60 + m1;
    const minutes2 = h2 * 60 + m2;
    
    return minutes1 - minutes2;
}

// ==================== 用戶管理用戶管理功能 ====================

let allUsersCache = []; // 快取所有用戶

/**
 * 載入所有用戶
 */
async function loadAllUsers() {
    const loadingEl = document.getElementById('users-loading');
    const emptyEl = document.getElementById('users-empty');
    const listEl = document.getElementById('users-list');
    const refreshBtn = document.getElementById('refresh-users-btn');
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) listEl.innerHTML = '';
        
        // 按鈕進入處理中狀態
        if (refreshBtn) {
            generalButtonState(refreshBtn, 'processing', '載入中...');
        }
        
        const res = await callApifetch('getAllUsers');
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.users && res.users.length > 0) {
            allUsersCache = res.users;
            renderUsersList(allUsersCache);
            updateUsersStats(allUsersCache);
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('載入用戶失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        showNotification('載入失敗，請稍後再試', 'error');
        
    } finally {
        // 恢復按鈕狀態
        if (refreshBtn) {
            generalButtonState(refreshBtn, 'idle');
        }
    }
}

/**
 * 渲染用戶列表
 */
function renderUsersList(users) {
    const listEl = document.getElementById('users-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    const currentUserId = localStorage.getItem('sessionUserId');
    
    users.forEach((user, index) => {
        const isCurrentUser = user.userId === currentUserId;
        const isAdmin = user.dept === '管理員';
        
        const div = document.createElement('div');
        div.className = 'bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow';
        div.dataset.userId = user.userId;
        div.dataset.userName = user.name;
        div.dataset.userDept = user.dept || '';

        div.innerHTML = `
        <div class="flex items-start space-x-3">
            <!-- 頭像 -->
            <img src="${user.picture || 'https://via.placeholder.com/48'}" 
                alt="${user.name}" 
                class="w-12 h-12 flex-shrink-0 rounded-full border-2 ${isAdmin ? 'border-yellow-400' : 'border-gray-300'}">
            
            <!-- 用戶資訊與操作區 -->
            <div class="flex-1 min-w-0">
                <!-- 名稱與標籤 -->
                <div class="flex flex-wrap items-center gap-1 mb-1">
                    <p class="font-bold text-gray-800 dark:text-white truncate">${user.name}</p>
                    ${isCurrentUser ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full whitespace-nowrap">您</span>' : ''}
                    ${isAdmin ? '<span class="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full whitespace-nowrap">管理員</span>' : '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full whitespace-nowrap">員工</span>'}
                </div>
                
                <!-- 部門資訊 -->
                <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 truncate">
                    ${user.dept || '未設定部門'} ${user.rate ? `| ${user.rate}` : ''}
                </p>
                
                <!-- 操作按鈕 -->
                ${!isCurrentUser ? `
                    <div class="flex flex-wrap gap-2">
                        <!-- 新增：編輯姓名按鈕 -->
                        <button onclick="openEditNameDialog('${user.userId}', '${user.name}')"
                                class="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors">
                            ✏️ 編輯姓名
                        </button>
                        
                        ${isAdmin ? `
                            <button onclick="changeUserRole('${user.userId}', '${user.name}', 'employee')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-md transition-colors">
                                降級為員工
                            </button>
                        ` : `
                            <button onclick="changeUserRole('${user.userId}', '${user.name}', 'admin')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-md transition-colors">
                                升級為管理員
                            </button>
                        `}
                        
                        <button onclick="confirmDeleteUser('${user.userId}', '${user.name}')"
                                class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md transition-colors">
                            刪除
                        </button>
                    </div>
                ` : `
                    <span class="text-xs text-gray-500 dark:text-gray-400">無法操作自己</span>
                `}

            </div>
        </div>
        `;
        
        listEl.appendChild(div);
    });
}

/**
 * 更新統計數據
 */
function updateUsersStats(users) {
    const totalEl = document.getElementById('total-users-count');
    const adminEl = document.getElementById('admin-users-count');
    const employeeEl = document.getElementById('employee-users-count');
    
    const adminCount = users.filter(u => u.dept === '管理員').length;
    const employeeCount = users.length - adminCount;
    
    if (totalEl) totalEl.textContent = users.length;
    if (adminEl) adminEl.textContent = adminCount;
    if (employeeEl) employeeEl.textContent = employeeCount;
}

/**
 * 搜尋用戶
 */
function filterUsersList(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) {
        renderUsersList(allUsersCache);
        return;
    }
    
    const filtered = allUsersCache.filter(user => {
        const name = (user.name || '').toLowerCase();
        const dept = (user.dept || '').toLowerCase();
        return name.includes(lowerQuery) || dept.includes(lowerQuery);
    });
    
    renderUsersList(filtered);
}

/**
 * 更改用戶角色
 */
async function changeUserRole(userId, userName, newRole) {
    const roleText = newRole === 'admin' ? '管理員' : '員工';
    
    if (!confirm(`確定要將「${userName}」的角色改為「${roleText}」嗎？`)) {
        return;
    }
    
    try {
        showNotification('處理中...', 'info');
        
        const res = await callApifetch(`updateUserRole&userId=${encodeURIComponent(userId)}&role=${newRole}`);
        
        if (res.ok) {
            showNotification(`已成功將「${userName}」設為${roleText}`, 'success');
            
            // 重新載入列表
            await loadAllUsers();
            
            // 如果改的是當前用戶，需要重新整理頁面
            const currentUserId = localStorage.getItem('sessionUserId');
            if (userId === currentUserId) {
                showNotification('您的權限已變更，即將重新整理頁面...', 'warning');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        } else {
            showNotification(res.msg || '操作失敗', 'error');
        }
        
    } catch (error) {
        console.error('更改角色失敗:', error);
        showNotification('操作失敗，請稍後再試', 'error');
    }
}

/**
 * 確認刪除用戶
 */
function confirmDeleteUser(userId, userName) {
    if (!confirm(`⚠️ 警告：確定要刪除用戶「${userName}」嗎？\n\n此操作無法復原！`)) {
        return;
    }
    
    if (!confirm(`再次確認：真的要刪除「${userName}」嗎？`)) {
        return;
    }
    
    deleteUser(userId, userName);
}

/**
 * 刪除用戶
 */
async function deleteUser(userId, userName) {
    try {
        showNotification('刪除中...', 'warning');
        
        const res = await callApifetch(`deleteUser&userId=${encodeURIComponent(userId)}`);
        
        if (res.ok) {
            showNotification(`已成功刪除「${userName}」`, 'success');
            
            // 重新載入列表
            await loadAllUsers();
        } else {
            showNotification(res.msg || '刪除失敗', 'error');
        }
        
    } catch (error) {
        console.error('刪除用戶失敗:', error);
        showNotification('刪除失敗，請稍後再試', 'error');
    }
}

// ==================== 編輯員工姓名功能 ====================

/**
 * 打開編輯姓名對話框
 */
function openEditNameDialog(userId, currentName) {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4">
                ✏️ 編輯員工姓名
            </h3>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    目前姓名
                </label>
                <input type="text" 
                       value="${currentName}" 
                       disabled
                       class="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 dark:bg-gray-700 dark:border-gray-600 text-gray-500 dark:text-gray-400">
            </div>
            
            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    新姓名 <span class="text-red-500">*</span>
                </label>
                <input type="text" 
                       id="new-name-input"
                       placeholder="請輸入新姓名（至少 2 個字）"
                       maxlength="50"
                       class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    ℹ️ 修改後將立即生效
                </p>
            </div>
            
            <div class="flex space-x-3">
                <button onclick="closeEditNameDialog()"
                        class="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-semibold transition-colors">
                    取消
                </button>
                <button onclick="saveNewName('${userId}')"
                        class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors">
                    確認修改
                </button>
            </div>
        </div>
    `;
    
    dialog.id = 'edit-name-dialog';
    document.body.appendChild(dialog);
    
    // 自動聚焦輸入框
    setTimeout(() => {
        document.getElementById('new-name-input').focus();
    }, 100);
    
    // 按 Enter 提交
    document.getElementById('new-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveNewName(userId);
        }
    });
    
    // 點擊背景關閉
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closeEditNameDialog();
        }
    });
}

/**
 * 關閉編輯姓名對話框
 */
function closeEditNameDialog() {
    const dialog = document.getElementById('edit-name-dialog');
    if (dialog) {
        dialog.remove();
    }
}

/**
 * 儲存新姓名
 */
async function saveNewName(userId) {
    const input = document.getElementById('new-name-input');
    const newName = input.value.trim();
    
    // 驗證
    if (!newName) {
        showNotification('請輸入新姓名', 'error');
        input.focus();
        return;
    }
    
    if (newName.length < 2) {
        showNotification('姓名至少需要 2 個字', 'error');
        input.focus();
        return;
    }
    
    if (newName.length > 50) {
        showNotification('姓名不能超過 50 個字', 'error');
        input.focus();
        return;
    }
    
    try {
        showNotification('更新中...', 'info');
        
        const res = await callApifetch(
            `updateEmployeeName&userId=${encodeURIComponent(userId)}&newName=${encodeURIComponent(newName)}`
        );
        
        if (res.ok) {
            showNotification(`✅ 姓名已更新為「${res.newName}」`, 'success');
            
            // 關閉對話框
            closeEditNameDialog();
            
            // 重新載入用戶列表
            await loadAllUsers();
        } else {
            showNotification(res.msg || '更新失敗', 'error');
        }
        
    } catch (error) {
        console.error('更新姓名失敗:', error);
        showNotification('更新失敗，請稍後再試', 'error');
    }
}