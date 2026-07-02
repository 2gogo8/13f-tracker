#!/usr/bin/env node
/**
 * Draft Backfill — Batch generate drafts for V2-completed summaries that lack a draft.
 *
 * Usage:
 *   node scripts/draft-backfill.mjs               # run for all eligible articles
 *   node scripts/draft-backfill.mjs --dry-run      # preview only, no DB writes
 *   node scripts/draft-backfill.mjs --force        # overwrite existing drafts
 *   node scripts/draft-backfill.mjs --limit=10     # cap at N articles
 *
 * Requires .env.local with MONGO_URI and ANTHROPIC_API_KEY
 */

import { MongoClient } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    force:     { type: 'boolean', default: false },
    limit:     { type: 'string' },
    help:      { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Draft Backfill
==============
Batch-generate drafts for V2-completed summaries that are missing a draft.

Flags:
  --dry-run    List articles to backfill without writing to DB
  --force      Overwrite existing drafts
  --limit=N    Cap at N articles
  --help       Show this help
`);
  process.exit(0);
}

const dryRun = args['dry-run'] || false;
const force  = args.force || false;
const limit  = args.limit ? parseInt(args.limit, 10) : 0;

// ── Load env ──────────────────────────────────────────────────────────────────

const envContent = readFileSync('.env.local', 'utf8');
const mongoUri = envContent.match(/MONGO_URI=(.*)/)?.[1]?.trim();
const anthropicKey = envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();

if (!mongoUri || !anthropicKey) {
  console.error('❌ Missing MONGO_URI or ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}

// ── PUBLISH_BLOCKERS (mirror of lib/insights/generateDraft.ts) ───────────────

const PUBLISH_BLOCKERS = [
  '【JG 觀點待補】',
  '《JG 觀點待補》',
  '請從上面候選方向',
  '候選方向中選一個',
  '改寫成正式 JG 判斷',
  'reviewer note',
  'internal instruction',
  'TODO for JG',
  '請 JG',
  '後台操作指令',
  'TODO',
];

// ── Draft generation (inline JS mirror of lib/insights/generateDraft.ts) ─────

const DRAFT_MODEL = 'claude-sonnet-4-5';

async function generateDraftForSummary(db, anthropic, summary) {
  const raw = summary.rawExpertInsight ?? {};
  const ki = raw.key_insights ?? [];
  const ts = raw.transcript_sample ?? '';
  const topic = raw.topic || summary.topic || '';
  const expertName = raw.expert_name || summary.expertName || '';
  const expertRole = raw.expert_role || raw.expert_title || '';
  const expertOrg = raw.expert_org || raw.expert_institution || '';
  const channel = raw.channel || raw.source_channel || '';
  const sourceType = raw.source_type || '';
  const ticker = raw.ticker || summary.ticker || '';
  const title = raw.title || raw.video_title || summary.title || '';
  const sourceUrl = raw.source_url || raw.url || summary.sourceUrl || '';
  const sourceDate = raw.publish_date || summary.createdAt || new Date().toISOString().split('T')[0];
  const sourceDateFallback = !raw.publish_date;

  const validKI = ki.filter(s =>
    typeof s === 'string' &&
    !s.match(/^\[music\]/i) &&
    !s.match(/^(welcome|hello|hi|大家好|歡迎)/i) &&
    s.length > 20
  );

  const hasContent = validKI.length > 0 || (typeof ts === 'string' && ts.length > 50);
  if (!hasContent) return { ok: false, error: '缺少 key_insights 和 transcript_sample' };
  if (!topic) return { ok: false, error: 'topic 空白' };
  if (!expertName && !channel) return { ok: false, error: '缺少 expert_name / channel' };
  if (sourceType === 'no_match') return { ok: false, error: 'source_type=no_match' };

  const enrichmentStatus = raw.enrichmentStatus || '';
  if (enrichmentStatus === 'needs_transcript_or_insights' || enrichmentStatus === 'transcript_too_short') {
    return { ok: false, error: `enrichmentStatus=${enrichmentStatus}` };
  }

  // Freshness warning (log only; don't block in backfill)
  let freshnessWarning = null;
  try {
    const srcDate = new Date(raw.publish_date || summary.createdAt);
    const daysOld = Math.floor((Date.now() - srcDate.getTime()) / 86400000);
    if (daysOld > 90) freshnessWarning = `⚠️ 素材已 ${daysOld} 天前（workerMode 繼續）`;
    else if (daysOld > 30) freshnessWarning = `⚠️ 此素材為 ${daysOld} 天前的訪談`;
  } catch { /* ignore */ }

  // Fetch recent articles for prompt
  const recentArticles = await db.collection('summaries')
    .find({ alphaReady: true }, { projection: { _id: 1, jgTitle: 1, title: 1, topic: 1, tags: 1, publishedAt: 1 } })
    .sort({ publishedAt: -1 }).limit(5).toArray();

  const kiText = validKI.map((k, i) => `${i + 1}. ${k}`).join('\n');
  const tsSection = typeof ts === 'string' && ts.length > 50 ? `\n訪談片段：\n${ts.slice(0, 800)}` : '';
  const expertLine = [expertName, expertRole, expertOrg].filter(Boolean).join('，');

  const systemPrompt = `你是一個財經研究助理。你必須只回傳一個 valid JSON object，不加任何解釋文字、markdown code block、或前後文。`;
  const userPrompt = `素材資訊：
- 標題：${title || topic}
- 專家：${expertLine || '（未知）'}
- 頻道：${channel || '（未知）'}
- 日期：${sourceDate || '（未知）'}
- 主題標的：${ticker ? ticker + ' / ' : ''}${topic}
- 來源連結：${sourceUrl || '（未提供）'}

專家關鍵觀點：
${kiText}
${tsSection}

近期市場感覺 / 方向：
（未提供）

最近已上架文章（供聯想參考）：
${recentArticles.length > 0
  ? recentArticles.map(a => `- 標題：${a.jgTitle || a.title || '未知'} | 主題：${a.topic || '—'} | 標籤：${(a.tags || []).join(', ') || '—'} | 日期：${a.publishedAt || '—'}`).join('\n')
  : '（無已上架文章）'}

---

請生成以下格式的 JSON object，只回傳 JSON，不加任何額外文字：

{
  "suggestedTitle": "建議標題（繁體中文）",
  "articleDraft": "完整文章草稿（markdown 格式）",
  "normalizedMarketThemes": [],
  "selectedMarketDirection": null,
  "marketDirectionFitScore": 0,
  "marketDirectionReason": "",
  "relatedRecentArticles": [],
  "jgAngleCandidates": []
}

articleDraft 格式（固定格式，markdown，用 \\n 換行）：
# {標題}

## 一、這則素材在講什麼
（根據素材整理這位專家說了什麼，只整理，不評論）

## 二、為什麼這件事對投資人重要
（從市場角度說明這則訊息的意義，不給買賣建議）

## 三、投資判斷摘要
（中性分析語氣，不要寫「JG 認為」「買賣建議」）

## 四、接下來觀察什麼
（列出 2-3 個後續值得追蹤的觀察指標或事件）

禁止出現：「JG 認為」「我的觀點是」買賣建議、影片口吻`;

  const msg = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawLLMText = msg.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(rawLLMText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
  } catch {
    return { ok: false, error: 'LLM JSON parse failed' };
  }

  const draftTitle = parsed.suggestedTitle || title || topic;
  const articleDraft = parsed.articleDraft || '';
  const draftLines = articleDraft.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < draftLines.length; i++) {
    if (draftLines[i].startsWith('# ')) { bodyStart = i + 1; break; }
  }
  const draftBody = draftLines.slice(bodyStart).join('\n').trim();
  const blocked = PUBLISH_BLOCKERS.some(b => draftBody.includes(b));
  const draftStatus = blocked ? 'draft_needs_review' : 'draft_ready';

  const tags = [ticker, topic, sourceType].filter(Boolean);
  const generatedAt = new Date();
  const today = generatedAt.toISOString().split('T')[0];

  await db.collection('summaries').updateOne(
    { _id: summary._id },
    {
      $set: {
        article: draftBody,
        body: draftBody,
        hasJgPlaceholder: false,
        title: draftTitle,
        jgTitle: draftTitle,
        analysisDate: today,
        articleType: 'expert_note',
        tags,
        needsDraft: false,
        draftStatus,
        lintStatus: 'pending',
        lintErrors: [],
        generatedAt,
        generatedBy: 'ai',
        model: DRAFT_MODEL,
        promptVersion: 'v2.0',
        updatedAt: generatedAt.toISOString(),
        sourceDate,
        sourceDateFallback,
        marketDirectionInput: '',
        originalMarketDirectionInput: '',
        normalizedMarketThemes: parsed.normalizedMarketThemes ?? [],
        selectedMarketDirection: parsed.selectedMarketDirection ?? null,
        marketDirectionFitScore: parsed.marketDirectionFitScore ?? 0,
        marketDirectionReason: parsed.marketDirectionReason ?? '',
        relatedRecentArticles: parsed.relatedRecentArticles ?? [],
        jgAngleCandidates: parsed.jgAngleCandidates ?? [],
      },
    }
  );

  return { ok: true, draftStatus, blocked, freshnessWarning };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  console.log('🔗 Connected to MongoDB');

  const db = client.db('13f-tracker');
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Build filter: V2 completed with insights but no draft
  const draftFilter = force
    ? {} // force: include all V2 completed
    : {
        $or: [
          { draftStatus: { $exists: false } },
          { draftStatus: null },
          { draftStatus: '' },
          { draftStatus: 'not_started' },
        ],
      };

  const filter = {
    keyInsightsV2Status: 'completed',
    insightsCount: { $gt: 0 },
    status: 'candidate',
    ...draftFilter,
  };

  const cursor = db.collection('summaries').find(filter, {
    projection: { _id: 1, title: 1, jgTitle: 1, insightsCount: 1, draftStatus: 1, rawExpertInsight: 1, topic: 1, ticker: 1, expertName: 1, sourceUrl: 1, createdAt: 1 },
  });
  if (limit > 0) cursor.limit(limit);

  const docs = await cursor.toArray();
  console.log(`\n📋 ${docs.length} articles to backfill${dryRun ? ' (DRY RUN)' : ''}\n`);

  if (docs.length === 0) {
    console.log('Nothing to do.');
    await client.close();
    return;
  }

  let drafted = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    const title = doc.jgTitle || doc.title || '(untitled)';
    console.log(`📄 ${title}`);
    console.log(`   ID: ${doc._id}`);
    console.log(`   insightsCount: ${doc.insightsCount}`);

    if (dryRun) {
      const existingDraft = doc.draftStatus && doc.draftStatus !== 'not_started' && doc.draftStatus !== '';
      if (existingDraft && !force) {
        console.log(`   → Would skip (already has draft: ${doc.draftStatus})`);
        skipped++;
      } else {
        console.log(`   → Would generate draft`);
        drafted++;
      }
      console.log();
      continue;
    }

    // Check if already has draft (double-check, force bypasses)
    if (!force && doc.draftStatus && !['not_started', '', null].includes(doc.draftStatus)) {
      console.log(`   → Skipped (already has draft: ${doc.draftStatus})`);
      skipped++;
      console.log();
      continue;
    }

    try {
      const result = await generateDraftForSummary(db, anthropic, doc);
      if (result.ok) {
        console.log(`   → Draft generated: ${result.draftStatus}`);
        if (result.freshnessWarning) console.log(`   ${result.freshnessWarning}`);
        drafted++;
      } else {
        console.log(`   → Failed: ${result.error}`);
        failed++;
      }
    } catch (err) {
      console.log(`   → Exception: ${err.message}`);
      failed++;
    }

    console.log();
  }

  console.log('═'.repeat(60));
  console.log(`🏁 COMPLETE: ${drafted} drafted, ${skipped} skipped, ${failed} failed out of ${docs.length}`);

  await client.close();
}

main().catch(e => { console.error('💥 Fatal:', e); process.exit(1); });
