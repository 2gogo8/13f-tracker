# AI_PROTOCOL.md — 開發憲法

## 1. API 安全
- 所有 `app/api/**/route.ts` 必須包含 `export const maxDuration = 30;`
- 重度掃描路由（anti-market-picks, tw/oversold, oversold-scanner, top-picks）可為 60

## 2. 本地驗證
- 任何代碼變動後，必須執行 `npx tsc --noEmit` 預檢
- 確認無錯誤後才 commit & push
- 若 build 失敗，直接讀取錯誤日誌，自主修正，不逐項詢問

## 3. Git 規範
- Commit 格式：`feat(AI-auto): [功能描述]`
- 修復類：`fix(AI-auto): [修復描述]`

## 4. 自癒模式
- 環境配置缺失、語法錯誤、型別錯誤 → 直接修正
- 非邏輯性問題不詢問，完成後一次性報告

## 5. 溝通協議
- Discord 回報禁止貼長代碼
- 僅回報：受影響檔案、修改重點、已自動修復項目
