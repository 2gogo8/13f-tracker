# HANDOFF.md — 影子JG 網站開發

**最後更新：2026-06-25**

---

## 🔴 目前優先任務：Alpha Launch

優先順序已從 backend automation 切換為 Alpha Launch。

### Alpha Launch 目標
1. 現有文章要看起來像 JG 的研究判斷，不像搬運頻道
2. Tab 不顯示 All-In / ARK / a16z 這種來源名稱
3. 來源透明，但只當 metadata，不是主視覺
4. 先做少量高品質文章給讀者試用
5. 自動化 pipeline 保持 inactive，避免成本爆衝

**尚未開始實作。等 JG 給方向後才動 UI。**

---

## Video Queue v2 狀態（暫停於 Phase 3A）

### 完成階段
- ✅ **Phase 1**：video_queue indexes + summaries.sourceVideoId_unique index
- ✅ **Phase 2**：正式 migration 完成，JG 驗收通過
- ✅ **Phase 3A**：v2 inactive functions 建立完成，JG 驗收通過

### 目前快照
| 項目 | 數值 |
|------|------|
| video_queue 總筆數 | 19 |
| processed | 19 |
| pending | **0** |
| processing | **0** |
| summaries | 4（無新文章） |

### Phase 3B — ❌ 未批准，不得開始

Phase 3B 內容（待 JG 另外確認）：
1. 移除 `process_video_queue_item` / `scan_all_channels_v2` 的 RuntimeError guard
2. 實作 `publish_summary_v2`（加 `sourceVideoId` 欄位）
3. 接 CLI `--scan-v2` flag（不替換 `--scan`）
4. 單頻道測試驗證

---

## 🔴 已知資料源問題（記錄，不急處理）

### 1. All-In Podcast channel — Source Data Issue ⚠️
- channels collection 的 "All-In Podcast" 頻道，channelId 指向的是**遊戲/娛樂 YouTuber**，非真正的 All-In Podcast
- plan_scan_v2 dry-run 已確認：所有影片都是娛樂內容（drama、OnlyFans 等），hardskip 全擋
- **處置：v2 不得自動處理此頻道，需 JG 手動確認正確的 channelId 後才能重設**

### 2. Odd Lots Bloomberg — Podcast Transcript Cost Risk ⚠️
- type 已改為 `podcast`，rssUrl 指向 Bloomberg Omny RSS（可正常拉到 episodes）
- 但 podcast 沒有 YouTube 字幕，transcript 需要 whisper（下載音檔 → 本機轉文字）
- whisper 成本較高，Alpha 階段**不自動處理 podcast**
- **處置：Alpha 階段以手動逐字稿為主；podcast 自動化待 Alpha 後另行規劃**

---

## 成本控制規則（必須遵守）

- ❌ 不得自行啟用 v2 pipeline
- ❌ 不得自行接 manual scan / cron（07:00 或任何排程）
- ❌ 不得自行處理任何影片
- ❌ 不得抓 transcript
- ❌ 不得呼叫 Claude 產文章
- ❌ 不得掃整個 repo
- ❌ 一次讀超過 5 個檔案需先說明理由

---

## 關鍵檔案位置

| 檔案 | 說明 |
|------|------|
| `~/cron-scripts/channel_pipeline.py` | v1 pipeline（仍使用中）+ v2 inactive functions（Phase 3A） |
| `~/cron-scripts/migrate_video_queue.py` | Migration 工具（已完成，不再執行） |
| `~/cron-scripts/resolve_channel_handles.py` | @handle → UCxxx 解析工具 |
| `~/cron-scripts/migration-dry-run-report.json` | 最新 dry-run 報告 |
| `~/.openclaw/workspace/video-queue-spec.md` | 吉利完整 spec |
| `~/repos/13f-tracker/app/insights/page.tsx` | insights 頁面（mobile + desktop） |
| `~/repos/13f-tracker/components/JGPicksSidebar.tsx` | 左側股票欄 |

---

## 其他待處理事項（與 video_queue 分開）

### Service Worker / 版型快取問題（暫緩）
- `useState(false)` 造成 SSR 初始值永遠桌機版（flash on mobile）
- Workbox 快取 JS bundle 最長 24 小時
- 解法未實作，待 Alpha Launch 完成後處理
