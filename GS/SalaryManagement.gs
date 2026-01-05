// SalaryManagement-Enhanced.gs - 薪資管理系統（完整版 - 修正版）

// ==================== 常數定義 ====================

const SHEET_SALARY_CONFIG_ENHANCED = "員工薪資設定";
const SHEET_MONTHLY_SALARY_ENHANCED = "月薪資記錄";

// 台灣法定最低薪資（2025）
// const MIN_MONTHLY_SALARY = 28590;  // 月薪
// const MIN_HOURLY_SALARY = 190;     // 時薪

// 加班費率
const OVERTIME_RATES = {
  weekday: 1.34,      // 平日加班（前2小時）
  weekdayExtra: 1.67, // 平日加班（第3小時起）
  restday: 1.34,      // 休息日前2小時
  restdayExtra: 1.67, // 休息日第3小時起
  holiday: 2.0        // 國定假日
};

/**
 * ✅ 判斷日期是平日/休息日/例假日
 * @param {string} dateStr - 日期字串 (YYYY-MM-DD)
 * @returns {string} 'weekday' | 'restday' | 'holiday'
 */
function getDateType(dateStr) {
  try {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay(); // 0=週日, 1=週一, ..., 6=週六
    
    // 週日 = 例假日
    if (dayOfWeek === 0) {
      return 'holiday';
    }
    
    // 週六 = 休息日
    if (dayOfWeek === 6) {
      return 'restday';
    }
    
    // ⭐ TODO: 可以再加上國定假日判斷
    // 例如：if (isNationalHoliday(dateStr)) return 'holiday';
    
    // 週一~週五 = 平日
    return 'weekday';
    
  } catch (error) {
    Logger.log('❌ 判斷日期類型失敗: ' + error);
    return 'weekday'; // 預設為平日
  }
}

/**
 * ✅ 計算加班費（根據日期類型）
 * @param {number} hours - 加班時數
 * @param {number} hourlyRate - 時薪
 * @param {string} dateType - 日期類型
 * @returns {Object} { firstPay, secondPay, thirdPay }
 */
function calculateOvertimePay(hours, hourlyRate, dateType) {
  let firstPay = 0;   // 前2小時
  let secondPay = 0;  // 3-8小時
  let thirdPay = 0;   // 9小時起
  
  if (dateType === 'weekday') {
    // 平日加班：前2h ×1.34，3h起 ×1.67
    const first = Math.min(hours, 2);
    firstPay = hourlyRate * first * 1.34;
    
    if (hours > 2) {
      const rest = Math.min(hours - 2, 2); // 最多再算2小時（總共4h）
      secondPay = hourlyRate * rest * 1.67;
    }
    
  } else if (dateType === 'restday') {
    // 休息日（週六）：前2h ×1.34，3-8h ×1.67，9h起 ×2.67
    const first = Math.min(hours, 2);
    firstPay = hourlyRate * first * 1.34;
    
    if (hours > 2) {
      const second = Math.min(hours - 2, 6); // 3-8h
      secondPay = hourlyRate * second * 1.67;
    }
    
    if (hours > 8) {
      const third = hours - 8; // 9h起
      thirdPay = hourlyRate * third * 2.67;
    }
    
  } else if (dateType === 'holiday') {
    // 例假日/國定假日（週日）：全天 ×2.0
    firstPay = hourlyRate * hours * 2.0;
  }
  
  return {
    firstPay: Math.round(firstPay),
    secondPay: Math.round(secondPay),
    thirdPay: Math.round(thirdPay)
  };
}
/**
 * ✅ 統一的 JSON 回應格式
 */
function jsonResponse(ok, data, message, code) {
  const response = {
    ok: ok,
    success: ok,
    data: data,
    records: data,
    msg: message,
    message: message,
    code: code || (ok ? 'SUCCESS' : 'ERROR')
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
// ==================== 試算表管理 ====================

/**
 * ✅ 取得或建立員工薪資設定試算表（完整版）
 */
function getEmployeeSalarySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SALARY_CONFIG_ENHANCED);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SALARY_CONFIG_ENHANCED);
    
    const headers = [
      // 基本資訊 (6欄: A-F)
      "員工ID", "員工姓名", "身分證字號", "員工類型", "薪資類型", "基本薪資",
      
      // 固定津貼項目 (6欄: G-L)
      "職務加給", "伙食費", "交通補助", "全勤獎金", "業績獎金", "其他津貼",
      
      // 銀行資訊 (4欄: M-P)
      "銀行代碼", "銀行帳號", "到職日期", "發薪日",
      
      // 法定扣款 (6欄: Q-V)
      "勞退自提率(%)", "勞保費", "健保費", "就業保險費", "勞退自提", "所得稅",
      
      // 其他扣款 (4欄: W-Z)
      "福利金扣款", "宿舍費用", "團保費用", "其他扣款",
      
      // 系統欄位 (3欄: AA-AC)
      "狀態", "備註", "最後更新時間"
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.getRange(1, 1, 1, headers.length).setBackground("#10b981");
    sheet.getRange(1, 1, 1, headers.length).setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    
    Logger.log("✅ 建立員工薪資設定試算表（完整版）");
  }
  
  return sheet;
}

function rebuildMonthlySalarySheet() {
     // 刪除舊表（如果存在）
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const oldSheet = ss.getSheetByName('月薪資記錄');
     if (oldSheet) {
       ss.deleteSheet(oldSheet);
     }
     
     // 建立新表
     getMonthlySalarySheetEnhanced();
     
     Logger.log('✅ 月薪資記錄試算表已重建');
   }

/**
 * ✅ 取得或建立月薪資記錄試算表（完整版）
 */
function getMonthlySalarySheetEnhanced() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MONTHLY_SALARY_ENHANCED);
    
    const headers = [
      // 基本資訊
      "薪資單ID", "員工ID", "員工姓名", "年月",
      "薪資類型", "時薪", "工作時數", "總加班時數", // ⭐ 新增
      
      // 應發項目
      "基本薪資", "職務加給", "伙食費", "交通補助", "全勤獎金", "業績獎金", "其他津貼",
      "平日加班費", "休息日加班費", "國定假日加班費",
      
      // 法定扣款
      "勞保費", "健保費", "就業保險費", "勞退自提", "所得稅",
      
      // 其他扣款
      "請假扣款", "福利金扣款", "宿舍費用", "團保費用", "其他扣款",
      
      // 總計
      "應發總額", "實發金額",
      
      // 銀行資訊
      "銀行代碼", "銀行帳號",
      
      // 系統欄位
      "狀態", "備註", "建立時間"
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.getRange(1, 1, 1, headers.length).setBackground("#10b981");
    sheet.getRange(1, 1, 1, headers.length).setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    
    Logger.log("✅ 建立月薪資記錄試算表（完整版）");
  }
  
  return sheet;
}

// ==================== 薪資設定功能 ====================

/**
 * ✅ 設定員工薪資資料（完整版 - 修正版）
 */
function setEmployeeSalaryTW(salaryData) {
  try {
    Logger.log('💰 開始設定員工薪資（完整版 - 修正版）');
    Logger.log('📥 收到的資料: ' + JSON.stringify(salaryData, null, 2));
    
    const sheet = getEmployeeSalarySheet();
    const data = sheet.getDataRange().getValues();
    
    // 驗證必填欄位
    if (!salaryData.employeeId || !salaryData.employeeName || !salaryData.baseSalary || salaryData.baseSalary <= 0) {
      return { success: false, message: "缺少必填欄位或基本薪資無效" };
    }
    
    // 檢查是否已存在
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(salaryData.employeeId).trim()) {
        rowIndex = i + 1;
        break;
      }
    }
    
    const now = new Date();
    
    // ⭐ 修正：確保順序與 Sheet 欄位完全一致
    const row = [
      // A-F: 基本資訊 (6欄)
      String(salaryData.employeeId).trim(),              // A: 員工ID
      String(salaryData.employeeName).trim(),            // B: 員工姓名
      String(salaryData.idNumber || "").trim(),          // C: 身分證字號
      String(salaryData.employeeType || "正職").trim(),  // D: 員工類型
      String(salaryData.salaryType || "月薪").trim(),    // E: 薪資類型
      parseFloat(salaryData.baseSalary) || 0,            // F: 基本薪資
      
      // G-L: 固定津貼項目 (6欄)
      parseFloat(salaryData.positionAllowance) || 0,     // G: 職務加給
      parseFloat(salaryData.mealAllowance) || 0,         // H: 伙食費
      parseFloat(salaryData.transportAllowance) || 0,    // I: 交通補助
      parseFloat(salaryData.attendanceBonus) || 0,       // J: 全勤獎金
      parseFloat(salaryData.performanceBonus) || 0,      // K: 業績獎金
      parseFloat(salaryData.otherAllowances) || 0,       // L: 其他津貼
      
      // M-P: 銀行資訊 (4欄)
      String(salaryData.bankCode || "").trim(),          // M: 銀行代碼
      String(salaryData.bankAccount || "").trim(),       // N: 銀行帳號
      salaryData.hireDate || "",                         // O: 到職日期
      String(salaryData.paymentDay || "5").trim(),       // P: 發薪日
      
      // Q-V: 法定扣款 (6欄)
      parseFloat(salaryData.pensionSelfRate) || 0,       // Q: 勞退自提率(%)
      parseFloat(salaryData.laborFee) || 0,              // R: 勞保費
      parseFloat(salaryData.healthFee) || 0,             // S: 健保費
      parseFloat(salaryData.employmentFee) || 0,         // T: 就業保險費
      parseFloat(salaryData.pensionSelf) || 0,           // U: 勞退自提
      parseFloat(salaryData.incomeTax) || 0,             // V: 所得稅
      
      // W-Z: 其他扣款 (4欄)
      parseFloat(salaryData.welfareFee) || 0,            // W: 福利金扣款
      parseFloat(salaryData.dormitoryFee) || 0,          // X: 宿舍費用
      parseFloat(salaryData.groupInsurance) || 0,        // Y: 團保費用
      parseFloat(salaryData.otherDeductions) || 0,       // Z: 其他扣款
      
      // AA-AC: 系統欄位 (3欄)
      "在職",                                             // AA: 狀態
      String(salaryData.note || "").trim(),              // AB: 備註
      now                                                 // AC: 最後更新時間
    ];
    
    Logger.log(`📝 準備寫入的 row 陣列長度: ${row.length}`);
    Logger.log(`📋 Sheet 標題欄位數: ${data[0].length}`);
    
    if (row.length !== data[0].length) {
      Logger.log(`⚠️ 警告：row 長度 (${row.length}) 與 Sheet 欄位數 (${data[0].length}) 不一致`);
    }
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      Logger.log(`✅ 更新員工薪資設定: ${salaryData.employeeName} (列 ${rowIndex})`);
    } else {
      sheet.appendRow(row);
      Logger.log(`✅ 新增員工薪資設定: ${salaryData.employeeName}`);
    }
    
    const currentYearMonth = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM");
    const recalculated = calculateMonthlySalary(salaryData.employeeId, currentYearMonth);

    if (recalculated.success) {
      saveMonthlySalary(recalculated.data);
      Logger.log('✅ 已更新當月薪資記錄');
    }

    return { success: true, message: "薪資設定成功" };
    // 同步到月薪資記錄
    // const currentYearMonth = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM");
    // syncSalaryToMonthlyRecord(salaryData.employeeId, currentYearMonth);
    
    // return { success: true, message: "薪資設定成功" };
    
  } catch (error) {
    Logger.log("❌ 設定薪資失敗: " + error);
    Logger.log("❌ 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 * ✅ 取得員工薪資設定（完整版）
 */
function getEmployeeSalaryTW(employeeId) {
  try {
    const sheet = getEmployeeSalarySheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(employeeId).trim()) {
        const salaryConfig = {};
        headers.forEach((header, index) => {
          salaryConfig[header] = data[i][index];
        });
        
        return { success: true, data: salaryConfig };
      }
    }
    
    return { success: false, message: "找不到該員工薪資資料" };
    
  } catch (error) {
    Logger.log("❌ 取得薪資設定失敗: " + error);
    return { success: false, message: error.toString() };
  }
}

