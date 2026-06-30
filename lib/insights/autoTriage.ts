/**
 * autoTriage.ts
 *
 * Auto-triage scoring and classification for summary documents.
 * Three independent scores (replacing the old jgFitScore):
 *   1. investmentRelevanceScore (0-100) – Is it investment-related?
 *   2. topicValueScore (0-100) – Is it worth writing about?
 *   3. editorialFitScore (0-100) – Does it fit JG's brand direction?
 *
 * Flow: rawMaterial → topicCandidate → draftCandidate → published
 */

export interface TriageResult {
  investmentRelevanceScore: number;
  topicValueScore: number;
  editorialFitScore: number;
  topicCandidateStatus: 'topic_candidate' | 'needs_review' | 'material_only' | 'reject';
  articleDecision: 'draft_candidate' | 'material_only' | 'needs_review' | 'reject';
  suggestedUse: string;
  matchedThemes: string[];
  matchedStocks: string[];
  triageReason: string;
  triagedAt: Date;
}

// ── Investment Relevance Keywords ─────────────────────────────────────────────
// Broad: anything related to investing, markets, companies, industries, tech/business
const INVESTMENT_KEYWORDS = [
  // 中文
  '投資', '市場', '股票', '基金', '公司', '產業', '科技', '商業',
  '財務', '經濟', '金融', '資產', '併購', '財報', '商業模式',
  '總經', '資本配置', '持倉', '能源', '半導體', '太空',
  'AI', '人工智慧',
  // English
  'investment', 'market', 'stock', 'fund', 'company', 'industry', 'tech',
  'business', 'financial', 'economy', 'finance', 'asset', 'M&A', 'merger',
  'acquisition', 'earnings', 'capital allocation', 'fund holdings',
  'business model', 'energy', 'semiconductor', 'space',
  'artificial intelligence',
  // Tickers / specific terms
  'ETF', 'IPO', '13F', 'Fed', '聯準會', '利率', '通膨', 'inflation',
  '殖利率', 'yield', 'GDP', '央行', 'central bank',
  '估值', 'valuation', '營收', 'revenue', '獲利', 'profit',
  '供應鏈', 'supply chain', '關稅', 'tariff',
  '比特幣', 'Bitcoin', 'crypto', '加密',
];

// ── Topic Value: indicators of substance ──────────────────────────────────────
const OPINION_INDICATORS = [
  '觀點', '認為', '判斷', '分析', '論點', '看法', '結論', '預測',
  '主張', '建議', '評估', '我認為', '我們認為',
  'opinion', 'argue', 'thesis', 'analysis', 'conclusion', 'predict',
  'recommend', 'assess', 'believe', 'view',
];

const DATA_INDICATORS = [
  '%', '億', '兆', 'billion', 'trillion', 'million',
  'YoY', 'QoQ', 'MoM', '同比', '環比', '增長', '下降',
  '數據', 'data', '統計', 'statistics', '報告', 'report',
];

// ── Editorial Fit: JG brand themes ────────────────────────────────────────────
const EDITORIAL_BOOST_THEMES: Record<string, string[]> = {
  '太空': ['太空', 'space', 'SpaceX', 'Starlink', 'rocket', '火箭', 'satellite', '衛星', 'RKLB'],
  'AI基礎設施': ['AI基礎設施', 'AI infrastructure', '資料中心', 'data center', 'hyperscaler', 'GPU', 'training', 'inference'],
  '主權基金': ['主權基金', 'sovereign', 'sovereign wealth', 'GIC', 'ADIA', 'Temasek', 'NBIM', '挪威主權'],
  '資本配置': ['資本配置', 'capital allocation', '資本', '私人市場', 'private market', 'PE', 'buyout', 'VC'],
  '市場結構': ['市場結構', 'market structure', '做市商', 'market maker', '流動性', 'liquidity', '高頻', 'HFT', '散戶vs機構'],
  '反市場觀點': ['反市場', '逆向', '泡沫', 'bubble', '做空', 'short', '質疑', '過熱', 'overvalued', '反直覺', 'contrarian'],
  '機構視角': ['機構', '法人', '13F', '持倉', 'portfolio', '重倉', '加倉', '減倉', 'institutional', 'hedge fund', '避險基金'],
};

