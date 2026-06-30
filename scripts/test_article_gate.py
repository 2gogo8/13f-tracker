#!/usr/bin/env python3
"""Phase 3D: Article Gate Test — All-In episode (youtube_id: 4j9RPGLENNI)"""
from dotenv import load_dotenv
import os, asyncio, json, anthropic
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

for f in ['~/repos/13f-tracker/.env.local', '~/repos/GetPriceFunction/.env']:
    load_dotenv(os.path.expanduser(f), override=False)
uri = os.getenv('MONGODB_URI') or os.getenv('MONGO_URI')
api_key = os.getenv('ANTHROPIC_API_KEY')
MODEL = 'claude-sonnet-4-5'

async def main():
    db = AsyncIOMotorClient(uri)['13f-tracker']

    # 讀 All-In expert_insights
    doc = await db.expert_insights.find_one({'youtube_id': '4j9RPGLENNI'})
    if not doc:
        print('❌ 找不到 All-In youtube_id=4j9RPGLENNI')
        return

    print(f"Doc _id: {doc['_id']}")
    print(f"enrichmentStatus: {doc.get('enrichmentStatus')}")
    print(f"video_title: {doc.get('video_title') or doc.get('title','')}")

    # 讀 keyword pool
    watchlist = await db.watchlist.find({}).to_list(100)
    picks = await db.jg_picks_manual.find({}).to_list(100)
    cache = await db.jg_picks_cache.find({}).limit(30).to_list(30)
    pool = list(set([d.get('symbol') or d.get('ticker','') for d in watchlist+picks+cache if d.get('symbol') or d.get('ticker')]))

    print(f"Keyword pool size: {len(pool)}")

    ki = doc.get('key_insights', [])[:8]
    if not ki:
        print('⚠️ No key_insights found — enrichmentStatus may not be enriched')
        return

    ki_text = '\n'.join([f"{i+1}. {k}" for i,k in enumerate(ki)])

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=MODEL, max_tokens=1000,
        system='你是 JG 的財經編輯助理。只回傳 valid JSON object，不加任何解釋文字或 markdown。',
        messages=[{'role': 'user', 'content': f"""你的任務是判斷以下財經影片素材是否值得成為 JG（台灣財經 YouTuber）的正式候選文章。

JG 的關注標的（Keyword Pool）：
{', '.join(pool[:40])}

影片資訊：
- 標題：{doc.get('video_title') or doc.get('title','')}
- 頻道：{doc.get('channel','')}
- 日期：{doc.get('publish_date','')}
- 主題：{doc.get('topic','')}

Key Insights（來自完整逐字稿）：
{ki_text}

JG 的核心關注方向：
- 美股選股：AI相關（NVDA、MSTR、PLTR等）、高成長科技、回檔機會
- 投資哲學：數據驅動、反市場觀點、長期持有的判斷依據
- 會員轉化：能讓會員看完後覺得「這值得」、「這幫我節省了研究時間」
- 產業主線：AI基礎設施、能源、太空、網路安全、比特幣相關

請評估並回傳 JSON：
{{"articleWorthinessScore": 0-100, "articleDecision": "draft_candidate"|"material_only"|"reject", "articleReason": "3-5句", "matchedStocks": [], "matchedThemes": [], "matchedPhilosophy": "1句", "matchedBusinessIdeas": "1句", "suggestedUse": "1-2句"}}

評分標準：
- >= 75 → draft_candidate
- 50-74 → material_only
- < 50 → reject

GameStop/Ryan Cohen/eBay 是資本配置故事，與 JG 的 AI/科技/能源主線距離較遠，請客觀評估。"""}]
    )

    raw = msg.content[0].text.strip()
    if raw.startswith('```'):
        raw = raw.split('\n',1)[1].rsplit('```',1)[0].strip()
    result = json.loads(raw)

    score = result.get('articleWorthinessScore', 0)
    decision = 'draft_candidate' if score >= 75 else 'material_only' if score >= 50 else 'reject'

    print(f"\n=== ARTICLE GATE RESULT ===")
    print(f"articleWorthinessScore: {score}")
    print(f"articleDecision: {decision}")
    print(f"articleReason: {result.get('articleReason')}")
    print(f"matchedStocks: {result.get('matchedStocks')}")
    print(f"matchedThemes: {result.get('matchedThemes')}")
    print(f"matchedPhilosophy: {result.get('matchedPhilosophy')}")
    print(f"matchedBusinessIdeas: {result.get('matchedBusinessIdeas')}")
    print(f"suggestedUse: {result.get('suggestedUse')}")

    now = datetime.now(timezone.utc)
    await db.expert_insights.update_one({'_id': doc['_id']}, {'$set': {
        'articleWorthinessScore': score,
        'articleDecision': decision,
        'articleReason': result.get('articleReason',''),
        'matchedStocks': result.get('matchedStocks',[]),
        'matchedThemes': result.get('matchedThemes',[]),
        'matchedPhilosophy': result.get('matchedPhilosophy',''),
        'matchedBusinessIdeas': result.get('matchedBusinessIdeas',''),
        'suggestedUse': result.get('suggestedUse',''),
        'articleGateCheckedAt': now,
        'articleGateModel': MODEL,
    }})
    print(f"\n✅ expert_insights 更新完成")

    # Also check doc's current candidate status
    summary = await db.summaries.find_one({'sourceExpertInsightId': str(doc['_id'])})
    if summary:
        print(f"\nSummary status: {summary.get('status')} (should still be candidate, not published)")
    else:
        print(f"\nNo summary found (doc not promoted yet)")

asyncio.run(main())
