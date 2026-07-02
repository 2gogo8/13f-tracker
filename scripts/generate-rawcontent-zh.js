/**
 * generate-rawcontent-zh.js
 * Generate rawContentZh for docs that have rawContentOriginal but no rawContentZh
 * Usage: node scripts/generate-rawcontent-zh.js [--limit N]
 */
import { MongoClient } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envVars = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k?.trim() && v.length) envVars[k.trim()] = v.join('=').trim();
});

const MONGO_URI = envVars.MONGO_URI;
const ANTHROPIC_KEY = envVars.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5';

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 100;

async function generateZh(anthropic, originalText, title, sourceName) {
  const truncated = originalText.slice(0, 30000);
  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2000,
    messages: [{ role: 'user', content: `你是財經研究分析師。以下是一篇英文影片逐字稿/文章的原文。

請將內容整理成**繁體中文段落摘要 + 關鍵觀點**，不是逐字翻譯。

要求：
- 用繁體中文
- 分段整理，每段 2-4 句話
- 保留重要數字、公司名、人名（英文原文）
- 標出關鍵觀點（用 • 符號）
- 總長度控制在 800-1500 字
- 不要加標題，直接開始內容

標題：${title || '(無標題)'}
來源：${sourceName || '(未知)'}

原文：
${truncated}` }]
  });
  return response.content[0].text.trim();
}

async function main() {
  console.log(`\n🔄 Generating rawContentZh for docs missing it (limit: ${limit})\n`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('13f-tracker');
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const docs = await db.collection('expert_insights').find({
    rawContentOriginal: { $exists: true, $ne: null },
    $or: [
      { rawContentZh: { $exists: false } },
      { rawContentZh: null }
    ]
  }).limit(limit).toArray();

  console.log(`Found ${docs.length} docs to process\n`);
  let done = 0, failed = 0;

  for (const doc of docs) {
    const title = doc.sourceTitle || doc.video_title || doc.title || '';
    const sourceName = doc.sourceName || doc.channel || doc.source_name || '';
    console.log(`[${done+failed+1}/${docs.length}] ${title.slice(0,60)}`);
    try {
      const zh = await generateZh(anthropic, doc.rawContentOriginal, title, sourceName);
      await db.collection('expert_insights').updateOne(
        { _id: doc._id },
        { $set: { rawContentZh: zh, rawContentZhGeneratedAt: new Date().toISOString() } }
      );
      console.log(`  ✅ ${zh.length} chars`);
      done++;
    } catch (e) {
      console.log(`  ❌ Failed: ${e.message?.slice(0,80)}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n📊 Done: ${done} | Failed: ${failed}`);
  await client.close();
}

main().catch(console.error);