const EDITORIAL_PENALTY_INDICATORS = [
  '純新聞', '新聞摘要', '價格變動', 'price action', '漲跌',
  '今日盤後', '盤中速報', '開盤', '收盤',
];

// Stock tickers (for matching)
const JG_STOCKS = [
  'NVDA', 'NVIDIA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'RKLB', 'MSTR',
  'PLTR', 'RBLX', 'NET', 'SNOW', 'ARM', 'SMCI', 'VRT', 'EQIX', 'AMT', 'VST',
  'FSLR', 'ENPH', 'BE', 'RUN', 'PLUG', 'DKNG', 'COIN', 'HOOD', 'SOFI',
  'GME', 'AMC', 'BBBY', 'WEN', 'CHWY', 'EBAY', 'SPX', 'QQQ', 'SPY', 'ARKK',
];

function normalizeText(doc: Record<string, unknown>): string {
  const fields = [
    doc.jgTitle, doc.video_title, doc.title, doc.articleTitle, doc.topic,
    doc.article, doc.body, doc.cleanArticleDraft, doc.editedArticleDraft, doc.articleDraft,
    doc.suggestedUse, doc.triageReason,
  ];
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

// ── Score 1: Investment Relevance (0-100) ──────────────────────────────────────
function calcInvestmentRelevance(text: string, textLower: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Keyword hits (each hit adds points, capped)
  const hits = INVESTMENT_KEYWORDS.filter(kw => textLower.includes(kw.toLowerCase()));
  if (hits.length > 0) {
    // Rapid ramp: 1 hit = 20, 2 = 35, 3 = 50, 4 = 60, 5+ = 70 max from keywords
    const kwScore = Math.min(70, hits.length <= 1 ? 20 : hits.length <= 2 ? 35 : hits.length <= 3 ? 50 : hits.length <= 4 ? 60 : 70);
    score += kwScore;
    reasons.push(`投資關鍵字 ${hits.length} 個: ${hits.slice(0, 5).join(', ')} (+${kwScore})`);
  }

  // Ticker mentions boost
  const tickerHits = JG_STOCKS.filter(t => text.includes(t));
  if (tickerHits.length > 0) {
    const tickerScore = Math.min(20, tickerHits.length * 5);
    score += tickerScore;
    reasons.push(`股票代號 ${tickerHits.length} 個 (+${tickerScore})`);
  }

  // Has financial data indicators
  const dataHits = DATA_INDICATORS.filter(d => text.includes(d) || textLower.includes(d.toLowerCase()));
  if (dataHits.length >= 2) {
    score += 10;
    reasons.push('+10 含財務數據');
  }

  return { score: Math.min(100, score), reasons };
}

// ── Score 2: Topic Value (0-100) ───────────────────────────────────────────────
function calcTopicValue(text: string, textLower: string, doc: Record<string, unknown>): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Clear opinion/thesis indicators
  const opinionHits = OPINION_INDICATORS.filter(kw => textLower.includes(kw.toLowerCase()));
  if (opinionHits.length >= 2) {
    score += 20;
    reasons.push(`+20 有觀點/論點 (${opinionHits.length} 個指標)`);
  } else if (opinionHits.length >= 1) {
    score += 10;
    reasons.push('+10 有觀點指標');
  }

  // Data support
  const dataHits = DATA_INDICATORS.filter(d => text.includes(d) || textLower.includes(d.toLowerCase()));
  if (dataHits.length >= 3) {
    score += 20;
    reasons.push('+20 有豐富數據');
  } else if (dataHits.length >= 1) {
    score += 10;
    reasons.push('+10 有數據支撐');
  }

  // Has keyInsights
  const hasKI = !!(
    (Array.isArray(doc.key_insights) && doc.key_insights.length > 0) ||
    (Array.isArray(doc.keyInsights) && (doc.keyInsights as unknown[]).length > 0)
  );
  if (hasKI) {
    const kiCount = (Array.isArray(doc.key_insights) ? doc.key_insights.length : 0)
      || (Array.isArray(doc.keyInsights) ? (doc.keyInsights as unknown[]).length : 0);
    const kiScore = Math.min(20, kiCount * 4);
    score += kiScore;
    reasons.push(`+${kiScore} 有 keyInsights (${kiCount} 條)`);
  }

  // Has transcript
  const hasTranscript = !!(doc.transcriptStored || doc.transcriptRef || (typeof doc.transcriptLength === 'number' && doc.transcriptLength > 0));
  if (hasTranscript) {
    score += 15;
    reasons.push('+15 有 transcript');
  }

  // Has article/draft content
  const hasDraft = !!(doc.cleanArticleDraft || doc.editedArticleDraft || doc.articleDraft);
  const hasArticle = !!(doc.article || doc.body);
  if (hasDraft) {
    score += 15;
    reasons.push('+15 有完整草稿');
  } else if (hasArticle) {
    score += 10;
    reasons.push('+10 有 article/body');
  }

  // Text length bonus (longer = more substance)
  if (text.length > 3000) {
    score += 10;
    reasons.push('+10 內容豐富 (>3000字)');
  } else if (text.length > 1000) {
    score += 5;
    reasons.push('+5 有一定內容量');
  }

  return { score: Math.min(100, score), reasons };
}

