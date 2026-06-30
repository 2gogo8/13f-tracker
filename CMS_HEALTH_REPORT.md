# CMS 內容流程總檢查與健康報告

**生成時間:** 2026-06-30T19:00:00+08:00  
**Repo:** ~/repos/13f-tracker  
**資料庫:** 13f-tracker (MongoDB Atlas cluster0.lh6rsp1.mongodb.net)

---

## 一、文章生命週期定義

根據目前實際程式碼與 DB 狀態，文章生命週期如下：

### 生命週期狀態與對應欄位條件

| 狀態 | status | alphaReady | draftStatus | 說明 |
|------|--------|------------|-------------|------|
| **raw_material** | `unknown` (或缺失) | `false` | `null` | 舊版自動產生的文章，只有 `article` 欄位，無 CMS 狀態欄位 |
| **candidate / needs_article** | `candidate` | `false` | `needs_article` | 已從 expert_insights 晉升，但尚未生成 AI 草稿 |
| **draft_ready** | `candidate` | `false` | `draft_ready` | 已有 AI 生成草稿（article/body 或 cleanArticleDraft），等待人工審閱 |
| **needs_review** | `candidate` | `false` | `draft_ready` + 含有 `【JG 觀點待補】` | 草稿已生成但含有 publish blocker placeholder |
| **ready_to_publish** | `candidate` | `false` | `draft_ready` + 無 blocker | editedArticleDraft 或 cleanArticleDraft 已清理完畢，可發佈 |
| **published** | `published` | `true` | - | 已上架，/insights 公開可見 |
| **unpublished** | `unpublished` | `false` | - | 已下架 |
| **archived** | `archived` | `false` | - | 已歸檔 |
| **rejected** | `rejected` | `false` | - | 已拒絕 |
| **invalid** | 其他情況 | - | - | 狀態不一致（見下方） |

### 關鍵發佈條件（publish gate）

```
Publish 允許條件（/api/admin/insights/publish）：
1. editedArticleDraft 或 cleanArticleDraft 非空（不使用 articleDraft）
2. 內容不含 PUBLISH_BLOCKERS 中任一關鍵字
3. 發佈後：publishedArticle = editedArticleDraft || cleanArticleDraft
         status = 'published', alphaReady = true
```

### 公開顯示條件（/api/insights）

```
/api/insights 顯示條件：
1. alphaReady === true
2. status === 'published'
3. publishedArticle 存在且非空
全部三者同時成立才會出現在前台
```

---

## 二、CMS Health Check 統計

### 總覽

| 指標 | 數量 |
|------|------|
| **總文章數 (summaries)** | 28 |
| **候選草稿 (candidate)** | 10 |
| **已上架 (published + alphaReady)** | 0 |
| **已下架 (unpublished)** | 0 |
| **已歸檔/拒絕 (archived/rejected)** | 0 |
| **無狀態 (unknown/missing status)** | 18 |
| **舊版 article/body 文章** | 6 (候選中有 article/body 但無 new-style drafts) |
| **無正文壞資料** | 1 |
| **有 placeholder 的文章** | 4 |
| **狀態矛盾的文章** | 23 |
| **日期缺失的文章** | 21 |
| **可發佈草稿** | 1 (AI 不是軟體業) |
| **需要人工 review** | 3 (有 draft_ready 但含 blocker) |

### Expert Insights 統計

| 指標 | 數量 |
|------|------|
| **總素材數** | 44 |
| **新素材 (new/無狀態)** | 40 |
| **已晉升 (promoted)** | 4 |
| **已歸檔/拒絕** | 0 |

---

## 三、各類問題文章清單

### 3.1 可編輯候選草稿（10 篇）