/**
 * ✅ 同步薪資到月薪資記錄（完整版 - 修正）
 */
function syncSalaryToMonthlyRecord(employeeId, yearMonth) {
  try {
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    
    if (!salaryConfig.success) {
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    const calculatedSalary = calculateMonthlySalary(employeeId, yearMonth);
    
    if (!calculatedSalary.success) {
      // ⭐⭐⭐ 關鍵修正：先判斷薪資類型
      const salaryType = String(config['薪資類型'] || '月薪').trim();
      const isHourly = salaryType === '時薪';
      
      // 建立基本薪資記錄
      const totalAllowances = 
        (parseFloat(config['職務加給']) || 0) +
        (parseFloat(config['伙食費']) || 0) +
        (parseFloat(config['交通補助']) || 0) +
        (parseFloat(config['全勤獎金']) || 0) +
        (parseFloat(config['業績獎金']) || 0) +
        (parseFloat(config['其他津貼']) || 0);
      
      const totalDeductions = 
        (parseFloat(config['勞保費']) || 0) +
        (parseFloat(config['健保費']) || 0) +
        (parseFloat(config['就業保險費']) || 0) +
        (parseFloat(config['勞退自提']) || 0) +
        (parseFloat(config['所得稅']) || 0) +
        (parseFloat(config['福利金扣款']) || 0) +
        (parseFloat(config['宿舍費用']) || 0) +
        (parseFloat(config['團保費用']) || 0) +
        (parseFloat(config['其他扣款']) || 0);
      
      // ⭐ 現在可以安全使用 isHourly 了
      const baseAmount = isHourly ? 0 : parseFloat(config['基本薪資']);
      const grossSalary = baseAmount + totalAllowances;
      
      const basicSalary = {
        employeeId: employeeId,
        employeeName: config['員工姓名'],
        yearMonth: yearMonth,
        
        // ⭐⭐⭐ 新增：薪資類型相關欄位
        salaryType: salaryType,
        hourlyRate: isHourly ? parseFloat(config['基本薪資']) : 0,
        totalWorkHours: 0,
        totalOvertimeHours: 0,
        
        baseSalary: isHourly ? 0 : parseFloat(config['基本薪資']),
        positionAllowance: config['職務加給'] || 0,
        mealAllowance: config['伙食費'] || 0,
        transportAllowance: config['交通補助'] || 0,
        attendanceBonus: config['全勤獎金'] || 0,
        performanceBonus: config['業績獎金'] || 0,
        otherAllowances: config['其他津貼'] || 0,
        weekdayOvertimePay: 0,
        restdayOvertimePay: 0,
        holidayOvertimePay: 0,
        laborFee: config['勞保費'] || 0,
        healthFee: config['健保費'] || 0,
        employmentFee: config['就業保險費'] || 0,
        pensionSelf: config['勞退自提'] || 0,
        incomeTax: config['所得稅'] || 0,
        leaveDeduction: 0,
        welfareFee: config['福利金扣款'] || 0,
        dormitoryFee: config['宿舍費用'] || 0,
        groupInsurance: config['團保費用'] || 0,
        otherDeductions: config['其他扣款'] || 0,
        grossSalary: grossSalary,
        netSalary: grossSalary - totalDeductions,
        bankCode: config['銀行代碼'] || "",
        bankAccount: config['銀行帳號'] || "",
        status: "已設定",
        note: "自動建立"
      };
      
      return saveMonthlySalary(basicSalary);
    }
    
    return saveMonthlySalary(calculatedSalary.data);
    
  } catch (error) {
    Logger.log(`❌ 同步失敗: ${error}`);
    return { success: false, message: error.toString() };
  }
}

// ==================== 薪資計算功能 ====================
/**
 * ✅ 取得員工該月份的加班記錄（正確版）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Array} 加班記錄陣列
 */
function getEmployeeMonthlyOvertime(employeeId, yearMonth) {
  try {
    Logger.log('📋 開始取得員工加班記錄');
    Logger.log('   員工ID: ' + employeeId);
    Logger.log('   年月: ' + yearMonth);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_OVERTIME); // "加班申請"
    
    if (!sheet) {
      Logger.log('⚠️ 找不到「加班申請」工作表');
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      Logger.log('⚠️ 「加班申請」工作表無資料');
      return [];
    }
    
    const headers = data[0];
    Logger.log('📊 加班申請欄位: ' + headers.join(', '));
    
    // ⭐ 根據實際欄位結構定義索引
    const userIdIndex = 1;      // 員工ID
    const dateIndex = 3;        // 加班日期
    const hoursIndex = 6;       // 加班時數
    const statusIndex = 9;      // 審核狀態
    
    Logger.log('🔍 使用欄位索引:');
    Logger.log('   員工ID: ' + userIdIndex);
    Logger.log('   加班日期: ' + dateIndex);
    Logger.log('   加班時數: ' + hoursIndex);
    Logger.log('   審核狀態: ' + statusIndex);
    
    const records = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const rowUserId = String(row[userIdIndex] || '').trim();
      const date = row[dateIndex];
      const hours = row[hoursIndex];
      const status = String(row[statusIndex] || '').trim().toLowerCase();
      
      // 檢查員工ID
      if (rowUserId !== employeeId) continue;
      
      // ⭐ 只計算已核准的加班
      if (status !== 'approved') {
        Logger.log(`   ⏭️ 跳過未核准的加班: ${date} (狀態: ${status})`);
        continue;
      }
      
      // 解析日期
      let dateStr = '';
      if (date instanceof Date) {
        dateStr = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd');
      } else if (typeof date === 'string') {
        dateStr = date;
      } else {
        Logger.log(`   ⏭️ 跳過無效日期: ${date}`);
        continue;
      }
      
      // 檢查年月
      const dateYearMonth = dateStr.substring(0, 7);
      if (dateYearMonth !== yearMonth) {
        continue;
      }
      
      const hoursNum = parseFloat(hours) || 0;
      
      records.push({
        date: dateStr,
        hours: hoursNum
      });
      
      Logger.log(`   ✅ ${dateStr}: ${hoursNum}h (狀態: ${status})`);
    }
    
    Logger.log(`✅ 找到 ${records.length} 筆已核准的加班記錄`);
    
    return records;
    
  } catch (error) {
    Logger.log('❌ 取得加班記錄失敗: ' + error);
    Logger.log('❌ 錯誤堆疊: ' + error.stack);
    return [];
  }
}

