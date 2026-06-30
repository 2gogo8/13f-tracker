/**
 * autoTriage.ts
 *
 * Auto-triage scoring and classification for summary documents.
 * Assigns jgFitScore (0-100) and routes documents into topicCandidateStatus buckets.
 *
 * Flow: rawMaterial → topicCandidate → draftCandidate → published
 */

export interface TriageResult {
  jgFitScore: number;
  topicCandidateStatus: 'topic_candidate' | 'needs_review' | 'material_only' | 'reject';
  articleDecision: 'draft_candidate' | 'material_only' | 'needs_review' | 'reject';
  suggestedUse: string;
  matchedThemes: string[];
  matchedStocks: string[];
  triageReason: string;
  triagedAt: Date;
}

// ── JG Keyword Pool ─────────────────────────────────────────────────────────
const JG_KEYWORDS = [
  'ETF', 'IPO', '主權基金', '私人市場', '資本配置',
  'AI', '半導體', '資料中心', '電力', '能源', '太空',
  'SpaceX', 'NVIDIA', '市場結構', '反市場', '散戶',
  '機構', '法人', '持倉', '13F', '比特幣', 'Bitcoin',
  '加密', 'crypto', '量化', 'hedge fund', '避險基金',
  '聯準會', 'Fed', '利率', '通膨', 'inflation', '殖利率',
  '財報', 'earnings', '估值', 'valuation', '自由現金流',
  'FCF', '護城河', 'moat', '回購', 'buyback', '分紅',
  '供應鏈', 'supply chain', '關稅', 'tariff', '地緣政治',
];

// ── Theme pool with weights ──────────────────────────────────────────────────
const JG_THEMES: Record<string, string[]> = {
  'AI基礎設施': ['AI', '人工智慧', 'artificial intelligence', 'LLM', 'GPU', 'training', 'inference', 'foundation model'],
  '電力/能源': ['電力', '能源', 'power', 'energy', '電網', 'grid', '燃料電池', 'nuclear', '核能', '太陽能', '風電'],
  '資料中心': ['資料中心', 'data center', 'datacenter', 'colocation', 'hyperscaler', 'cloud'],
  '半導體': ['半導體', 'semiconductor', 'chip', '晶片', 'TSMC', '台積電', 'NVIDIA', 'AMD', 'Intel', 'fabless'],
  '太空': ['太空', 'space', 'SpaceX', 'Starlink', 'rocket', '火箭', 'satellite', '衛星'],
  '資本配置': ['資本配置', '資本', '主權基金', '私人市場', 'private market', 'VC', 'venture', 'PE', 'buyout', '資產配置'],
  '市場結構': ['市場結構', '散戶', '機構', '法人', '流動性', 'liquidity', '做市商', 'market maker', '高頻', 'HFT'],
  '反市場觀點': ['反市場', '逆向', '泡沫', 'bubble', '做空', 'short', '質疑', '過熱', 'overvalued'],
  '比特幣/加密': ['比特幣', 'Bitcoin', 'BTC', '加密', 'crypto', 'Ethereum', 'ETH', 'MSTR', 'MicroStrategy'],
  '股票選擇': ['持倉', '13F', 'portfolio', '選股', 'stock pick', '投資組合', '重倉', '加倉', '減倉'],
};

// Stock tickers to match
const JG_STOCKS = [
  'NVDA', 'NVIDIA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'RKLB', 'MSTR',
  'PLTR', 'RBLX', 'NET', 'SNOW', 'ARM', 'SMCI', 'VRT', 'EQIX', 'AMT', 'VST',
  'FSLR', 'ENPH', 'BE', 'RUN', 'PLUG', 'DKNG', 'COIN', 'HOOD', 'SOFI',
  'GME', 'AMC', 'BBBY', 'WEN', 'CHWY', 'EBAY', 'SPX', 'QQQ', 'SPY', 'ARKK',
];

// Investment/market base keywords for base score
const INVESTMENT_BASE_KEYWORDS = [
  '投資', 'investment', '市場', 'market', '股票', 'stock', '基金', 'fund',
  '公司', 'company', '產業', 'industry', '科技', 'tech', '商業', 'business',
  '財務', 'financial', '經濟', 'economy', '金融', 'finance', '資產', 'asset',
];