| # | _id | 標題 | draftStatus | 內容來源 | 字數 |
|---|-----|------|-------------|----------|------|
| 1 | 6a3bb178... | SpaceX IPO 表面是火箭故事 | draft_ready | cleanArticleDraft | 1543 |
| 2 | 6a3bc15b... | AI 應用層，從題材到基本面 | draft_ready | cleanArticleDraft | 1909 |
| 3 | 6a3ce018...e730 | Ryan Cohen 的 eBay 想像 | draft_ready | cleanArticleDraft | 1925 |
| 4 | 6a3ce018...e731 | Fable 5 的爭議 | draft_ready | cleanArticleDraft | 2204 |
| 5 | 6a3ce019...e732 | 挪威主權基金買的不是水泥 | draft_ready | cleanArticleDraft | 2272 |
| 6 | 6a41d70f... | Bloom Energy 執行長 | draft_ready | article/body | 1054 |
| 7 | 6a41d733... | WEN Meme Stock | needs_article | ❌ 無內容 | 0 |
| 8 | 6a41e63e... | Bitcoin Treasury 公司 | draft_ready | article/body | 2052 |
| 9 | 6a425912... | Chewy教會Ryan Cohen的事 | draft_ready | article/body | 1858 |
| 10 | 6a42a849... | AI 不是軟體業 | draft_ready | editedArticleDraft | 3876 |

### 3.2 可發佈草稿（僅 1 篇）

| _id | 標題 | 字數 | 原因 |
|-----|------|------|------|
| 6a42a849... | AI 不是軟體業：當每個用戶都要燒電 | 3876 | 唯一有 editedArticleDraft + 已移除 blockers 的文章 |

⚠️ **注意：** 這篇文章 status=candidate 但 publishedArticle 已有內容（3876 chars）。這是因為之前有批次操作把 cleanArticleDraft 寫入 publishedArticle 但又把 status 改回 candidate。

### 3.3 已上架文章（0 篇）

**目前 /insights 前台沒有任何文章。**

所有文章都是 candidate 或 unknown 狀態，沒有任何 `status=published AND alphaReady=true` 的文章。

### 3.4 已下架文章（0 篇）

無。

### 3.5 舊版 article/body 文章（6 篇，候選中使用舊格式）

以下候選文章的內容存在 `article` / `body` 中，但 `cleanArticleDraft` / `editedArticleDraft` / `articleDraft` 為空：

| _id | 標題 | article 字數 | body 字數 |
|-----|------|-------------|----------|
| 6a41d70f... | Bloom Energy 執行長 | 1054 | 1054 |
| 6a41e63e... | Bitcoin Treasury 公司 | 2052 | 2052 |
| 6a425912... | Chewy教會Ryan Cohen的事 | 1858 | 1858 |

另外 18 篇 unknown 狀態文章也只有 `article` 欄位（見 3.8）。

### 3.6 無正文壞資料（1 篇）

| _id | 標題 | 問題 |
|-----|------|------|
| 6a41d733... | WEN Meme Stock | 所有內容欄位皆為空，draftStatus=needs_article |

### 3.7 有 placeholder 的文章（4 篇）

| _id | 標題 | Blockers |
|-----|------|----------|
| 6a41d70f... | Bloom Energy 執行長 | 【JG 觀點待補】 |
| 6a41e63e... | Bitcoin Treasury 公司 | 【JG 觀點待補】、請從上面候選方向、候選方向中選一個、改寫成正式 JG 判斷 |
| 6a425912... | Chewy教會Ryan Cohen的事 | 【JG 觀點待補】 |
| 6a42a849... | AI 不是軟體業 | 【JG 觀點待補】 |

⚠️ **6a42a849（AI 不是軟體業）** 的 `editedArticleDraft` 中仍有【JG 觀點待補】，但因為 publish gate 只檢查 `editedArticleDraft || cleanArticleDraft || articleDraft`，所以這篇的 editedArticleDraft（3876 chars）會被 publish gate 攔下。

### 3.8 狀態矛盾的文章（23 篇）

#### A. status=unknown（18 篇）