function saveMonthlySalary(salaryData) {
  try {
    const sheet = getMonthlySalarySheetEnhanced();
    
    let normalizedYearMonth = salaryData.yearMonth;
    
    if (salaryData.yearMonth instanceof Date) {
      normalizedYearMonth = Utilities.formatDate(salaryData.yearMonth, "Asia/Taipei", "yyyy-MM");
    } else if (typeof salaryData.yearMonth === 'string') {
      normalizedYearMonth = salaryData.yearMonth.substring(0, 7);
    }
    
    const salaryId = `SAL-${normalizedYearMonth}-${salaryData.employeeId}`;
    
    // ⭐⭐⭐ 關鍵修正：記錄薪資類型
    const salaryType = salaryData.salaryType || '月薪';
    
    Logger.log(`💾 saveMonthlySalary 準備儲存:`);
    Logger.log(`   - salaryId: ${salaryId}`);
    Logger.log(`   - salaryType: "${salaryType}" (來源: ${salaryData.salaryType})`);
    Logger.log(`   - hourlyRate: ${salaryData.hourlyRate || 0}`);
    Logger.log(`   - baseSalary: ${salaryData.baseSalary || 0}`);
    
    const row = [
      // 基本資訊
      salaryId,
      salaryData.employeeId,
      salaryData.employeeName,
      normalizedYearMonth,
      
      // ⭐⭐⭐ 修正：使用變數而不是 || '月薪'
      salaryType,  // 這裡改成使用變數
      
      salaryData.hourlyRate || 0,
      salaryData.totalWorkHours || 0,
      salaryData.totalOvertimeHours || 0,
      
      // 應發項目
      salaryData.baseSalary || 0,
      salaryData.positionAllowance || 0,
      salaryData.mealAllowance || 0,
      salaryData.transportAllowance || 0,
      salaryData.attendanceBonus || 0,
      salaryData.performanceBonus || 0,
      salaryData.otherAllowances || 0,
      salaryData.weekdayOvertimePay || 0,
      salaryData.restdayOvertimePay || 0,
      salaryData.holidayOvertimePay || 0,
      
      // 法定扣款
      salaryData.laborFee || 0,
      salaryData.healthFee || 0,
      salaryData.employmentFee || 0,
      salaryData.pensionSelf || 0,
      salaryData.incomeTax || 0,
      
      // 其他扣款
      salaryData.leaveDeduction || 0,
      salaryData.welfareFee || 0,
      salaryData.dormitoryFee || 0,
      salaryData.groupInsurance || 0,
      salaryData.otherDeductions || 0,
      
      // 總計
      salaryData.grossSalary || 0,
      salaryData.netSalary || 0,
      
      // 銀行資訊
      salaryData.bankCode || "",
      salaryData.bankAccount || "",
      
      // 系統欄位
      salaryData.status || "已計算",
      salaryData.note || "",
      new Date()
    ];
    
    const data = sheet.getDataRange().getValues();
    let found = false;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === salaryId) {
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        found = true;
        Logger.log(`✅ 更新薪資單: ${salaryId}, 薪資類型: ${salaryType}`);
        break;
      }
    }
    
    if (!found) {
      sheet.appendRow(row);
      Logger.log(`✅ 新增薪資單: ${salaryId}, 薪資類型: ${salaryType}`);
    }
    
    return { success: true, salaryId: salaryId, message: "薪資單儲存成功" };
    
  } catch (error) {
    Logger.log("❌ 儲存薪資單失敗: " + error);
    return { success: false, message: error.toString() };
  }
}
/**
 * ✅ 查詢我的薪資（完整版）
 */
function getMySalary(userId, yearMonth) {
  try {
    const employeeId = userId;
    const sheet = getMonthlySalarySheetEnhanced();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return { success: false, message: "薪資記錄表中沒有資料" };
    }
    
    const headers = data[0];
    const employeeIdIndex = headers.indexOf('員工ID');
    const yearMonthIndex = headers.indexOf('年月');
    
    if (employeeIdIndex === -1 || yearMonthIndex === -1) {
      return { success: false, message: "試算表缺少必要欄位" };
    }
    
    for (let i = 1; i < data.length; i++) {
      const rowEmployeeId = String(data[i][employeeIdIndex]).trim();
      const rawYearMonth = data[i][yearMonthIndex];
      
      let normalizedYearMonth = '';
      
      if (rawYearMonth instanceof Date) {
        normalizedYearMonth = Utilities.formatDate(rawYearMonth, 'Asia/Taipei', 'yyyy-MM');
      } else if (typeof rawYearMonth === 'string') {
        normalizedYearMonth = rawYearMonth.substring(0, 7);
      } else {
        normalizedYearMonth = String(rawYearMonth).substring(0, 7);
      }
      
      if (rowEmployeeId === employeeId && normalizedYearMonth === yearMonth) {
        const salary = {};
        headers.forEach((header, index) => {
          if (header === '年月' && data[i][index] instanceof Date) {
            salary[header] = Utilities.formatDate(data[i][index], 'Asia/Taipei', 'yyyy-MM');
          } else {
            salary[header] = data[i][index];
          }
        });
        
        return { success: true, data: salary };
      }
    }
    
    return { success: false, message: "查無薪資記錄" };
    
  } catch (error) {
    Logger.log('❌ 查詢薪資失敗: ' + error);
    return { success: false, message: error.toString() };
  }
}

/**
 * ✅ 查詢我的薪資歷史（完整版）
 */
function getMySalaryHistory(userId, limit = 12) {
  try {
    const employeeId = userId;
    const sheet = getMonthlySalarySheetEnhanced();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return { success: true, data: [], total: 0 };
    }
    
    const headers = data[0];
    const employeeIdIndex = headers.indexOf('員工ID');
    
    if (employeeIdIndex === -1) {
      return { success: false, message: "試算表缺少「員工ID」欄位" };
    }
    
    const salaries = [];
    
    for (let i = 1; i < data.length; i++) {
      const rowEmployeeId = String(data[i][employeeIdIndex]).trim();
      
      if (rowEmployeeId === employeeId) {
        const salary = {};
        headers.forEach((header, index) => {
          if (header === '年月' && data[i][index] instanceof Date) {
            salary[header] = Utilities.formatDate(data[i][index], "Asia/Taipei", "yyyy-MM");
          } else {
            salary[header] = data[i][index];
          }
        });
        salaries.push(salary);
      }
    }
    
    salaries.sort((a, b) => {
      const yearMonthA = String(a['年月'] || '');
      const yearMonthB = String(b['年月'] || '');
      return yearMonthB.localeCompare(yearMonthA);
    });
    
    const result = salaries.slice(0, limit);
    
    return { success: true, data: result, total: salaries.length };
    
  } catch (error) {
    Logger.log("❌ 查詢薪資歷史失敗: " + error);
    return { success: false, message: error.toString() };
  }
}

/**
 * ✅ 查詢所有員工的月薪資列表（完整版）
 */
function getAllMonthlySalary(yearMonth) {
  try {
    const sheet = getMonthlySalarySheetEnhanced();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const salaries = [];
    
    for (let i = 1; i < data.length; i++) {
      const rawYearMonth = data[i][3];
      
      let normalizedYearMonth = '';
      
      if (rawYearMonth instanceof Date) {
        normalizedYearMonth = Utilities.formatDate(rawYearMonth, "Asia/Taipei", "yyyy-MM");
      } else if (typeof rawYearMonth === 'string') {
        normalizedYearMonth = rawYearMonth.substring(0, 7);
      }
      
      if (!yearMonth || normalizedYearMonth === yearMonth) {
        const salary = {};
        headers.forEach((header, index) => {
          if (header === '年月') {
            salary[header] = normalizedYearMonth;
          } else {
            salary[header] = data[i][index];
          }
        });
        salaries.push(salary);
      }
    }
    
    return { success: true, data: salaries };
    
  } catch (error) {
    Logger.log("❌ 查詢薪資列表失敗: " + error);
    return { success: false, message: error.toString() };
  }
}

// ==================== 輔助函數 ====================

/**
 * ✅ 取得員工加班記錄
 */
function getEmployeeOvertimeRecords(employeeId, yearMonth) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("加班申請");
    
    if (!sheet) {
      return { success: true, data: [] };
    }
    
    const values = sheet.getDataRange().getValues();
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      if (!row[1] || !row[3]) continue;
      
      const rowEmployeeId = String(row[1]).trim();
      const overtimeDate = row[3];
      
      if (rowEmployeeId !== employeeId) continue;
      
      let dateStr = "";
      if (overtimeDate instanceof Date) {
        dateStr = Utilities.formatDate(overtimeDate, "Asia/Taipei", "yyyy-MM");
      } else if (typeof overtimeDate === "string") {
        dateStr = overtimeDate.substring(0, 7);
      }
      
      if (dateStr !== yearMonth) continue;
      
      const status = String(row[9] || "").trim().toLowerCase();
      if (status !== "approved") continue;
      
      records.push({
        overtimeDate: dateStr,
        overtimeHours: parseFloat(row[6]) || 0,
        overtimeType: "平日加班",
        reviewStatus: "核准"
      });
    }
    
    return { success: true, data: records };
    
  } catch (error) {
    Logger.log("❌ 取得加班記錄失敗: " + error);
    return { success: false, message: error.toString(), data: [] };
  }
}

/**
 * ✅ 取得員工請假記錄
 */
function getEmployeeMonthlySalary(employeeId, yearMonth) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("請假記錄");
    
    if (!sheet) {
      return { success: true, data: [] };
    }
    
    const values = sheet.getDataRange().getValues();
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      if (!row[1] || !row[5]) continue;
      
      const rowEmployeeId = String(row[1]).trim();
      const startDate = row[5];
      
      if (rowEmployeeId !== employeeId) continue;
      
      let dateStr = "";
      if (startDate instanceof Date) {
        dateStr = Utilities.formatDate(startDate, "Asia/Taipei", "yyyy-MM");
      } else if (typeof startDate === "string") {
        dateStr = startDate.substring(0, 7);
      }
      
      if (dateStr !== yearMonth) continue;
      
      const status = String(row[9] || "").trim().toUpperCase();
      if (status !== "APPROVED") continue;
      
      records.push({
        leaveType: row[4] || "",
        startDate: startDate,
        leaveDays: parseFloat(row[7]) || 0,
        reviewStatus: "核准"
      });
    }
    
    return { success: true, data: records };
    
  } catch (error) {
    Logger.log("❌ 取得請假記錄失敗: " + error);
    return { success: false, message: error.toString(), data: [] };
  }
}

