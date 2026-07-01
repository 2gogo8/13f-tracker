'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeSummary, getWorkbenchCardInfo, hasUsableContent } from '@/lib/insights/normalizeSummary';

interface Interview {
  date: string;
  topic: string;
  keyPoint: string;
}

interface Expert {
  _id: string;
  name: string;
  title: string;
  organization: string;
  bio: string;
  tags: string[];
  interviews: Interview[];
  createdAt: string;
  updatedAt: string;
}

interface InsightSummary {
  _id: string;
  tags: string[];
  summary: {
    timelineAnalysis: string;
    keyNumbers: string;
    predictionVsReality: string;
  };
  expertCount: number;
  publishedAt: string;
}

type ModalMode = 'create' | 'edit';

export default function ExpertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'experts' | 'channels' | 'cms' | 'jg-picks' | 'usage'>('experts');

  // Admin state
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // CMS state
  const [cmsData, setCmsData] = useState<{
    // New content-gate CMS buckets
    rawMaterial: any[]; rawMaterialCount: number;
    contentCandidate: any[]; contentCandidateCount: number;
    inProgress: any[]; inProgressCount: number;
    needsData: any[]; needsDataCount: number;
    needsReview: any[]; needsReviewCount: number;
    published: any[]; publishedCount: number;
    invalid: any[]; invalidCount: number;
    // backward compat
    topicCandidate: any[]; topicCandidateCount: number;
    draftCandidate: any[]; draftCandidateCount: number;
    candidate: any[]; candidateCount: number;
    newExpertInsights: any[]; sectionB: any[]; sectionBEmpty: boolean; publishedSummaries: any[];
    unpublishedSummaries: any[]; archivedRejectedUnpublished: any[]; candidateSummaries: any[];
    sectionAIrrelevantCount: number;
    rawMaterialExpertCount: number; rawMaterialIrrelevantCount: number;
  } | null>(null);
  // Article management sub-tab (content-gate flow)
  const [articleTab, setArticleTab] = useState<'rawMaterial' | 'contentWorkbench' | 'inProgress' | 'published' | 'needsData' | 'needsReview' | 'invalid'>('contentWorkbench');
  // Draft editing state
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingDraftText, setEditingDraftText] = useState<string>('');
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const [editingContentSource, setEditingContentSource] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveMsg, setDraftSaveMsg] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);
  const [updatingPublishedId, setUpdatingPublishedId] = useState<string | null>(null);
  const [cmsLoading, setCmsLoading] = useState(false);
  const [cmsError, setCmsError] = useState<string | null>(null);
  const [cmsMsg, setCmsMsg] = useState<string | null>(null);
  const [cmsPreview, setCmsPreview] = useState<any | null>(null);
  const [cmsPreviewLoading, setCmsPreviewLoading] = useState(false);
  const [previewTab, setPreviewTab] = useState<'draft' | 'insights' | 'insightsV2' | 'transcript' | 'source'>('draft');
  const [generatingV2Id, setGeneratingV2Id] = useState<string | null>(null);
  const [v2SortMode, setV2SortMode] = useState<'score' | 'position'>('score');
  const [transcriptData, setTranscriptData] = useState<{fullTranscript: string, transcriptLength?: number, fetchedAt: string, expiresAt: string} | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [cmsEditId, setCmsEditId] = useState<string | null>(null);
  const [cmsEditMeta, setCmsEditMeta] = useState<Record<string, any>>({});
  const [generatingDraftId, setGeneratingDraftId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [marketDirectionsText, setMarketDirectionsText] = useState('');

  // Workbench: reject dropdown
  const [rejectDropdownId, setRejectDropdownId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectReasonOther, setRejectReasonOther] = useState<string>('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  // Workbench: publish confirm dialog
  const [publishConfirmDoc, setPublishConfirmDoc] = useState<any | null>(null);
  const [publishDialogError, setPublishDialogError] = useState<string | null>(null);
  // Workbench: batch V2 dry-run dialog
  const [showBatchV2Dialog, setShowBatchV2Dialog] = useState(false);
  const [batchV2DryRunData, setBatchV2DryRunData] = useState<any | null>(null);

  // 自動挑片狀態
  const [rankingContext, setRankingContext] = useState('');
  const [manualKeywords, setManualKeywords] = useState('');
  const [useKeywordPool, setUseKeywordPool] = useState(false);
  const [keywordPoolCount, setKeywordPoolCount] = useState<number | null>(null);
  const [isRanking, setIsRanking] = useState(false);
  const [rankingMsg, setRankingMsg] = useState('');
  const [draftResult, setDraftResult] = useState<Record<string, any> | null>(null);

  // Usage analytics state
  const [usageData, setUsageData] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // JG Picks admin state
  const [manualPicks, setManualPicks] = useState<any[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [addSymbol, setAddSymbol] = useState('');
  const [addMentionDate, setAddMentionDate] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSource, setAddSource] = useState('manual');
  const [addingPick, setAddingPick] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Channel management state
  const [channels, setChannels] = useState<any[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [newChannelUrl, setNewChannelUrl] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkAdding, setBulkAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingExpert, setEditingExpert] = useState<Expert | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Insight generation state
  const [insightTags, setInsightTags] = useState<string[]>([]);
  const [insightInput, setInsightInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedInsight, setGeneratedInsight] = useState<InsightSummary | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formInterviews, setFormInterviews] = useState<Interview[]>([]);

  // Interview add form
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [intDate, setIntDate] = useState('');
  const [intTopic, setIntTopic] = useState('');
  const [intKeyPoint, setIntKeyPoint] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (
      status === 'authenticated' &&
      (session?.user as any)?.isAdmin !== true
    ) {
      router.replace('/not-member');
    }
  }, [status, session, router]);

  // Preload keyword pool count
  useEffect(() => {
    fetch('/api/admin/insights/keyword-pool')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setKeywordPoolCount(d.totalKeywords);
      })
      .catch(() => {});
  }, []);

  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      if (data.ok) setChannels(data.channels || []);
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  const fetchAdminStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whoami');
      const data = await res.json();
      setIsAdmin(data.ok && data.isAdmin === true);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const fetchCmsData = useCallback(async () => {
    setCmsLoading(true);
    setCmsError(null);
    try {
      const res = await fetch('/api/admin/insights/candidates');
      const data = await res.json();
      if (data.ok) setCmsData(data);
      else setCmsError(data.error || '載入失敗');
    } catch {
      setCmsError('網路錯誤');
    } finally {
      setCmsLoading(false);
    }
  }, []);

  const cmsAction = async (url: string, body: object, successMsg: string) => {
    setCmsMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        setCmsMsg(`✅ ${successMsg}`);
        fetchCmsData();
      } else {
        setCmsMsg(`❌ ${data.message || data.error || '操作失敗'}`);
        if (data.lintErrors?.length) setCmsMsg(`❌ Lint 不通過：${data.lintErrors.join(', ')}`);
      }
    } catch {
      setCmsMsg('❌ 網路錯誤');
    }
  };

  const handleRankVideos = async () => {
    setIsRanking(true);
    setRankingMsg('評分中...');
    try {
      const res = await fetch('/api/admin/insights/rank-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketContextRaw: rankingContext.trim(),
          manualKeywordsRaw: manualKeywords.trim(),
          useKeywordPool,
          topN: 5,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setRankingMsg(
          `✅ 推薦 ${data.results.recommended}支 / 待確認 ${data.results.needs_review}支 / 低優先 ${data.results.low_priority}支` +
            (data.keywordsUsed ? ` (關鍵字 ${data.keywordsUsed} 個)` : '')
        );
        fetchCmsData();
      } else {
        setRankingMsg(`⚠️ 評分失敗：${data.error}`);
      }
    } catch {
      setRankingMsg('⚠️ 網路錯誤');
    } finally {
      setIsRanking(false);
    }
  };

  const handleGenerateDraft = async (summaryId: string) => {
    setGeneratingDraftId(summaryId);
    setDraftError(null);
    setDraftResult(null);
    setCmsMsg(null);
    try {
      // 支援 freeform 自由文字，直接傳 raw string。LLM 會先整理成主題。
      const res = await fetch('/api/admin/insights/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryId, marketDirectionsRaw: marketDirectionsText.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const warningPart = data.freshnessWarning ? ` | ${data.freshnessWarning}` : '';
        setCmsMsg(`✅ 草稿生成完成：${data.draftTitle}${warningPart}`);
        setDraftResult(data);
        fetchCmsData();
      } else {
        setDraftError(data.error || '生成失敗');
      }
    } catch {
      setDraftError('網路錯誤，請重試');
    } finally {
      setGeneratingDraftId(null);
    }
  };

  const handleArticleGate = async (expertInsightId: string) => {
    setEnrichingId(expertInsightId)
    try {
      const res = await fetch('/api/admin/insights/article-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expertInsightId })
      })
      const data = await res.json()
      if (data.ok) {
        const label = data.articleDecision === 'draft_candidate' ? '🔥 適合成文'
          : data.articleDecision === 'material_only' ? '📚 只放素材庫'
          : '🚫 不建議處理'
        setCmsMsg(`${label}（${data.articleWorthinessScore}分）`)
        fetchCmsData()
      } else {
        setCmsMsg(`⚠️ ${data.error}`)
      }
    } catch {
      setCmsMsg('⚠️ 網路錯誤')
    } finally {
      setEnrichingId(null)
    }
  }

  const openPreview = async (id: string, type: 'summary' | 'expert_insight', defaultTab?: 'draft' | 'insights' | 'insightsV2' | 'transcript' | 'source') => {
    setCmsPreviewLoading(true);
    setCmsPreview(null);
    setPreviewTab(defaultTab ?? 'draft');
    setTranscriptData(null);
    setTranscriptError(null);
    // Reset draft editing state when switching articles
    setEditingDraftId(null);
    setEditingDraftText('');
    setEditingContentSource(null);
    setDraftSaveMsg(null);
    setDraftWarning(null);
    try {
      const res = await fetch(`/api/admin/insights/preview?id=${id}&type=${type}`);
      const data = await res.json();
      if (data.ok) setCmsPreview(data.doc);
    } finally {
      setCmsPreviewLoading(false);
    }
  };

  const loadTranscript = async (youtubeId: string) => {
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const res = await fetch(`/api/admin/insights/transcript?youtube_id=${youtubeId}`);
      const data = await res.json();
      if (data.ok) setTranscriptData(data);
      else setTranscriptError(data.error || '無法載入逐字稿');
    } catch {
      setTranscriptError('網路錯誤');
    }
    setTranscriptLoading(false);
  };

  const triggerScan = async () => {
    setScanning(true);
    setScanStatus(null);
    try {
      const res = await fetch('/api/admin/scan-now', { method: 'POST' });
      const data = await res.json();
      setScanStatus(data.ok ? '✅ 已送出，約 15 分鐘內執行' : '❌ 送出失敗');
    } catch {
      setScanStatus('❌ 送出失敗');
    } finally {
      setScanning(false);
    }
  };

  const bulkAddChannels = async () => {
    const urls = bulkInput.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setBulkAdding(true);
    try {
      const results = await Promise.allSettled(
        urls.map(url =>
          fetch('/api/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          }).then(r => r.json())
        )
      );
      let success = 0, duplicate = 0, failed = 0;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.duplicate) duplicate++;
          else if (r.value.ok) success++;
          else failed++;
        } else {
          failed++;
        }
      }
      setBulkInput('');
      fetchChannels();
      alert(`✅ 成功新增 ${success} 個 / ⚠️ ${duplicate} 個重複 / ❌ ${failed} 個失敗`);
    } catch (err) {
      console.error('Bulk add failed:', err);
    } finally {
      setBulkAdding(false);
    }
  };

  const bulkDeleteChannels = async () => {
    if (selectedUrls.size === 0) return;
    if (!confirm(`確定要刪除 ${selectedUrls.size} 個頻道嗎？`)) return;
    try {
      await Promise.allSettled(
        [...selectedUrls].map(url =>
          fetch(`/api/channels?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
        )
      );
      setSelectedUrls(new Set());
      fetchChannels();
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  const addChannel = async () => {
    if (!newChannelUrl.trim()) return;
    setAddingChannel(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newChannelUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewChannelUrl('');
        fetchChannels();
        alert(data.duplicate ? '頻道已存在' : '✅ 頻道已新增！下次掃描時會自動處理最新一集。');
      }
    } catch (err) {
      console.error('Add channel failed:', err);
    } finally {
      setAddingChannel(false);
    }
  };

  const fetchExperts = useCallback(async () => {
    try {
      const url = activeTag ? `/api/experts?tag=${encodeURIComponent(activeTag)}` : '/api/experts';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setExperts(data);
      }
    } catch (err) {
      console.error('Failed to fetch experts:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTag]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchExperts();
    }
  }, [status, fetchExperts]);

  // Collect all tags
  const allTags = Array.from(new Set(experts.flatMap((e) => e.tags))).sort();

  // Filter by search
  const filtered = experts.filter((e) => {
    const term = searchTerm.toLowerCase();
    return (
      e.name.toLowerCase().includes(term) ||
      e.title.toLowerCase().includes(term) ||
      e.organization.toLowerCase().includes(term) ||
      e.bio.toLowerCase().includes(term) ||
      e.tags.some((t) => t.toLowerCase().includes(term))
    );
  });

  const resetForm = () => {
    setFormName('');
    setFormTitle('');
    setFormOrg('');
    setFormBio('');
    setFormTags('');
    setFormInterviews([]);
    setEditingExpert(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalMode('create');
    setShowModal(true);
  };

  const openEditModal = (expert: Expert) => {
    setEditingExpert(expert);
    setFormName(expert.name);
    setFormTitle(expert.title);
    setFormOrg(expert.organization);
    setFormBio(expert.bio);
    setFormTags(expert.tags.join(', '));
    setFormInterviews([...expert.interviews]);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formTitle.trim() || !formOrg.trim()) return;
    setSaving(true);

    const payload = {
      name: formName.trim(),
      title: formTitle.trim(),
      organization: formOrg.trim(),
      bio: formBio.trim(),
      tags: formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      interviews: formInterviews,
    };

    try {
      if (modalMode === 'create') {
        const res = await fetch('/api/experts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setShowModal(false);
          resetForm();
          fetchExperts();
        }
      } else if (editingExpert) {
        const res = await fetch(`/api/experts/${editingExpert._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setShowModal(false);
          resetForm();
          fetchExperts();
        }
      }
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這位專家？')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/experts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchExperts();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  const addInterview = () => {
    if (!intDate || !intTopic.trim() || !intKeyPoint.trim()) return;
    setFormInterviews([...formInterviews, { date: intDate, topic: intTopic.trim(), keyPoint: intKeyPoint.trim() }]);
    setIntDate('');
    setIntTopic('');
    setIntKeyPoint('');
    setShowInterviewForm(false);
  };

  const removeInterview = (index: number) => {
    setFormInterviews(formInterviews.filter((_, i) => i !== index));
  };

  // Add interview directly to an expert (inline)
  const addInterviewToExpert = async (expertId: string, interview: Interview) => {
    const expert = experts.find((e) => e._id === expertId);
    if (!expert) return;
    const updated = [...(expert.interviews || []), interview];
    try {
      const res = await fetch(`/api/experts/${expertId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviews: updated }),
      });
      if (res.ok) fetchExperts();
    } catch (err) {
      console.error('Add interview failed:', err);
    }
  };

  const removeInterviewFromExpert = async (expertId: string, index: number) => {
    const expert = experts.find((e) => e._id === expertId);
    if (!expert) return;
    const updated = (expert.interviews || []).filter((_, i) => i !== index);
    try {
      const res = await fetch(`/api/experts/${expertId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviews: updated }),
      });
      if (res.ok) fetchExperts();
    } catch (err) {
      console.error('Remove interview failed:', err);
    }
  };

  // Workbench: reject handler
  const handleReject = async (s: any, reason: string, otherText: string) => {
    const finalReason = reason === '其他（可輸入文字）' ? otherText.trim() : reason;
    if (!finalReason) { alert('請選擇拒絕原因'); return; }
    const isArchive = reason === '封存（待後續處理）';
    setRejectingId(s._id);
    setRejectDropdownId(null);
    setRejectReason('');
    setRejectReasonOther('');
    setCmsMsg(null);
    try {
      const res = await fetch('/api/admin/insights/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s._id,
          action: isArchive ? 'archive' : 'reject',
          rejectionReason: isArchive ? undefined : finalReason,
          archivedReason: isArchive ? finalReason : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) { setCmsMsg(isArchive ? '✅ 已封存' : '✅ 已拒絕'); fetchCmsData(); }
      else setCmsMsg(`❌ ${data.error || '操作失敗'}`);
    } catch { setCmsMsg('❌ 網路錯誤'); }
    finally { setRejectingId(null); }
  };

  // Workbench: batch V2 dry-run (compute locally from cmsData)
  const handleBatchV2DryRun = () => {
    if (!cmsData) return;
    const all = [...(cmsData.contentCandidate ?? []), ...(cmsData.inProgress ?? [])];
    const toRun = all.filter((d: any) => d.keyInsightsV2Status !== 'completed' && hasUsableContent(d));
    const toSkip = all.filter((d: any) => d.keyInsightsV2Status === 'completed');
    const totalChunks = toRun.reduce((sum: number, d: any) => {
      const chunks = d.totalChunks ?? (d.transcriptLength ? Math.ceil(d.transcriptLength / 10000) : 2);
      return sum + chunks;
    }, 0);
    const estimateMin = Math.max(1, Math.round(totalChunks * 0.3));
    const estimateMax = Math.max(2, Math.round(totalChunks * 0.5));
    setBatchV2DryRunData({ toRun, toSkip, totalChunks, estimateMin, estimateMax });
    setShowBatchV2Dialog(true);
  };

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
        <p className="text-gray-400">載入中...</p>
      </div>
    );
  }

  const btnStyle = (bg: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: '5px', border: 'none', cursor: 'pointer',
    background: bg, color: '#fff', fontSize: '12px', fontWeight: 600,
  });

  return (
    <div className="min-h-screen py-12 px-4 md:px-8">
      {/* Back nav */}
      <div className="max-w-5xl mx-auto mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-primary transition-colors"
        >
          ← 返回首頁
        </Link>
      </div>

      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="font-serif text-4xl md:text-5xl font-bold mb-4 tracking-tight">
          <span className="gradient-text">專家資料庫</span>
        </h1>
        <div className="gradient-line mb-6"></div>
        <p className="text-gray-400 font-light text-base tracking-[0.15em] uppercase">
          Expert Database
        </p>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('experts')}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeTab === 'experts' ? '#c0202a' : '#f0ede8',
              color: activeTab === 'experts' ? '#fff' : '#555',
              fontWeight: 600, fontSize: '14px',
            }}
          >專家管理</button>
          <button
            onClick={() => { setActiveTab('channels'); fetchChannels(); }}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeTab === 'channels' ? '#c0202a' : '#f0ede8',
              color: activeTab === 'channels' ? '#fff' : '#555',
              fontWeight: 600, fontSize: '14px',
            }}
          >頻道管理</button>
          <button
            onClick={() => { setActiveTab('cms'); if (!cmsData) fetchCmsData(); if (isAdmin === null) fetchAdminStatus(); }}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeTab === 'cms' ? '#c0202a' : '#f0ede8',
              color: activeTab === 'cms' ? '#fff' : '#555',
              fontWeight: 600, fontSize: '14px',
            }}
          >📝 文章候選上架</button>
          <button
            onClick={() => {
              setActiveTab('jg-picks');
              if (manualPicks.length === 0) {
                setPicksLoading(true);
                fetch('/api/admin/jg-picks').then(r => r.json()).then(d => {
                  setManualPicks(d.picks || []);
                }).catch(() => {}).finally(() => setPicksLoading(false));
              }
            }}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeTab === 'jg-picks' ? '#c0202a' : '#f0ede8',
              color: activeTab === 'jg-picks' ? '#fff' : '#555',
              fontWeight: 600, fontSize: '14px',
            }}
          >📈 JG 提到過</button>
          <button
            onClick={() => {
              setActiveTab('usage');
              if (!usageData) {
                setUsageLoading(true);
                fetch('/api/admin/insights-usage').then(r => r.json()).then(d => {
                  setUsageData(d);
                }).catch(() => {}).finally(() => setUsageLoading(false));
              }
            }}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeTab === 'usage' ? '#c0202a' : '#f0ede8',
              color: activeTab === 'usage' ? '#fff' : '#555',
              fontWeight: 600, fontSize: '14px',
            }}
          >📊 Alpha 使用紀錄</button>
        </div>

        {activeTab === 'usage' && (
          <div style={{ maxWidth: '1100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontWeight: 700, fontSize: '18px' }}>Alpha 使用紀錄</h2>
              <button onClick={() => {
                setUsageLoading(true);
                fetch('/api/admin/insights-usage').then(r => r.json()).then(setUsageData).catch(() => {}).finally(() => setUsageLoading(false));
              }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                刷新
              </button>
            </div>

            {usageLoading && <div style={{ color: '#aaa', fontSize: '14px' }}>載入中...</div>}

            {!usageLoading && usageData && (() => {
              const { overview, users, articles, recentEvents } = usageData;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

                  {/* ── Overview cards ── */}
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px', color: '#555' }}>總覽</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                      {[['總使用者', overview.totalUsers],
                        ['總 page_view', overview.totalPageViews],
                        ['總 article_view', overview.totalArticleViews],
                        ['今日事件', overview.todayEvents],
                        ['最近 24h', overview.last24hEvents],
                      ].map(([label, value]) => (
                        <div key={String(label)} style={{ background: '#fdfbf8', border: '1px solid #e3ddd2', borderRadius: '8px', padding: '16px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: '#c0202a' }}>{value}</div>
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    {overview.lastEventAt && (
                      <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>最後一次使用：{overview.lastEventAt.slice(0, 16).replace('T', ' ')}</div>
                    )}
                  </div>

                  {/* ── User list ── */}
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px', color: '#555' }}>使用者列表（依最近使用排序）</h3>
                    <div style={{ border: '1px solid #e3ddd2', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '220px 80px 80px 80px 140px 1fr', background: '#f0ede8', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#666' }}>
                        <span>Email</span><span>page_view</span><span>article</span><span>session</span><span>最近使用</span><span>最近文章</span>
                      </div>
                      {users.length === 0 && <div style={{ padding: '20px', color: '#aaa', fontSize: '13px', textAlign: 'center' }}>尚無資料</div>}
                      {users.map((u: any, i: number) => (
                        <div key={u.email} style={{ display: 'grid', gridTemplateColumns: '220px 80px 80px 80px 140px 1fr', padding: '10px 12px', borderTop: i > 0 ? '1px solid #f0ede8' : 'none', fontSize: '12px', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                          <span>{u.visitCount}</span>
                          <span>{u.articleViewCount}</span>
                          <span>{u.sessionCount}</span>
                          <span style={{ color: '#888', fontSize: '11px' }}>{u.lastSeenAt?.slice(0, 16).replace('T', ' ')}</span>
                          <span style={{ color: '#999', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.recentArticle?.title || u.recentArticle?.topic || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Article ranking ── */}
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px', color: '#555' }}>文章觀看排行</h3>
                    <div style={{ border: '1px solid #e3ddd2', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 150px', background: '#f0ede8', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#666' }}>
                        <span>文章</span><span>總看數</span><span>獨立用戶</span><span>最近觀看</span>
                      </div>
                      {articles.length === 0 && <div style={{ padding: '20px', color: '#aaa', fontSize: '13px', textAlign: 'center' }}>尚無資料</div>}
                      {articles.map((a: any, i: number) => (
                        <div key={a.articleTopic || i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 150px', padding: '10px 12px', borderTop: i > 0 ? '1px solid #f0ede8' : 'none', fontSize: '12px', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.articleTitle || a.articleTopic}</div>
                            <div style={{ fontSize: '10px', color: '#aaa' }}>{a.articleTopic}</div>
                          </div>
                          <span style={{ fontWeight: 700, color: '#c0202a' }}>{a.viewCount}</span>
                          <span>{a.uniqueUsers}</span>
                          <span style={{ color: '#888', fontSize: '11px' }}>{a.lastViewedAt?.slice(0, 16).replace('T', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Recent events ── */}
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px', color: '#555' }}>最近事件（最新 50 筆）</h3>
                    <div style={{ border: '1px solid #e3ddd2', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 180px 130px 1fr', background: '#f0ede8', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#666' }}>
                        <span>時間</span><span>Email</span><span>Event</span><span>文章</span>
                      </div>
                      {recentEvents.length === 0 && <div style={{ padding: '20px', color: '#aaa', fontSize: '13px', textAlign: 'center' }}>尚無資料</div>}
                      {recentEvents.map((e: any, i: number) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 180px 130px 1fr', padding: '8px 12px', borderTop: i > 0 ? '1px solid #f0ede8' : 'none', fontSize: '11px', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#fdfbf8' }}>
                          <span style={{ color: '#888' }}>{e.timestamp?.slice(0, 16).replace('T', ' ')}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{e.userEmail}</span>
                          <span style={{ color: e.eventType === 'article_view' ? '#4a90d9' : '#22c55e', fontFamily: 'monospace', fontSize: '10px' }}>{e.eventType}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666' }}>{e.articleTitle || e.articleTopic || e.path}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'jg-picks' && (
          <div style={{ maxWidth: '900px' }}>
            <h2 style={{ fontWeight: 700, fontSize: '18px', marginBottom: '16px' }}>JG 提到過股票管理</h2>

            {/* Add form */}
            <div style={{ background: '#fdfbf8', border: '1px solid #e3ddd2', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: 600, fontSize: '15px', marginBottom: '12px' }}>新增股票</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Ticker *</label>
                  <input value={addSymbol} onChange={e => setAddSymbol(e.target.value.toUpperCase())}
                    placeholder="NVDA" style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', width: '100px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>提到日期 *</label>
                  <input type="date" value={addMentionDate} onChange={e => setAddMentionDate(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>備註（選填）</label>
                  <input value={addNote} onChange={e => setAddNote(e.target.value)}
                    placeholder="會員直播提到" style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', width: '180px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>來源</label>
                  <select value={addSource} onChange={e => setAddSource(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px' }}>
                    <option value="manual">手動</option>
                    <option value="live">直播</option>
                    <option value="member-channel">會員頻道</option>
                    <option value="article">文章</option>
                  </select>
                </div>
                <button
                  disabled={addingPick || !addSymbol || !addMentionDate}
                  onClick={async () => {
                    setAddingPick(true); setAddError(null); setAddSuccess(null);
                    try {
                      const res = await fetch('/api/admin/jg-picks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ symbol: addSymbol, mentionDate: addMentionDate, note: addNote, source: addSource }),
                      });
                      const d = await res.json();
                      if (d.ok) {
                        setAddSuccess(`✅ ${addSymbol} 新增成功！mentionClose=${d.pick.mentionClose} latestClose=${d.pick.latestClose} perf=${d.pick.performancePct}%`);
                        setAddSymbol(''); setAddMentionDate(''); setAddNote('');
                        setManualPicks(prev => [d.pick, ...prev]);
                      } else {
                        setAddError(`❌ ${d.error}`);
                      }
                    } catch (e) { setAddError('❌ 請求失敗'); }
                    finally { setAddingPick(false); }
                  }}
                  style={{ padding: '8px 20px', background: addingPick ? '#ccc' : '#c0202a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                >{addingPick ? '新增中...' : '新增'}</button>
              </div>
              {addError && <div style={{ marginTop: '10px', color: '#c0202a', fontSize: '13px' }}>{addError}</div>}
              {addSuccess && <div style={{ marginTop: '10px', color: '#22c55e', fontSize: '13px' }}>{addSuccess}</div>}
            </div>

            {/* List */}
            {picksLoading ? (
              <div style={{ color: '#aaa', fontSize: '14px' }}>載入中...</div>
            ) : (
              <div style={{ border: '1px solid #e3ddd2', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 90px 90px 90px 80px 1fr 80px', gap: '0', background: '#f0ede8', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#666' }}>
                  <span>Ticker</span><span>提到日期</span><span>提到價</span><span>最新收盤</span><span>截至</span><span>績效</span><span>備註</span><span>狀態</span>
                </div>
                {manualPicks.length === 0 && (
                  <div style={{ padding: '20px', color: '#aaa', fontSize: '13px', textAlign: 'center' }}>尚無手動新增股票</div>
                )}
                {manualPicks.map((pick, idx) => (
                  <div key={String(pick._id)} style={{ display: 'grid', gridTemplateColumns: '80px 100px 90px 90px 90px 80px 1fr 80px', gap: '0', padding: '10px 12px', borderTop: idx > 0 ? '1px solid #f0ede8' : 'none', fontSize: '13px', alignItems: 'center', background: pick.active === false ? '#fafafa' : '#fff' }}>
                    <span style={{ fontWeight: 700, color: pick.active === false ? '#aaa' : '#1a1a1a' }}>{pick.symbol}</span>
                    <span style={{ color: '#666' }}>{pick.mentionDate}</span>
                    <span>{pick.mentionClose != null ? `$${pick.mentionClose}` : '—'}</span>
                    <span>{pick.latestClose != null ? `$${pick.latestClose}` : '—'}</span>
                    <span style={{ color: '#999', fontSize: '11px' }}>{pick.latestCloseDate || '—'}</span>
                    <span style={{ fontWeight: 700, color: pick.performancePct > 0 ? '#22c55e' : pick.performancePct < 0 ? '#ef5350' : '#aaa' }}>
                      {pick.performancePct != null ? `${pick.performancePct > 0 ? '+' : ''}${pick.performancePct}%` : '—'}
                    </span>
                    <span style={{ color: '#999', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.note || ''}</span>
                    <button
                      onClick={async () => {
                        const newActive = !(pick.active !== false);
                        const res = await fetch(`/api/admin/jg-picks/${pick._id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ active: newActive }),
                        });
                        const d = await res.json();
                        if (d.ok) setManualPicks(prev => prev.map(p => String(p._id) === String(pick._id) ? { ...p, active: newActive } : p));
                      }}
                      style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', background: pick.active === false ? '#e8f5e9' : '#fff3f3', color: pick.active === false ? '#22c55e' : '#c0202a' }}
                    >{pick.active === false ? '啟用' : '停用'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'cms' && (
          <div style={{ maxWidth: '1200px' }}>
            {/* Header + actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontWeight: 700, fontSize: '18px' }}>📝 文章候選上架</h2>
              <button onClick={fetchCmsData} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>刷新</button>
            </div>

            {isAdmin === false && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', background: '#fff8e1', border: '1px solid #f6cc4a', fontSize: '14px', fontWeight: 500, color: '#856404' }}>
                ⚠️ 尚未設定 ADMIN_EMAILS，文章管理操作已鎖定
              </div>
            )}
            {cmsMsg && (
              <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '12px', background: cmsMsg.startsWith('✅') ? '#f0fff4' : '#fff5f5', border: `1px solid ${cmsMsg.startsWith('✅') ? '#68d391' : '#fc8181'}`, fontSize: '14px' }}>
                {cmsMsg}
              </div>
            )}
            {cmsError && <div style={{ color: 'red', marginBottom: '12px' }}>❌ {cmsError}</div>}
            {draftError && <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '12px', background: '#fff5f5', border: '1px solid #fc8181', fontSize: '14px', color: '#c53030' }}>❌ 草稿生成失敗：{draftError} <button onClick={() => setDraftError(null)} style={{ marginLeft: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#888' }}>×</button></div>}
            {draftResult && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', background: '#f0fff4', border: '1px solid #68d391', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong>📊 生成結果摘要</strong>
                  <button onClick={() => setDraftResult(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888' }}>×</button>
                </div>
                {draftResult.selectedMarketDirection && (
                  <div style={{ marginBottom: '6px' }}>🧭 <strong>市場方向</strong>：{draftResult.selectedMarketDirection}（符合度 {draftResult.marketDirectionFitScore}）</div>
                )}
                {Array.isArray(draftResult.jgAngleCandidates) && draftResult.jgAngleCandidates.length > 0 && (
                  <div style={{ marginBottom: '6px' }}>
                    💡 <strong>JG 觀點候選</strong>：
                    <ol style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                      {draftResult.jgAngleCandidates.map((c: string, i: number) => <li key={i}>{c}</li>)}
                    </ol>
                  </div>
                )}
                {Array.isArray(draftResult.relatedRecentArticles) && draftResult.relatedRecentArticles.length > 0 && (
                  <div>
                    🔗 <strong>相關近期文章</strong>：{draftResult.relatedRecentArticles.map((a: any) => `${a.title}（${a.fitScore}）`).join('、')}
                  </div>
                )}
              </div>
            )}
            {cmsLoading && <div style={{ color: '#888', marginBottom: '12px' }}>載入中…</div>}

            {/* Preview modal */}
            {(cmsPreview || cmsPreviewLoading) && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setCmsPreview(null)}>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '16px' }}>預覽</strong>
                    <button onClick={() => setCmsPreview(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                  </div>
                  {cmsPreviewLoading && <div>載入中…</div>}
                  {cmsPreview && (
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{cmsPreview.video_title || cmsPreview.jgTitle || cmsPreview.title || cmsPreview.articleTitle || cmsPreview.topic || cmsPreview.expert_name || '(no title)'}</div>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                        topic: {cmsPreview.topic || '—'} | ticker: {cmsPreview.ticker || cmsPreview.topic_ticker || '—'} | source: {cmsPreview.channel || cmsPreview.source_type || cmsPreview.source || '—'} | status: {cmsPreview.status || 'n/a'}
                      </div>
                      {cmsPreview.lintErrors?.length > 0 && (
                        <div style={{ background: '#fff5f5', padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
                          <strong>Lint errors:</strong> {cmsPreview.lintErrors.join(', ')}
                        </div>
                      )}
                      {/* Tab navigation */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
                        {(['draft', 'insights', 'insightsV2', 'transcript', 'source'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => {
                              setPreviewTab(tab);
                              const ytIdForTranscript = cmsPreview?.youtube_id || cmsPreview?.rawExpertInsight?.youtube_id;
                              if (tab === 'transcript' && ytIdForTranscript && !transcriptData) {
                                loadTranscript(ytIdForTranscript);
                              }
                            }}
                            style={{
                              padding: '4px 12px', fontSize: 13, borderRadius: 4, cursor: 'pointer',
                              background: previewTab === tab ? '#c9a84c' : '#eee',
                              color: previewTab === tab ? '#000' : '#666', border: 'none', fontWeight: previewTab === tab ? 700 : 400,
                            }}
                          >
                            {tab === 'draft' ? '📝 草稿' : tab === 'insights' ? '🔑 Key Insights' : tab === 'insightsV2' ? '🔬 V2 全文洞察' : tab === 'transcript' ? '📄 Transcript' : '🔗 Source'}
                          </button>
                        ))}
                      </div>

                      {/* Tab: draft — uses normalizeSummary */}
                      {previewTab === 'draft' && (() => {
                        const norm = normalizeSummary(cmsPreview);
                        return (
                        <div>
                          {norm.displayDraft ? (
                            <div>
                              {norm.displayDraftSource && <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>顯示來源：{norm.displayDraftSource}</div>}
                              {norm.warnings.length > 0 && <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '6px' }}>⚠️ {norm.warnings.join('; ')}</div>}
                              {editingDraftId === cmsPreview._id ? (
                                <div>
                                  {editingContentSource
                                    ? <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>目前編輯來源：{editingContentSource}</div>
                                    : <div style={{ fontSize: '12px', color: '#ef4444', background: '#fff5f5', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #fecaca' }}>找不到可編輯正文</div>
                                  }
                                  <textarea
                                    value={editingDraftText}
                                    onChange={e => setEditingDraftText(e.target.value)}
                                    rows={20}
                                    style={{ width: '100%', fontSize: '13px', lineHeight: 1.6, fontFamily: 'monospace', border: '1px solid #ccc', borderRadius: '6px', padding: '10px', resize: 'vertical', boxSizing: 'border-box' }}
                                  />
                                  {draftSaveMsg && <div style={{ marginTop: '6px', fontSize: '12px', color: draftSaveMsg.startsWith('✅') ? '#22c55e' : draftSaveMsg.startsWith('⚠️') ? '#f59e0b' : '#ef4444' }}>{draftSaveMsg}</div>}
                                  {draftWarning && <div style={{ marginTop: '6px', fontSize: '12px', color: '#f59e0b', background: '#fffbeb', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fde68a' }}>{draftWarning}</div>}
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                    <button
                                      disabled={savingDraft || !norm.canEdit}
                                      onClick={async () => {
                                        if (!editingDraftText.trim()) {
                                          setDraftSaveMsg('❌ 草稿內容不能為空');
                                          return;
                                        }
                                        setSavingDraft(true); setDraftSaveMsg(null); setDraftWarning(null);
                                        try {
                                          const r = await fetch('/api/admin/insights/save-draft', {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ summary_id: cmsPreview._id, editedArticleDraft: editingDraftText }),
                                          });
                                          const d = await r.json();
                                          if (d.ok) {
                                            const msg = d.warning ? `✅ 已儲存 ⚠️ ${d.warning}` : '✅ 草稿已儲存';
                                            if (/【JG 觀點待補】|TODO/i.test(editingDraftText)) {
                                              setDraftWarning('⚠️ 此草稿仍含後台提示（【JG 觀點待補】或 TODO），不能發佈');
                                            }
                                            setDraftSaveMsg(msg);
                                            setCmsPreview((prev: any) => ({ ...prev, editedArticleDraft: editingDraftText }));
                                            setCmsData((prev: any) => {
                                              if (!prev) return prev;
                                              const updateList = (list: any[]) => list?.map((item: any) => item._id === cmsPreview._id ? { ...item, editedArticleDraft: editingDraftText } : item);
                                              return {
                                                ...prev,
                                                rawMaterial: updateList(prev.rawMaterial),
                                                candidate: updateList(prev.candidate),
                                                needsReview: updateList(prev.needsReview),
                                                published: updateList(prev.published),
                                                unpublished: updateList(prev.unpublished),
                                                invalid: updateList(prev.invalid),
                                                sectionB: updateList(prev.sectionB),
                                                publishedSummaries: updateList(prev.publishedSummaries),
                                                unpublishedSummaries: updateList(prev.unpublishedSummaries),
                                              };
                                            });
                                            setEditingDraftId(null);
                                            fetchCmsData();
                                          } else {
                                            setDraftSaveMsg(`❌ ${d.error}`);
                                          }
                                        } catch { setDraftSaveMsg('❌ 網路錯誤'); }
                                        finally { setSavingDraft(false); }
                                      }}
                                      style={{ padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                    >{savingDraft ? '儲存中...' : '💾 儲存草稿'}</button>
                                    <button onClick={() => { setEditingDraftId(null); setEditingContentSource(null); setDraftSaveMsg(null); setDraftWarning(null); }} style={{ padding: '6px 14px', background: '#e5e7eb', color: '#555', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>取消</button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto', background: '#f8f8f8', padding: '12px', borderRadius: '6px' }}>
                                    {norm.displayDraft}
                                  </div>
                                  {draftSaveMsg && <div style={{ marginTop: '6px', fontSize: '12px', color: '#22c55e' }}>{draftSaveMsg}</div>}
                                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={() => {
                                        setEditingDraftId(cmsPreview._id);
                                        setEditingDraftText(norm.editableContent);
                                        setEditingContentSource(norm.editableContentSource);
                                        setDraftSaveMsg(null);
                                        setDraftWarning(null);
                                      }}
                                      style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                                    >✏️ 編輯草稿</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {norm.warnings.length > 0 && (
                                <div style={{ fontSize: '12px', color: '#ef4444', background: '#fff5f5', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                  {norm.warnings.join('; ')}
                                </div>
                              )}
                              {(cmsPreview.expert_name || cmsPreview.expert_org || cmsPreview.expert_role || cmsPreview.expert_title) && (
                                <div style={{ background: '#f0f4ff', padding: '10px 12px', borderRadius: '6px', fontSize: '13px' }}>
                                  <strong>👤 專家</strong>：{[cmsPreview.expert_name, cmsPreview.expert_role || cmsPreview.expert_title, cmsPreview.expert_org || cmsPreview.expert_institution].filter(Boolean).join(' / ')}
                                </div>
                              )}
                              {(cmsPreview.ticker || cmsPreview.topic_ticker || cmsPreview.topic || cmsPreview.url) && (
                                <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '6px', fontSize: '13px' }}>
                                  <strong>📌 標的</strong>：ticker={cmsPreview.ticker || cmsPreview.topic_ticker || '—'} | topic={cmsPreview.topic || '—'}{cmsPreview.url ? <> | <a href={cmsPreview.url} target="_blank" rel="noreferrer" style={{ color: '#0070f3' }}>來源連結</a></> : null}
                                </div>
                              )}
                              {(cmsPreview.transcript_sample || cmsPreview.rawExpertInsight?.transcript_sample) && (
                                <div style={{ background: '#f8f8f8', padding: '10px 12px', borderRadius: '6px', fontSize: '13px' }}>
                                  <strong>📝 Transcript（前段）</strong>
                                  <div style={{ marginTop: '6px', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '200px', overflowY: 'auto', color: '#444' }}>
                                    {String(cmsPreview.transcript_sample || cmsPreview.rawExpertInsight?.transcript_sample).slice(0, 600)}{String(cmsPreview.transcript_sample || cmsPreview.rawExpertInsight?.transcript_sample).length > 600 ? '…' : ''}
                                  </div>
                                </div>
                              )}
                              {!norm.keyInsights.length && !(cmsPreview.transcript_sample || cmsPreview.rawExpertInsight?.transcript_sample) && (
                                <div style={{ color: '#aaa', fontSize: '13px', padding: '12px', textAlign: 'center' }}>(無文章內容、無 key_insights、無 transcript_sample)</div>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })()}

                      {/* Tab: insights — uses normalizeSummary */}
                      {previewTab === 'insights' && (() => {
                        const norm = normalizeSummary(cmsPreview);
                        const kiList = norm.keyInsights;
                        const kiCount = cmsPreview.keyInsightsCount || kiList.length || 0;
                        const extractionMode = cmsPreview.insightExtractionMode || cmsPreview.rawExpertInsight?.insightExtractionMode || 'unknown';
                        const coverageRatio = cmsPreview.transcriptCoverageRatio ?? cmsPreview.rawExpertInsight?.transcriptCoverageRatio ?? 0;
                        const coverageWarning = cmsPreview.coverageWarning || cmsPreview.rawExpertInsight?.coverageWarning;
                        const transcriptSegments = cmsPreview.transcriptSegments ?? cmsPreview.rawExpertInsight?.transcriptSegments;
                        return (
                        <div>
                          <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 12, color: '#856404', fontWeight: 600 }}>⚠️ Legacy 原始片段（英文，非正式中文洞察）— 請使用 🔬 V2 全文洞察 tab 閱讀完整中文內容</div>
                          <div style={{ fontSize: 12, marginBottom: 8 }}>
                            <span style={{ color: '#888' }}>
                              {kiCount} 條 | 模式: {extractionMode}
                              {transcriptSegments != null && <>{' | '}segments: {transcriptSegments}</>}
                            </span>
                            {' '}
                            {cmsPreview?.keyInsightsV2Status === 'completed'
                              ? <span style={{ color: '#9ca3af' }}>此為舊版片段，未做全文覆蓋；正式全文洞察請看 ✅ V2 正式洞察 tab。</span>
                              : coverageRatio >= 0.95
                                ? <span style={{ color: '#4ade80' }}>✅ 已覆蓋完整逐字稿 ({Math.round(coverageRatio * 100)}%)</span>
                                : <span style={{ color: '#9ca3af' }}>舊版片段（部分覆蓋 {Math.round(coverageRatio * 100)}%），正式洞察請看 V2 tab</span>
                            }
                            {coverageWarning && (
                              <div style={{ color: '#fbbf24', marginTop: 4 }}>{coverageWarning}</div>
                            )}
                            {cmsPreview.keyInsightsUpdatedAt && (
                              <div style={{ color: '#666', marginTop: 2 }}>更新: {new Date(cmsPreview.keyInsightsUpdatedAt).toLocaleDateString()}</div>
                            )}
                          </div>
                          {kiList.length > 0 ? (
                            kiList.map((ki: Record<string, unknown> | string, i: number) => {
                              const text = typeof ki === 'string' ? ki : (ki as Record<string, unknown>).insight as string || JSON.stringify(ki);
                              const topic = typeof ki !== 'string' ? (ki as Record<string, unknown>).topic as string : undefined;
                              const tickers = typeof ki !== 'string' && Array.isArray((ki as Record<string, unknown>).tickers) ? ((ki as Record<string, unknown>).tickers as string[]).join(', ') : undefined;
                              return (
                              <div key={i} style={{ marginBottom: 8, padding: '8px', background: '#fffbeb', borderRadius: 4, fontSize: 13 }}>
                                <span style={{ color: '#c9a84c', marginRight: 8, fontWeight: 700 }}>{i + 1}.</span>{text}
                                {(topic || tickers) && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{topic && <span>📌 {topic}</span>}{tickers && <span style={{ marginLeft: 8 }}>🏷️ {tickers}</span>}</div>}
                              </div>
                              );
                            })
                          ) : (
                            <div style={{ color: '#aaa', fontSize: 13, padding: 12, textAlign: 'center' }}>(無 key_insights)</div>
                          )}
                        </div>
                        );
                      })()}

                      {/* Tab: Key Insights V2 */}
                      {previewTab === 'insightsV2' && (() => {
                        const v2List: any[] = cmsPreview?.keyInsightsV2 || [];
                        const cr = cmsPreview?.coverageReport as { transcriptCharLength?: number; totalChunks?: number; processedChunks?: number; skippedChunks?: number; coveragePercent?: number; maxUncoveredGap?: number } | undefined;
                        const jobStatus = cmsPreview?.keyInsightsV2Status as string | undefined;
                        const sorted = [...v2List].sort((a, b) => {
                          if (v2SortMode === 'position') return (a.sourceCharStart ?? 0) - (b.sourceCharStart ?? 0);
                          return ((b.investmentRelevanceScore ?? 0) + (b.importanceScore ?? 0)) - ((a.investmentRelevanceScore ?? 0) + (a.importanceScore ?? 0));
                        });
                        return (
                        <div>
                          {/* Coverage Report */}
                          {(cr || cmsPreview?.transcriptCharLength) && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                              <div style={{ fontWeight: 700, marginBottom: 4, color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
                                <span>📊 Coverage Report</span>
                                {jobStatus && (
                                  <span style={{
                                    padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                    background: jobStatus === 'completed' ? '#dcfce7' : jobStatus === 'running' ? '#dbeafe' : jobStatus === 'partial' ? '#fef3c7' : jobStatus === 'failed' ? '#fee2e2' : '#f3f4f6',
                                    color: jobStatus === 'completed' ? '#166534' : jobStatus === 'running' ? '#1e40af' : jobStatus === 'partial' ? '#92400e' : jobStatus === 'failed' ? '#991b1b' : '#374151',
                                  }}>
                                    {jobStatus.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px', color: '#333' }}>
                                <span>📝 Transcript: {(cmsPreview?.transcriptCharLength ?? cr?.transcriptCharLength ?? 0).toLocaleString()} chars</span>
                                <span>🧩 Total Chunks: {cmsPreview?.totalChunks ?? cr?.totalChunks ?? 0}</span>
                                <span style={{ fontWeight: 700, color: (cmsPreview?.coveragePercent ?? cr?.coveragePercent ?? 0) >= 90 ? '#16a34a' : '#d97706' }}>📊 Coverage: {cmsPreview?.coveragePercent ?? cr?.coveragePercent ?? 0}%</span>
                                <span>✅ Processed: {cmsPreview?.processedChunks ?? cr?.processedChunks ?? 0}/{cmsPreview?.totalChunks ?? cr?.totalChunks ?? 0}</span>
                                {(cmsPreview?.failedChunks ?? 0) > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>❌ Failed: {cmsPreview?.failedChunks ?? 0}</span>}
                                <span>💡 Insights: {cmsPreview?.insightsCount ?? v2List.length}</span>
                                {cmsPreview?.modelUsed && <span style={{ color: '#6b7280' }}>🤖 Model: {cmsPreview.modelUsed}</span>}
                                {cmsPreview?.keyInsightsV2StartedAt && <span style={{ color: '#6b7280' }}>🚀 Started: {new Date(cmsPreview.keyInsightsV2StartedAt).toLocaleString()}</span>}
                                {cmsPreview?.keyInsightsV2CompletedAt && <span style={{ color: '#6b7280' }}>🏁 Completed: {new Date(cmsPreview.keyInsightsV2CompletedAt).toLocaleString()}</span>}
                              </div>
                              {cmsPreview?.lastError && (
                                <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: '#fee2e2', padding: '4px 8px', borderRadius: 4 }}>⚠️ Last Error: {String(cmsPreview.lastError).substring(0, 200)}</div>
                              )}
                            </div>
                          )}
                          {/* Sort toggle + regenerate */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => setV2SortMode('score')} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: v2SortMode === 'score' ? '#c9a84c' : '#eee', color: v2SortMode === 'score' ? '#000' : '#666', fontWeight: v2SortMode === 'score' ? 700 : 400 }}>📊 依分數排序</button>
                              <button onClick={() => setV2SortMode('position')} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: v2SortMode === 'position' ? '#c9a84c' : '#eee', color: v2SortMode === 'position' ? '#000' : '#666', fontWeight: v2SortMode === 'position' ? 700 : 400 }}>📄 依逐字稿順序</button>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#888' }}>{v2List.length} 條 insights</span>
                              {(!jobStatus || jobStatus === 'not_started') && (
                                <button
                                  disabled={generatingV2Id === cmsPreview?._id}
                                  onClick={async () => {
                                    const id = cmsPreview?._id;
                                    if (!id) return;
                                    setGeneratingV2Id(id);
                                    setCmsMsg(null);
                                    try {
                                      const res = await fetch('/api/admin/insights/v2-job', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'queue', summaryId: id }),
                                      });
                                      const data = await res.json();
                                      if (data.ok) { setCmsMsg(`✅ ${data.message}`); } else { setCmsMsg(`❌ ${data.error}`); }
                                    } catch { setCmsMsg('❌ 網路錯誤'); }
                                    finally { setGeneratingV2Id(null); }
                                  }}
                                  style={{ padding: '4px 12px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: '#7c3aed', color: '#fff', fontWeight: 600, opacity: generatingV2Id === cmsPreview?._id ? 0.6 : 1 }}
                                >
                                  📋 Queue V2
                                </button>
                              )}
                              {(jobStatus === 'partial' || jobStatus === 'failed') && (
                                <button
                                  disabled={generatingV2Id === cmsPreview?._id}
                                  onClick={async () => {
                                    const id = cmsPreview?._id;
                                    if (!id) return;
                                    setGeneratingV2Id(id);
                                    setCmsMsg(null);
                                    try {
                                      const res = await fetch('/api/admin/insights/v2-job', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'resume', summaryId: id }),
                                      });
                                      const data = await res.json();
                                      if (data.ok) { setCmsMsg(`✅ ${data.message}`); } else { setCmsMsg(`❌ ${data.error}`); }
                                    } catch { setCmsMsg('❌ 網路錯誤'); }
                                    finally { setGeneratingV2Id(null); }
                                  }}
                                  style={{ padding: '4px 12px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: '#d97706', color: '#fff', fontWeight: 600 }}
                                >
                                  🔄 Resume V2
                                </button>
                              )}
                              {((cmsPreview?.failedChunks ?? 0) > 0) && (
                                <button
                                  disabled={generatingV2Id === cmsPreview?._id}
                                  onClick={async () => {
                                    const id = cmsPreview?._id;
                                    if (!id) return;
                                    setGeneratingV2Id(id);
                                    setCmsMsg(null);
                                    try {
                                      const res = await fetch('/api/admin/insights/v2-job', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'retry-failed', summaryId: id }),
                                      });
                                      const data = await res.json();
                                      if (data.ok) { setCmsMsg(`✅ ${data.message}`); } else { setCmsMsg(`❌ ${data.error}`); }
                                    } catch { setCmsMsg('❌ 網路錯誤'); }
                                    finally { setGeneratingV2Id(null); }
                                  }}
                                  style={{ padding: '4px 12px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: '#dc2626', color: '#fff', fontWeight: 600 }}
                                >
                                  🔁 Retry Failed
                                </button>
                              )}
                              {jobStatus && jobStatus !== 'not_started' && (
                                <button
                                  disabled={generatingV2Id === cmsPreview?._id}
                                  onClick={async () => {
                                    const id = cmsPreview?._id;
                                    if (!id || !confirm('確定要重置此文章的 V2 資料嗎？所有 insights 會被清除。')) return;
                                    setGeneratingV2Id(id);
                                    setCmsMsg(null);
                                    try {
                                      const res = await fetch('/api/admin/insights/v2-job', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'reset', summaryId: id, confirmed: true }),
                                      });
                                      const data = await res.json();
                                      if (data.ok) {
                                        setCmsMsg(`✅ ${data.message}`);
                                        const previewRes = await fetch(`/api/admin/insights/preview?id=${id}`);
                                        const previewData = await previewRes.json();
                                        if (previewData.ok) setCmsPreview(previewData.summary || previewData.doc);
                                      } else { setCmsMsg(`❌ ${data.error}`); }
                                    } catch { setCmsMsg('❌ 網路錯誤'); }
                                    finally { setGeneratingV2Id(null); }
                                  }}
                                  style={{ padding: '4px 12px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: '#6b7280', color: '#fff', fontWeight: 600 }}
                                >
                                  🗑️ Reset V2
                                </button>
                              )}
                            </div>
                          </div>
                          {cmsPreview?.keyInsightsV2GeneratedAt && (
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>產生於: {new Date(cmsPreview.keyInsightsV2GeneratedAt).toLocaleString()}</div>
                          )}
                          {/* Insight cards */}
                          {sorted.length > 0 ? sorted.map((ins: any, i: number) => (
                            <details key={i} style={{ marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                              <summary style={{ padding: '10px 14px', cursor: 'pointer', background: '#fefce8', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ color: '#c9a84c', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600 }}>{ins.zhTitle || ins.insightTitle}</div>
                                  {ins.zhTitle && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{ins.insightTitle}</div>}
                                  <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{ins.zhSummary}</div>
                                  <div style={{ fontSize: 11, color: '#888', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <span style={{ color: ins.investmentRelevanceScore >= 70 ? '#16a34a' : ins.investmentRelevanceScore >= 40 ? '#d97706' : '#9ca3af' }}>投資:</span>
                                      <span style={{ display: 'inline-block', width: 40, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${ins.investmentRelevanceScore ?? 0}%`, background: ins.investmentRelevanceScore >= 70 ? '#16a34a' : ins.investmentRelevanceScore >= 40 ? '#d97706' : '#9ca3af', borderRadius: 3 }} /></span>
                                      <span>{ins.investmentRelevanceScore}</span>
                                    </span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <span>重要:</span>
                                      <span style={{ display: 'inline-block', width: 40, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${ins.importanceScore ?? 0}%`, background: ins.importanceScore >= 70 ? '#2563eb' : ins.importanceScore >= 40 ? '#6366f1' : '#9ca3af', borderRadius: 3 }} /></span>
                                      <span>{ins.importanceScore}</span>
                                    </span>
                                    <span>Chunk {(ins.chunkIndex ?? 0) + 1}/{ins.totalChunks}</span>
                                    {ins.tickers?.length > 0 && <span style={{ color: '#f59e0b' }}>🏷️ {ins.tickers.join(', ')}</span>}
                                  </div>
                                </div>
                              </summary>
                              <div style={{ padding: '10px 14px', background: '#f9fafb', fontSize: 12 }}>
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>📝 原始逐字稿段落</div>
                                  <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto', color: '#333' }}>
                                    {ins.sourceExcerpt}
                                  </div>
                                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>位置: chars {(ins.sourceCharStart ?? 0).toLocaleString()}–{(ins.sourceCharEnd ?? 0).toLocaleString()}{ins.timestampStart && ` | ⏱ ${ins.timestampStart}–${ins.timestampEnd || '?'}`}</div>
                                </div>
                                {ins.zhEvidenceSummary && <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600, color: '#374151' }}>🔍 佐證摘要: </span><span style={{ color: '#555' }}>{ins.zhEvidenceSummary}</span></div>}
                                {ins.whyItMatters && <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600, color: '#374151' }}>💡 為什麼重要: </span><span style={{ color: '#555' }}>{ins.whyItMatters}</span></div>}
                                {ins.suggestedArticleAngle && <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600, color: '#374151' }}>✍️ 文章角度: </span><span style={{ color: '#555' }}>{ins.suggestedArticleAngle}</span></div>}
                                {ins.companies?.length > 0 && <div style={{ fontSize: 11, color: '#6b7280' }}>🏢 {ins.companies.join(', ')}</div>}
                                {ins.topicTags?.length > 0 && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>🏷️ {ins.topicTags.join(', ')}</div>}
                              </div>
                            </details>
                          )) : (
                            <div style={{ color: '#aaa', fontSize: 13, padding: 16, textAlign: 'center', background: '#f9fafb', borderRadius: 8, border: '1px dashed #e5e5e5' }}>
                              尚未產生 Key Insights V2。點擊「🔬 重新產生 V2」開始。
                            </div>
                          )}
                        </div>
                        );
                      })()}

                      {/* Tab: transcript */}
                      {previewTab === 'transcript' && (
                        <div>
                          {transcriptLoading && <div style={{ color: '#888' }}>載入中...</div>}
                          {transcriptError && <div style={{ color: '#d32f2f' }}>⚠️ {transcriptError}</div>}
                          {transcriptData && (
                            <div>
                              <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '5px 10px', marginBottom: 8, fontSize: 12, color: '#856404' }}>
                                📜 原文進字稿（英文）— 屬於 worker 輸入原料，主閱讀請使用 🔬 V2 全文洞察 tab
                              </div>
                              <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
                                {transcriptData.transcriptLength?.toLocaleString()} chars | 抓取: {transcriptData.fetchedAt ? new Date(transcriptData.fetchedAt).toLocaleDateString() : 'N/A'} | 到期: {transcriptData.expiresAt ? new Date(transcriptData.expiresAt).toLocaleDateString() : 'N/A'}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, maxHeight: 400, overflowY: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {transcriptData.fullTranscript}
                              </div>
                            </div>
                          )}
                          {!transcriptLoading && !transcriptError && !transcriptData && (cmsPreview?.transcript_sample || cmsPreview?.rawExpertInsight?.transcript_sample) && (
                            <div>
                              <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Transcript Sample（前 600 字）</div>
                              <div style={{ fontSize: 13, color: '#444', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>{cmsPreview.transcript_sample || cmsPreview.rawExpertInsight?.transcript_sample}</div>
                            </div>
                          )}
                          {!transcriptLoading && !transcriptError && !transcriptData && !cmsPreview?.transcript_sample && !cmsPreview?.rawExpertInsight?.transcript_sample && (
                            <div style={{ color: '#aaa', fontSize: 13, padding: 12, textAlign: 'center' }}>(無逐字稿資料)</div>
                          )}
                        </div>
                      )}

                      {/* Tab: source — uses normalizeSummary */}
                      {previewTab === 'source' && (() => {
                        const norm = normalizeSummary(cmsPreview);
                        return (
                        <div style={{ fontSize: 13 }}>
                          {norm.youtubeId && (
                            <div style={{ marginBottom: 8 }}>
                              <a href={`https://www.youtube.com/watch?v=${norm.youtubeId}`} target="_blank" rel="noopener noreferrer"
                                style={{ color: '#0070f3', textDecoration: 'underline' }}>
                                ▶ 在 YouTube 觀看原影片
                              </a>
                            </div>
                          )}
                          <div style={{ color: '#888', fontSize: 12 }}>
                            <div>youtube_id: {norm.youtubeId || 'N/A'}</div>
                            <div>channel: {norm.displayChannel || 'N/A'}</div>
                            <div>source: {norm.displaySource || 'N/A'}</div>
                            <div>sourceDate: {norm.displaySourceDate || 'N/A'}</div>
                            <div>sourceExpertInsightId: {cmsPreview?.sourceExpertInsightId || cmsPreview?.expertInsightId || 'N/A'}</div>
                            <div>enrichmentModel: {cmsPreview?.enrichmentModel || 'N/A'}</div>
                            <div>insightExtractionMode: {cmsPreview?.insightExtractionMode || cmsPreview?.rawExpertInsight?.insightExtractionMode || 'N/A'}</div>
                            <div>transcriptAvailable: {norm.transcriptAvailable ? 'Yes' : 'No'}</div>
                            <div>transcriptLength: {norm.transcriptLength?.toLocaleString() || 'N/A'}</div>
                            <div>transcriptSource: {norm.transcriptSource || 'N/A'}</div>
                            <div>workerInputField: video_transcripts.fullTranscript (via youtube_id fallback)</div>
                            {norm.transcriptMetadataWarnings.length > 0 && (
                              <div style={{ color: '#f59e0b', marginTop: 4 }}>⚠️ {norm.transcriptMetadataWarnings.join('; ')}</div>
                            )}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Edit metadata modal */}
            {cmsEditId && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setCmsEditId(null)}>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '90%' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <strong>編輯 Metadata</strong>
                    <button onClick={() => setCmsEditId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                  </div>
                  {[['jgTitle', 'JG Title'], ['displaySection', 'Display Section'], ['articleType', 'Article Type'], ['sortOrder', 'Sort Order']].map(([k, label]) => (
                    <div key={k} style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>{label}</label>
                      <input
                        value={cmsEditMeta[k] ?? ''}
                        onChange={e => setCmsEditMeta(m => ({ ...m, [k]: k === 'sortOrder' ? Number(e.target.value) : e.target.value }))}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px' }}
                        type={k === 'sortOrder' ? 'number' : 'text'}
                      />
                    </div>
                  ))}
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>isPinned</label>
                    <input type="checkbox" checked={!!cmsEditMeta.isPinned} onChange={e => setCmsEditMeta(m => ({ ...m, isPinned: e.target.checked }))} />
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Tags (comma-separated)</label>
                    <input
                      value={Array.isArray(cmsEditMeta.tags) ? cmsEditMeta.tags.join(', ') : (cmsEditMeta.tags || '')}
                      onChange={e => setCmsEditMeta(m => ({ ...m, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) }))}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                  <button
                    onClick={async () => {
                      await cmsAction('/api/admin/insights/update-status', { id: cmsEditId, action: 'updateMetadata', metadata: cmsEditMeta }, '元資料已更新');
                      setCmsEditId(null);
                    }}
                    style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#c0202a', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                  >儲存</button>
                </div>
              </div>
            )}

            {/* A. New expert_insights */}
            <section style={{ marginBottom: '32px' }}>
              {/* 自動挑片 區塊 */}
              <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="text-sm font-semibold text-gray-300 mb-2">🧭 自動挑選值得處理的影片</div>

                <textarea
                  value={rankingContext}
                  onChange={e => setRankingContext(e.target.value)}
                  placeholder={`近期市場方向（可選）：\n熱錢很多，但市場開始注意 AI 泡沫風險。\n市場還很樂觀，但如果通膨或利率預期變動，資金可能會重新定價高估值資產。`}
                  rows={2}
                  className="w-full text-xs bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 resize-y mb-2"
                />

                <textarea
                  value={manualKeywords}
                  onChange={e => setManualKeywords(e.target.value)}
                  placeholder="手動關鍵字 / 股票（例如：RKLB, MSTR, AI power, bitcoin treasury）"
                  rows={2}
                  className="w-full text-xs bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 resize-y mb-2"
                />

                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useKeywordPool}
                      onChange={e => setUseKeywordPool(e.target.checked)}
                      className="rounded"
                    />
                    使用 JG Keyword Pool（Watchlist + Picks）
                  </label>
                  {useKeywordPool && keywordPoolCount !== null && (
                    <span className="text-xs text-gray-400">（{keywordPoolCount} 個關鍵字）</span>
                  )}
                </div>

                <button
                  onClick={handleRankVideos}
                  disabled={isRanking}
                  className="text-sm px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded"
                >
                  {isRanking ? '評分中...' : '🧭 自動挑選'}
                </button>
                {rankingMsg && <div className="text-xs text-gray-300 mt-2">{rankingMsg}</div>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #e5e5e5', paddingBottom: '6px' }}>
                <h3 style={{ fontWeight: 700, fontSize: '16px', margin: 0 }}>
                  A. 新掃描內容 ({cmsData?.newExpertInsights.length ?? 0})
                  {(cmsData as any)?.sectionAIrrelevantCount > 0 && (
                    <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 400, marginLeft: '8px' }}>
                      (另有 {(cmsData as any).sectionAIrrelevantCount} 支 irrelevant 已隱藏)
                    </span>
                  )}
                </h3>
                <button
                  onClick={async () => {
                    setCmsMsg(null);
                    try {
                      const res = await fetch('/api/admin/insights/sync-video-queue', { method: 'POST' });
                      const data = await res.json();
                      if (data.ok) {
                        setCmsMsg(`✅ 同步完成：${data.synced} 筆新增，${data.skipped} 筆已存在`);
                        fetchCmsData();
                      } else {
                        setCmsMsg(`❌ 同步失敗：${data.error}`);
                      }
                    } catch {
                      setCmsMsg('❌ 同步失敗：網路錯誤');
                    }
                  }}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  🔄 同步頻道素材
                </button>
              </div>
              {!cmsData?.newExpertInsights.length && !cmsLoading && (
                <div style={{ color: '#888', fontSize: '14px' }}>無新內容（請點「同步頻道素材」從 video_queue 導入）</div>
              )}
              {cmsData?.newExpertInsights.map((ins: any) => {
                const displayTitle =
                  ins.video_title ||
                  ins.title ||
                  ins.topic ||
                  (ins.expert_name && ins.topic ? `${ins.expert_name} — ${ins.topic}` : null) ||
                  ins.expert_name ||
                  '(no title)';
                const metaParts = [
                  ins.ticker || ins.topic_ticker,
                  ins.topic,
                  ins.expert_name,
                  ins.channel || ins.source_type,
                  ins.status || 'new',
                ].map((p: any) => p || '—').join(' / ');
                const snippet =
                  (Array.isArray(ins.key_insights) && ins.key_insights[0]) ||
                  ins.note ||
                  ins.transcript_sample?.slice(0, 120) ||
                  '無摘要';
                const hasTitle = !!(ins.video_title || ins.title);
                const hasTicker = !!(ins.ticker || ins.topic_ticker);
                const hasKeyInsights = Array.isArray(ins.key_insights) && ins.key_insights.length > 0;
                const hasTranscript = !!ins.transcript_sample;
                const onlyExpertName = !hasTitle && !hasTicker && !hasKeyInsights && !hasTranscript && !!ins.expert_name;
                return (
                  <div key={ins._id} style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>{displayTitle}</span>
                          {!hasTitle && <span style={{ fontSize: '11px', background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: '4px' }}>🔴 缺title</span>}
                          {!hasTicker && <span style={{ fontSize: '11px', background: '#fef9c3', color: '#854d0e', padding: '1px 6px', borderRadius: '4px' }}>🟡 缺ticker</span>}
                          {hasKeyInsights && <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px' }}>🟢 key_insights</span>}
                          {hasTranscript && <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px' }}>🔵 transcript</span>}
                          {onlyExpertName && <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }}>⚠️ 格式異常</span>}
                          {ins.enrichmentStatus === 'needs_transcript_or_insights' && (
                            <>
                              <span style={{ fontSize: '11px', background: '#431407', color: '#fb923c', padding: '1px 6px', borderRadius: '4px' }}>⚠️ 需補逐字稿</span>
                              <button
                                onClick={async () => {
                                  setEnrichingId(ins._id)
                                  try {
                                    const res = await fetch('/api/admin/insights/enrich-video', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ expertInsightId: ins._id })
                                    })
                                    const data = await res.json()
                                    if (data.ok) {
                                      setCmsMsg(`✅ 已補 ${data.keyInsightsCount} 條 key insights`)
                                      fetchCmsData()
                                    } else {
                                      const reason = data.enrichmentStatus === 'transcript_unavailable' ? '無可用字幕'
                                        : data.enrichmentStatus === 'irrelevant' ? '影片不相關'
                                        : '補充失敗：' + (data.reason || data.error || '未知錯誤')
                                      setCmsMsg(`⚠️ ${reason}`)
                                      fetchCmsData()
                                    }
                                  } catch {
                                    setCmsMsg('⚠️ 網路錯誤')
                                  } finally {
                                    setEnrichingId(null)
                                  }
                                }}
                                disabled={enrichingId === ins._id}
                                style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '4px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: enrichingId === ins._id ? 'wait' : 'pointer', opacity: enrichingId === ins._id ? 0.6 : 1 }}
                              >
                                {enrichingId === ins._id ? '補充中...' : '🔍 補充逐字稿'}
                              </button>
                            </>
                          )}
                          {ins.enrichmentStatus === 'enriched' && (
                            <span style={{ fontSize: '11px', background: '#052e16', color: '#4ade80', padding: '1px 6px', borderRadius: '4px' }}>✅ 已補 key insights</span>
                          )}
                          {ins.enrichmentStatus === 'transcript_unavailable' && (
                            <span style={{ fontSize: '11px', background: '#450a0a', color: '#f87171', padding: '1px 6px', borderRadius: '4px' }}>⚠️ 無可用字幕</span>
                          )}
                          {ins.enrichmentStatus === 'irrelevant' && (
                            <span style={{ fontSize: '11px', background: '#1f2937', color: '#9ca3af', padding: '1px 6px', borderRadius: '4px' }}>⏭️ 影片不相關</span>
                          )}
                          {ins.enrichmentStatus === 'transcript_too_short' && (
                            <span style={{ fontSize: '11px', background: '#7f1d1d', color: '#fca5a5', padding: '1px 6px', borderRadius: '4px' }}>⚠️ 逐字稿太短，不適合成稿</span>
                          )}
                          {ins.source_type === 'video_queue' && (
                            <span style={{ fontSize: '11px', background: '#1e3a5f', color: '#60a5fa', padding: '1px 6px', borderRadius: '4px' }}>📡 頻道同步</span>
                          )}
                          {typeof ins.investmentScore === 'number' && (
                            <span style={{ fontSize: '11px', color: '#9ca3af', padding: '1px 6px' }}>投資分: {ins.investmentScore}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>{metaParts}</div>
                        {(() => {
                          const date = ins.publish_date || ins.sourceDate
                          const { label, color, daysAgo } = getFreshnessBadge(date)
                          return (
                            <span className={`text-xs ${color}`} style={{ marginBottom: '4px', display: 'inline-block' }}>
                              {label} {date ? `(${date}${daysAgo !== null ? `, ${daysAgo}天前` : ''})` : ''}
                            </span>
                          )
                        })()}
                        <div style={{ fontSize: '12px', color: '#555' }}>{String(snippet).slice(0, 150)}{String(snippet).length > 150 ? '…' : ''}</div>
                        {/* Triage badges */}
                        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          {ins.triageStatus === 'recommended' && (
                            <span style={{ fontSize: '11px', color: '#86efac', background: 'rgba(20,83,45,0.4)', padding: '1px 8px', borderRadius: '4px', fontWeight: 600 }}>
                              🔥 推薦處理 {ins.priorityScore}分
                            </span>
                          )}
                          {ins.triageStatus === 'needs_review' && (
                            <span style={{ fontSize: '11px', color: '#fde047', background: 'rgba(113,63,18,0.3)', padding: '1px 8px', borderRadius: '4px' }}>
                              🟡 可人工確認 {ins.priorityScore}分
                            </span>
                          )}
                          {ins.triageStatus === 'low_priority' && (
                            <span style={{ fontSize: '11px', color: '#9ca3af', background: 'rgba(55,65,81,0.5)', padding: '1px 8px', borderRadius: '4px' }}>
                              ⚪ 低優先 {ins.priorityScore}分
                            </span>
                          )}
                          {ins.triageStatus === 'irrelevant' && (
                            <span style={{ fontSize: '11px', color: '#6b7280', background: 'rgba(55,65,81,0.3)', padding: '1px 8px', borderRadius: '4px' }}>
                              🚫 不相關
                            </span>
                          )}
                          {!ins.triageStatus && (
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>（尚未自動挑選）</span>
                          )}
                          {ins.enrichmentStatus === 'needs_transcript_or_insights' && !ins.triageStatus && (
                            <span style={{ fontSize: '11px', color: '#60a5fa' }}>📡 最新影片，尚未讀取內容</span>
                          )}
                        </div>
                        {ins.investmentRelevanceScore !== undefined && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                            投資相關:{ins.investmentRelevanceScore} 關鍵字:{ins.keywordMatchScore}
                          </div>
                        )}
                        {ins.priorityReason && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', marginTop: '2px' }}>{ins.priorityReason}</div>
                        )}
                        {Array.isArray(ins.matchedTickers) && ins.matchedTickers.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '3px' }}>
                            🎯 {ins.matchedTickers.join(', ')}
                          </div>
                        )}
                        {Array.isArray(ins.matchedThemes) && ins.matchedThemes.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#60a5fa', marginTop: '2px' }}>
                            🏷️ {ins.matchedThemes.join(' / ')}
                          </div>
                        )}
                        {Array.isArray(ins.matchedMarketThemes) && ins.matchedMarketThemes.length > 0 && !ins.matchedThemes?.length && (
                          <div style={{ fontSize: '11px', color: '#60a5fa', marginTop: '2px' }}>
                            🏷️ {ins.matchedMarketThemes.join(' / ')}
                          </div>
                        )}
                        {/* Article worthiness badge */}
                        {ins.articleDecision === 'draft_candidate' && (
                          <span style={{ fontSize: 11, background: '#166534', color: '#86efac', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                            🔥 適合成文 {ins.articleWorthinessScore}分
                          </span>
                        )}
                        {ins.articleDecision === 'material_only' && (
                          <span style={{ fontSize: 11, background: '#713f12', color: '#fde68a', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                            📚 只放素材庫 {ins.articleWorthinessScore}分
                          </span>
                        )}
                        {ins.articleDecision === 'reject' && (
                          <span style={{ fontSize: 11, background: '#450a0a', color: '#fca5a5', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                            🚫 不建議處理 {ins.articleWorthinessScore}分
                          </span>
                        )}
                        {!ins.articleDecision && ins.enrichmentStatus === 'enriched' && (
                          <span style={{ fontSize: 11, color: '#9ca3af', display: 'inline-block', marginTop: 4 }}>尚未判斷成文價値</span>
                        )}
                        {ins.articleReason && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' }}>{ins.articleReason}</div>
                        )}
                        {Array.isArray(ins.matchedStocks) && ins.matchedStocks.length > 0 && (
                          <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 2 }}>🎯 {ins.matchedStocks.join(', ')}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button onClick={() => openPreview(ins._id, 'expert_insight')} style={btnStyle('#6c757d')}>Preview</button>
                        {ins.enrichmentStatus === 'enriched' && (ins.key_insights?.length > 0 || ins.keyInsights?.length > 0) ? (
                          ins.articleDecision === 'draft_candidate' ? (
                            <button onClick={() => cmsAction('/api/admin/insights/promote', { expertInsightId: ins._id }, '已轉為候選文章')} style={btnStyle('#16a34a')}>➡️ 轉成最新候選</button>
                          ) : ins.articleDecision === 'material_only' ? (
                            <span style={{ fontSize: '11px', color: '#fbbf24', padding: '4px 8px', alignSelf: 'center' }}>📚 已整理為素材，不建議成文</span>
                          ) : ins.articleDecision === 'reject' ? (
                            <span style={{ fontSize: '11px', color: '#f87171', padding: '4px 8px', alignSelf: 'center' }}>🚫 不建議處理</span>
                          ) : (
                            <button
                              onClick={() => handleArticleGate(ins._id)}
                              disabled={enrichingId === ins._id}
                              style={{ ...btnStyle('#7c3aed'), opacity: enrichingId === ins._id ? 0.6 : 1, cursor: enrichingId === ins._id ? 'wait' : 'pointer' }}
                            >
                              {enrichingId === ins._id ? '判斷中...' : '🧠 判斷是否値得成文'}
                            </button>
                          )
                        ) : ins.enrichmentStatus === 'transcript_too_short' ? (
                          <span style={{ fontSize: '11px', color: '#ef4444', padding: '4px 8px', alignSelf: 'center' }}>⚠️ 內容太短，不適合成稿</span>
                        ) : ins.enrichmentStatus === 'transcript_unavailable' ? (
                          <span style={{ fontSize: '11px', color: '#ef4444', padding: '4px 8px', alignSelf: 'center' }}>⚠️ 無字幕，不可成稿</span>
                        ) : ins.enrichmentStatus === 'irrelevant' ? (
                          <span style={{ fontSize: '11px', color: '#9ca3af', padding: '4px 8px', alignSelf: 'center' }}>⏭️ 不相關</span>
                        ) : (
                          <button
                            onClick={async () => {
                              setEnrichingId(ins._id)
                              try {
                                const res = await fetch('/api/admin/insights/enrich-video', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ expertInsightId: ins._id })
                                })
                                const data = await res.json()
                                if (data.ok) {
                                  setCmsMsg(`✅ 已補 ${data.keyInsightsCount} 條 key insights`)
                                  fetchCmsData()
                                } else {
                                  const reason = data.enrichmentStatus === 'transcript_unavailable' ? '無可用字幕'
                                    : data.enrichmentStatus === 'irrelevant' ? '影片不相關'
                                    : '補充失敗：' + (data.reason || data.error || '未知錯誤')
                                  setCmsMsg(`⚠️ ${reason}`)
                                  fetchCmsData()
                                }
                              } catch {
                                setCmsMsg('⚠️ 網路錯誤')
                              } finally {
                                setEnrichingId(null)
                              }
                            }}
                            disabled={enrichingId === ins._id}
                            style={{ ...btnStyle('#1d4ed8'), opacity: enrichingId === ins._id ? 0.6 : 1, cursor: enrichingId === ins._id ? 'wait' : 'pointer' }}
                          >
                            {enrichingId === ins._id ? '讀取中...' : '🔍 先讀取影片內容'}
                          </button>
                        )}
                        <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: ins._id, type: 'expert_insight', action: 'reject' }, '已拒絕')} style={btnStyle('#dc3545')}>拒絕</button>
                        <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: ins._id, type: 'expert_insight', action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* ── 文章管理 Tab ── */}
            <div style={{ marginTop: '8px' }}>
              {/* Sub-tab switcher */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e5e5e5', paddingBottom: '0', flexWrap: 'wrap' }}>
                {([
                  ['rawMaterial',       `📦 素材庫 (${cmsData?.rawMaterialCount ?? 0})`],
                  ['contentWorkbench',  `📋 內容候選 (${cmsData?.contentCandidateCount ?? 0})`],
                  ['inProgress',        `⏳ 進行中 (${cmsData?.inProgressCount ?? 0})`],
                  ['published',         `✅ 已上架 (${cmsData?.publishedCount ?? 0})`],
                  ['needsData',         `📭 需補資料 (${cmsData?.needsDataCount ?? 0})`],
                  ['invalid',           `❌ 廢資料 (${cmsData?.invalidCount ?? 0})`],
                ] as const).map(([tab, label]) => (
                  <button key={tab} onClick={() => setArticleTab(tab as any)}
                    style={{ padding: '7px 14px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '12px',
                      background: articleTab === tab ? '#fff' : 'transparent',
                      color: articleTab === tab ? '#c0202a' : '#888',
                      borderBottom: articleTab === tab ? '2px solid #c0202a' : '2px solid transparent',
                      marginBottom: '-2px',
                    }}>{label}</button>
                ))}
              </div>

              {/* ── 內容候選 (contentWorkbench) ── */}
              {articleTab === 'contentWorkbench' && (() => {
                const allItems = [
                  ...(cmsData?.contentCandidate ?? []),
                ];
                const sorted = [...allItems].sort((a, b) => {
                  const pa = getWorkbenchCardInfo(a).priority;
                  const pb = getWorkbenchCardInfo(b).priority;
                  return pa - pb;
                });
                const REJECT_REASONS = [
                  '不是投資內容', '重複題材', '品質低／資訊太少',
                  '無可用內容（無逐字稿也無文章）', '主題不適合本頻道',
                  '已過時（超過 3 個月）', '其他（可輸入文字）', '封存（待後續處理）',
                ];
                return (
                  <section style={{ marginBottom: '32px' }}>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
                      <button
                        onClick={async () => {
                          setCmsMsg(null);
                          try {
                            const res = await fetch('/api/admin/insights/run-triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                            const d = await res.json();
                            if (d.ok) { setCmsMsg(`✅ Auto-triage 完成：${d.total} 篇，選題候選 ${d.bucketCounts?.topic_candidate ?? 0} 篇`); fetchCmsData(); }
                            else setCmsMsg(`❌ ${d.error || 'Triage 失敗'}`);
                          } catch { setCmsMsg('❌ 網路錯誤'); }
                        }}
                        style={{ padding: '5px 12px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                      >🤖 Auto-triage</button>
                      <button
                        onClick={handleBatchV2DryRun}
                        style={{ padding: '5px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                      >🔬 批次 V2 ▼</button>
                      <button
                        disabled={!!generatingV2Id}
                        onClick={async () => {
                          setGeneratingV2Id('batch-failed');
                          setCmsMsg(null);
                          try {
                            const res = await fetch('/api/admin/insights/batch-key-insights-v2', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ mode: 'failed_only' }),
                            });
                            const data = await res.json();
                            if (data.ok) { setCmsMsg(`✅ 重處理完成：${data.totalProcessed} 篇`); fetchCmsData(); }
                            else setCmsMsg(`❌ ${data.error || '重處理失敗'}`);
                          } catch { setCmsMsg('❌ 網路錯誤'); }
                          finally { setGeneratingV2Id(null); }
                        }}
                        style={{ padding: '5px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '5px', cursor: generatingV2Id ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 600, opacity: generatingV2Id ? 0.6 : 1 }}
                      >{generatingV2Id === 'batch-failed' ? '⏳...' : '🔄 重處理失敗'}</button>
                    </div>

                    {sorted.length === 0 && !cmsLoading && (
                      <div style={{ color: '#9ca3af', fontSize: '14px', padding: '24px', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e5e5' }}>
                        目前沒有內容候選。請先點「🤖 Auto-triage」將素材分流。
                      </div>
                    )}

                    {sorted.map((s: any) => {
                      const cardInfo = getWorkbenchCardInfo(s);
                      const hasDraft = !!(s.editedArticleDraft || s.cleanArticleDraft || s.articleDraft);
                      // 有效 completed：status=completed + 實際有 insights（排除假 completed）
                      const v2Completed = s.keyInsightsV2Status === 'completed' &&
                        ((s.insightsCount ?? 0) > 0 || (Array.isArray(s.keyInsightsV2) && s.keyInsightsV2.length > 0));
                      const usable = hasUsableContent(s);
                      const isYT = !!(s.youtube_id || s.rawExpertInsight?.youtube_id);
                      const hasArticleText = !isYT && (
                        ((s.summaries?.article || s.body || s.article) || '').trim().length > 100
                      );
                      // Draft button logic
                      const draftEnabled = !hasDraft && v2Completed;
                      const draftDisabledTitle = hasDraft ? '已有草稿' : (!v2Completed ? '請先完成 V2 全文洞察' : !usable ? '無可用內容，無法生成草稿' : '');
                      // Publish button logic
                      const publishEnabled = s.draftStatus === 'draft_ready';
                      // Smart preview default tab
                      const previewDefaultTab: 'insightsV2' | 'draft' = v2Completed ? 'insightsV2' : 'draft';
                      const isRejectOpen = rejectDropdownId === s._id;

                      return (
                        <div key={s._id} style={{ border: `1px solid ${cardInfo.border}`, borderRadius: '8px', padding: '12px', marginBottom: '10px', background: cardInfo.bg, position: 'relative' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                            {/* Left: info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Status badge */}
                              <div style={{ marginBottom: '4px' }}>
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: cardInfo.color, background: cardInfo.bg, border: `1px solid ${cardInfo.border}` }}>
                                  {cardInfo.label}
                                </span>
                              </div>
                              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                                {s.jgTitle || s.video_title || s.title || s.articleTitle || s.topic || '(無標題)'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#555', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                                <span>📅 {s.sourceDate || 'n/a'}</span>
                                <span>📡 {s.sourceChannel || s.source || s.channel || 'n/a'}</span>
                                {s.investmentRelevanceScore != null && (
                                  <span style={{ color: '#0369a1', fontWeight: 700 }}>
                                    投:{s.investmentRelevanceScore} 值:{s.topicValueScore ?? '-'} 品:{s.editorialFitScore ?? '-'}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {s.keyInsightsV2Status && s.keyInsightsV2Status !== 'not_started' && (
                                  <span style={{
                                    color: v2Completed ? '#16a34a' : s.keyInsightsV2Status === 'running' ? '#2563eb' : s.keyInsightsV2Status === 'partial' ? '#d97706' : '#dc2626',
                                    fontWeight: 600,
                                  }}>
                                    🔬 V2:{s.keyInsightsV2Status}
                                    {s.insightsCount != null && ` (${s.insightsCount}條)`}
                                    {s.coveragePercent != null && ` ${s.coveragePercent}%`}
                                    {s.processedChunks != null && s.totalChunks != null && ` [${s.processedChunks}/${s.totalChunks}]`}
                                  </span>
                                )}
                                {hasDraft && <span style={{ color: '#16a34a' }}>📝 草稿:{s.draftStatus || 'ready'}</span>}
                                {(s.transcriptStored || s.youtube_id) && <span style={{ color: '#2563eb' }}>📄 transcript</span>}
                                {Array.isArray(s.matchedThemes) && s.matchedThemes.length > 0 && (
                                  <span style={{ color: '#0369a1' }}>🏷️ {s.matchedThemes.join(' / ')}</span>
                                )}
                              </div>
                              {!v2Completed && hasDraft && (
                                <div style={{ marginTop: '4px', fontSize: '11px', color: '#d97706' }}>⚠️ V2 洞察尚未完成</div>
                              )}
                            </div>
                            {/* Right: buttons */}
                            <div style={{ display: 'flex', gap: '5px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '320px' }}>
                              {/* Preview */}
                              <button
                                onClick={() => openPreview(s._id, 'summary', previewDefaultTab)}
                                style={btnStyle('#6c757d')}
                              >Preview</button>

                              {/* 生成草稿 */}
                              <button
                                disabled={!draftEnabled || generatingDraftId === s._id}
                                onClick={() => draftEnabled && handleGenerateDraft(s._id)}
                                title={draftDisabledTitle}
                                style={{
                                  ...btnStyle(hasDraft ? '#38a169' : draftEnabled ? '#805ad5' : '#aaa'),
                                  opacity: (!draftEnabled || generatingDraftId === s._id) ? 0.6 : 1,
                                  cursor: (!draftEnabled || generatingDraftId === s._id) ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {hasDraft ? '✅ 已有草稿' : generatingDraftId === s._id ? '生成中…' : '✍️ 生成草稿'}
                              </button>

                              {/* 發佈 */}
                              <button
                                disabled={!publishEnabled || publishingId === s._id}
                                title={!publishEnabled ? '尚未生成草稿，或草稿含待補內容' : ''}
                                onClick={() => {
                                  if (!publishEnabled) {
                                    alert('尚未生成草稿，或草稿含待補內容，請先完成草稿');
                                    return;
                                  }
                                  setPublishDialogError(null);
                                  setPublishConfirmDoc(s);
                                }}
                                style={{
                                  ...btnStyle('#28a745'),
                                  opacity: (!publishEnabled || publishingId === s._id) ? 0.5 : 1,
                                  cursor: (!publishEnabled || publishingId === s._id) ? 'not-allowed' : 'pointer',
                                }}
                              >{publishingId === s._id ? '發佈中...' : '🚀 發佈'}</button>

                              {/* 拒絕▼ */}
                              <button
                                disabled={rejectingId === s._id}
                                onClick={() => {
                                  if (rejectDropdownId === s._id) {
                                    setRejectDropdownId(null);
                                  } else {
                                    setRejectDropdownId(s._id);
                                    setRejectReason('');
                                    setRejectReasonOther('');
                                  }
                                }}
                                style={{ ...btnStyle('#dc3545'), opacity: rejectingId === s._id ? 0.6 : 1 }}
                              >{rejectingId === s._id ? '⏳...' : '拒絕▼'}</button>

                              {/* Meta */}
                              <button
                                onClick={() => { setCmsEditId(s._id); setCmsEditMeta({ jgTitle: s.jgTitle || '', displaySection: s.displaySection || '', articleType: s.articleType || '', sortOrder: s.sortOrder ?? 0, isPinned: !!s.isPinned, tags: s.tags || [] }); }}
                                style={btnStyle('#0070f3')}
                              >Meta</button>
                            </div>
                          </div>

                          {/* Reject dropdown */}
                          {isRejectOpen && (
                            <div style={{ marginTop: '10px', padding: '12px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '6px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>選擇拒絕原因（必填）</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                                {REJECT_REASONS.map(r => (
                                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                    <input
                                      type="radio"
                                      name={`reject-${s._id}`}
                                      value={r}
                                      checked={rejectReason === r}
                                      onChange={() => setRejectReason(r)}
                                    />
                                    {r}
                                  </label>
                                ))}
                              </div>
                              {rejectReason === '其他（可輸入文字）' && (
                                <input
                                  value={rejectReasonOther}
                                  onChange={e => setRejectReasonOther(e.target.value)}
                                  placeholder="請輸入原因..."
                                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '12px', marginBottom: '8px', boxSizing: 'border-box' }}
                                />
                              )}
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  disabled={!rejectReason || (rejectReason === '其他（可輸入文字）' && !rejectReasonOther.trim())}
                                  onClick={() => handleReject(s, rejectReason, rejectReasonOther)}
                                  style={{ ...btnStyle('#dc3545'), opacity: (!rejectReason || (rejectReason === '其他（可輸入文字）' && !rejectReasonOther.trim())) ? 0.5 : 1, cursor: !rejectReason ? 'not-allowed' : 'pointer' }}
                                >確認{rejectReason === '封存（待後續處理）' ? '封存' : '拒絕'}</button>
                                <button onClick={() => { setRejectDropdownId(null); setRejectReason(''); setRejectReasonOther(''); }} style={{ ...btnStyle('#6b7280') }}>取消</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })()}

              {/* ── 進行中 (inProgress) ── */}
              {articleTab === 'inProgress' && (() => {
                const items = cmsData?.inProgress ?? [];
                return (
                  <section style={{ marginBottom: '32px' }}>
                    <div style={{ marginBottom: '12px', fontSize: '13px', color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px' }}>
                      ⏳ 這些文章有標題和內容來源，但尚未完成 V2 洞察或草稿生成。補齊後會自動升入「內容候選」。
                    </div>
                    {items.length === 0 && !cmsLoading && (
                      <div style={{ color: '#9ca3af', fontSize: '14px', padding: '24px', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>目前沒有進行中的文章 🎉</div>
                    )}
                    {items.map((s: any) => {
                      const missing: string[] = s.missingItems ?? [];
                      const isYT = !!(s.youtube_id || s.rawExpertInsight?.youtube_id);
                      const summaryId = s._id;
                      const needsV2 = missing.some((m: string) => m.includes('V2'));
                      return (
                        <div key={s._id} style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#f9fafb' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                                {s.jgTitle || s.video_title || s.title || s.topic || '(無標題)'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#555', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                                <span>📅 {s.sourceDate || 'n/a'}</span>
                                <span>📡 {s.sourceChannel || s.source || 'n/a'}</span>
                                {isYT && <span style={{ color: '#2563eb' }}>▶ YouTube</span>}
                              </div>
                              {missing.length > 0 && (
                                <div style={{ marginTop: '6px' }}>
                                  {missing.map((item: string) => (
                                    <div key={item} style={{ fontSize: '12px', color: '#d97706', marginBottom: '3px' }}>⚠️ {item}</div>
                                  ))}
                                </div>
                              )}
                              {needsV2 && (
                                <div style={{ marginTop: '8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace', color: '#92400e' }}>
                                  本地執行：<code>npm run insights:v2 -- --summaryId={summaryId}</code>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '5px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                              <button
                                disabled={rejectingId === s._id}
                                onClick={() => {
                                  if (rejectDropdownId === s._id) { setRejectDropdownId(null); }
                                  else { setRejectDropdownId(s._id); setRejectReason(''); setRejectReasonOther(''); }
                                }}
                                style={{ ...btnStyle('#dc3545'), opacity: rejectingId === s._id ? 0.6 : 1 }}
                              >{rejectingId === s._id ? '⏳...' : '拒絕▼'}</button>
                            </div>
                          </div>
                          {/* Reject dropdown */}
                          {rejectDropdownId === s._id && (
                            <div style={{ marginTop: '10px', padding: '12px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '6px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>選擇拒絕原因（必填）</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                                {['不是投資內容', '重複題材', '品質低／資訊太少', '無可用內容（無逐字稿也無文章）', '主題不適合本頻道', '已過時（超過 3 個月）', '其他（可輸入文字）', '封存（待後續處理）'].map(r => (
                                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                    <input type="radio" name={`reject-ip-${s._id}`} value={r} checked={rejectReason === r} onChange={() => setRejectReason(r)} />
                                    {r}
                                  </label>
                                ))}
                              </div>
                              {rejectReason === '其他（可輸入文字）' && (
                                <input value={rejectReasonOther} onChange={e => setRejectReasonOther(e.target.value)} placeholder="請輸入原因..." style={{ width: '100%', padding: '5px 8px', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '12px', marginBottom: '8px', boxSizing: 'border-box' }} />
                              )}
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button disabled={!rejectReason || (rejectReason === '其他（可輸入文字）' && !rejectReasonOther.trim())} onClick={() => handleReject(s, rejectReason, rejectReasonOther)} style={{ ...btnStyle('#dc3545'), opacity: !rejectReason ? 0.5 : 1, cursor: !rejectReason ? 'not-allowed' : 'pointer' }}>確認{rejectReason === '封存（待後續處理）' ? '封存' : '拒絕'}</button>
                                <button onClick={() => { setRejectDropdownId(null); setRejectReason(''); setRejectReasonOther(''); }} style={btnStyle('#6b7280')}>取消</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })()}

              {/* ── 需補資料 (needsData) ── */}
              {articleTab === 'needsData' && (() => {
                const items = cmsData?.needsData ?? [];
                return (
                  <section style={{ marginBottom: '32px' }}>
                    <div style={{ marginBottom: '12px', fontSize: '13px', color: '#6b7280', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px' }}>
                      📭 這些文章缺少標題或可用內容，需要人工補資料後才能進入管線。
                    </div>
                    {items.length === 0 && !cmsLoading && (
                      <div style={{ color: '#9ca3af', fontSize: '14px', padding: '24px', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>目前沒有需補資料的文章</div>
                    )}
                    {items.map((s: any) => {
                      const missing: string[] = s.missingItems ?? [];
                      const isYT = !!(s.youtube_id || s.rawExpertInsight?.youtube_id);
                      return (
                        <div key={s._id} style={{ border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '8px', background: '#fffbeb' }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: '#92400e' }}>
                            {s.jgTitle || s.video_title || s.title || s.topic || '(無標題)'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#555', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                            <span>📅 {s.sourceDate || 'n/a'}</span>
                            <span>📡 {s.sourceChannel || s.source || 'n/a'}</span>
                            {isYT && <span>▶ youtube_id: {s.youtube_id}</span>}
                            {s._id && <span style={{ color: '#9ca3af' }}>id: {s._id}</span>}
                          </div>
                          {missing.length > 0 && (
                            <div style={{ marginTop: '4px' }}>
                              {missing.map((item: string) => (
                                <div key={item} style={{ fontSize: '12px', color: '#b45309', marginBottom: '2px' }}>⚠️ {item}</div>
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: '8px' }}>
                            <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                );
              })()}

              {/* ── 需審核 (needsReview) ── */}
              {articleTab === 'needsReview' && (
                <section style={{ marginBottom: '32px' }}>
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px' }}>
                    ⚠️ 這些文章包含《JG 觀點待補》、blocker 或狀態矛盾，需要人工確認後才能發布。
                  </div>
                  {(!cmsData?.needsReview?.length) && !cmsLoading && (
                    <div style={{ color: '#9ca3af', fontSize: '14px', padding: '16px', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e5e5' }}>無需審核項目</div>
                  )}
                  {(cmsData?.needsReview ?? []).map((s: any) => (
                    <div key={s._id} style={{ border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '8px', background: '#fffbeb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.jgTitle || s.title || s.articleTitle || s.topic || '(no title)'}</div>
                          <div style={{ fontSize: '11px', color: '#856404' }}>status: {s.status || 'unknown'} | alphaReady: {String(!!s.alphaReady)} | publishReadiness: {s.publishReadiness || 'n/a'}</div>
                          {s.blocker && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '3px' }}>🚫 Blocker: {s.blocker}</div>}
                          {(s.editedArticleDraft || s.cleanArticleDraft) && ['【JG 觀點待補】', '《JG 觀點待補》', 'TODO'].some(p => ((s.editedArticleDraft || '') + (s.cleanArticleDraft || '')).includes(p)) && (
                            <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '3px' }}>🚫 草稿含《JG 觀點待補》/TODO，需補完後才可發布</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                          <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                          <button onClick={() => { setCmsEditId(s._id); setCmsEditMeta({ jgTitle: s.jgTitle || '', displaySection: s.displaySection || '', articleType: s.articleType || '', sortOrder: s.sortOrder ?? 0, isPinned: !!s.isPinned, tags: s.tags || [] }); }} style={btnStyle('#0070f3')}>Meta</button>
                          <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* ── 已上架文章 ── */}
              {articleTab === 'published' && (
                <section style={{ marginBottom: '32px' }}>
                  {!cmsData?.published?.length && !cmsLoading && (
                    <div style={{ color: '#888', fontSize: '14px', padding: '20px', textAlign: 'center' }}>無已上架文章（需 status=published + alphaReady=true + publishedArticle 有內容）</div>
                  )}
                  {(cmsData?.published ?? []).map((s: any) => (
                    <div key={s._id} style={{ border: '1px solid #d4edda', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#f0fff4' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.jgTitle || s.title || s.articleTitle}</div>
                          <div style={{ fontSize: '11px', color: '#666', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '2px' }}>
                            <span>sourceDate: {s.sourceDate || 'n/a'}</span>
                            <span>channel: {s.sourceChannel || s.source || 'n/a'}</span>
                            <span>status: {s.status}</span>
                            <span>alphaReady: {String(!!s.alphaReady)}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#666', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '2px' }}>
                            <span>draftStatus: {s.draftStatus || 'n/a'}</span>
                            <span>publishReadiness: {s.publishReadiness || 'n/a'}</span>
                            <span>publishedAt: {s.publishedAt?.slice(0, 10) || 'n/a'}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#666', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>articleDecision: {s.articleDecision || 'n/a'}</span>
                            {s.articleWorthinessScore != null && <span>worthiness: {s.articleWorthinessScore}</span>}
                            {s.publishedArticle && <span style={{ color: '#22c55e' }}>✅ publishedArticle</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                          <button onClick={() => { setCmsEditId(s._id); setCmsEditMeta({ jgTitle: s.jgTitle || '', displaySection: s.displaySection || '', articleType: s.articleType || '', sortOrder: s.sortOrder ?? 0, isPinned: !!s.isPinned, tags: s.tags || [] }); }} style={btnStyle('#0070f3')}>Meta</button>
                          <button
                            disabled={updatingPublishedId === s._id}
                            onClick={async () => {
                              setUpdatingPublishedId(s._id); setCmsMsg(null);
                              try {
                                const r = await fetch('/api/admin/insights/update-published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary_id: s._id }) });
                                const d = await r.json();
                                if (d.ok) { setCmsMsg('✅ 已更新上架內容'); fetchCmsData(); }
                                else setCmsMsg(`❌ ${d.error}`);
                              } catch { setCmsMsg('❌ 網路錯誤'); }
                              finally { setUpdatingPublishedId(null); }
                            }}
                            style={{ ...btnStyle('#805ad5'), opacity: updatingPublishedId === s._id ? 0.6 : 1 }}
                          >{updatingPublishedId === s._id ? '更新中...' : '🔄 更新上架內容'}</button>
                          <button
                            disabled={unpublishingId === s._id}
                            onClick={async () => {
                              setUnpublishingId(s._id); setCmsMsg(null);
                              try {
                                const r = await fetch('/api/admin/insights/unpublish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary_id: s._id }) });
                                const d = await r.json();
                                if (d.ok) { setCmsMsg('✅ 已下架'); fetchCmsData(); }
                                else setCmsMsg(`❌ ${d.error}`);
                              } catch { setCmsMsg('❌ 網路錯誤'); }
                              finally { setUnpublishingId(null); }
                            }}
                            style={{ ...btnStyle('#fd7e14'), opacity: unpublishingId === s._id ? 0.6 : 1 }}
                          >{unpublishingId === s._id ? '下架中...' : '📴 下架'}</button>
                          {s.youtube_id && (
                            <a href={`https://www.youtube.com/watch?v=${s.youtube_id}`} target="_blank" rel="noopener noreferrer"
                              style={{ ...btnStyle('#1d4ed8'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>▶ 影片</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* ── 已下架文章 (已移除， unpublished bucket 不再使用) ── */}
              {articleTab === ('unpublished' as any) && (
                <section style={{ marginBottom: '32px' }}>
                  {!cmsData?.unpublishedSummaries?.length && !cmsLoading && (
                    <div style={{ color: '#888', fontSize: '14px', padding: '20px', textAlign: 'center' }}>無已下架文章</div>
                  )}
                  {(cmsData?.unpublishedSummaries ?? []).map((s: any) => (
                    <div key={s._id} style={{ border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#fffbeb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.jgTitle || s.title || s.articleTitle}</div>
                          <div style={{ fontSize: '11px', color: '#856404', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '2px' }}>
                            <span>sourceDate: {s.sourceDate || 'n/a'}</span>
                            <span>channel: {s.sourceChannel || s.source || 'n/a'}</span>
                            <span>status: {s.status}</span>
                            <span>alphaReady: {String(!!s.alphaReady)}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#856404', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '2px' }}>
                            <span>unpublishedAt: {s.unpublishedAt?.slice(0, 10) || 'n/a'}</span>
                            <span>unpublishedBy: {s.unpublishedBy || 'n/a'}</span>
                            {s.unpublishReason && <span>reason: {s.unpublishReason}</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#856404', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>articleDecision: {s.articleDecision || 'n/a'}</span>
                            {s.articleWorthinessScore != null && <span>worthiness: {s.articleWorthinessScore}</span>}
                            {s.publishedArticle && <span style={{ color: '#22c55e' }}>✅ publishedArticle 保留中</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                          <button
                            disabled={publishingId === s._id}
                            onClick={async () => {
                              setPublishingId(s._id); setCmsMsg(null);
                              try {
                                const r = await fetch('/api/admin/insights/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summaryId: s._id }) });
                                const d = await r.json();
                                if (d.ok) { setCmsMsg('✅ 已重新發佈'); fetchCmsData(); }
                                else setCmsMsg(`❌ ${d.error || '發佈失敗'}`);
                              } catch { setCmsMsg('❌ 網路錯誤'); }
                              finally { setPublishingId(null); }
                            }}
                            style={{ ...btnStyle('#28a745'), opacity: publishingId === s._id ? 0.6 : 1 }}
                          >{publishingId === s._id ? '發佈中...' : '🚀 重新發佈'}</button>
                          <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* ── 壞資料 (invalid) ── */}
              {articleTab === 'invalid' && (
                <section style={{ marginBottom: '32px' }}>
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: '#ef4444', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px' }}>
                    ❌ 這些文件沒有任何正文內容（editedDraft / cleanDraft / articleDraft / article / body 皆空），無法發布。
                  </div>
                  {(!cmsData?.invalid?.length) && !cmsLoading && (
                    <div style={{ color: '#9ca3af', fontSize: '14px', padding: '16px', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e5e5' }}>無壞資料</div>
                  )}
                  {(cmsData?.invalid ?? []).map((s: any) => (
                    <div key={s._id} style={{ border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '8px', background: '#fff5f5' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: '#dc2626' }}>{s.jgTitle || s.title || s.topic || '(no title)'}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>status: {s.status || 'unknown'} | 無任何正文內容</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                          <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div>
            {/* Manual scan trigger */}
            <div style={{
              background: '#f5f2ec', border: '1px solid #e3ddd2', borderRadius: '8px',
              padding: '14px 16px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>手動執行揄描</div>
                <div style={{ fontSize: '12px', color: '#888' }}>搜尋 4 個頻道的最新影片，生成內容並上架</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {scanStatus && <span style={{ fontSize: '13px', color: scanStatus.startsWith('✅') ? '#22c55e' : '#ef5350' }}>{scanStatus}</span>}
                <button
                  onClick={triggerScan}
                  disabled={scanning}
                  style={{
                    background: '#c0202a', color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '10px 20px', fontWeight: 600,
                    fontSize: '14px', cursor: scanning ? 'not-allowed' : 'pointer',
                    opacity: scanning ? 0.6 : 1,
                  }}
                >
                  {scanning ? '送出中...' : '▶ 立刻揄描'}
                </button>
              </div>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={() => setBulkMode(false)}
                style={{
                  padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: !bulkMode ? '#c0202a' : '#f0ede8',
                  color: !bulkMode ? '#fff' : '#555',
                  fontWeight: 600, fontSize: '13px',
                }}
              >單一新增</button>
              <button
                onClick={() => setBulkMode(true)}
                style={{
                  padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: bulkMode ? '#c0202a' : '#f0ede8',
                  color: bulkMode ? '#fff' : '#555',
                  fontWeight: 600, fontSize: '13px',
                }}
              >批量新增</button>
            </div>

            {/* Single add */}
            {!bulkMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <input
                  value={newChannelUrl}
                  onChange={e => setNewChannelUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addChannel()}
                  placeholder="貼上 YouTube 頻道或 Podcast URL..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: '1px solid #e3ddd2', fontSize: '14px' }}
                />
                <button
                  onClick={addChannel}
                  disabled={addingChannel || !newChannelUrl.trim()}
                  style={{
                    padding: '10px 20px', background: '#c0202a', color: '#fff',
                    border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
                    opacity: addingChannel ? 0.6 : 1,
                  }}
                >
                  {addingChannel ? '新增中...' : '+ 新增頻道'}
                </button>
              </div>
            )}

            {/* Bulk add */}
            {bulkMode && (
              <div style={{ marginBottom: '24px' }}>
                <textarea
                  value={bulkInput}
                  onChange={e => setBulkInput(e.target.value)}
                  placeholder={'每行一個 URL，例如：\nhttps://www.youtube.com/@example\nhttps://feeds.example.com/podcast'}
                  rows={5}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e3ddd2', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <button
                  onClick={bulkAddChannels}
                  disabled={bulkAdding || !bulkInput.trim()}
                  style={{
                    marginTop: '8px', padding: '10px 20px', background: '#c0202a', color: '#fff',
                    border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
                    opacity: bulkAdding ? 0.6 : 1,
                  }}
                >
                  {bulkAdding ? '新增中...' : '批量新增'}
                </button>
              </div>
            )}

            {/* Bulk delete header */}
            {channels.filter(c => c.active !== false).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={selectedUrls.size > 0 && selectedUrls.size === channels.filter(c => c.active !== false).length}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedUrls(new Set(channels.filter(c => c.active !== false).map(c => c.url)));
                      } else {
                        setSelectedUrls(new Set());
                      }
                    }}
                  />
                  全選
                </label>
                <button
                  onClick={bulkDeleteChannels}
                  disabled={selectedUrls.size === 0}
                  style={{
                    padding: '6px 14px', background: '#dc2626', color: '#fff',
                    border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
                    fontSize: '13px',
                    opacity: selectedUrls.size === 0 ? 0.4 : 1,
                  }}
                >
                  刪除選取 ({selectedUrls.size})
                </button>
              </div>
            )}

            {/* Channel list */}
            {channelsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>載入中...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {channels.filter(c => c.active !== false).map(ch => (
                  <div key={ch._id?.toString()} style={{
                    background: '#fff', border: '1px solid #e3ddd2', borderRadius: '8px',
                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedUrls.has(ch.url)}
                      onChange={e => {
                        const next = new Set(selectedUrls);
                        if (e.target.checked) next.add(ch.url);
                        else next.delete(ch.url);
                        setSelectedUrls(next);
                      }}
                      style={{ flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '20px' }}>{ch.type === 'youtube' ? '▶️' : '🎙'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{ch.name !== ch.url ? ch.name : (ch.short || ch.url)}</div>
                      <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>
                        {ch.url} · 已處理 {ch.episodeCount || 0} 集
                        {ch.lastProcessedAt
                          ? ` · 上次：${new Date(ch.lastProcessedAt).toLocaleDateString('zh-TW')}`
                          : ' · 尚未處理'}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm(`移除頻道 ${ch.name || ch.url}？`)) return;
                        await fetch(`/api/channels?url=${encodeURIComponent(ch.url)}`, { method: 'DELETE' });
                        fetchChannels();
                      }}
                      style={{ background: 'none', border: '1px solid #f0ede8', borderRadius: '4px', padding: '4px 10px', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}
                    >移除</button>
                  </div>
                ))}
                {channels.filter(c => c.active !== false).length === 0 && (
                  <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>尚無頻道</div>
                )}
              </div>
            )}

            <div style={{ marginTop: '16px', fontSize: '12px', color: '#aaa' }}>
              💡 新增頻道後，每天 07:00 自動抓最新一集。或直接在 Discord 貼 URL 給 JGClaw 立刻執行。
            </div>
          </div>
        )}

        {activeTab === 'experts' && (<>
        {/* Search + Add button */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="搜尋專家姓名、機構、專業領域..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/80 backdrop-blur border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 shadow-[0_4px_20px_rgba(196,30,58,0.25)] transition-all whitespace-nowrap"
          >
            + 新增專家
          </button>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                !activeTag
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTag === tag
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Expert cards */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
            <p className="mt-4 text-gray-400 font-light">載入專家資料...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">
              {searchTerm ? `找不到符合「${searchTerm}」的專家` : '尚未建立專家資料'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((expert) => (
              <ExpertCard
                key={expert._id}
                expert={expert}
                expanded={expandedId === expert._id}
                onToggle={() => setExpandedId(expandedId === expert._id ? null : expert._id)}
                onEdit={() => openEditModal(expert)}
                onDelete={() => handleDelete(expert._id)}
                deleting={deleting === expert._id}
                onAddInterview={(interview) => addInterviewToExpert(expert._id, interview)}
                onRemoveInterview={(index) => removeInterviewFromExpert(expert._id, index)}
              />
            ))}
          </div>
        )}

        <div className="text-center mt-8 text-sm text-gray-400">
          共 {filtered.length} 位專家
        </div>

        {/* ── Insight Generation Section ── */}
        <div className="mt-16 pt-12 border-t border-gray-200">
          <h2 className="font-serif text-2xl md:text-3xl font-bold mb-2 text-center">
            <span className="gradient-text">關鍵字分析</span>
          </h2>
          <p className="text-center text-gray-400 text-sm mb-8">輸入關鍵字，AI 將從專家訪談中生成結構化摘要</p>

          {/* Tag input */}
          <div className="apple-card p-6">
            <label className="block text-xs font-medium text-gray-500 mb-2">關鍵字標籤</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {insightTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
                >
                  {tag}
                  <button
                    onClick={() => setInsightTags(insightTags.filter((t) => t !== tag))}
                    className="ml-0.5 text-primary/60 hover:text-primary text-base leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="輸入關鍵字後按 Enter..."
                value={insightInput}
                onChange={(e) => setInsightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && insightInput.trim()) {
                    e.preventDefault();
                    const tag = insightInput.trim();
                    if (!insightTags.includes(tag)) {
                      setInsightTags([...insightTags, tag]);
                    }
                    setInsightInput('');
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <button
                onClick={async () => {
                  if (insightTags.length === 0) return;
                  setGenerating(true);
                  setInsightError(null);
                  setGeneratedInsight(null);
                  try {
                    const res = await fetch('/api/insights/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tags: insightTags, source: 'manual' }),
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error || '生成失敗');
                    }
                    const data = await res.json();
                    setGeneratedInsight(data);
                  } catch (err) {
                    setInsightError(err instanceof Error ? err.message : '生成失敗');
                  } finally {
                    setGenerating(false);
                  }
                }}
                disabled={generating || insightTags.length === 0}
                className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 shadow-[0_4px_20px_rgba(196,30,58,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {generating ? '生成中...' : '🔍 生成摘要'}
              </button>
            </div>

            {insightError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                {insightError}
              </div>
            )}
          </div>

          {/* Generated result */}
          {generatedInsight && (
            <div className="mt-6 apple-card p-6 space-y-6">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {generatedInsight.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-full bg-primary/8 text-primary text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
                <span className="text-xs text-gray-400 ml-auto">
                  {generatedInsight.expertCount} 位專家 · {new Date(generatedInsight.publishedAt).toLocaleDateString('zh-TW')}
                </span>
              </div>

              <div>
                <h4 className="font-serif text-lg font-bold text-gray-900 mb-2">⏱ 時間推論</h4>
                <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {generatedInsight.summary.timelineAnalysis}
                </div>
              </div>

              <hr className="border-gray-100" />

              <div>
                <h4 className="font-serif text-lg font-bold text-gray-900 mb-2">📊 關鍵數字</h4>
                <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {generatedInsight.summary.keyNumbers}
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="border-l-3 border-primary pl-4" style={{ borderLeft: '3px solid #C41E3A' }}>
                <h4 className="font-serif text-lg font-bold text-gray-900 mb-2">🎯 預測 vs 現實</h4>
                <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {generatedInsight.summary.predictionVsReality}
                </div>
              </div>

              <div className="text-center pt-2">
                <a
                  href="/insights"
                  className="text-sm text-primary hover:text-primary/80 font-medium"
                >
                  查看所有公開摘要 →
                </a>
              </div>
            </div>
          )}
        </div>
        </>)}
      </div>

      {/* Publish Confirm Dialog */}
      {publishConfirmDoc && (() => {
        const s = publishConfirmDoc;
        const draftText = s.editedArticleDraft || s.cleanArticleDraft || s.articleDraft || '';
        const title = s.jgTitle || s.video_title || s.title || s.articleTitle || s.topic || '(無標題)';
        const v2Done = s.keyInsightsV2Status === 'completed';
        const v2Count = s.insightsCount ?? 0;
        const v2Coverage = s.coveragePercent ?? 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setPublishConfirmDoc(null)} />
            <div style={{ position: 'relative', background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px' }}>確認發佈？</h3>
              <div style={{ fontSize: '14px', color: '#333', marginBottom: '12px', lineHeight: 1.5 }}>「{title.slice(0, 50)}{title.length > 50 ? '...' : ''}」</div>
              <div style={{ fontSize: '12px', color: '#666', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px', background: '#f9fafb', padding: '10px 12px', borderRadius: '6px' }}>
                <span>草稿長度：{draftText.length.toLocaleString()} 字</span>
                {v2Done
                  ? <span style={{ color: '#16a34a' }}>V2 洞察：{v2Count} 條，coverage {v2Coverage}%</span>
                  : <span style={{ color: '#d97706' }}>⚠️ V2 洞察未完成（{s.keyInsightsV2Status || 'not_started'}），確認要直接發佈？</span>
                }
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '20px' }}>發佈後將顯示於 /insights 頁面。</div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPublishConfirmDoc(null)} style={{ padding: '8px 18px', border: '1px solid #ccc', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>取消</button>
                <button
                  disabled={publishingId === s._id}
                  onClick={async () => {
                    setPublishingId(s._id);
                    setPublishDialogError(null);
                    setCmsMsg(null);
                    try {
                      const r = await fetch('/api/admin/insights/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summaryId: s._id }) });
                      const d = await r.json();
                      if (d.ok) { setPublishConfirmDoc(null); setCmsMsg('✅ 已發佈上架'); fetchCmsData(); }
                      else { setPublishDialogError(`❌ ${d.error || '發佈失敗'}`); setCmsMsg(`❌ ${d.error || '發佈失敗'}`); }
                    } catch { setPublishDialogError('❌ 網路錯誤'); setCmsMsg('❌ 網路錯誤'); }
                    finally { setPublishingId(null); }
                  }}
                  style={{ padding: '8px 18px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', cursor: publishingId === s._id ? 'wait' : 'pointer', fontWeight: 700, fontSize: '13px', opacity: publishingId === s._id ? 0.6 : 1 }}
                >{publishingId === s._id ? '發佈中...' : '確認發佈'}</button>
              </div>
              {publishDialogError && (
                <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>
                  {publishDialogError}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Batch V2 Dry-run Dialog */}
      {showBatchV2Dialog && batchV2DryRunData && (() => {
        const { toRun, toSkip, totalChunks, estimateMin, estimateMax } = batchV2DryRunData;
        const CLI_CMD = 'npm run insights:v2 -- --all-with-transcript --resume';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowBatchV2Dialog(false)} />
            <div style={{ position: 'relative', background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px' }}>🔬 批次 V2 Dry-run 預覽</h3>
              <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                <strong>預計處理：{toRun.length} 篇</strong>
              </div>
              {toRun.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>將跑：</div>
                  <div style={{ fontSize: '11px', color: '#333', background: '#f0f9ff', padding: '8px', borderRadius: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                    {toRun.map((d: any) => (
                      <div key={d._id}>{d.jgTitle || d.video_title || d.title || '(無標題)'}{d.totalChunks ? ` (${d.totalChunks} chunks)` : ''}</div>
                    ))}
                  </div>
                </div>
              )}
              {toSkip.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>將跳過（已 completed）：</div>
                  <div style={{ fontSize: '11px', color: '#888', background: '#f9fafb', padding: '8px', borderRadius: '6px', maxHeight: '80px', overflowY: 'auto' }}>
                    {toSkip.map((d: any) => (
                      <div key={d._id}>{d.jgTitle || d.video_title || d.title || '(無標題)'}</div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
                預估 chunks：{totalChunks} | 預估時間：{estimateMin}–{estimateMax} 分鐘（本地 terminal 執行）
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>請在本地 Mac 執行以下指令：</div>
              <div style={{ background: '#1f2937', color: '#f9fafb', padding: '10px 14px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span>{CLI_CMD}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(CLI_CMD).catch(() => {})}
                  style={{ padding: '3px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}
                >複製</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowBatchV2Dialog(false)} style={{ padding: '8px 20px', border: '1px solid #ccc', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>關閉</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6">
            <h2 className="font-serif text-2xl font-bold mb-6 text-gray-900">
              {modalMode === 'create' ? '新增專家' : '編輯專家'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">姓名 *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="例：黃仁勳"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">現職職位 *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="例：CEO"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">所屬機構 *</label>
                <input
                  value={formOrg}
                  onChange={(e) => setFormOrg(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="例：NVIDIA"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">專長簡述</label>
                <textarea
                  value={formBio}
                  onChange={(e) => setFormBio(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  placeholder="他最厲害的事（1-2句）"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">標籤（逗號分隔）</label>
                <input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="例：AI, 半導體, GPU"
                />
              </div>

              {/* Interviews in modal */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">訪談紀錄</label>
                  <button
                    onClick={() => setShowInterviewForm(true)}
                    className="text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    + 新增訪談
                  </button>
                </div>
                {formInterviews.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formInterviews.map((int, i) => (
                      <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-700">{int.date} — {int.topic}</div>
                          <div className="text-gray-500 mt-0.5">{int.keyPoint}</div>
                        </div>
                        <button onClick={() => removeInterview(i)} className="text-red-400 hover:text-red-600 flex-shrink-0 text-base leading-none">×</button>
                      </div>
                    ))}
                  </div>
                )}
                {showInterviewForm && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <input
                      type="date"
                      value={intDate}
                      onChange={(e) => setIntDate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-gray-200 text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <input
                      value={intTopic}
                      onChange={(e) => setIntTopic(e.target.value)}
                      placeholder="訪談主題"
                      className="w-full px-2 py-1.5 rounded border border-gray-200 text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <textarea
                      value={intKeyPoint}
                      onChange={(e) => setIntKeyPoint(e.target.value)}
                      placeholder="關鍵觀點（1-3句）"
                      rows={2}
                      className="w-full px-2 py-1.5 rounded border border-gray-200 text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={addInterview} className="px-3 py-1 bg-primary text-white text-xs rounded-lg hover:bg-primary/90">加入</button>
                      <button onClick={() => setShowInterviewForm(false)} className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-300">取消</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !formName.trim() || !formTitle.trim() || !formOrg.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(196,30,58,0.2)]"
              >
                {saving ? '儲存中...' : modalMode === 'create' ? '建立' : '更新'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────── Freshness Badge Helper ────── */

function getFreshnessBadge(sourceDate: string | null | undefined): { label: string; color: string; daysAgo: number | null } {
  if (!sourceDate) return { label: '❓ 無日期', color: 'text-gray-400', daysAgo: null }
  try {
    const date = new Date(sourceDate)
    const now = new Date()
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (daysAgo <= 7) return { label: '🟢 最新素材', color: 'text-green-400', daysAgo }
    if (daysAgo <= 30) return { label: '🟡 近期素材', color: 'text-yellow-400', daysAgo }
    if (daysAgo <= 90) return { label: '🟠 偏舊素材', color: 'text-orange-400', daysAgo }
    return { label: '🔴 歷史素材', color: 'text-red-400', daysAgo }
  } catch {
    return { label: '❓ 無日期', color: 'text-gray-400', daysAgo: null }
  }
}

/* ────── Expert Card Component ────── */

function ExpertCard({
  expert,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  deleting,
  onAddInterview,
  onRemoveInterview,
}: {
  expert: Expert;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  onAddInterview: (interview: Interview) => void;
  onRemoveInterview: (index: number) => void;
}) {
  const [showInlineIntForm, setShowInlineIntForm] = useState(false);
  const [iDate, setIDate] = useState('');
  const [iTopic, setITopic] = useState('');
  const [iKeyPoint, setIKeyPoint] = useState('');

  const handleAdd = () => {
    if (!iDate || !iTopic.trim() || !iKeyPoint.trim()) return;
    onAddInterview({ date: iDate, topic: iTopic.trim(), keyPoint: iKeyPoint.trim() });
    setIDate('');
    setITopic('');
    setIKeyPoint('');
    setShowInlineIntForm(false);
  };

  return (
    <div className="apple-card overflow-hidden">
      {/* Card header - clickable */}
      <div className="p-5 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-serif text-lg font-bold text-gray-900">{expert.name}</h3>
              <span className="text-xs text-gray-400">
                {expanded ? '▲' : '▼'}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {expert.title}
              <span className="text-gray-300 mx-1.5">·</span>
              {expert.organization}
            </p>
            {expert.bio && (
              <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{expert.bio}</p>
            )}
            {/* Tags */}
            {(expert.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(expert.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-primary/8 text-primary text-[11px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-all text-xs"
              title="編輯"
            >
              ✏️
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all text-xs disabled:opacity-50"
              title="刪除"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* Expanded - Interviews */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">訪談紀錄</h4>
            <button
              onClick={() => setShowInlineIntForm(true)}
              className="text-xs text-primary hover:text-primary/80 font-medium"
            >
              + 新增訪談
            </button>
          </div>

          {(expert.interviews || []).length === 0 && !showInlineIntForm && (
            <p className="text-xs text-gray-400 py-2">尚無訪談紀錄</p>
          )}

          {(expert.interviews || []).length > 0 && (
            <div className="space-y-2.5 mb-3">
              {(expert.interviews || []).map((int, i) => (
                <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <span className="text-gray-400 font-mono">{int.date}</span>
                      <span className="font-medium text-gray-700">{int.topic}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{int.keyPoint}</p>
                  </div>
                  <button
                    onClick={() => onRemoveInterview(i)}
                    className="text-red-300 hover:text-red-500 flex-shrink-0 text-sm leading-none p-1"
                    title="刪除訪談"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inline interview form */}
          {showInlineIntForm && (
            <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-2 mt-2">
              <input
                type="date"
                value={iDate}
                onChange={(e) => setIDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-gray-200 text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <input
                value={iTopic}
                onChange={(e) => setITopic(e.target.value)}
                placeholder="訪談主題"
                className="w-full px-2 py-1.5 rounded border border-gray-200 text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <textarea
                value={iKeyPoint}
                onChange={(e) => setIKeyPoint(e.target.value)}
                placeholder="關鍵觀點（1-3句）"
                rows={2}
                className="w-full px-2 py-1.5 rounded border border-gray-200 text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleAdd} className="px-3 py-1 bg-primary text-white text-xs rounded-lg hover:bg-primary/90">加入</button>
                <button onClick={() => setShowInlineIntForm(false)} className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-300">取消</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