所有 18 篇「unknown」文章的共同特徵：
- 沒有 `status` 欄位（或值為空）
- 只有 `article` 欄位有內容（756-3115 字）
- 沒有 `sourceDate`、`draftStatus`、`alphaReady`
- 有 `publishedAt` 時間戳，但可能是創建時間而非實際發佈時間
- **這些是舊版 pipeline 自動產生的文章，從未進入 CMS 流程**

| _id | 標題 | article 字數 | publishedAt |
|-----|------|-------------|-------------|
| 6a3bbe2a... | SpaceX史上最大IPO | 2305 | 2026-06-24T23:26 |
| 6a3bc88a... | 通膨可能跌破預期 | 952 | 2026-06-24T12:07 |
| 6a3c4403... | 今日專家觀點：Amon談AI | 1053 | 2026-06-24T20:54 |
| 6a3c53b2... | 美光財報炸裂漲15% | 927 | 2026-06-24T22:01 |
| 6a3c53cf... | Anthropic營收暴漲20倍 | 993 | 2026-06-24T22:01 |
| 6a3c53e7... | Fed壓力測試過關 | 819 | 2026-06-24T22:02 |
| 6a3c5409... | 生技股爆地雷？ | 1117 | 2026-06-24T22:02 |
| 6a3c61a7... | Anthropic年營收暴衝到300億 | 855 | 2026-06-24T23:00 |
| 6a3c61bd... | 22歲兄弟的$4000卡車 | 756 | 2026-06-24T23:01 |
| 6a3c61d4... | 預測市場爆發 | 977 | 2026-06-24T23:01 |
| 6a3c61e6... | 傳統金融與加密貨幣 | 825 | 2026-06-24T23:01 |
| 6a3c64bf... | 中國AI年營收破10億 | 2036 | 2026-06-24T23:14 |
| 6a3c675d... | 自我進化的 AI：Mirendal | 1775 | 2026-06-24T23:25 |
| 6a3c67be... | 荷莫茲海峽封鎖 | 1126 | 2026-06-24T23:26 |
| 6a3c67e0... | AI 內容生成的真實性困境 | 1155 | 2026-06-24T23:27 |
| 6a3c6815... | Holcim CEO 親揭 | 1870 | 2026-06-24T23:28 |
| 6a3e86db... | 挪威主權基金情境推演 | 1282 | 2026-06-26T14:04 |
| 6a401c12... | 社會主義橫掃紐約 | 3115 | 2026-06-27T18:53 |

#### B. candidate 但有 publishedArticle 殘留（5 篇）

這些文章曾經被批次操作寫入 `publishedArticle`，但 status 被改回 `candidate`：

| _id | 標題 | publishedArticle 字數 |
|-----|------|-----------------------|
| 6a3bb178... | SpaceX IPO 表面是火箭故事 | 1543 |
| 6a3bc15b... | AI 應用層 | 1909 |
| 6a3ce018...e730 | Ryan Cohen 的 eBay 想像 | 1925 |
| 6a3ce018...e731 | Fable 5 的爭議 | 2204 |
| 6a3ce019...e732 | 挪威主權基金買的不是水泥 | 2272 |

### 3.9 日期缺失的文章（21 篇）

- **18 篇** unknown 文章全部沒有 sourceDate
- **3 篇** candidate 文章缺少 sourceDate：
  - 6a41d70f... Bloom Energy（sourceDate=null）
  - 6a41d733... WEN Meme Stock（sourceDate=null）
  - 6a41e63e... Bitcoin Treasury（sourceDate=2025-08-08，⚠️ 一年前的日期）

### 3.10 需要人工 review 的文章（3 篇）

| _id | 標題 | 問題 |
|-----|------|------|
| 6a41d70f... | Bloom Energy 執行長 | 含【JG 觀點待補】，且內容在 article/body（舊格式），sourceDate 缺失 |
| 6a41e63e... | Bitcoin Treasury 公司 | 含多個 blockers，sourceDate=2025-08-08（一年前），內容在 article/body |
| 6a425912... | Chewy教會Ryan Cohen的事 | 含【JG 觀點待補】，內容在 article/body（舊格式） |