// ==================== 時薪計算功能 ====================

/**
 * ✅ 計算時薪員工的月薪資（完整修正版）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Object} 薪資計算結果
 */
function calculateHourlySalary(employeeId, yearMonth) {
  try {
    Logger.log(`⏰ 開始計算時薪薪資: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得員工薪資設定
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) {
      Logger.log('❌ 找不到員工薪資設定');
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    const hourlyRate = parseFloat(config['基本薪資']) || 0; // 時薪
    
    Logger.log(`💵 時薪: $${hourlyRate}`);
    
    // 2. ⭐ 取得該月份的打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    Logger.log(`📋 找到 ${attendanceRecords.length} 筆打卡記錄`);
    
    // 3. 計算工作時數
    let totalWorkHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.workHours > 0) {
        totalWorkHours += record.workHours;
        Logger.log(`   ${record.date}: ${record.punchIn} ~ ${record.punchOut} = ${record.workHours.toFixed(2)}h`);
      }
    });

    Logger.log(`⏱️ 總工作時數: ${totalWorkHours.toFixed(1)}h`);
    
    // 4. 計算基本薪資（工作時數 × 時薪）
    const basePay = totalWorkHours * hourlyRate;
    
    Logger.log(`💰 基本薪資 = ${hourlyRate} × ${totalWorkHours.toFixed(2)} = $${Math.round(basePay)}`);
    
    // 5. ⭐ 取得加班記錄
    const overtimeRecords = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    Logger.log(`📋 找到 ${overtimeRecords.length} 筆加班記錄`);
    
    // 6. ⭐⭐⭐ 計算加班費（區分平日/休息日/例假日）
    let totalOvertimeHours = 0;
    let weekdayOvertimePay = 0;   // 平日加班費
    let restdayOvertimePay = 0;   // 休息日加班費（週六）
    let holidayOvertimePay = 0;   // 例假日加班費（週日）
    
    // 按日期分組計算
    const overtimeByDate = {};
    
    overtimeRecords.forEach(record => {
      const date = record.date;
      if (!overtimeByDate[date]) {
        overtimeByDate[date] = 0;
      }
      overtimeByDate[date] += parseFloat(record.hours) || 0;
    });
    
    // ⭐⭐⭐ 修正：遍歷每天的加班記錄（區分平日/休息日/例假日）
    Object.keys(overtimeByDate).forEach(date => {
      let dailyHours = overtimeByDate[date];
      
      // 判斷日期類型
      const dateType = getDateType(date);
      const dateTypeName = {
        'weekday': '平日',
        'restday': '休息日（週六）',
        'holiday': '例假日（週日）'
      }[dateType];
      
      Logger.log(`\n📅 ${date} (${dateTypeName}): ${dailyHours.toFixed(1)}h`);
      
      // ⭐ 根據日期類型限制加班時數
      let maxHours = 4; // 平日最多4h
      if (dateType === 'restday') maxHours = 12; // 休息日最多12h
      if (dateType === 'holiday') maxHours = 8;  // 例假日最多8h
      
      if (dailyHours > maxHours) {
        Logger.log(`   ⚠️ 超過上限 (${dailyHours}h > ${maxHours}h)，限制為 ${maxHours}h`);
        dailyHours = maxHours;
      }
      
      // ⭐ 計算加班費
      const pay = calculateOvertimePay(dailyHours, hourlyRate, dateType);
      const totalPay = pay.firstPay + pay.secondPay + pay.thirdPay;
      
      // ⭐⭐⭐ 關鍵：依日期類型分別累計
      if (dateType === 'weekday') {
        weekdayOvertimePay += totalPay;
        Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
        if (pay.secondPay > 0) {
          Logger.log(`   - 後2h: $${pay.secondPay} (×1.67)`);
        }
      } else if (dateType === 'restday') {
        restdayOvertimePay += totalPay;
        Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
        if (pay.secondPay > 0) {
          Logger.log(`   - 3-8h: $${pay.secondPay} (×1.67)`);
        }
        if (pay.thirdPay > 0) {
          Logger.log(`   - 9h起: $${pay.thirdPay} (×2.67)`);
        }
      } else if (dateType === 'holiday') {
        holidayOvertimePay += totalPay;
        Logger.log(`   - 全天: $${totalPay} (×2.0)`);
      }
      
      totalOvertimeHours += dailyHours;
      Logger.log(`   ✅ 小計: $${totalPay}`);
    });
    
    // 四捨五入
    weekdayOvertimePay = Math.round(weekdayOvertimePay);
    restdayOvertimePay = Math.round(restdayOvertimePay);
    holidayOvertimePay = Math.round(holidayOvertimePay);
    
    Logger.log(`\n✅ 加班費計算完成:`);
    Logger.log(`   - 總時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 例假日加班費: $${holidayOvertimePay}`);
    
    // 7. 固定津貼（時薪員工通常沒有，但保留欄位）
    const positionAllowance = parseFloat(config['職務加給']) || 0;
    const mealAllowance = parseFloat(config['伙食費']) || 0;
    const transportAllowance = parseFloat(config['交通補助']) || 0;
    const attendanceBonus = parseFloat(config['全勤獎金']) || 0;
    const performanceBonus = parseFloat(config['業績獎金']) || 0;
    const otherAllowances = parseFloat(config['其他津貼']) || 0;
    
    Logger.log(`📋 固定津貼:`);
    if (positionAllowance > 0) Logger.log(`   - 職務加給: $${positionAllowance}`);
    if (mealAllowance > 0) Logger.log(`   - 伙食費: $${mealAllowance}`);
    if (transportAllowance > 0) Logger.log(`   - 交通補助: $${transportAllowance}`);
    if (attendanceBonus > 0) Logger.log(`   - 全勤獎金: $${attendanceBonus}`);
    if (performanceBonus > 0) Logger.log(`   - 業績獎金: $${performanceBonus}`);
    if (otherAllowances > 0) Logger.log(`   - 其他津貼: $${otherAllowances}`);
    
    // 8. 應發總額
    const grossSalary = basePay + 
                       positionAllowance + 
                       mealAllowance + 
                       transportAllowance + 
                       attendanceBonus + 
                       performanceBonus + 
                       otherAllowances +
                       weekdayOvertimePay + 
                       restdayOvertimePay +
                       holidayOvertimePay;
    
    Logger.log(`💵 應發總額: $${Math.round(grossSalary)}`);
    
    // 9. 扣款項目（時薪若月薪未達基本工資，可能不需扣保險）
    let laborFee = 0;
    let healthFee = 0;
    let employmentFee = 0;
    let pensionSelf = 0;
    let incomeTax = 0;
    
    // ⭐ 如果月總薪資達到基本工資，才扣保險
    if (grossSalary >= 28590) {
      const insuredSalary = getInsuredSalary(grossSalary);
      laborFee = Math.round(insuredSalary * 0.115 * 0.2);
      healthFee = Math.round(insuredSalary * 0.0517 * 0.3);
      employmentFee = Math.round(insuredSalary * 0.01 * 0.2);
      
      const pensionSelfRate = parseFloat(config['勞退自提率(%)']) || 0;
      pensionSelf = Math.round(insuredSalary * (pensionSelfRate / 100));
      
      if (grossSalary > 34000) {
        incomeTax = Math.round((grossSalary - 34000) * 0.05);
      }
      
      Logger.log(`📋 月薪達基本工資，計算法定扣款 (投保薪資: ${insuredSalary})`);
      Logger.log(`   - 勞保費: $${laborFee}`);
      Logger.log(`   - 健保費: $${healthFee}`);
      Logger.log(`   - 就業保險費: $${employmentFee}`);
      Logger.log(`   - 勞退自提 (${pensionSelfRate}%): $${pensionSelf}`);
      Logger.log(`   - 所得稅: $${incomeTax}`);
    } else {
      Logger.log(`⚠️ 月薪未達基本工資 ($${Math.round(grossSalary)} < $28,590)，不扣保險`);
    }
    
    // 10. 其他扣款
    const welfareFee = parseFloat(config['福利金扣款']) || 0;
    const dormitoryFee = parseFloat(config['宿舍費用']) || 0;
    const groupInsurance = parseFloat(config['團保費用']) || 0;
    const otherDeductions = parseFloat(config['其他扣款']) || 0;
    
    if (welfareFee > 0 || dormitoryFee > 0 || groupInsurance > 0 || otherDeductions > 0) {
      Logger.log(`📋 其他扣款:`);
      if (welfareFee > 0) Logger.log(`   - 福利金: $${welfareFee}`);
      if (dormitoryFee > 0) Logger.log(`   - 宿舍費用: $${dormitoryFee}`);
      if (groupInsurance > 0) Logger.log(`   - 團保費用: $${groupInsurance}`);
      if (otherDeductions > 0) Logger.log(`   - 其他扣款: $${otherDeductions}`);
    }
    
    // 11. 扣款總額
    const totalDeductions = laborFee + healthFee + employmentFee + pensionSelf + incomeTax +
                           welfareFee + dormitoryFee + groupInsurance + otherDeductions;
    
    Logger.log(`💸 扣款總額: $${totalDeductions}`);
    
    // 12. 實發金額
    const netSalary = grossSalary - totalDeductions;
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log('📊 時薪薪資計算結果匯總:');
    Logger.log('═══════════════════════════════════════');
    Logger.log(`   員工: ${config['員工姓名']} (${employeeId})`);
    Logger.log(`   月份: ${yearMonth}`);
    Logger.log(`   時薪: $${hourlyRate}`);
    Logger.log(`   工作時數: ${totalWorkHours.toFixed(2)}h`);
    Logger.log(`   基本薪資: $${Math.round(basePay)}`);
    Logger.log(`   加班時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 例假日加班費: $${holidayOvertimePay}`);
    Logger.log(`   應發總額: $${Math.round(grossSalary)}`);
    Logger.log(`   扣款總額: $${totalDeductions}`);
    Logger.log(`   實發金額: $${Math.round(netSalary)}`);
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    // 13. 返回結果
    const result = {
      employeeId: employeeId,
      employeeName: config['員工姓名'],
      yearMonth: yearMonth,
      salaryType: '時薪',
      hourlyRate: hourlyRate,
      totalWorkHours: parseFloat(totalWorkHours.toFixed(1)), // ⭐ 保留1位小數
      baseSalary: Math.round(basePay),
      positionAllowance: positionAllowance,
      mealAllowance: mealAllowance,
      transportAllowance: transportAllowance,
      attendanceBonus: attendanceBonus,
      performanceBonus: performanceBonus,
      otherAllowances: otherAllowances,
      weekdayOvertimePay: weekdayOvertimePay,      // ⭐ 只有平日
      restdayOvertimePay: restdayOvertimePay,      // ⭐ 只有休息日（週六）
      holidayOvertimePay: holidayOvertimePay,      // ⭐ 只有例假日（週日）
      totalOvertimeHours: totalOvertimeHours,
      laborFee: laborFee,
      healthFee: healthFee,
      employmentFee: employmentFee,
      pensionSelf: pensionSelf,
      pensionSelfRate: parseFloat(config['勞退自提率(%)']) || 0,
      incomeTax: incomeTax,
      leaveDeduction: 0,
      welfareFee: welfareFee,
      dormitoryFee: dormitoryFee,
      groupInsurance: groupInsurance,
      otherDeductions: otherDeductions,
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(netSalary),
      bankCode: config['銀行代碼'] || "",
      bankAccount: config['銀行帳號'] || "",
      status: "已計算",
      note: `工作${totalWorkHours.toFixed(1)}h，加班${totalOvertimeHours.toFixed(1)}h`
    };
    
    Logger.log('✅ 時薪計算完成');
    
    return { success: true, data: result };
    
  } catch (error) {
    Logger.log("❌ 計算時薪薪資失敗: " + error);
    Logger.log("❌ 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 * 🧪 測試時薪計算（使用實際打卡資料）
 */
function testCalculateHourlySalary() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('🧪 測試時薪計算');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'U68e0ca9d516e63ed15bf9387fad174ac';
  const yearMonth = '2025-12';
  
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  Logger.log('');
  Logger.log('📊 計算結果:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 * ✅ 取得員工該月份的打卡記錄並計算工時（修正版）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Array} 打卡記錄陣列
 */
function getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth) {
  try {
    Logger.log('📋 開始取得員工打卡記錄');
    Logger.log('   員工ID: ' + employeeId);
    Logger.log('   年月: ' + yearMonth);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_ATTENDANCE);
    
    if (!sheet) {
      Logger.log('⚠️ 找不到「打卡紀錄」工作表');
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      Logger.log('⚠️ 「打卡紀錄」工作表無資料');
      return [];
    }
    
    const headers = data[0];
    Logger.log('📊 打卡紀錄欄位: ' + headers.join(', '));
    
    const punchTimeIndex = headers.indexOf('打卡時間');
    const userIdIndex = headers.indexOf('userId');
    const typeIndex = headers.indexOf('打卡類別');
    const noteIndex = headers.indexOf('備註');
    const auditIndex = headers.indexOf('管理員審核');
    
    Logger.log('🔍 欄位索引:');
    Logger.log('   打卡時間: ' + punchTimeIndex);
    Logger.log('   userId: ' + userIdIndex);
    Logger.log('   打卡類別: ' + typeIndex);
    
    if (punchTimeIndex === -1 || userIdIndex === -1 || typeIndex === -1) {
      Logger.log('⚠️ 「打卡紀錄」工作表缺少必要欄位');
      return [];
    }
    
    // ⭐ 按日期分組打卡記錄（改用陣列儲存所有打卡）
    const recordsByDate = {};
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const rowUserId = String(row[userIdIndex] || '').trim();
      const punchTime = row[punchTimeIndex];
      const punchType = String(row[typeIndex] || '').trim();
      const note = row[noteIndex] || '';
      const audit = row[auditIndex] || '';
      
      if (rowUserId !== employeeId) continue;
      
      // 解析打卡時間
      let punchDate = null;
      let timeStr = '';
      let fullDateTime = null;
      
      if (punchTime instanceof Date) {
        punchDate = Utilities.formatDate(punchTime, 'Asia/Taipei', 'yyyy-MM-dd');
        timeStr = Utilities.formatDate(punchTime, 'Asia/Taipei', 'HH:mm');
        fullDateTime = punchTime;
      } else if (typeof punchTime === 'string') {
        const parts = punchTime.split(' ');
        if (parts.length >= 2) {
          punchDate = parts[0];
          timeStr = parts[1].substring(0, 5);
          try {
            fullDateTime = new Date(punchTime);
          } catch (e) {
            continue;
          }
        }
      } else {
        continue;
      }
      
      const dateStr = punchDate.substring(0, 7);
      if (dateStr !== yearMonth) continue;
      
      // 只計算正常打卡或已核准的補打卡
      const isNormalPunch = (note !== '補打卡');
      const isApprovedAdjustment = (note === '補打卡' && audit === 'v');
      
      if (!isNormalPunch && !isApprovedAdjustment) {
        Logger.log(`   ⏭️ 跳過 ${punchDate} ${timeStr} 的未核准補打卡`);
        continue;
      }
      
      // ⭐ 改用陣列儲存所有打卡（支援同一天多次打卡）
      if (!recordsByDate[punchDate]) {
        recordsByDate[punchDate] = [];
      }
      
      recordsByDate[punchDate].push({
        type: punchType,
        time: timeStr,
        fullDateTime: fullDateTime,
        note: note
      });
    }
    
    Logger.log(`📊 找到 ${Object.keys(recordsByDate).length} 天的打卡記錄`);
    
    // ⭐⭐⭐ 關鍵修正：配對上下班記錄並計算工時
    const records = [];
    
    Object.keys(recordsByDate).forEach(date => {
      const dayPunches = recordsByDate[date];
      
      // 按時間排序
      dayPunches.sort((a, b) => a.fullDateTime - b.fullDateTime);
      
      // 找出上班和下班打卡
      const punchIns = dayPunches.filter(p => p.type === '上班');
      const punchOuts = dayPunches.filter(p => p.type === '下班');
      
      let punchIn = null;
      let punchOut = null;
      let workHours = 0;
      
      // ⭐ 配對邏輯：取第一個上班和最後一個下班
      if (punchIns.length > 0) {
        punchIn = punchIns[0].time;
      }
      
      if (punchOuts.length > 0) {
        punchOut = punchOuts[punchOuts.length - 1].time;
      }
      
      // 計算工時
      if (punchIn && punchOut) {
        try {
          const inTime = new Date(`${date} ${punchIn}`);
          const outTime = new Date(`${date} ${punchOut}`);
          const diffMs = outTime - inTime;
          
          if (diffMs > 0) {
            const totalHours = diffMs / (1000 * 60 * 60);
            const lunchBreak = 1;
            // workHours = Math.max(0, totalHours - lunchBreak);
            workHours = Math.floor(Math.max(0, totalHours - lunchBreak));
            Logger.log(`   ${date}: ${punchIn} ~ ${punchOut} = ${workHours.toFixed(2)}h (原始: ${totalHours.toFixed(2)}h)`);
          } else {
            Logger.log(`   ⚠️ ${date}: ${punchIn} ~ ${punchOut} 時間異常（下班早於上班）`);
          }
        } catch (e) {
          Logger.log(`   ⚠️ 無法計算 ${date} 的工時: ` + e);
        }
      } else {
        Logger.log(`   ⚠️ ${date}: 打卡不完整 (上班: ${punchIn || '無'}, 下班: ${punchOut || '無'})`);
      }
      
      records.push({
        date: date,
        punchIn: punchIn,
        punchOut: punchOut,
        workHours: workHours
      });
    });
    
    // 按日期排序
    records.sort((a, b) => a.date.localeCompare(b.date));
    
    Logger.log(`✅ 成功處理 ${records.length} 筆打卡記錄`);
    
    return records;
    
  } catch (error) {
    Logger.log('❌ 取得打卡記錄失敗: ' + error);
    Logger.log('❌ 錯誤堆疊: ' + error.stack);
    return [];
  }
}

/**
 * ✅ 新增 API：取得員工該月份的加班記錄
 */
function getEmployeeMonthlyOvertimeAPI() {
  try {
    const session = checkSessionInternal();
    if (!session.ok) {
      return jsonResponse({ ok: false, msg: 'SESSION_INVALID', code: 'SESSION_INVALID' });
    }
    
    const employeeId = session.user.userId;
    const yearMonth = getParam('yearMonth');
    
    if (!yearMonth) {
      return jsonResponse({ ok: false, msg: 'MISSING_YEAR_MONTH', code: 'MISSING_YEAR_MONTH' });
    }
    
    Logger.log(`📋 取得 ${employeeId} 在 ${yearMonth} 的加班記錄`);
    
    const records = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    
    return jsonResponse({ ok: true, records: records });
    
  } catch (error) {
    Logger.log('❌ getEmployeeMonthlyOvertimeAPI 錯誤: ' + error);
    return jsonResponse({ ok: false, msg: error.toString(), code: 'ERROR' });
  }
}

/**
 * 🧪 測試打卡工時計算
 */
function testGetEmployeeMonthlyAttendance() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('🧪 測試 getEmployeeMonthlyAttendance');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'U68e0ca9d516e63ed15bf9387fad174ac'; // CSF
  const yearMonth = '2025-12';
  
  const records = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
  
  Logger.log('');
  Logger.log('📊 測試結果：找到 ' + records.length + ' 筆記錄');
  Logger.log('');
  
  let totalHours = 0;
  
  records.forEach(record => {
    Logger.log(`   ${record.date}: ${record.punchIn || '--'} ~ ${record.punchOut || '--'}, 工時: ${record.workHours.toFixed(2)}h`);
    totalHours += record.workHours;
  });
  
  Logger.log('');
  Logger.log('✅ 總工時: ' + totalHours.toFixed(2) + ' 小時');
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 * ✅ 計算午休時間（12:00-13:00）
 * 
 * @param {Date} startTime - 上班時間
 * @param {Date} endTime - 下班時間
 * @returns {number} 午休時間（毫秒）
 */
function calculateLunchBreak(startTime, endTime) {
  const lunchStart = new Date(startTime);
  lunchStart.setHours(12, 0, 0, 0);
  
  const lunchEnd = new Date(startTime);
  lunchEnd.setHours(13, 0, 0, 0);
  
  // 如果工作時段包含午休時間，扣除1小時
  if (startTime < lunchEnd && endTime > lunchStart) {
    return 60 * 60 * 1000; // 1小時 = 3600000毫秒
  }
  
  return 0;
}

/**
 * ✅ 投保薪資級距對照表（供時薪使用）
 */
function getInsuredSalary(salary) {
  const brackets = [
    { min: 0, max: 26400, insured: 26400 },
    { min: 26401, max: 27600, insured: 27600 },
    { min: 27601, max: 28800, insured: 28800 },
    { min: 28801, max: 30300, insured: 30300 },
    { min: 30301, max: 31800, insured: 31800 },
    { min: 31801, max: 33300, insured: 33300 },
    { min: 33301, max: 34800, insured: 34800 },
    { min: 34801, max: 36300, insured: 36300 },
    { min: 36301, max: 38200, insured: 38200 },
    { min: 38201, max: 40100, insured: 40100 },
    { min: 40101, max: 42000, insured: 42000 },
    { min: 42001, max: 43900, insured: 43900 },
    { min: 43901, max: 45800, insured: 45800 },
    { min: 45801, max: Infinity, insured: 45800 }
  ];
  
  for (const bracket of brackets) {
    if (salary >= bracket.min && salary <= bracket.max) {
      return bracket.insured;
    }
  }
  
  return 26400;
}

/**
 * ✅ 修改：計算月薪資（統一入口，自動判斷月薪/時薪）
 */
function calculateMonthlySalary(employeeId, yearMonth) {
  try {
    Logger.log(`💰 開始計算薪資: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得員工薪資設定
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) {
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    const salaryType = String(config['薪資類型'] || '月薪').trim();
    
    Logger.log(`📋 薪資類型: ${salaryType}`);
    
    // 2. ⭐⭐⭐ 根據薪資類型分流
    if (salaryType === '時薪') {
      Logger.log('⏰ 使用時薪計算邏輯');
      return calculateHourlySalary(employeeId, yearMonth);
    } else {
      Logger.log('💼 使用月薪計算邏輯');
      return calculateMonthlySalaryInternal(employeeId, yearMonth);
    }
    
  } catch (error) {
    Logger.log("❌ 計算薪資失敗: " + error);
    Logger.log("❌ 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 * ✅ 月薪計算（內部函數 - 完整修正版）
 */
function calculateMonthlySalaryInternal(employeeId, yearMonth) {
  try {
    Logger.log(`💰 開始計算月薪: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得員工薪資設定
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) {
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    
    // 2. 取得加班記錄
    const overtimeRecords = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    Logger.log(`📋 找到 ${overtimeRecords.length} 筆加班記錄`);
    
    // 3. 取得請假記錄
    const leaveRecords = getEmployeeMonthlySalary(employeeId, yearMonth);
    
    // 4. 基本薪資
    const baseSalary = parseFloat(config['基本薪資']) || 0;
    const hourlyRate = Math.round(baseSalary / 30 / 8); // 平日時薪
    
    Logger.log(`💵 基本薪資: ${baseSalary}, 時薪: ${hourlyRate}`);
    
    // 5. 固定津貼
    const positionAllowance = parseFloat(config['職務加給']) || 0;
    const mealAllowance = parseFloat(config['伙食費']) || 0;
    const transportAllowance = parseFloat(config['交通補助']) || 0;
    let attendanceBonus = parseFloat(config['全勤獎金']) || 0;
    const performanceBonus = parseFloat(config['業績獎金']) || 0;
    const otherAllowances = parseFloat(config['其他津貼']) || 0;
    
    // 6. ⭐⭐⭐ 計算加班費（區分平日/休息日/例假日）
    let totalOvertimeHours = 0;
    let weekdayOvertimePay = 0;   // 平日加班費
    let restdayOvertimePay = 0;   // 休息日加班費（週六）
    let holidayOvertimePay = 0;   // 例假日加班費（週日）
    
    // 按日期分組計算
    const overtimeByDate = {};
    
    overtimeRecords.forEach(record => {
      const date = record.date;
      if (!overtimeByDate[date]) {
        overtimeByDate[date] = 0;
      }
      overtimeByDate[date] += parseFloat(record.hours) || 0;
    });
    
    Logger.log(`📊 每日加班統計: ${JSON.stringify(overtimeByDate)}`);
    
    // ⭐⭐⭐ 修正：遍歷每天的加班記錄（區分平日/休息日/例假日）
    Object.keys(overtimeByDate).forEach(date => {
      let dailyHours = overtimeByDate[date];
      
      const dateType = getDateType(date);
      const dateTypeName = {
        'weekday': '平日',
        'restday': '休息日（週六）',
        'holiday': '例假日（週日）'
      }[dateType];
      
      Logger.log(`\n📅 ${date} (${dateTypeName}): ${dailyHours.toFixed(1)}h`);
      
      let maxHours = 4;
      if (dateType === 'restday') maxHours = 12;
      if (dateType === 'holiday') maxHours = 8;
      
      if (dailyHours > maxHours) {
        Logger.log(`   ⚠️ 超過上限，限制為 ${maxHours}h`);
        dailyHours = maxHours;
      }
      
      const pay = calculateOvertimePay(dailyHours, hourlyRate, dateType);
      const totalPay = pay.firstPay + pay.secondPay + pay.thirdPay;
      
      // ⭐⭐⭐ 關鍵：依日期類型分別累計
      if (dateType === 'weekday') {
        weekdayOvertimePay += totalPay;
        Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
        if (pay.secondPay > 0) {
          Logger.log(`   - 後2h: $${pay.secondPay} (×1.67)`);
        }
      } else if (dateType === 'restday') {
        restdayOvertimePay += totalPay;
        Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
        if (pay.secondPay > 0) {
          Logger.log(`   - 3-8h: $${pay.secondPay} (×1.67)`);
        }
        if (pay.thirdPay > 0) {
          Logger.log(`   - 9h起: $${pay.thirdPay} (×2.67)`);
        }
      } else if (dateType === 'holiday') {
        holidayOvertimePay += totalPay;
        Logger.log(`   - 全天: $${totalPay} (×2.0)`);
      }
      
      totalOvertimeHours += dailyHours;
      Logger.log(`   ✅ 小計: $${totalPay}`);
    });
    
    // 四捨五入
    weekdayOvertimePay = Math.round(weekdayOvertimePay);
    restdayOvertimePay = Math.round(restdayOvertimePay);
    holidayOvertimePay = Math.round(holidayOvertimePay);
    
    Logger.log(`\n✅ 加班費計算完成:`);
    Logger.log(`   - 總時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 例假日加班費: $${holidayOvertimePay}`);
    
    // 7. 請假扣款
    let leaveDeduction = 0;
    if (leaveRecords.success && leaveRecords.data) {
      leaveRecords.data.forEach(record => {
        if (record.reviewStatus === '核准') {
          const leaveType = String(record.leaveType).toUpperCase();
          
          // 只有事假需要扣薪
          if (leaveType === 'PERSONAL_LEAVE' || leaveType === '事假') {
            const dailyRate = Math.round(baseSalary / 30);
            leaveDeduction += record.leaveDays * dailyRate;
          }
        }
      });
    }
    
    // 如果有請假，取消全勤獎金
    if (leaveDeduction > 0) {
      attendanceBonus = 0;
      Logger.log(`⚠️ 有請假記錄，取消全勤獎金`);
    }
    
    // 8. 法定扣款
    const laborFee = parseFloat(config['勞保費']) || 0;
    const healthFee = parseFloat(config['健保費']) || 0;
    const employmentFee = parseFloat(config['就業保險費']) || 0;
    const pensionSelf = parseFloat(config['勞退自提']) || 0;
    const pensionSelfRate = parseFloat(config['勞退自提率(%)']) || 0;
    const incomeTax = parseFloat(config['所得稅']) || 0;
    
    // 9. 其他扣款
    const welfareFee = parseFloat(config['福利金扣款']) || 0;
    const dormitoryFee = parseFloat(config['宿舍費用']) || 0;
    const groupInsurance = parseFloat(config['團保費用']) || 0;
    const otherDeductions = parseFloat(config['其他扣款']) || 0;
    
    // 10. 應發總額
    const grossSalary = baseSalary + 
                       positionAllowance + 
                       mealAllowance + 
                       transportAllowance + 
                       attendanceBonus + 
                       performanceBonus + 
                       otherAllowances +
                       weekdayOvertimePay + 
                       restdayOvertimePay +
                       holidayOvertimePay;
    
    // 11. 扣款總額
    const totalDeductions = laborFee + 
                           healthFee + 
                           employmentFee + 
                           pensionSelf + 
                           incomeTax +
                           leaveDeduction + 
                           welfareFee + 
                           dormitoryFee + 
                           groupInsurance + 
                           otherDeductions;
    
    // 12. 實發金額
    const netSalary = grossSalary - totalDeductions;
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log('📊 月薪薪資計算結果匯總:');
    Logger.log('═══════════════════════════════════════');
    Logger.log(`   員工: ${config['員工姓名']} (${employeeId})`);
    Logger.log(`   月份: ${yearMonth}`);
    Logger.log(`   基本薪資: $${baseSalary}`);
    Logger.log(`   加班時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 例假日加班費: $${holidayOvertimePay}`);
    Logger.log(`   應發總額: $${Math.round(grossSalary)}`);
    Logger.log(`   扣款總額: $${totalDeductions}`);
    Logger.log(`   實發金額: $${Math.round(netSalary)}`);
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    // 13. 返回結果
    const result = {
      employeeId: employeeId,
      employeeName: config['員工姓名'],
      yearMonth: yearMonth,
      salaryType: '月薪',
      baseSalary: baseSalary,
      positionAllowance: positionAllowance,
      mealAllowance: mealAllowance,
      transportAllowance: transportAllowance,
      attendanceBonus: attendanceBonus,
      performanceBonus: performanceBonus,
      otherAllowances: otherAllowances,
      weekdayOvertimePay: weekdayOvertimePay,      // ⭐ 只有平日
      restdayOvertimePay: restdayOvertimePay,      // ⭐ 只有休息日（週六）
      holidayOvertimePay: holidayOvertimePay,      // ⭐ 只有例假日（週日）
      totalOvertimeHours: totalOvertimeHours,
      laborFee: laborFee,
      healthFee: healthFee,
      employmentFee: employmentFee,
      pensionSelf: pensionSelf,
      pensionSelfRate: pensionSelfRate,
      incomeTax: incomeTax,
      leaveDeduction: Math.round(leaveDeduction),
      welfareFee: welfareFee,
      dormitoryFee: dormitoryFee,
      groupInsurance: groupInsurance,
      otherDeductions: otherDeductions,
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(netSalary),
      bankCode: config['銀行代碼'] || "",
      bankAccount: config['銀行帳號'] || "",
      status: "已計算",
      note: `本月加班${totalOvertimeHours.toFixed(1)}小時`
    };
    
    Logger.log('✅ 月薪計算完成');
    
    return { success: true, data: result };
    
  } catch (error) {
    Logger.log("❌ 計算月薪失敗: " + error);
    Logger.log("❌ 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}


/**
 * ✅ API：取得員工該月份的打卡記錄
 */
function getEmployeeMonthlyAttendance() {
  try {
    const session = checkSessionInternal();
    if (!session.ok) {
      return jsonResponse({ ok: false, msg: 'SESSION_INVALID', code: 'SESSION_INVALID' });
    }
    
    const employeeId = session.user.userId;
    const yearMonth = getParam('yearMonth');
    
    if (!yearMonth) {
      return jsonResponse({ ok: false, msg: 'MISSING_YEAR_MONTH', code: 'MISSING_YEAR_MONTH' });
    }
    
    Logger.log(`📋 API: 取得 ${employeeId} 在 ${yearMonth} 的打卡記錄`);
    
    // 呼叫 SalaryManagement-Enhanced.gs 中的內部函數
    const records = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    
    return jsonResponse({ ok: true, records: records });
    
  } catch (error) {
    Logger.log('❌ getEmployeeMonthlyAttendance API 錯誤: ' + error);
    return jsonResponse({ ok: false, msg: error.toString(), code: 'ERROR' });
  }
}


// ==================== 薪資匯出功能（管理員專用） ====================

/**
 * ✅ 匯出所有員工薪資總表為 Excel（修正版）
 */
function exportAllSalaryExcel() {
  try {
    // 從全域變數取得參數
    const e = globalThis.currentRequest;
    
    if (!e || !e.parameter) {
      return jsonResponse(false, null, '無法取得請求參數', 'NO_REQUEST');
    }
    
    const params = e.parameter;
    const yearMonth = params.yearMonth;
    
    Logger.log('📥 exportAllSalaryExcel 收到參數:');
    Logger.log('   yearMonth: ' + yearMonth);
    
    // 驗證參數
    if (!yearMonth) {
      return jsonResponse(false, null, '缺少 yearMonth 參數', 'MISSING_YEAR_MONTH');
    }
    
    // ⭐⭐⭐ 移除 Session 驗證（已在 Main.gs 中驗證過）
    
    Logger.log('✅ 開始匯出薪資總表: ' + yearMonth);
    
    // 取得薪資記錄
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salarySheet = ss.getSheetByName('月薪資記錄');
    
    if (!salarySheet) {
      return jsonResponse(false, null, '找不到月薪資記錄工作表', 'SHEET_NOT_FOUND');
    }
    
    const lastRow = salarySheet.getLastRow();
    
    if (lastRow <= 1) {
      return jsonResponse(false, null, '沒有薪資記錄', 'NO_RECORDS');
    }
    
    const allData = salarySheet.getRange(2, 1, lastRow - 1, salarySheet.getLastColumn()).getValues();
    
    Logger.log(`📊 原始資料筆數: ${allData.length}`);
    
    // 篩選指定月份的記錄
    const records = [];
    
    allData.forEach((row, index) => {
      const rowYearMonth = row[3]; // 第4欄是年月
      
      let normalizedYearMonth = '';
      
      if (rowYearMonth instanceof Date) {
        normalizedYearMonth = Utilities.formatDate(rowYearMonth, 'Asia/Taipei', 'yyyy-MM');
      } else if (typeof rowYearMonth === 'string') {
        normalizedYearMonth = rowYearMonth.substring(0, 7);
      } else {
        return;
      }
      
      if (normalizedYearMonth === yearMonth) {
        records.push(row);
        Logger.log(`✅ 找到符合記錄: 員工 ${row[2]}, 年月 ${normalizedYearMonth}`);
      }
    });
    
    Logger.log(`📊 找到 ${records.length} 筆 ${yearMonth} 的記錄`);
    
    if (records.length === 0) {
      return jsonResponse(false, null, `${yearMonth} 沒有薪資記錄`, 'NO_RECORDS_FOR_MONTH');
    }
    
    // 建立新的試算表
    const spreadsheet = SpreadsheetApp.create(`薪資總表_${yearMonth}`);
    const sheet = spreadsheet.getActiveSheet();
    sheet.setName('薪資明細');
    
    // 設定標題列
    const headers = [
      '薪資單ID', '員工ID', '員工姓名', '年月', '薪資類型', '時薪', '工作時數', '總加班時數',
      '基本薪資', '職務加給', '伙食費', '交通補助', '全勤獎金', '業績獎金', '其他津貼',
      '平日加班費', '休息日加班費', '國定假日加班費',
      '勞保費', '健保費', '就業保險費', '勞退自提', '所得稅',
      '請假扣款', '福利金扣款', '宿舍費用', '團保費用', '其他扣款',
      '應發總額', '實發金額',
      '銀行代碼', '銀行帳號',
      '狀態', '備註', '建立時間'
    ];
    
    // 寫入標題列
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 格式化標題列
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // 寫入資料
    if (records.length > 0) {
      const dataToWrite = records.map(row => {
        while (row.length < headers.length) {
          row.push('');
        }
        return row.slice(0, headers.length);
      });
      
      sheet.getRange(2, 1, dataToWrite.length, headers.length).setValues(dataToWrite);
      Logger.log(`✅ 已寫入 ${dataToWrite.length} 筆資料`);
    }
    
    // 自動調整欄寬
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
    
    // 凍結標題列
    sheet.setFrozenRows(1);
    
    // 設定檔案權限
    const file = DriveApp.getFileById(spreadsheet.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 取得下載連結
    const fileId = spreadsheet.getId();
    const downloadUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
    
    Logger.log('✅ Excel 已生成');
    Logger.log('📊 檔案 ID: ' + fileId);
    Logger.log('🔗 下載連結: ' + downloadUrl);
    
    return jsonResponse(true, {
      fileUrl: downloadUrl,
      fileId: fileId,
      fileName: `薪資總表_${yearMonth}`,
      recordCount: records.length
    }, '薪資總表已生成');
    
  } catch (error) {
    Logger.log('❌ exportAllSalaryExcel 錯誤: ' + error.toString());
    Logger.log('❌ 錯誤堆疊: ' + error.stack);
    return jsonResponse(false, null, '匯出失敗: ' + error.toString(), 'EXPORT_ERROR');
  }
}
/**
 * ✅ 取得或建立資料夾
 * 
 * @param {string} folderName - 資料夾名稱
 * @param {Folder} parentFolder - 父資料夾（可選）
 * @returns {Folder} 資料夾物件
 */
function getOrCreateFolder(folderName, parentFolder) {
  const parent = parentFolder || DriveApp.getRootFolder();
  
  const folders = parent.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(folderName);
  }
}

/**
 * ✅ 取得銀行名稱（重複使用現有函數）
 */
function getBankName(code) {
  if (!code || code === '') {
    return '未設定';
  }
  
  // 自動補零到 3 位數
  const bankCode = String(code).padStart(3, '0');
  
  const banks = {
    // 公股銀行
    "004": "臺灣銀行",
    "005": "臺灣土地銀行",
    "006": "合作金庫商業銀行",
    "007": "第一商業銀行",
    "008": "華南商業銀行",
    "009": "彰化商業銀行",
    "011": "上海商業儲蓄銀行",
    "012": "台北富邦商業銀行",
    "013": "國泰世華商業銀行",
    "016": "高雄銀行",
    "017": "兆豐國際商業銀行",
    "050": "臺灣中小企業銀行",
    
    // 民營銀行
    "103": "臺灣新光商業銀行",
    "108": "陽信商業銀行",
    "118": "板信商業銀行",
    "147": "三信商業銀行",
    "803": "聯邦商業銀行",
    "805": "遠東國際商業銀行",
    "806": "元大商業銀行",
    "807": "永豐商業銀行",
    "808": "玉山商業銀行",
    "809": "凱基商業銀行",
    "810": "星展（台灣）商業銀行",
    "812": "台新國際商業銀行",
    "816": "安泰商業銀行",
    "822": "中國信託商業銀行",
    "826": "樂天國際商業銀行",
    
    // 外商銀行
    "052": "渣打國際商業銀行",
    "081": "匯豐（台灣）商業銀行",
    "101": "瑞興商業銀行",
    "102": "華泰商業銀行",
    "815": "日盛國際商業銀行",
    "824": "連線商業銀行",
    
    // 郵局
    "700": "中華郵政"
  };
  
  return banks[bankCode] || `未知銀行 (${bankCode})`;
}

console.log('✅ 薪資匯出功能已載入（管理員專用）');


function testExportSalaryDirect() {
  Logger.log('🧪 开始测试汇出功能');
  
  // 模拟请求参数
  const mockParams = {
    action: 'exportAllSalaryExcel',
    token: '48c4c025-f8fa-4528-9429-910b507c6774',  // ⚠️ 替换成真实的 token
    yearMonth: '2025-12',
    callback: 'callback'
  };
  
  // 模拟 doGet 请求
  const mockEvent = {
    parameter: mockParams
  };
  
  const result = doGet(mockEvent);
  Logger.log('📤 测试结果:');
  Logger.log(result.getContent());
}

function testCheckSalaryData() {
  Logger.log('🔍 檢查薪資記錄資料結構');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salarySheet = ss.getSheetByName('月薪資記錄');
  
  if (!salarySheet) {
    Logger.log('❌ 找不到「月薪資記錄」工作表');
    return;
  }
  
  const lastRow = salarySheet.getLastRow();
  Logger.log(`📊 總行數: ${lastRow}`);
  
  if (lastRow <= 1) {
    Logger.log('⚠️ 工作表中沒有資料');
    return;
  }
  
  // 取得標題列
  const headers = salarySheet.getRange(1, 1, 1, salarySheet.getLastColumn()).getValues()[0];
  Logger.log(`📋 欄位標題: ${headers.join(', ')}`);
  
  // 取得前 5 筆資料
  const sampleData = salarySheet.getRange(2, 1, Math.min(5, lastRow - 1), salarySheet.getLastColumn()).getValues();
  
  Logger.log('\n📊 前 5 筆資料:');
  sampleData.forEach((row, index) => {
    Logger.log(`\n第 ${index + 1} 筆:`);
    Logger.log(`   員工ID (col 2): ${row[1]}`);
    Logger.log(`   員工姓名 (col 3): ${row[2]}`);
    Logger.log(`   年月 (col 4): ${row[3]} (型別: ${typeof row[3]})`);
    
    if (row[3] instanceof Date) {
      Logger.log(`   年月 (格式化): ${Utilities.formatDate(row[3], 'Asia/Taipei', 'yyyy-MM')}`);
    }
  });
}

function testEricSalary() {
  const employeeId = 'Ud3b574f260f5a777337158ccd4ff0ba2'; // Eric 的 ID
  const yearMonth = '2025-12';
  
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  Logger.log('📊 計算結果:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * ✅ 計算員工該月份的總工時（不含扣除項目，僅計算淨工作時數）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Object} { success, totalWorkHours }
 */
function calculateEmployeeWorkHours(employeeId, yearMonth) {
  try {
    Logger.log(`⏱️ 計算員工工時: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    Logger.log(`📋 找到 ${attendanceRecords.length} 筆打卡記錄`);
    
    // 2. 計算總工時（已扣除午休）
    let totalWorkHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.workHours > 0) {
        totalWorkHours += record.workHours;
      }
    });
    
    Logger.log(`✅ 總工時: ${totalWorkHours.toFixed(1)} 小時`);
    
    return { 
      success: true, 
      totalWorkHours: totalWorkHours 
    };
    
  } catch (error) {
    Logger.log('❌ 計算工時失敗: ' + error);
    return { 
      success: false, 
      totalWorkHours: 0,
      message: error.toString() 
    };
  }
}

/**
 * ✅ API：取得員工該月份的總工作時數
 * 
 * 用途：查詢員工該月份的淨工作時數（已扣除午休）
 * 路徑：?action=getEmployeeWorkHours&yearMonth=2025-12
 * 
 * @returns {Object} { ok, totalWorkHours, records }
 */
function getEmployeeWorkHoursAPI() {
  try {
    // 1. 驗證 Session
    const session = checkSessionInternal();
    if (!session.ok) {
      return jsonResponse(false, null, 'SESSION_INVALID', 'SESSION_INVALID');
    }
    
    const employeeId = session.user.userId;
    const yearMonth = getParam('yearMonth');
    
    // 2. 驗證參數
    if (!yearMonth) {
      return jsonResponse(false, null, '缺少 yearMonth 參數', 'MISSING_YEAR_MONTH');
    }
    
    Logger.log(`📋 API: 取得 ${employeeId} 在 ${yearMonth} 的總工作時數`);
    
    // 3. 取得打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    
    // 4. 計算總工時
    let totalWorkHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.workHours > 0) {
        totalWorkHours += record.workHours;
      }
    });
    
    // 5. 保留1位小數
    const totalWorkHoursRounded = parseFloat(totalWorkHours.toFixed(1));
    
    Logger.log(`✅ 總工作時數: ${totalWorkHoursRounded}h`);
    
    // 6. 返回結果
    return jsonResponse(true, {
      totalWorkHours: totalWorkHoursRounded,
      workDays: attendanceRecords.length,
      records: attendanceRecords.map(r => ({
        date: r.date,
        punchIn: r.punchIn,
        punchOut: r.punchOut,
        workHours: parseFloat(r.workHours.toFixed(1))
      }))
    }, '查詢成功');
    
  } catch (error) {
    Logger.log('❌ getEmployeeWorkHoursAPI 錯誤: ' + error);
    Logger.log('❌ 錯誤堆疊: ' + error.stack);
    return jsonResponse(false, null, error.toString(), 'ERROR');
  }
}


