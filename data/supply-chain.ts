// Curated supply chain data: US company → suppliers (Taiwan + key US/global)
// Sources: public filings, earnings calls, industry reports

export interface Supplier {
  name: string;        // Company name
  ticker?: string;     // Stock ticker (if public)
  market: 'TW' | 'US' | 'KR' | 'JP' | 'NL' | 'DE' | 'OTHER'; // Exchange/country
  role: string;        // What they supply
  category: 'chip' | 'assembly' | 'component' | 'equipment' | 'material' | 'software' | 'service';
}

export interface SupplyChainEntry {
  symbol: string;
  suppliers: Supplier[];
}

const supplyChainDB: Record<string, Supplier[]> = {
  // ===== NVIDIA =====
  'NVDA': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '先進製程晶圓代工（3nm/5nm GPU）', category: 'chip' },
    { name: '日月光 ASE', ticker: '3711.TW', market: 'TW', role: 'GPU封裝測試（CoWoS先進封裝）', category: 'assembly' },
    { name: '矽品 SPIL', ticker: '2325.TW', market: 'TW', role: '半導體封裝測試', category: 'assembly' },
    { name: '京元電子 King Yuan', ticker: '2449.TW', market: 'TW', role: 'IC 測試服務', category: 'assembly' },
    { name: '欣興電子 Unimicron', ticker: '3037.TW', market: 'TW', role: 'ABF載板（GPU基板）', category: 'component' },
    { name: '南亞電路板 NanYa PCB', ticker: '8046.TW', market: 'TW', role: 'ABF載板', category: 'component' },
    { name: '景碩 Kinsus', ticker: '3189.TW', market: 'TW', role: 'IC載板', category: 'component' },
    { name: '台達電 Delta', ticker: '2308.TW', market: 'TW', role: '伺服器電源供應器', category: 'component' },
    { name: '光寶科 Liteon', ticker: '2301.TW', market: 'TW', role: '電源模組', category: 'component' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'AI伺服器組裝（GB200）', category: 'assembly' },
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'AI伺服器/HGX平台代工', category: 'assembly' },
    { name: '緯創 Wistron', ticker: '3231.TW', market: 'TW', role: 'AI伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: '雲端伺服器設計製造', category: 'assembly' },
    { name: '技嘉 Gigabyte', ticker: '2376.TW', market: 'TW', role: 'GPU顯卡/伺服器', category: 'assembly' },
    { name: '微星 MSI', ticker: '2377.TW', market: 'TW', role: 'GPU顯卡', category: 'assembly' },
    { name: '華碩 ASUS', ticker: '2357.TW', market: 'TW', role: 'GPU顯卡', category: 'assembly' },
    { name: '奇鋐 Asia Vital', ticker: '3017.TW', market: 'TW', role: '散熱模組（液冷/氣冷）', category: 'component' },
    { name: '雙鴻 Auras', ticker: '3324.TW', market: 'TW', role: '散熱解決方案', category: 'component' },
    { name: 'SK Hynix', ticker: '000660.KS', market: 'KR', role: 'HBM3E 高頻寬記憶體', category: 'chip' },
    { name: 'Micron 美光', ticker: 'MU', market: 'US', role: 'HBM3E 記憶體', category: 'chip' },
    { name: 'Samsung 三星', ticker: '005930.KS', market: 'KR', role: 'HBM 記憶體', category: 'chip' },
    { name: 'Broadcom 博通', ticker: 'AVGO', market: 'US', role: '網路晶片（NVLink交換器）', category: 'chip' },
    { name: 'ASML 艾司摩爾', ticker: 'ASML', market: 'NL', role: 'EUV光刻機（供TSMC）', category: 'equipment' },
  ],

  // ===== APPLE =====
  'AAPL': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: 'A系列/M系列晶片代工（3nm）', category: 'chip' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'iPhone/iPad主要組裝', category: 'assembly' },
    { name: '和碩 Pegatron', ticker: '4938.TW', market: 'TW', role: 'iPhone組裝', category: 'assembly' },
    { name: '緯創 Wistron', ticker: '3231.TW', market: 'TW', role: 'MacBook/iPad組裝', category: 'assembly' },
    { name: '台達電 Delta', ticker: '2308.TW', market: 'TW', role: '充電器/電源轉接器', category: 'component' },
    { name: '大立光 Largan', ticker: '3008.TW', market: 'TW', role: 'iPhone鏡頭模組', category: 'component' },
    { name: '玉晶光 Genius', ticker: '3406.TW', market: 'TW', role: '光學鏡頭', category: 'component' },
    { name: '穩懋 Win Semi', ticker: '3105.TW', market: 'TW', role: 'PA功率放大器晶片', category: 'chip' },
    { name: '臻鼎 Zhen Ding', ticker: '4958.TW', market: 'TW', role: '軟性印刷電路板（FPC）', category: 'component' },
    { name: '欣興電子 Unimicron', ticker: '3037.TW', market: 'TW', role: 'HDI電路板', category: 'component' },
    { name: '可成 Catcher', ticker: '2474.TW', market: 'TW', role: '金屬機殼', category: 'component' },
    { name: '日月光 ASE', ticker: '3711.TW', market: 'TW', role: 'SiP系統級封裝', category: 'assembly' },
    { name: 'Qualcomm 高通', ticker: 'QCOM', market: 'US', role: '5G數據機（部分iPhone）', category: 'chip' },
    { name: 'Broadcom 博通', ticker: 'AVGO', market: 'US', role: 'Wi-Fi/藍牙晶片', category: 'chip' },
    { name: 'Texas Instruments', ticker: 'TXN', market: 'US', role: '類比IC/電源管理', category: 'chip' },
    { name: 'Corning 康寧', ticker: 'GLW', market: 'US', role: 'Ceramic Shield螢幕玻璃', category: 'material' },
    { name: 'Samsung 三星', ticker: '005930.KS', market: 'KR', role: 'OLED面板', category: 'component' },
    { name: 'Sony', ticker: '6758.T', market: 'JP', role: 'CMOS影像感測器', category: 'chip' },
  ],

  // ===== AMD =====
  'AMD': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: 'CPU/GPU晶圓代工（3nm/5nm）', category: 'chip' },
    { name: '日月光 ASE', ticker: '3711.TW', market: 'TW', role: '封裝測試', category: 'assembly' },
    { name: '矽品 SPIL', ticker: '2325.TW', market: 'TW', role: '封裝測試', category: 'assembly' },
    { name: '欣興電子 Unimicron', ticker: '3037.TW', market: 'TW', role: 'ABF載板', category: 'component' },
    { name: '南亞電路板 NanYa PCB', ticker: '8046.TW', market: 'TW', role: 'ABF載板', category: 'component' },
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'AI伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: 'AI伺服器', category: 'assembly' },
    { name: 'SK Hynix', ticker: '000660.KS', market: 'KR', role: 'HBM記憶體', category: 'chip' },
    { name: 'Micron 美光', ticker: 'MU', market: 'US', role: 'HBM記憶體', category: 'chip' },
    { name: 'ASML 艾司摩爾', ticker: 'ASML', market: 'NL', role: 'EUV光刻機（供TSMC）', category: 'equipment' },
  ],

  // ===== BROADCOM =====
  'AVGO': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '網路/客製化AI晶片代工', category: 'chip' },
    { name: '日月光 ASE', ticker: '3711.TW', market: 'TW', role: '封裝測試', category: 'assembly' },
    { name: '欣興電子 Unimicron', ticker: '3037.TW', market: 'TW', role: 'ABF載板', category: 'component' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: '網通設備組裝', category: 'assembly' },
  ],

  // ===== TESLA =====
  'TSLA': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: 'FSD自駕晶片代工', category: 'chip' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: '電動車零組件/連接器', category: 'component' },
    { name: '和大工業 Hota', ticker: '1536.TW', market: 'TW', role: '減速齒輪箱', category: 'component' },
    { name: '貿聯 BizLink', ticker: '3665.TW', market: 'TW', role: '線束/充電連接器', category: 'component' },
    { name: '乙盛精密 E-TONE', ticker: '5765.TW', market: 'TW', role: '車用精密零件', category: 'component' },
    { name: 'Panasonic', ticker: '6752.T', market: 'JP', role: '電池芯', category: 'component' },
    { name: 'Texas Instruments', ticker: 'TXN', market: 'US', role: '車用類比IC', category: 'chip' },
    { name: 'Samsung SDI', ticker: '006400.KS', market: 'KR', role: '電池芯', category: 'component' },
  ],

  // ===== MICROSOFT =====
  'MSFT': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '自研AI晶片Maia代工', category: 'chip' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'Xbox/Surface組裝', category: 'assembly' },
    { name: '和碩 Pegatron', ticker: '4938.TW', market: 'TW', role: 'Surface組裝', category: 'assembly' },
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'Azure伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: '雲端伺服器', category: 'assembly' },
    { name: 'NVIDIA', ticker: 'NVDA', market: 'US', role: 'Azure AI GPU（H100/B200）', category: 'chip' },
    { name: 'AMD', ticker: 'AMD', market: 'US', role: 'Azure CPU/GPU', category: 'chip' },
  ],

  // ===== AMAZON =====
  'AMZN': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '自研Graviton/Trainium晶片代工', category: 'chip' },
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'AWS伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: 'AWS雲端伺服器', category: 'assembly' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'AWS伺服器/Kindle', category: 'assembly' },
    { name: 'NVIDIA', ticker: 'NVDA', market: 'US', role: 'AWS AI GPU', category: 'chip' },
    { name: 'Intel', ticker: 'INTC', market: 'US', role: 'AWS伺服器CPU', category: 'chip' },
  ],

  // ===== GOOGLE =====
  'GOOGL': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '自研TPU/Tensor晶片代工', category: 'chip' },
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'GCP伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: '雲端伺服器', category: 'assembly' },
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'Pixel手機組裝', category: 'assembly' },
    { name: 'NVIDIA', ticker: 'NVDA', market: 'US', role: 'GCP AI GPU', category: 'chip' },
    { name: 'Broadcom 博通', ticker: 'AVGO', market: 'US', role: 'TPU客製化晶片合作', category: 'chip' },
    { name: 'Samsung 三星', ticker: '005930.KS', market: 'KR', role: 'Pixel OLED面板', category: 'component' },
  ],

  // ===== META =====
  'META': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '自研MTIA晶片代工', category: 'chip' },
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'AI伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: '雲端伺服器', category: 'assembly' },
    { name: '和碩 Pegatron', ticker: '4938.TW', market: 'TW', role: 'Quest VR頭盔組裝', category: 'assembly' },
    { name: 'NVIDIA', ticker: 'NVDA', market: 'US', role: 'AI訓練GPU', category: 'chip' },
    { name: 'Qualcomm 高通', ticker: 'QCOM', market: 'US', role: 'Quest VR處理器', category: 'chip' },
  ],

  // ===== INTEL =====
  'INTC': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '部分晶片代工', category: 'chip' },
    { name: '日月光 ASE', ticker: '3711.TW', market: 'TW', role: '封裝測試', category: 'assembly' },
    { name: '欣興電子 Unimicron', ticker: '3037.TW', market: 'TW', role: 'ABF載板', category: 'component' },
    { name: 'ASML 艾司摩爾', ticker: 'ASML', market: 'NL', role: 'EUV光刻機', category: 'equipment' },
    { name: 'Applied Materials', ticker: 'AMAT', market: 'US', role: '半導體製程設備', category: 'equipment' },
    { name: 'Lam Research', ticker: 'LRCX', market: 'US', role: '蝕刻設備', category: 'equipment' },
  ],

  // ===== QUALCOMM =====
  'QCOM': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: 'Snapdragon晶片代工（4nm）', category: 'chip' },
    { name: '日月光 ASE', ticker: '3711.TW', market: 'TW', role: '封裝測試', category: 'assembly' },
    { name: '穩懋 Win Semi', ticker: '3105.TW', market: 'TW', role: 'RF前端元件', category: 'chip' },
    { name: '欣興電子 Unimicron', ticker: '3037.TW', market: 'TW', role: 'IC載板', category: 'component' },
    { name: 'Samsung 三星', ticker: '005930.KS', market: 'KR', role: '部分晶片代工', category: 'chip' },
  ],

  // ===== APPLIED MATERIALS =====
  'AMAT': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '最大客戶（設備買家）', category: 'service' },
    { name: 'Samsung 三星', ticker: '005930.KS', market: 'KR', role: '主要客戶', category: 'service' },
    { name: 'Intel', ticker: 'INTC', market: 'US', role: '主要客戶', category: 'service' },
  ],

  // ===== LAM RESEARCH =====
  'LRCX': [
    { name: '台積電 TSMC', ticker: '2330.TW', market: 'TW', role: '最大客戶', category: 'service' },
    { name: 'Samsung 三星', ticker: '005930.KS', market: 'KR', role: '主要客戶', category: 'service' },
    { name: 'SK Hynix', ticker: '000660.KS', market: 'KR', role: '主要客戶', category: 'service' },
  ],

  // ===== ORACLE =====
  'ORCL': [
    { name: '廣達 Quanta', ticker: '2382.TW', market: 'TW', role: 'OCI雲端伺服器代工', category: 'assembly' },
    { name: '緯穎 Wiwynn', ticker: '6669.TW', market: 'TW', role: '雲端伺服器', category: 'assembly' },
    { name: 'NVIDIA', ticker: 'NVDA', market: 'US', role: 'OCI AI GPU', category: 'chip' },
  ],

  // ===== Netflix =====
  'NFLX': [
    { name: '台達電 Delta', ticker: '2308.TW', market: 'TW', role: '資料中心電源', category: 'component' },
  ],

  // ===== JP Morgan =====
  'JPM': [
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'IT基礎設施', category: 'assembly' },
  ],

  // ===== Costco =====
  'COST': [
    { name: '鴻海 Foxconn', ticker: '2317.TW', market: 'TW', role: 'POS/IT設備', category: 'assembly' },
  ],
};

export function getSupplyChain(symbol: string): Supplier[] {
  return supplyChainDB[symbol.toUpperCase()] || [];
}

export function hasSupplyChain(symbol: string): boolean {
  return symbol.toUpperCase() in supplyChainDB;
}

export function getAllSupplyChainSymbols(): string[] {
  return Object.keys(supplyChainDB);
}

export default supplyChainDB;
