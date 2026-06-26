'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
    newExpertInsights: any[];
    candidateSummaries: any[];
    publishedSummaries: any[];
    archivedRejectedUnpublished: any[];
  } | null>(null);
  const [cmsLoading, setCmsLoading] = useState(false);
  const [cmsError, setCmsError] = useState<string | null>(null);
  const [cmsMsg, setCmsMsg] = useState<string | null>(null);
  const [cmsPreview, setCmsPreview] = useState<any | null>(null);
  const [cmsPreviewLoading, setCmsPreviewLoading] = useState(false);
  const [cmsEditId, setCmsEditId] = useState<string | null>(null);
  const [cmsEditMeta, setCmsEditMeta] = useState<Record<string, any>>({});

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
      (session?.user as any)?.isMember === false &&
      (session?.user as any)?.isAdmin !== true
    ) {
      router.replace('/not-member');
    }
  }, [status, session, router]);

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

  const openPreview = async (id: string, type: 'summary' | 'expert_insight') => {
    setCmsPreviewLoading(true);
    setCmsPreview(null);
    try {
      const res = await fetch(`/api/admin/insights/preview?id=${id}&type=${type}`);
      const data = await res.json();
      if (data.ok) setCmsPreview(data.doc);
    } finally {
      setCmsPreviewLoading(false);
    }
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
                      <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{cmsPreview.jgTitle || cmsPreview.title || cmsPreview.articleTitle}</div>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                        topic: {cmsPreview.topic} | source: {cmsPreview.source} | sourceDate: {cmsPreview.sourceDate} | status: {cmsPreview.status || 'n/a'} | alphaReady: {String(cmsPreview.alphaReady)}
                      </div>
                      {cmsPreview.lintErrors?.length > 0 && (
                        <div style={{ background: '#fff5f5', padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
                          <strong>Lint errors:</strong> {cmsPreview.lintErrors.join(', ')}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto', background: '#f8f8f8', padding: '12px', borderRadius: '6px' }}>
                        {cmsPreview.article || cmsPreview.body || '(無內容)'}
                      </div>
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
              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px', borderBottom: '2px solid #e5e5e5', paddingBottom: '6px' }}>
                A. 新掃描內容 ({cmsData?.newExpertInsights.length ?? 0})
              </h3>
              {!cmsData?.newExpertInsights.length && !cmsLoading && (
                <div style={{ color: '#888', fontSize: '14px' }}>無新內容（expert_insights collection 待外部 pipeline 填充）</div>
              )}
              {cmsData?.newExpertInsights.map((ins: any) => (
                <div key={ins._id} style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{ins.title || '(no title)'}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        topic: {ins.topic} | source: {ins.source} | {ins.createdAt?.slice(0, 10)} | status: {ins.status || 'new'}
                        {ins.ticker && ` | ticker: ${ins.ticker}`}
                      </div>
                      {ins.summary && <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>{String(ins.summary).slice(0, 120)}&hellip;</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => openPreview(ins._id, 'expert_insight')} style={btnStyle('#6c757d')}>Preview</button>
                      <button onClick={() => cmsAction('/api/admin/insights/promote', { expertInsightId: ins._id }, '已轉為候選文章')} style={btnStyle('#0070f3')}>轉成候選</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: ins._id, type: 'expert_insight', action: 'reject' }, '已拒絕')} style={btnStyle('#dc3545')}>拒絕</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: ins._id, type: 'expert_insight', action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* B. Candidate summaries */}
            <section style={{ marginBottom: '32px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px', borderBottom: '2px solid #e5e5e5', paddingBottom: '6px' }}>
                B. 候選文章 ({cmsData?.candidateSummaries.length ?? 0})
              </h3>
              {!cmsData?.candidateSummaries.length && !cmsLoading && (
                <div style={{ color: '#888', fontSize: '14px' }}>無候選文章</div>
              )}
              {cmsData?.candidateSummaries.map((s: any) => (
                <div key={s._id} style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.jgTitle || s.title || s.articleTitle}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        topic: {s.topic} | source: {s.source} | articleType: {s.articleType || 'n/a'} | section: {s.displaySection || 'n/a'} | sort: {s.sortOrder ?? 0} | pinned: {String(!!s.isPinned)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        sourceDate: {s.sourceDate || 'n/a'} | tags: {(s.tags || []).join(', ')}
                      </div>
                      {s.lintErrors?.length > 0 && (
                        <div style={{ fontSize: '12px', color: '#e53e3e', marginTop: '4px' }}>lint: {s.lintErrors.join(', ')}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                      <button onClick={() => cmsAction('/api/admin/insights/publish', { summaryId: s._id }, '已上架')} style={btnStyle('#28a745')}>上架</button>
                      <button onClick={() => { setCmsEditId(s._id); setCmsEditMeta({ jgTitle: s.jgTitle || '', displaySection: s.displaySection || '', articleType: s.articleType || '', sortOrder: s.sortOrder ?? 0, isPinned: !!s.isPinned, tags: s.tags || [] }); }} style={btnStyle('#0070f3')}>編輯</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'reject' }, '已拒絕')} style={btnStyle('#dc3545')}>拒絕</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* C. Published summaries */}
            <section style={{ marginBottom: '32px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px', borderBottom: '2px solid #e5e5e5', paddingBottom: '6px' }}>
                C. 已上架文章 ({cmsData?.publishedSummaries.length ?? 0})
              </h3>
              {!cmsData?.publishedSummaries.length && !cmsLoading && (
                <div style={{ color: '#888', fontSize: '14px' }}>無已上架文章</div>
              )}
              {cmsData?.publishedSummaries.map((s: any) => (
                <div key={s._id} style={{ border: '1px solid #d4edda', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#f0fff4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.jgTitle || s.title || s.articleTitle}</div>
                      <div style={{ fontSize: '12px', color: '#555' }}>
                        topic: {s.topic} | section: {s.displaySection || 'n/a'} | sort: {s.sortOrder ?? 0} | pinned: {String(!!s.isPinned)} | publishedAt: {s.publishedAt?.slice(0, 10)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => openPreview(s._id, 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                      <button onClick={() => { setCmsEditId(s._id); setCmsEditMeta({ jgTitle: s.jgTitle || '', displaySection: s.displaySection || '', articleType: s.articleType || '', sortOrder: s.sortOrder ?? 0, isPinned: !!s.isPinned, tags: s.tags || [] }); }} style={btnStyle('#0070f3')}>編輯</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'unpublish' }, '已下架')} style={btnStyle('#fd7e14')}>下架</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, action: 'archive' }, '已封存')} style={btnStyle('#6c757d')}>封存</button>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* D. Rejected/archived/unpublished */}
            <section>
              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px', borderBottom: '2px solid #e5e5e5', paddingBottom: '6px' }}>
                D. 已拒絕/封存/下架 ({cmsData?.archivedRejectedUnpublished.length ?? 0})
              </h3>
              {!cmsData?.archivedRejectedUnpublished.length && !cmsLoading && (
                <div style={{ color: '#888', fontSize: '14px' }}>無記錄</div>
              )}
              {cmsData?.archivedRejectedUnpublished.map((s: any) => (
                <div key={`${s._source}-${s._id}`} style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.jgTitle || s.title || s.articleTitle}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        source: {s.source} | status: <span style={{ color: s.status === 'rejected' ? '#dc3545' : '#6c757d' }}>{s.status}</span> | type: {s._source}
                        {s.reviewNote && ` | note: ${s.reviewNote}`}
                        {(s.rejectedAt || s.archivedAt || s.unpublishedAt) && ` | ${(s.rejectedAt || s.archivedAt || s.unpublishedAt)?.slice(0, 10)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => openPreview(s._id, s._source === 'expert_insight' ? 'expert_insight' : 'summary')} style={btnStyle('#6c757d')}>Preview</button>
                      <button onClick={() => cmsAction('/api/admin/insights/update-status', { id: s._id, type: s._source === 'expert_insight' ? 'expert_insight' : 'summary', action: 'restore' }, '已恢復為候選')} style={btnStyle('#0070f3')}>恢復</button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
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