---

## 四、Latest 20 Dry-Run 清單

**日期排序優先順序：** sourceDate → publish_date → video_published_at → publishedAt → createdAt → updatedAt

| Rank | 標題 | dateUsed | dateField | contentSource | 字數 | canPublish | blockReasons |
|------|------|----------|-----------|---------------|------|------------|--------------|
| 1 | AI 不是軟體業 | 2026-06-29 | createdAt | editedArticleDraft | 3876 | ⚠️* | 含【JG 觀點待補】 |
| 2 | Chewy教會Ryan Cohen | 2026-06-29 | createdAt | article | 1858 | ❌ | 含【JG 觀點待補】 |
| 3 | Bloom Energy 執行長 | 2026-06-29 | createdAt | article | 1054 | ❌ | 含【JG 觀點待補】 |
| 4 | WEN Meme Stock | 2026-06-29 | createdAt | ❌ 無 | 0 | ❌ | 無正文 |
| 5 | Bitcoin Treasury 公司 | 2026-06-29 | createdAt | article | 2052 | ❌ | 含多 blockers |
| 6 | 社會主義橫掃紐約… | 2026-06-27 | publishedAt | article | 3115 | ❌ | status=unknown |
| 7 | 挪威主權基金情境推演 | 2026-06-26 | publishedAt | article | 1282 | ❌ | status=unknown |
| 8 | SpaceX IPO 表面是火箭 | 2026-06-24 | sourceDate | cleanArticleDraft | 1543 | ✅ | - |
| 9 | AI 應用層 | 2026-06-24 | sourceDate | cleanArticleDraft | 1909 | ✅ | - |
| 10 | 挪威主權基金買的不是水泥 | 2026-06-24 | sourceDate | cleanArticleDraft | 2272 | ✅ | - |
| 11 | SpaceX史上最大IPO | 2026-06-24 | publishedAt | article | 2305 | ❌ | status=unknown |
| 12-18 | (其他 6/24 unknown 文章) | 2026-06-24 | publishedAt | article | 756-2036 | ❌ | status=unknown |
| 19 | Ryan Cohen 的 eBay 想像 | 2026-06-23 | sourceDate | cleanArticleDraft | 1925 | ✅ | - |
| 20 | Fable 5 的爭議 | 2026-06-13 | sourceDate | cleanArticleDraft | 2204 | ✅ | - |

### 可上架 Latest 10 清單

**目前可直接發佈的文章：5 篇**（publishBlockedReasons 為空 + 有 cleanArticleDraft 或 editedArticleDraft）

| # | 標題 | sourceDate | 字數 | contentSource |
|---|------|-----------|------|---------------|
| 1 | SpaceX IPO 表面是火箭故事 | 2026-06-24 | 1543 | cleanArticleDraft |
| 2 | AI 應用層，從題材到基本面 | 2026-06-24 | 1909 | cleanArticleDraft |
| 3 | 挪威主權基金買的不是水泥 | 2026-06-24 | 2272 | cleanArticleDraft |
| 4 | Ryan Cohen 的 eBay 想像 | 2026-06-23 | 1925 | cleanArticleDraft |
| 5 | Fable 5 的爭議 | 2026-06-13 | 2204 | cleanArticleDraft |

**⚠️ 不足 10 篇的原因：**

1. **3 篇候選含 placeholder blocker**（Bloom Energy / Bitcoin Treasury / Chewy）：需要人工移除【JG 觀點待補】並編輯 JG 觀點
2. **1 篇候選（AI 不是軟體業）** 的 editedArticleDraft 仍含【JG 觀點待補】
3. **1 篇候選（WEN Meme Stock）** 完全無內容
4. **18 篇 unknown 文章** 無 CMS 狀態，不在候選流程中，且 publish gate 要求 editedArticleDraft 或 cleanArticleDraft