function normalizeText(doc: Record<string, unknown>): string {
  const fields = [
    doc.jgTitle, doc.video_title, doc.title, doc.articleTitle, doc.topic,
    doc.article, doc.body, doc.cleanArticleDraft, doc.editedArticleDraft, doc.articleDraft,
    doc.suggestedUse, doc.triageReason,
  ];
  // Also include key_insights text
  const ki = doc.key_insights || doc.keyInsights;
  if (Array.isArray(ki)) {
    ki.forEach((k: unknown) => {
      if (typeof k === 'string') fields.push(k);
      else if (k && typeof k === 'object') {
        const obj = k as Record<string, unknown>;
        fields.push(obj.insight, obj.text, obj.topic);
      }
    });
  }
  return fields
    .filter((f): f is string => typeof f === 'string' && f.length > 0)
    .join(' ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runAutoTriage(doc: Record<string, any>): TriageResult {
  const text = normalizeText(doc);
  const textLower = text.toLowerCase();

  let score = 0;
  const reasons: string[] = [];
  const matchedThemes: string[] = [];
  const matchedStocks: string[] = [];

  // ── 1. Base investment relevance (max +20) ──
  const baseHits = INVESTMENT_BASE_KEYWORDS.filter(kw => textLower.includes(kw.toLowerCase()));
  if (baseHits.length > 0) {
    const baseScore = Math.min(20, baseHits.length * 3);
    score += baseScore;
    reasons.push(`投資相關關鍵字 ${baseHits.length} 個 (+${baseScore})`);
  }

  // ── 2. JG keyword pool (max +30) ──
  const jgHits = JG_KEYWORDS.filter(kw => text.includes(kw) || textLower.includes(kw.toLowerCase()));
  if (jgHits.length > 0) {
    const jgScore = Math.min(30, jgHits.length * 4);
    score += jgScore;
    reasons.push(`JG 關鍵字 ${jgHits.length} 個: ${jgHits.slice(0, 5).join(', ')} (+${jgScore})`);
  }

  // ── 3. Theme matching (max +30) ──
  let themeScore = 0;
  for (const [theme, keywords] of Object.entries(JG_THEMES)) {
    const hit = keywords.some(kw => text.includes(kw) || textLower.includes(kw.toLowerCase()));
    if (hit) {
      matchedThemes.push(theme);
      themeScore += 10;
    }
  }
  if (themeScore > 0) {
    themeScore = Math.min(30, themeScore);
    score += themeScore;
    reasons.push(`命中主題: ${matchedThemes.join(', ')} (+${themeScore})`);
  }

  // ── 4. Stock matching (max +10) ──
  let stockScore = 0;
  for (const ticker of JG_STOCKS) {
    if (text.includes(ticker)) {
      matchedStocks.push(ticker);
      stockScore += 3;
    }
  }
  if (stockScore > 0) {
    stockScore = Math.min(10, stockScore);
    score += stockScore;
    reasons.push(`命中股票: ${matchedStocks.join(', ')} (+${stockScore})`);
  }

  // ── 5. Metadata quality bonuses ──
  const hasTitle = !!(doc.jgTitle || doc.video_title || doc.title || doc.articleTitle);
  const hasDate = !!(doc.sourceDate || doc.createdAt || doc.publish_date);
  const hasTranscript = !!(doc.transcriptStored || doc.transcriptRef || (typeof doc.transcriptLength === 'number' && doc.transcriptLength > 0));
  const hasKI = !!(
    (Array.isArray(doc.key_insights) && doc.key_insights.length > 0) ||
    (Array.isArray(doc.keyInsights) && doc.keyInsights.length > 0)
  );
  const hasDraft = !!(doc.cleanArticleDraft || doc.editedArticleDraft || doc.articleDraft);
  const hasContent = !!(doc.article || doc.body || hasDraft);

  if (hasDate) { score += 5; reasons.push('+5 有 sourceDate'); }
  if (hasTranscript) { score += 10; reasons.push('+10 有 transcript'); }
  if (hasKI) { score += 10; reasons.push('+10 有 keyInsights'); }
  if (hasContent) { score += 5; reasons.push('+5 有 article/draft'); }
  if (hasTitle) { score += 5; reasons.push('+5 有 title'); }

  // ── 6. Existing signals from prior processing ──
  if (doc.articleDecision === 'draft_candidate') { score += 15; reasons.push('+15 已判斷 draft_candidate'); }
  else if (doc.articleDecision === 'material_only') { score += 5; reasons.push('+5 已判斷 material_only'); }
  else if (doc.articleDecision === 'needs_review') { score += 8; reasons.push('+8 已判斷 needs_review'); }

  // Cap at 100
  score = Math.min(100, score);

  // ── Classification ──
  let topicCandidateStatus: TriageResult['topicCandidateStatus'];
  let articleDecision: TriageResult['articleDecision'];
  let suggestedUse: string;

  if (score >= 75) {
    topicCandidateStatus = 'topic_candidate';
  } else if (score >= 50) {
    topicCandidateStatus = 'needs_review';
  } else if (score > 0) {
    topicCandidateStatus = 'material_only';
  } else {
    topicCandidateStatus = 'reject';
  }

  // Override: no content → reject
  if (!hasContent && !hasKI && !hasTranscript) {
    topicCandidateStatus = 'reject';
  }

  // Article decision
  if (hasDraft && score >= 75) {
    articleDecision = 'draft_candidate';
    suggestedUse = '已有草稿，可直接編輯後發佈';
  } else if (score >= 75) {
    articleDecision = 'draft_candidate';
    suggestedUse = '高相關，建議生成草稿';
  } else if (score >= 50) {
    articleDecision = 'needs_review';
    suggestedUse = '需人工確認主題與相關性';
  } else if (score >= 25) {
    articleDecision = 'material_only';
    suggestedUse = '可作為素材庫參考，不建議直接成文';
  } else {
    articleDecision = 'reject';
    suggestedUse = '相關性低，暫不處理';
  }

  return {
    jgFitScore: score,
    topicCandidateStatus,
    articleDecision,
    suggestedUse,
    matchedThemes,
    matchedStocks,
    triageReason: reasons.join(' | '),
    triagedAt: new Date(),
  };
}
