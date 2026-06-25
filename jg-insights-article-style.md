# JG Insights Article Format System v1

> 建立日期：2026-06-25
> 狀態：規格草案（未正式套用到 DB）
> 用途：所有 Alpha-ready 文章必須符合此規格

---

## Alpha-Ready 文章必要欄位

每篇進入前台主畫面的文章必須包含以下欄位，缺一不可：

| 欄位 | 說明 | 範例 |
|------|------|------|
| `topicLabel` | 前台 tab 顯示名稱（JG 品牌語言） | `私募市場破牆` |
| `jgTitle` | 主標題（JG 判斷型，非原始標題） | `SpaceX IPO 表面是火箭故事，真正是私人市場破牆` |
| `articleType` | 文章版型代碼（見下方 5 種） | `deep_research` |
| `sourceLabel` | 來源顯示名稱 | `All-In Podcast` |
| `sourceDate` | 原始內容發佈日期 | `2026-06-24` |
| `analysisDate` | JG 分析日期 | `2026-06-25` |
| `dataCutoffDate` | 資料截至日期 | `2026-06-24` |
| `claimsToCheck` | 需查證的數字與說法（array） | `["SpaceX 估值 $350B", "Cursor 收購價 $60B"]` |
| `verificationPoints` | 後續驗證點（array） | `["Q3 IPO 是否正式提申請", "Cursor 用戶數成長率"]` |
| `articleVersion` | 版本標記 | `v2_alpha` |

### 選填欄位（建議加入）

| 欄位 | 說明 |
|------|------|
| `jgAngle` | JG 解讀角度（1-2句） |
| `investmentQuestion` | 核心投資問題 |
| `alphaReady` | `true` 代表人工確認可公開 |
| `needsReview` | `true` 代表缺欄位或未完成 |

---

## Alpha Safety Gate 規則（前台過濾邏輯）

只有符合以下**任一條件**的文章才會出現在主畫面：

1. `articleVersion === "v2_alpha"`
2. `alphaReady === true`
3. `topic` 在手動 allowlist 裡（目前 4 篇：`All-In·6/24`、`Manual·6/24`、`a16z·6/24`、`ARK·6/24`）

缺欄位的自動產文（`source: video`、`source: auto`）不會出現在主畫面。

---

## Tab 顯示規則（硬規則）

**只能顯示：**
1. `topicLabel`（DB 欄位）
2. topic-mapping.ts 的 mapping
3. `articleType` 對應的中文分類
4. fallback：「JG 今日雷達」

**禁止顯示：**
- sourceName / channelName
- `All-In`、`ARK`、`a16z`、`Manual`
- 日期（如 `6/25`、`・6/25`）
- 原始影片標題
- 空白

---

## 文章版型 5 種

### 1. Deep Research Note｜深度研究筆記

**適合：** All-In、多事件、多公司、多產業交錯文章
**結構：**
1. 市場事件地圖（1-2段，今天發生什麼）
2. JG 判斷主線（核心觀點，1段）
3. 資料鉚釘（3-5個關鍵數字，來源+日期）
4. 投資者問題（2-3個問題框架）
5. claimsToCheck（需查證項目列表）
6. verificationPoints（後續追蹤點）

**articleType：** `deep_research`
**topicLabel 範例：** `私募市場破牆`、`AI 權力重組`

---

### 2. Core Idea Breakdown｜核心觀念拆解

**適合：** a16z、PMF、AI 留存率、創業與商業模式觀念
**結構：**
1. 一句話核心觀點（JG 版本）
2. 觀念拆解（3 層：是什麼 / 為什麼重要 / 投資涵義）
3. 對照案例（1-2個真實公司）
4. claimsToCheck

**articleType：** `core_idea`
**topicLabel 範例：** `產品留存率`、`AI PMF`

---

### 3. Business Model Teardown｜商業模式拆解

**適合：** Ferrari、Acquired、稀缺性、定價權、護城河
**結構：**
1. 為什麼這個生意特別（差異化來源）
2. 護城河拆解（2-3層）
3. 數字驗證（毛利率、ROE、pricing power 數據）
4. 類似競爭者比較（2-3個對照）
5. 主要風險點

**articleType：** `business_teardown`
**topicLabel 範例：** `稀缺性定價`、`護城河解剖`

---

### 4. Forum Signal Map｜美國論壇情緒地圖

**適合：** Reddit / X / Hacker News / Stocktwits 的恐慌或興奮訊號
**結構：**
1. 情緒溫度計（恐慌 / 中立 / 興奮，附日期）
2. 主流敘事是什麼（散戶在講什麼）
3. JG 反向或同向判斷
4. 歷史對比（上次類似情緒發生什麼）
5. 操作問題（你要在哪個時間點做什麼判斷）

**articleType：** `forum_signal`
**topicLabel 範例：** `論壇情緒地圖`、`恐慌指數`

---

### 5. Macro / Policy Risk Brief｜總經與政策風險簡報

**適合：** ARK、通膨、利率、能源、戰爭、AI 監管、政策變化
**結構：**
1. 政策/數據事件（宣布日期 + 生效時間軸 + 目前狀態）
2. 市場定價怎麼反應（實際數據）
3. JG 判斷的不對稱點（市場定價 vs JG 預期）
4. 生效時間軸（ Q幾 / 什麼條件觸發）
5. verificationPoints（驗證什麼才知道對不對）

**articleType：** `macro_brief`
**topicLabel 範例：** `總經風險`、`利率重定價`

---

## 日期有效性標準

每篇文章都必須讓讀者知道「這是 JG 在什麼時間點的判斷」。

格式：
```
來源日期：2026-06-24（All-In Podcast EP xxx）
JG 分析日期：2026-06-25
資料截至：2026-06-24
```

⚠️ 市場資訊會過期。缺乏時間軸的分析對讀者有誤導風險。

---

## 未來 DB Migration 計畫（尚未執行）

當準備好批量整理文章時，需要補齊：
- 所有缺 `topicLabel`、`jgTitle` 的文章
- 設定 `alphaReady: true` 或 `needsReview: true`
- 填入 `sourceDate`、`analysisDate`、`dataCutoffDate`
- 現有 4 篇可以從 topic-mapping.ts 直接搬入 DB

---

## rollback 指引

**暫停自動產文 rollback：**
```bash
launchctl load ~/Library/LaunchAgents/com.jg.channel-pipeline.plist
launchctl load ~/Library/LaunchAgents/com.jg.channel-video-scanner.plist
launchctl load ~/Library/LaunchAgents/com.jg.daily-insights-pipeline.plist
```

**Alpha gate rollback（API）：**
在 `app/api/insights/route.ts` 把 `.find(ALPHA_FILTER)` 換回 `.find({ investmentRelevant: { $ne: false } })`