**需要補草稿的文章：**
- WEN Meme Stock（完全無內容）
- Bloom Energy / Bitcoin Treasury / Chewy（有 article/body 但需清理 placeholder 並移到 editedArticleDraft）

**需要人工 review 的文章：**
- 所有含【JG 觀點待補】的 4 篇

**日期缺失文章（影響排序）：**
- Bloom Energy（無 sourceDate）
- WEN Meme Stock（無 sourceDate）
- Bitcoin Treasury（sourceDate=2025-08-08，⚠️ 一年前）

---

## 五、/experts 與 /insights 一致性檢查

### /api/admin/insights/candidates 回傳分析

根據 candidates API 的查詢邏輯：

| Bucket | 查詢條件 | 預期筆數 | 說明 |
|--------|----------|----------|------|
| Section A (新素材) | expert_insights: status=new, 30 天內 | ~19 | 包含未 triage 的素材 |
| Section B (新候選) | summaries: status=candidate, alphaReady=false, 90 天內 | ~9 | 不含 draftStatus=archived |
| Section B2 (歷史候選) | summaries: status=candidate, 90 天外 | ~1 | Bitcoin Treasury (2025-08-08) |
| Published | summaries: status=published, alphaReady=true | 0 | ❌ 目前沒有已發佈文章 |
| Unpublished | summaries: status=unpublished | 0 | - |
| Archived/Rejected | summaries+expert_insights: archived/rejected | 0 | - |

### /api/insights 公開 API 分析

| 指標 | 數值 | 說明 |
|------|------|------|
| 公開文章數 | **0** | 沒有任何文章通過 alpha gate |
| publishedArticle 存在但非 published 狀態 | **5** | candidate 中有 publishedArticle 殘留 |
| debug metadata 外露風險 | **低** | /api/insights 有 project() 限制回傳欄位 |

### 一致性問題

#### DB 應該顯示，但 API 沒回的文章

| 問題類型 | 數量 | 說明 |
|----------|------|------|
| unknown 狀態文章被 candidates API 忽略 | 18 | candidates API 只查 status=candidate，unknown 文章不在任何 bucket |
| ⚠️ **18 篇文章消失於後台** | 18 | 這些文章在 DB 中存在，但 /experts CMS 介面完全看不到 |

#### API 有回，但 UI 可能看不到的文章

- candidates API 回傳的 `candidateSummaries` 會包含所有 candidate，但 UI 的 Section B 依照 90 天過濾
- Bitcoin Treasury（sourceDate=2025-08-08）會被放到 Section B2（歷史區），可能在 UI 上不顯眼

#### UI bucket 分類可能錯誤的地方

1. **5 篇 candidate 有 publishedArticle 殘留** — UI 的 normalizeSummary 會顯示 publishedContent 非空，可能造成混淆
2. **unknown 文章不在任何 bucket** — /experts 的 CMS tab 完全看不到這 18 篇
3. **WEN Meme Stock** 出現在 candidate bucket 但無法編輯或發佈（無內容）

---

## 六、修正建議（優先順序排列）

### 🔴 A. 必修問題（會造成文章看不到、不能編輯、不能發布）

| 優先 | 問題 | 影響 | 建議修正 |
|------|------|------|----------|
| A1 | **18 篇 unknown 文章完全不在 CMS 流程** | 這些文章有內容但看不到、不能編輯 | 需要 migration：給這些文章設定 status=candidate 或 archived，並將 article 內容複製到 cleanArticleDraft |
| A2 | **0 篇已發佈文章** | /insights 前台空白 | 需要上架文章：5 篇有 cleanArticleDraft 的候選可直接發佈（如果內容確認 OK） |
| A3 | **5 篇 candidate 有 publishedArticle 殘留** | 狀態矛盾，可能造成誤解 | 需要清理：將這 5 篇的 publishedArticle 清空（因為 status 不是 published） |
| A4 | **publish gate 只接受 editedArticleDraft 或 cleanArticleDraft** | 舊版 article/body 文章無法發佈 | 需要 migration 或修改 publish gate 的 source 邏輯 |