/**
 * 🧪 測試取得 Eric 的工作時數（後端驗證）
 */
function testEricWorkHours() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('🧪 測試 Eric 的工作時數');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'Ud3b574f260f5a777337158ccd4ff0ba2'; // Eric
  const yearMonth = '2025-12';
  
  Logger.log(`📋 員工ID: ${employeeId}`);
  Logger.log(`📅 查詢月份: ${yearMonth}`);
  Logger.log('');
  
  // ==================== 方法 1：直接呼叫內部函數 ====================
  Logger.log('📊 方法 1：呼叫 getEmployeeMonthlyAttendanceInternal');
  Logger.log('─────────────────────────────────────');
  
  const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
  
  Logger.log(`✅ 找到 ${attendanceRecords.length} 筆打卡記錄`);
  Logger.log('');
  
  // 計算總工時
  let totalWorkHours = 0;
  
  Logger.log('📋 每日工時明細:');
  attendanceRecords.forEach(record => {
    if (record.workHours > 0) {
      totalWorkHours += record.workHours;
      Logger.log(`   ${record.date}: ${record.punchIn || '--'} ~ ${record.punchOut || '--'} = ${record.workHours.toFixed(1)}h`);
    } else {
      Logger.log(`   ${record.date}: ${record.punchIn || '--'} ~ ${record.punchOut || '--'} = 打卡不完整`);
    }
  });
  
  Logger.log('');
  Logger.log('─────────────────────────────────────');
  Logger.log(`✅ 總工作時數: ${totalWorkHours.toFixed(1)} 小時`);
  Logger.log(`✅ 出勤天數: ${attendanceRecords.filter(r => r.workHours > 0).length} 天`);
  Logger.log('─────────────────────────────────────');
  Logger.log('');
  
  // ==================== 方法 2：呼叫 calculateEmployeeWorkHours ====================
  Logger.log('📊 方法 2：呼叫 calculateEmployeeWorkHours');
  Logger.log('─────────────────────────────────────');
  
  const result = calculateEmployeeWorkHours(employeeId, yearMonth);
  
  if (result.success) {
    Logger.log(`✅ 成功取得工作時數: ${result.totalWorkHours.toFixed(1)}h`);
  } else {
    Logger.log(`❌ 失敗: ${result.message}`);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log('🎯 測試完成');
  Logger.log('═══════════════════════════════════════');
  
  // ==================== 方法 3：檢查薪資計算結果 ====================
  Logger.log('');
  Logger.log('📊 方法 3：檢查薪資計算結果中的工作時數');
  Logger.log('─────────────────────────────────────');
  
  const salaryResult = calculateMonthlySalary(employeeId, yearMonth);
  
  if (salaryResult.success) {
    const data = salaryResult.data;
    Logger.log(`✅ 薪資類型: ${data.salaryType}`);
    Logger.log(`✅ 時薪: $${data.hourlyRate || 0}`);
    Logger.log(`✅ 工作時數: ${data.totalWorkHours || 0}h`);
    Logger.log(`✅ 基本薪資: $${data.baseSalary}`);
    Logger.log(`✅ 加班時數: ${data.totalOvertimeHours || 0}h`);
  } else {
    Logger.log(`❌ 計算失敗: ${salaryResult.message}`);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}