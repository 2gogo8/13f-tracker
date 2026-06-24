/**
 * topic-mapping.ts — JG Insights Alpha Content Spec
 *
 * Maps DB `topic` values to JG-branded display fields.
 * Does NOT modify DB. Frontend-only.
 *
 * Rules:
 * - Tab nav shows topicLabel (not source name)
 * - Article title shows jgTitle (not articleTitle when mapping exists)
 * - Source shown as small metadata badge only
 * - Fallback to original topic/articleTitle when mapping is absent
 */

export interface TopicMeta {
  topicLabel: string;        // shown in nav tab
  jgTitle: string;           // main article headline
  sourceLabel: string;       // small metadata badge: "來源：All-In Podcast"
  jgAngle: string;           // JG's interpretive angle (1-2 sentences)
  investmentQuestion: string; // core question for investors
}

const TOPIC_META: Record<string, TopicMeta> = {
  'All-In·6/24': {
    topicLabel: '私募市場破牆',
    jgTitle: 'SpaceX IPO 表面是火箭故事，真正是私人市場破牆',
    sourceLabel: 'All-In Podcast',
    jgAngle: '從 SpaceX、Cursor 與私人市場開放，觀察頂級資產是否開始從封閉市場走向散戶入口。',
    investmentQuestion: '私人市場破牆後，投資人該追火箭，還是追掌握入口與分配權的平台？',
  },
  'Manual·6/24': {
    topicLabel: 'AI 權力重組',
    jgTitle: 'Cursor $60 億估值揭示的真相：AI 工具護城河是發行入口，不是模型',
    sourceLabel: 'JG 觀察',
    jgAngle: 'AI 工具競爭不只是模型能力，而是誰能掌握工作流入口、算力供應與企業採用。',
    investmentQuestion: 'AI 工具公司的護城河，究竟來自模型，還是來自使用者工作流與發行權？',
  },
  'a16z·6/24': {
    topicLabel: '產品留存率',
    jgTitle: '留存率才是 PMF 的唯一指標，ChatGPT 不是因為 AI 強才爆',
    sourceLabel: 'a16z',
    jgAngle: 'AI 產品真正的競爭力不是生成能力，而是用戶是否形成「用了就回不去」的習慣。',
    investmentQuestion: '哪些 AI 產品已經出現高留存與流程嵌入，而不是只靠新鮮感成長？',
  },
  'ARK·6/24': {
    topicLabel: '總經風險',
    jgTitle: '通膨急凍比預期快 40%，市場定價邏輯要換了',
    sourceLabel: 'ARK Invest',
    jgAngle: '通膨與利率預期變化，可能重新影響成長股、長天期資產與科技估值。',
    investmentQuestion: '如果通膨降溫速度快於市場預期，資金會先回到哪類資產？',
  },
};

/** Nav tab label: topicLabel if mapped, else original topic (truncated) */
export function getTopicLabel(topic: string, fallback: string): string {
  return TOPIC_META[topic]?.topicLabel ?? fallback;
}

/** Main article headline: jgTitle if mapped, else original articleTitle */
export function getJgTitle(topic: string, fallback: string): string {
  return TOPIC_META[topic]?.jgTitle ?? fallback;
}

/** Source badge text: sourceLabel if mapped, else raw topic channel prefix */
export function getSourceLabel(topic: string): string | null {
  return TOPIC_META[topic]?.sourceLabel ?? null;
}

/** JG angle text (optional display) */
export function getJgAngle(topic: string): string | null {
  return TOPIC_META[topic]?.jgAngle ?? null;
}

/** Investment question (optional display) */
export function getInvestmentQuestion(topic: string): string | null {
  return TOPIC_META[topic]?.investmentQuestion ?? null;
}

/** Full meta object (null if no mapping) */
export function getTopicMeta(topic: string): TopicMeta | null {
  return TOPIC_META[topic] ?? null;
}