### 🟡 B. 資料整理

| 優先 | 問題 | 建議 |
|------|------|------|
| B1 | 3 篇候選的內容在 article/body 而非 new-style fields | 將 article/body 內容複製到 cleanArticleDraft |
| B2 | 21 篇缺少 sourceDate | 嘗試從 publishedAt/createdAt 回填 sourceDate |
| B3 | Bitcoin Treasury sourceDate=2025-08-08 | 確認是否要保留或更新日期 |
| B4 | WEN Meme Stock 完全無內容 | 決定是否歸檔或補內容 |

### 🟢 C. 發布準備

| 優先 | 問題 | 建議 |
|------|------|------|
| C1 | 5 篇已有 cleanArticleDraft 的候選可直接發佈 | 確認內容後一鍵發佈 |
| C2 | 4 篇含【JG 觀點待補】需人工審閱 | JG 審閱後替換 placeholder |
| C3 | AI 不是軟體業已有 editedArticleDraft 但仍含 blocker | 編輯移除 blocker 後即可發佈 |

### ⚪ D. 可以延後

| 項目 | 說明 |
|------|------|
| D1 | 逐字稿英翻中 |
| D2 | 素材庫 UI 優化 |
| D3 | unknown 文章的細部分類（哪些值得、哪些歸檔） |
| D4 | expert_insights 的 40 篇新素材 triage |

---

## 七、Health Check API

已建立 admin-only health check endpoint：

```
GET /api/admin/insights/health-check
```

**輸出內容：**
- `stats`: totalSummaries, candidateCount, publishedCount, unpublishedCount, legacyCount, invalidCount, publishableCount, placeholderCount, stateMismatchCount, dateMissingCount, noContentCount, needsReviewCount
- `expertInsights`: total, new, promoted, archived
- `articles`: 每篇文章的完整分析（狀態、內容來源、字數、blockers、placeholders、矛盾原因）
- `issues`: 所有問題清單
- `latest20DryRun`: 最新 20 篇 dry-run 排序結果

**檔案位置：** `app/api/admin/insights/health-check/route.ts`  
**Build 狀態：** ✅ 通過

---

## 八、完整統計摘要

```
┌─────────────────────────────────────────┐
│          CMS Health Dashboard           │
├─────────────────────┬───────────────────┤
│ 總文章數            │ 28                │
│ 可見於 CMS 後台     │ 10 (候選)          │
│ 不可見（unknown）    │ 18                │
│ 前台可見            │ 0                 │
│ 可直接發佈          │ 5                 │
│ 需人工審閱          │ 4                 │
│ 狀態矛盾            │ 23                │
│ 日期缺失            │ 21                │
│ 無內容              │ 1                 │
├─────────────────────┼───────────────────┤
│ Expert Insights     │ 44                │
│ 待處理素材          │ 40                │
│ 已晉升              │ 4                 │
└─────────────────────┴───────────────────┘
```

---

## 九、建議下一步

1. **最優先：** 上架 5 篇已有 cleanArticleDraft 的候選文章（如果內容確認 OK）
2. **第二步：** 處理 4 篇含【JG 觀點待補】的文章 — JG 人工填入觀點
3. **第三步：** 決定 18 篇 unknown 文章的命運（migration 到 candidate 或 archive）
4. **第四步：** 清理 5 篇 candidate 中的 publishedArticle 殘留
5. **第五步：** 處理 40 篇待 triage 的 expert_insights 素材

---

*報告結束。此報告為唯讀檢查，未對任何資料做修改。*