// ── Score 3: Editorial Fit (0-100) ─────────────────────────────────────────────
function calcEditorialFit(text: string, textLower: string, matchedThemes: string[]): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Theme matching (editorial boost themes)
  const editorialThemes: string[] = [];
  for (const [theme, keywords] of Object.entries(EDITORIAL_BOOST_THEMES)) {
    const hit = keywords.some(kw => text.includes(kw) || textLower.includes(kw.toLowerCase()));
    if (hit) {
      editorialThemes.push(theme);
    }
  }
  if (editorialThemes.length > 0) {
    const themeScore = Math.min(50, editorialThemes.length * 15);
    score += themeScore;
    reasons.push(`JG 品牌主題: ${editorialThemes.join(', ')} (+${themeScore})`);
  }

  // Contrarian / anti-mainstream indicators
  const contrarian = ['反市場', '逆向', 'contrarian', '反直覺', '質疑', '泡沫', '做空'].filter(
    kw => textLower.includes(kw.toLowerCase())
  );
  if (contrarian.length > 0) {
    score += 15;
    reasons.push('+15 反直覺/反市場觀點');
  }

  // Institutional perspective
  const institutional = ['機構', '法人', '13F', 'institutional', 'hedge fund', '避險基金', '主權基金'].filter(
    kw => textLower.includes(kw.toLowerCase())
  );
  if (institutional.length >= 2) {
    score += 15;
    reasons.push('+15 機構視角');
  } else if (institutional.length >= 1) {
    score += 8;
    reasons.push('+8 有機構元素');
  }

  // Capital allocation logic
  const capAlloc = ['資本配置', 'capital allocation', '回購', 'buyback', '分紅', '資產配置'].filter(
    kw => textLower.includes(kw.toLowerCase())
  );
  if (capAlloc.length > 0) {
    score += 10;
    reasons.push('+10 資本配置邏輯');
  }

  // Penalty: pure news / no opinion / price-only
  const penaltyHits = EDITORIAL_PENALTY_INDICATORS.filter(p => textLower.includes(p.toLowerCase()));
  if (penaltyHits.length > 0) {
    const penalty = Math.min(20, penaltyHits.length * 10);
    score -= penalty;
    reasons.push(`-${penalty} 偏新聞/無觀點`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runAutoTriage(doc: Record<string, any>): TriageResult {
  const text = normalizeText(doc);
  const textLower = text.toLowerCase();

  // ── Compute three independent scores ──
  const ir = calcInvestmentRelevance(text, textLower);
  const matchedStocks = JG_STOCKS.filter(t => text.includes(t));

  // Collect matchedThemes from editorial fit themes
  const matchedThemes: string[] = [];
  for (const [theme, keywords] of Object.entries(EDITORIAL_BOOST_THEMES)) {
    const hit = keywords.some(kw => text.includes(kw) || textLower.includes(kw.toLowerCase()));
    if (hit) matchedThemes.push(theme);
  }

  const tv = calcTopicValue(text, textLower, doc);
  const ef = calcEditorialFit(text, textLower, matchedThemes);

  const investmentRelevanceScore = ir.score;
  const topicValueScore = tv.score;
  const editorialFitScore = ef.score;

  // ── Combine reasons ──
  const allReasons = [
    `[投資相關=${investmentRelevanceScore}] ${ir.reasons.join(' | ')}`,
    `[成文價值=${topicValueScore}] ${tv.reasons.join(' | ')}`,
    `[品牌符合=${editorialFitScore}] ${ef.reasons.join(' | ')}`,
  ];

  // ── Classification based on investmentRelevanceScore ──
  const hasContent = !!(doc.article || doc.body || doc.cleanArticleDraft || doc.editedArticleDraft || doc.articleDraft);
  const hasKI = !!(
    (Array.isArray(doc.key_insights) && doc.key_insights.length > 0) ||
    (Array.isArray(doc.keyInsights) && (doc.keyInsights as unknown[]).length > 0)
  );
  const hasTranscript = !!(doc.transcriptStored || doc.transcriptRef || (typeof doc.transcriptLength === 'number' && doc.transcriptLength > 0));
  const hasDraft = !!(doc.cleanArticleDraft || doc.editedArticleDraft);
  const hasBlocker = !!doc.blocker;
  const editableText = (doc.editedArticleDraft || '') + ' ' + (doc.cleanArticleDraft || '');
  const BLOCK_PHRASES = ['【JG 觀點待補】', '《JG 觀點待補》', 'TODO'];
  const hasBlockerPhrase = BLOCK_PHRASES.some(p => editableText.includes(p));
  // Data contradiction check
  const hasDataContradiction = false; // placeholder, can be expanded

  let topicCandidateStatus: TriageResult['topicCandidateStatus'];
  let articleDecision: TriageResult['articleDecision'];
  let suggestedUse: string;

  // Invalid: no content at all
  if (!hasContent && !hasKI && !hasTranscript) {
    topicCandidateStatus = 'reject';
    articleDecision = 'reject';
    suggestedUse = '無內容，無法處理';
  }
  // needsReview: blocker / blocker phrase / score 30-59
  else if (hasBlocker || hasBlockerPhrase || hasDataContradiction) {
    topicCandidateStatus = 'needs_review';
    articleDecision = 'needs_review';
    suggestedUse = hasBlocker ? `有 blocker: ${doc.blocker}` : hasBlockerPhrase ? '草稿含《JG 觀點待補》/TODO' : '資料矛盾需確認';
  }
  else if (investmentRelevanceScore >= 60) {
    // topicCandidate: investmentRelevanceScore >= 60
    topicCandidateStatus = 'topic_candidate';

    // articleDecision based on combined scores
    const combinedScore = topicValueScore + editorialFitScore;
    if (combinedScore >= 100) {
      articleDecision = 'draft_candidate';
      suggestedUse = '高成文價值 + 高品牌符合，建議生成草稿';
    } else if (combinedScore >= 60) {
      articleDecision = 'needs_review';
      suggestedUse = '有潛力，需人工確認主題方向';
    } else {
      articleDecision = 'material_only';
      suggestedUse = '投資相關但成文價值或品牌符合度偏低，可作素材';
    }
  }
  else if (investmentRelevanceScore >= 30) {
    // needsReview: borderline investment relevance
    topicCandidateStatus = 'needs_review';
    articleDecision = 'needs_review';
    suggestedUse = '投資相關性待確認 (30-59)';
  }
  else {
    // rawMaterial: not investment-related
    topicCandidateStatus = 'material_only';
    articleDecision = 'material_only';
    suggestedUse = '投資相關性低，暫存素材庫';
  }

  return {
    investmentRelevanceScore,
    topicValueScore,
    editorialFitScore,
    topicCandidateStatus,
    articleDecision,
    suggestedUse,
    matchedThemes,
    matchedStocks,
    triageReason: allReasons.join(' | '),
    triagedAt: new Date(),
  };
}
