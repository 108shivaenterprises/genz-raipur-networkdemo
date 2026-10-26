import React, { useState, useEffect } from 'react';
import { PageTitle } from './PageTitle.js';
import {
  Property,
  DueDiligenceChecklistItem,
  DueDiligenceIssue,
  UserProfile,
  DueDiligenceCategory,
} from '../types/index.js';
import { api } from '../lib/api.js';
import { formatINR, formatDateTime } from '../lib/utils.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { useTemplateHi } from '../lib/templateHi.js';
import { hasPerm } from '../lib/permissions.js';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Upload,
  UserCheck,
  Building,
  Filter,
  PlusCircle,
  MessageSquare,
  Scale,
  RefreshCw,
  ExternalLink,
  Info,
  Check,
  X,
  Lock,
  Share2,
  Download,
  Eye,
  Copy,
} from 'lucide-react';
import { SecureDocumentUploadModal } from './SecureDocumentUploadModal.js';

const DD_STATUS: Record<string, [string, string]> = {
  ALL: ['All', 'सभी'], VERIFIED: ['Verified', 'सत्यापित'], UNDER_REVIEW: ['Under Review', 'समीक्षा में'], PENDING_DOCUMENT: ['Pending Document', 'दस्तावेज़ बाकी'],
  NOT_STARTED: ['Not Started', 'शुरू नहीं'], ISSUE_FOUND: ['Issue Found', 'समस्या मिली'], NOT_APPLICABLE: ['Not Applicable', 'लागू नहीं'], REJECTED: ['Rejected', 'अस्वीकृत'],
};
const DD_GATE: Record<string, [string, string]> = {
  NONE: ['Not started', 'शुरू नहीं'], DOCUMENT_UPLOADED: ['Document recorded', 'दस्तावेज़ दर्ज'], BROKER_CHECKED: ['Broker checked', 'ब्रोकर ने जाँचा'],
  AUTHENTICITY_VERIFIED: ['Authenticity verified', 'असलियत की जाँच हुई'], LEGAL_REVIEW_COMPLETED: ['Legal review done', 'कानूनी समीक्षा पूरी'],
  ISSUE_RESOLVED: ['Issue resolved', 'समस्या सुलझी'], READINESS_APPROVED: ['Ready for transaction', 'लेन-देन के लिए तैयार'],
};
const DD_GATE_PERM: Record<string, string> = {
  DOCUMENT_UPLOADED: 'dd:upload', BROKER_CHECKED: 'dd:verify_broker', AUTHENTICITY_VERIFIED: 'dd:verify_authenticity',
  LEGAL_REVIEW_COMPLETED: 'dd:legal_signoff', ISSUE_RESOLVED: 'dd:issue_manage', READINESS_APPROVED: 'dd:readiness_approve',
};
const DD_SEV: Record<string, [string, string]> = {
  CRITICAL: ['CRITICAL', 'गंभीर'], HIGH: ['HIGH', 'उच्च'], MEDIUM: ['MEDIUM', 'मध्यम'], LOW: ['LOW', 'कम'], INFORMATIONAL: ['INFORMATIONAL', 'सूचना'],
};
const DD_ISSUE_STATUS: Record<string, [string, string]> = {
  OPEN: ['OPEN', 'खुली'], IN_PROGRESS: ['IN PROGRESS', 'जारी'], RESOLVED: ['RESOLVED', 'सुलझी'], ACCEPTED_RISK: ['ACCEPTED RISK', 'जोखिम स्वीकार'], REOPENED: ['REOPENED', 'दोबारा खुली'],
};
const DD_SCOPE: Record<string, [string, string]> = {
  ALL_VERIFIED_BROKERS: ['All verified brokers', 'सभी सत्यापित ब्रोकर'], DEAL_PARTICIPANTS_ONLY: ['Deal room only', 'सिर्फ़ डील रूम'],
  CUSTOM_BROKERS: ['Chosen brokers', 'चुने हुए ब्रोकर'], OWNER_AND_ADMIN_ONLY: ['Owner & admins only', 'सिर्फ़ मालिक और एडमिन'],
};

interface DueDiligenceViewProps {
  properties: Property[];
  currentUser: UserProfile;
  initialPropertyId?: string;
  allBrokers?: UserProfile[];
  /** the caller's permissions — controls which action buttons are shown (the server enforces them regardless) */
  permissions?: string[];
}

export const DueDiligenceView: React.FC<DueDiligenceViewProps> = ({
  properties,
  currentUser,
  initialPropertyId,
  allBrokers = [],
  permissions,
}) => {
  const tx = useTx();
  const th = useTemplateHi();
  const { lang } = useI18n();
  const label = useLabel();
  const hi = lang === 'hi';
  const allow = (perm: string) => !permissions || hasPerm(permissions, perm);
  const stt = (m: Record<string, [string, string]>, k: string) => (m[k] ? (hi ? m[k][1] : m[k][0]) : k.replace(/_/g, ' '));
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    initialPropertyId || properties[0]?.id || ''
  );
  const [items, setItems] = useState<DueDiligenceChecklistItem[]>([]);
  const [issues, setIssues] = useState<DueDiligenceIssue[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('ALL');
  // v62 — "my open items" across properties: tap one → its property opens and the row is brought into view
  const [mine, setMine] = useState<any>(null);
  const [focusId, setFocusId] = useState('');
  // v75 — a check is one line until opened (the list was 14 long cards, ~13,000 px on a phone)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [extraProp, setExtraProp] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => { api.ddMine().then(setMine).catch(() => setMine(null)); }, []);

  // Secure Document Upload Modal state
  const [secureUploadItem, setSecureUploadItem] = useState<DueDiligenceChecklistItem | null>(null);
  const [previewEvidence, setPreviewEvidence] = useState<any | null>(null);

  // Gate Modal
  const [gateModalItem, setGateModalItem] = useState<DueDiligenceChecklistItem | null>(null);
  const [gateTargetStage, setGateTargetStage] = useState<string>('BROKER_CHECKED');
  const [gateVerificationMethod, setGateVerificationMethod] = useState<string>('DOCUMENT_CROSS_CHECK');
  const [gateNotes, setGateNotes] = useState('');
  const [isAdvancingGate, setIsAdvancingGate] = useState(false);
  const [gateError, setGateError] = useState('');

  // Issue Modal
  const [showNewIssueModal, setShowNewIssueModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueSeverity, setIssueSeverity] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL'>('MEDIUM');
  const [issueResolverId, setIssueResolverId] = useState(currentUser.id);
  const [issueResolverName, setIssueResolverName] = useState(currentUser.name);
  const [issueDeadline, setIssueDeadline] = useState('');
  const [issueResolutionPlan, setIssueResolutionPlan] = useState('');
  const [isSavingIssue, setIsSavingIssue] = useState(false);

  // Active Property
  const currentProperty = properties.find((p) => p.id === selectedPropertyId);

  const loadDueDiligence = async (propId: string) => {
    if (!propId) return;
    setLoading(true);
    try {
      const res = await api.getDueDiligence(propId);
      setItems(res.items);
      setIssues(res.issues);
    } catch (err) {
      console.error('Failed to load due diligence:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPropertyId) {
      loadDueDiligence(selectedPropertyId);
    }
  }, [selectedPropertyId]);
  // bring the picked open item into view once its property's checklist is on screen
  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`dd-item-${focusId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const t = window.setTimeout(() => setFocusId(''), 4000); return () => window.clearTimeout(t); }
  }, [focusId, loading, items, issues]);
  const openMine = (row: any) => {
    setActiveCategory('ALL'); setActiveStatusFilter('ALL'); setFocusId(row.kind === 'START' ? '' : row.id);
    if (row.kind === 'START') window.setTimeout(() => api.ddMine().then(setMine).catch(() => undefined), 1500);
    if (!properties.some(p => p.id === row.propertyId)) setExtraProp({ id: row.propertyId, title: row.propertyTitle });
    if (row.propertyId === selectedPropertyId) loadDueDiligence(row.propertyId); else setSelectedPropertyId(row.propertyId);
  };

  // Advance approval gate handler
  const handleAdvanceGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateModalItem) return;
    setIsAdvancingGate(true);
    setGateError('');
    try {
      await api.advanceDueDiligenceGate(gateModalItem.id, {
        stage: gateTargetStage,
        verificationMethod: gateVerificationMethod,
        notes: gateNotes,
      });
      setGateModalItem(null);
      setGateNotes('');
      loadDueDiligence(selectedPropertyId);
    } catch (err: any) {
      setGateError(err.message);
    } finally {
      setIsAdvancingGate(false);
    }
  };

  // Create issue handler
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle || !issueDescription || !selectedPropertyId) return;
    setIsSavingIssue(true);
    try {
      await api.createDueDiligenceIssue({
        propertyId: selectedPropertyId,
        severity: issueSeverity,
        title: issueTitle,
        description: issueDescription,
        responsibleResolverId: issueResolverId,
        responsibleResolverName: issueResolverName,
        deadline: issueDeadline ? new Date(issueDeadline).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
        resolutionPlan: issueResolutionPlan || 'Immediate verification and mitigation.',
      });
      setShowNewIssueModal(false);
      setIssueTitle('');
      setIssueDescription('');
      setIssueResolutionPlan('');
      loadDueDiligence(selectedPropertyId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingIssue(false);
    }
  };

  // Toggle applicability
  const handleToggleApplicability = async (item: DueDiligenceChecklistItem) => {
    const nextApplicable = !item.isApplicable;
    let reason = '';
    if (!nextApplicable) {
      reason = window.prompt(tx('Provide the justification for waiving this check:', 'इस जाँच को छोड़ने का कारण लिखें:')) || '';
      if (!reason.trim()) return;
    }
    try {
      await api.setDueDiligenceApplicability(item.id, nextApplicable, reason);
      loadDueDiligence(selectedPropertyId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (activeCategory !== 'ALL' && item.category !== activeCategory) {
      return false;
    }
    if (activeStatusFilter !== 'ALL' && item.status !== activeStatusFilter) {
      return false;
    }
    return true;
  });

  // Scorecard stats
  const totalApplicable = items.filter((i) => i.isApplicable).length;
  const verifiedCount = items.filter((i) => i.isApplicable && i.status === 'VERIFIED').length;
  const underReviewCount = items.filter((i) => i.isApplicable && i.status === 'UNDER_REVIEW').length;
  const pendingDocCount = items.filter((i) => i.isApplicable && (i.status === 'PENDING_DOCUMENT' || i.status === 'NOT_STARTED')).length;
  const issuesFoundCount = items.filter((i) => i.status === 'ISSUE_FOUND').length;
  const criticalIssues = issues.filter((iss) => iss.severity === 'CRITICAL' && iss.status !== 'RESOLVED');
  const completionPct = totalApplicable > 0 ? Math.round((verifiedCount / totalApplicable) * 100) : 0;

  const categories: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: tx('All Checks', 'सभी जाँचें') },
    { id: 'COMMON_TITLE', label: tx('Title & Ownership', 'टाइटल और मालिकाना') },
    { id: 'REVENUE_MUNICIPAL', label: tx('Revenue & Municipal', 'राजस्व और नगर निगम') },
    { id: 'PHYSICAL_BOUNDARY', label: tx('Physical Demarcation', 'ज़मीनी सीमांकन') },
    { id: 'STATUTORY_ZONING', label: tx('Master Plan Zoning', 'मास्टर प्लान ज़ोनिंग') },
    { id: 'INDEPENDENT_HOUSE', label: tx('Villa / House Specific', 'विला / मकान के लिए') },
    { id: 'FLAT_APARTMENT', label: tx('Apartment Specific', 'अपार्टमेंट के लिए') },
    { id: 'PLOT_LAND', label: tx('Plot / Land Specific', 'प्लॉट / ज़मीन के लिए') },
    { id: 'COMMERCIAL_UNIT', label: tx('Commercial Specific', 'कमर्शियल के लिए') },
    { id: 'AGRICULTURAL_LAND', label: tx('Agricultural Specific', 'कृषि भूमि के लिए') },
  ];

  const gateOptions: Array<{ id: string; label: string }> = [
    { id: 'DOCUMENT_UPLOADED', label: tx('1. Document Recorded', '1. दस्तावेज़ दर्ज') },
    { id: 'BROKER_CHECKED', label: tx('2. Broker Checked (Initial Verification)', '2. ब्रोकर ने जाँचा (शुरुआती सत्यापन)') },
    { id: 'AUTHENTICITY_VERIFIED', label: tx('3. Authenticity Independently Verified', '3. असलियत की स्वतंत्र जाँच') },
    { id: 'LEGAL_REVIEW_COMPLETED', label: tx('4. Legal Review Completed (Legal Counsel only)', '4. कानूनी समीक्षा पूरी (केवल लीगल काउंसल)') },
    { id: 'ISSUE_RESOLVED', label: tx('5. Outstanding Issue Resolved', '5. बाकी समस्या सुलझी') },
    { id: 'READINESS_APPROVED', label: tx('6. Transaction Readiness Approved', '6. लेन-देन की तैयारी मंज़ूर') },
  ].filter((g) => allow(DD_GATE_PERM[g.id]));

  if (!properties.length && !(mine?.items?.length)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600" data-testid="dd-empty">
        <p className="font-semibold text-slate-900">{tx('Property Due Diligence', 'प्रॉपर्टी ड्यू डिलिजेंस')}</p>
        <p className="mt-1">{tx('Due diligence opens for your own listings and for properties in a deal room you are part of. List a property or join a deal room to start.', 'ड्यू डिलिजेंस आपकी अपनी लिस्टिंग और उन प्रॉपर्टी के लिए खुलती है जिनके डील रूम में आप हैं। शुरू करने के लिए प्रॉपर्टी लिस्ट करें या किसी डील रूम से जुड़ें।')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Property Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title={tx('Property title check', 'प्रॉपर्टी टाइटल जाँच')} help={<>{tx('6-stage verification gates, 30-year title search at the Sub-Registrar, Khasra / land-record checks and tracking of critical issues.', '6 चरणों के सत्यापन गेट, उप-पंजीयक पर 30 साल की टाइटल खोज, खसरा / भूमि रिकॉर्ड की जाँच और गंभीर समस्याओं की ट्रैकिंग।')} {tx('Common checks plus checks for the property type.', 'सामान्य जाँचें और प्रॉपर्टी के प्रकार की जाँचें।')}</>} />
        </div>

        {/* Property Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 max-w-full items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm">
            <Building className="h-4 w-4 text-slate-400 ml-1.5" />
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="min-w-0 max-w-full text-xs font-medium text-slate-800 bg-transparent focus:outline-none pr-3"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.title.slice(0, 36)}... ({label('propertyType', p.propertyType)})
                </option>
              ))}
              {extraProp && !properties.some((p) => p.id === extraProp.id) && <option value={extraProp.id}>{extraProp.id} — {extraProp.title.slice(0, 36)}</option>}
            </select>
          </div>
          <button
            onClick={() => loadDueDiligence(selectedPropertyId)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            title={tx('Refresh verification status', 'सत्यापन की स्थिति रीफ़्रेश करें')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{tx('Refresh', 'रीफ़्रेश')}</span>
          </button>
        </div>
      </div>

      {/* v62 — what waits on me across properties */}
      {mine && mine.items.length > 0 && (
        <details className="rounded-xl border border-amber-300 bg-amber-50/60 p-3" open data-testid="dd-mine">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
            {tx('My open items', 'मेरे खुले काम')} ({mine.items.length})
            {mine.counts.overdue > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{tx(`${mine.counts.overdue} overdue`, `${mine.counts.overdue} देर से`)}</span>}
            <span className="text-xs font-medium text-slate-600">{tx(`${mine.counts.issues} issues · ${mine.counts.review} to review · ${mine.counts.papers} papers missing${mine.counts.start ? ` · ${mine.counts.start} to start` : ''}`, `${mine.counts.issues} समस्या · ${mine.counts.review} जाँचना · ${mine.counts.papers} काग़ज़ बाक़ी${mine.counts.start ? ` · ${mine.counts.start} शुरू करना` : ''}`)}</span>
          </summary>
          <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
            {mine.items.map((row: any) => (
              <li key={row.kind + row.id}>
                <button type="button" onClick={() => openMine(row)} className="flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-slate-400" data-testid={`dd-mine-${row.id}`}>
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${row.kind === 'ISSUE' ? (row.overdue || row.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-rose-50 text-rose-800') : row.kind === 'REVIEW' ? 'bg-indigo-50 text-indigo-800' : 'bg-amber-100 text-amber-900'}`}>
                    {row.kind === 'ISSUE' ? tx('Issue', 'समस्या') : row.kind === 'REVIEW' ? tx('Review', 'जाँचें') : row.kind === 'START' ? tx('Start', 'शुरू करें') : tx('Paper', 'काग़ज़')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{row.kind === 'START' ? tx('Title check not started — the deal is live', 'टाइटल जाँच शुरू नहीं हुई — डील चल रही है') : th(row.title)}</span>
                    <span className="block truncate text-xs text-slate-500">{row.propertyTitle}{row.kind === 'ISSUE' && row.deadline ? ` · ${row.overdue ? tx('overdue since', 'देर — ') : tx('by', 'तक')} ${new Date(row.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}{row.kind === 'PAPER' && row.requiredDocument ? ` · ${th(row.requiredDocument)}` : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Selected Property Header Card */}
      {currentProperty && (
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
                <span>{currentProperty.id}</span>
                <span>·</span>
                <span>{label('propertyType', currentProperty.propertyType)}</span>
                <span>·</span>
                <span>{[currentProperty.locality, currentProperty.city].filter(Boolean).join(', ')}</span>
              </div>
              <h3 className="text-base font-bold text-white">{currentProperty.title}</h3>
              <p className="hidden text-xs text-slate-300 max-w-3xl line-clamp-1 sm:block">{currentProperty.description}</p>
            </div>
            <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">{tx('Asking Price', 'माँगी गई क़ीमत')}</div>
                <div className="text-sm font-bold text-emerald-400">{formatINR(currentProperty.askingPrice)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">{tx('Owner / Listing', 'मालिक / लिस्टिंग')}</div>
                <div className="text-xs font-medium text-slate-200">{currentProperty.ownerName}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">{tx('Due Diligence Score', 'ड्यू डिलिजेंस स्कोर')}</div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold ${completionPct >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {completionPct}%
                  </span>
                  <span className="text-[10px] text-slate-400">({verifiedCount}/{totalApplicable})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scorecard Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3" data-testid="dd-scorecard">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">{tx('Verified Checks', 'सत्यापित जाँचें')}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">{verifiedCount}</div>
          <div className="hidden text-[10px] text-slate-400 mt-0.5 sm:block">{tx('Gate cleared with evidence', 'सबूत के साथ गेट पार')}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">{tx('Under Review', 'समीक्षा में')}</span>
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">{underReviewCount}</div>
          <div className="hidden text-[10px] text-slate-400 mt-0.5 sm:block">{tx('Documents uploaded / checking', 'दस्तावेज़ दर्ज / जाँच जारी')}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">{tx('Pending Documents', 'बाकी दस्तावेज़')}</span>
            <FileText className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">{pendingDocCount}</div>
          <div className="hidden text-[10px] text-slate-400 mt-0.5 sm:block">{tx('Awaiting seller submission', 'विक्रेता से दस्तावेज़ का इंतज़ार')}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">{tx('Open Issues', 'खुली समस्याएँ')}</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">{issues.filter((i) => i.status !== 'RESOLVED').length}</div>
          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">{criticalIssues.length} {tx('Critical (blocks readiness)', 'गंभीर (तैयारी रोकती हैं)')}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">{tx('Legal Review Signoff', 'कानूनी समीक्षा सहमति')}</span>
            <Scale className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1">
            {items.some((i) => i.itemKey === 'DD_C2_REGISTERED_TITLE_CHAIN' && i.approvalStage === 'LEGAL_REVIEW_COMPLETED')
              ? tx('Legal review done', 'कानूनी समीक्षा पूरी')
              : criticalIssues.length > 0
              ? tx('Defect Identified', 'दोष मिला')
              : tx('Advocate Vetting Pending', 'अधिवक्ता की जाँच बाकी')}
          </div>
          <div className="hidden text-[10px] text-slate-400 mt-0.5 sm:block">{tx('Reviewed by an empanelled advocate', 'पैनल के अधिवक्ता द्वारा समीक्षित')}</div>
        </div>
      </div>

      {/* Critical Blocker Warning Banner if critical issues exist */}
      {criticalIssues.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-rose-900">
              {tx(`Transaction readiness is blocked by ${criticalIssues.length} unresolved critical due diligence defect(s)`, `${criticalIssues.length} गंभीर ड्यू डिलिजेंस दोष सुलझे नहीं हैं — लेन-देन की तैयारी रुकी है`)}
            </h4>
            <p className="text-xs text-rose-700">
              {tx('Per platform policy, the transaction cannot be marked ready until these critical items are reviewed and formally marked resolved.', 'प्लेटफ़ॉर्म नीति के अनुसार, जब तक इन गंभीर मुद्दों की समीक्षा होकर उन्हें सुलझा हुआ दर्ज नहीं किया जाता, लेन-देन को तैयार नहीं माना जा सकता।')}
            </p>
          </div>
        </div>
      )}

      {/* Filter Toolbar + Action Buttons */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            {allow('dd:issue_manage') && (
              <button
                onClick={() => setShowNewIssueModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>{tx('Log Due Diligence Issue', 'ड्यू डिलिजेंस समस्या दर्ज करें')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Status Filter */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium">{tx('Status Filter:', 'स्थिति फ़िल्टर:')}</span>
          {['ALL', 'VERIFIED', 'UNDER_REVIEW', 'PENDING_DOCUMENT', 'ISSUE_FOUND', 'NOT_APPLICABLE'].map((st) => (
            <button
              key={st}
              onClick={() => setActiveStatusFilter(st)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeStatusFilter === st
                  ? 'bg-slate-200 text-slate-900 font-semibold'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {stt(DD_STATUS, st)}
            </button>
          ))}
        </div>
      </div>

      {/* Checklist Items Accordion / Cards List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            {tx('Loading due diligence verification data...', 'ड्यू डिलिजेंस डेटा लोड हो रहा है...')}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-xl text-slate-400 text-xs">
            {tx('No checklist items matching the current filter.', 'मौजूदा फ़िल्टर से मेल खाती कोई जाँच नहीं।')}
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const hasEvidence = item.evidenceReferences.length > 0;
            const isVerified = item.status === 'VERIFIED';
            const isIssue = item.status === 'ISSUE_FOUND';
            const isWaived = !item.isApplicable;
            const statusCls = isVerified ? 'bg-emerald-100 text-emerald-800' : isIssue ? 'bg-rose-100 text-rose-800' : item.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-800' : isWaived ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800';
            if (!openIds.has(item.id) && focusId !== item.id) {
              return (
                <button key={item.id} id={`dd-item-${item.id}`} type="button" onClick={() => setOpenIds(prev => new Set(prev).add(item.id))} data-testid={`dd-row-${item.id}`}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-2 text-left ${isIssue ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 bg-white hover:border-slate-400'} ${isWaived ? 'opacity-70' : ''}`}>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>{stt(DD_STATUS, item.status)}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-900">{th(item.title)}</span>
                  {item.evidenceReferences.length > 0 && <span className="shrink-0 text-[11px] text-slate-500">📎 {item.evidenceReferences.length}</span>}
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              );
            }

            return (
              <div
                key={item.id}
                id={`dd-item-${item.id}`}
                className={`bg-white border rounded-xl p-4 transition-all ${focusId === item.id ? 'ring-2 ring-amber-400 ' : ''}${
                  isIssue
                    ? 'border-rose-300 bg-rose-50/20'
                    : isVerified
                    ? 'border-slate-200 bg-white'
                    : isWaived
                    ? 'border-slate-200 bg-slate-50/50 opacity-75'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  {/* Left Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-slate-400 text-[11px]">{item.id}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                        {categories.find((c) => c.id === item.category)?.label || item.category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-300">·</span>

                      {/* Status indicator */}
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          isVerified
                            ? 'bg-emerald-100 text-emerald-800'
                            : isIssue
                            ? 'bg-rose-100 text-rose-800'
                            : item.status === 'UNDER_REVIEW'
                            ? 'bg-blue-100 text-blue-800'
                            : isWaived
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {stt(DD_STATUS, item.status)}
                      </span>

                      {/* Approval Gate Stage */}
                      <span className="text-[10px] text-slate-500 font-medium">
                        {tx('Gate', 'गेट')}: <strong className="text-slate-800">{stt(DD_GATE, item.approvalStage)}</strong>
                      </span>
                      <button type="button" onClick={() => { setOpenIds(prev => { const n = new Set(prev); n.delete(item.id); return n; }); if (focusId === item.id) setFocusId(''); }} data-testid={`dd-hide-${item.id}`} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"><ChevronUp className="h-3.5 w-3.5" />{tx('Hide', 'छुपाएँ')}</button>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{th(item.title)}</h4>
                    <p className="text-xs text-slate-600">{th(item.description)}</p>

                    {/* Required Document & Evidence Description */}
                    <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                          {tx('Mandatory Evidence Document', 'अनिवार्य सबूत दस्तावेज़')}
                        </div>
                        <div className="text-xs font-medium text-slate-800 mt-0.5">
                          {th(item.requiredDocument)}
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                          {tx('Acceptable Verification Benchmark', 'मान्य सत्यापन का मानक')}
                        </div>
                        <div className="text-xs text-slate-700 mt-0.5">
                          {th(item.acceptableEvidenceDescription)}
                        </div>
                      </div>
                    </div>

                    {/* Attached Evidence List */}
                    {hasEvidence && (
                      <div className="pt-2">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>{tx('Paperwork Records', 'दस्तावेज़ रिकॉर्ड')} ({item.evidenceReferences.length})</span>
                          <span className="text-[10px] text-slate-500 font-medium">{tx('details + file fingerprint; files are not stored by GENZ', 'ब्योरा + फ़ाइल फ़िंगरप्रिंट; फ़ाइलें GENZ पर सेव नहीं होतीं')}</span>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {item.evidenceReferences.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex flex-col gap-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg p-2.5 text-xs transition-colors min-w-[240px] max-w-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                                  <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                                  <span className="truncate">{ev.fileName}</span>
                                </div>
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {ev.documentType?.replace(/_/g, ' ') || tx('DOCUMENT', 'दस्तावेज़')}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-600 space-y-0.5">
                                {ev.documentNumber && (
                                  <div>
                                    <span className="text-slate-400">{tx('Reg No', 'पंजीयन नं.')}: </span>
                                    <span className="font-mono font-medium text-slate-800">{ev.documentNumber}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-400">{tx('Issuer', 'जारीकर्ता')}: </span>
                                  <span className="text-slate-700">{ev.issuer || tx('Issuer not recorded', 'जारीकर्ता दर्ज नहीं')}</span>
                                </div>
                                {ev.checksumSha256 && (
                                  <div className="font-mono text-[10px] text-slate-500 truncate">
                                    <span className="text-slate-400 font-sans">SHA-256: </span>
                                    {ev.checksumSha256.slice(0, 18)}...
                                  </div>
                                )}
                              </div>

                              {/* Sharing & Access Permissions Badge */}
                              <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                                <span className="inline-flex items-center gap-1 text-indigo-700 font-medium">
                                  <Share2 className="h-3 w-3 text-indigo-600" />
                                  {ev.accessScope === 'CUSTOM_BROKERS'
                                    ? tx(`${ev.sharedBrokerIds?.length || 0} Brokers`, `${ev.sharedBrokerIds?.length || 0} ब्रोकर`)
                                    : stt(DD_SCOPE, ev.accessScope || 'OWNER_AND_ADMIN_ONLY')}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewEvidence(ev)}
                                    className="font-semibold text-slate-700 hover:text-slate-900 hover:underline flex items-center gap-0.5"
                                  >
                                    <Eye className="h-3 w-3" />
                                    <span>{tx('View', 'देखें')}</span>
                                  </button>
                                  {(/^https:\/\//i.test(ev.fileUrl || '') || (!!ev.libraryDocId && String(ev.fileUrl || '').startsWith('/api/property-docs/'))) ? (
                                    <a
                                      href={ev.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      <span>{tx('Open file', 'फ़ाइल खोलें')}</span>
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">{tx('No file link', 'फ़ाइल लिंक नहीं')}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reviewer Signoff / Audit details */}
                    {item.reviewerName && (
                      <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          {tx('Reviewed by', 'समीक्षक')} <strong className="text-slate-800">{item.reviewerName}</strong> ({label('role', item.reviewerRole || '')}) · {formatDateTime(item.reviewTimestamp || '')}
                        </span>
                      </div>
                    )}

                    {item.notApplicableReason && (
                      <div className="text-xs text-slate-500 italic bg-slate-100 p-2 rounded">
                        {tx('Waive Reason', 'छोड़ने का कारण')}: {item.notApplicableReason}
                      </div>
                    )}
                  </div>

                  {/* Right Actions Toolbar */}
                  <div className="flex flex-wrap lg:flex-col items-center gap-2 shrink-0 pt-2 lg:pt-0">
                    {/* Secure Upload Paperwork button */}
                    {allow('dd:upload') && (
                      <button
                        onClick={() => setSecureUploadItem(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors shadow-xs"
                      >
                        <Upload className="h-3.5 w-3.5 text-amber-400" />
                        <span>{tx('Add Paperwork', 'दस्तावेज़ जोड़ें')}</span>
                      </button>
                    )}

                    {/* Advance Gate (only the stages this role may sign off) */}
                    {gateOptions.length > 0 && (
                      <button
                        onClick={() => {
                          setGateModalItem(item);
                          const next =
                            item.approvalStage === 'DOCUMENT_UPLOADED'
                              ? 'BROKER_CHECKED'
                              : item.approvalStage === 'BROKER_CHECKED'
                              ? 'AUTHENTICITY_VERIFIED'
                              : item.approvalStage === 'AUTHENTICITY_VERIFIED'
                              ? 'LEGAL_REVIEW_COMPLETED'
                              : 'READINESS_APPROVED';
                          setGateTargetStage(gateOptions.some((g) => g.id === next) ? next : gateOptions[0].id);
                          setGateError('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>{tx('Advance Gate', 'गेट आगे बढ़ाएँ')}</span>
                      </button>
                    )}

                    {/* Toggle Applicability */}
                    {allow('dd:issue_manage') && (
                      <button
                        onClick={() => handleToggleApplicability(item)}
                        className="flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-slate-800 text-[11px] font-medium transition-colors"
                      >
                        <span>{item.isApplicable ? tx('Waive Item', 'यह जाँच छोड़ें') : tx('Restore Item', 'जाँच बहाल करें')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Issue Register Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-xs text-rose-600 font-semibold uppercase tracking-wider">{tx('Defect & Exception Tracking', 'दोष और अपवाद ट्रैकिंग')}</div>
            <h3 className="text-base font-bold text-slate-900">{tx('Issue Register', 'समस्या रजिस्टर')}</h3>
            <p className="text-xs text-slate-500">
              {tx('Structured resolution workflows for title chain breaks, co-owner permissions, boundary deviations and lender releases.', 'टाइटल चेन टूटने, सह-मालिकों की अनुमति, सीमा विचलन और बैंक/ऋणदाता की रिलीज़ के लिए तय हल-प्रक्रिया।')}
            </p>
          </div>
          {allow('dd:issue_manage') && (
            <button
              onClick={() => setShowNewIssueModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{tx('File New Issue', 'नई समस्या दर्ज करें')}</span>
            </button>
          )}
        </div>

        {issues.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-lg text-slate-400 text-xs">
            {tx('No defect issues logged for this property.', 'इस प्रॉपर्टी के लिए कोई दोष दर्ज नहीं है।')}
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((iss) => (
              <div
                key={iss.id}
                id={`dd-item-${iss.id}`}
                className={`border rounded-lg p-4 space-y-2 ${focusId === iss.id ? 'ring-2 ring-amber-400 ' : ''}${
                  iss.severity === 'CRITICAL'
                    ? 'border-rose-300 bg-rose-50/30'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        iss.severity === 'CRITICAL'
                          ? 'bg-rose-600 text-white'
                          : iss.severity === 'HIGH'
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {stt(DD_SEV, iss.severity)}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{iss.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">({iss.id})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        iss.status === 'RESOLVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : iss.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {stt(DD_ISSUE_STATUS, iss.status)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700">{iss.description}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1 text-slate-600">
                  <div>
                    <span className="text-slate-400">{tx('Resolver', 'हल करने वाला')}:</span>{' '}
                    <strong>{iss.responsibleResolverName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">{tx('Deadline', 'अंतिम तारीख़')}:</span>{' '}
                    {formatDateTime(iss.deadline)}
                  </div>
                  <div>
                    <span className="text-slate-400">{tx('Resolution Plan', 'हल की योजना')}:</span>{' '}
                    {iss.resolutionPlan}
                  </div>
                </div>

                {iss.responseNotes && (
                  <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded p-2">
                    <strong>{tx('Resolver Response', 'हल करने वाले का जवाब')}:</strong> {iss.responseNotes}
                  </div>
                )}

                {/* Issue action controls */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  {iss.status !== 'RESOLVED' && allow('dd:issue_manage') && (
                    <>
                      <button
                        onClick={async () => {
                          const note = window.prompt(tx('Enter resolution response / evidence details:', 'हल का जवाब / सबूत का ब्योरा लिखें:'));
                          if (note && note.trim()) {
                            try {
                              await api.respondDueDiligenceIssue(iss.id, { responseNotes: note.trim() });
                              loadDueDiligence(selectedPropertyId);
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }
                        }}
                        className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded transition-colors"
                      >
                        {tx('Submit Response', 'जवाब भेजें')}
                      </button>

                      <button
                        onClick={async () => {
                          const decisionNotes = window.prompt(tx('Enter reviewer resolution notes (required):', 'समीक्षक के हल-नोट्स लिखें (ज़रूरी):'));
                          if (decisionNotes && decisionNotes.trim()) {
                            try {
                              await api.decideDueDiligenceIssue(iss.id, { decision: 'RESOLVED', notes: decisionNotes.trim() });
                              loadDueDiligence(selectedPropertyId);
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }
                        }}
                        className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded transition-colors"
                      >
                        {tx('Approve & Mark Resolved', 'मंज़ूर करें और सुलझा हुआ दर्ज करें')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Statutory Disclaimer Banner (B4 & B6 requirement) */}
      <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600">
        <Info className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-800">{tx('Legal Notice & Platform Disclaimer:', 'कानूनी सूचना और प्लेटफ़ॉर्म अस्वीकरण:')}</strong> {tx('Platform due diligence is an internal workflow and risk-management check carried out by brokers and participating advocates. It is not a government title guarantee or a judicial certificate, and it does not replace deed vetting by an independent advocate acting for the buyer.', 'प्लेटफ़ॉर्म का ड्यू डिलिजेंस ब्रोकर और भाग लेने वाले अधिवक्ताओं द्वारा की गई आंतरिक कार्य-प्रक्रिया और जोखिम-जाँच है। यह सरकारी टाइटल गारंटी या न्यायिक प्रमाणपत्र नहीं है, और खरीदार के अपने स्वतंत्र अधिवक्ता द्वारा डीड की जाँच का विकल्प नहीं है।')}
        </div>
      </div>

      {/* Secure Document Upload & Paperwork Sharing Modal */}
      {secureUploadItem && (
        <SecureDocumentUploadModal
          item={secureUploadItem}
          propertyTitle={currentProperty?.title}
          propertyState={currentProperty?.state}
          currentUser={currentUser}
          allBrokers={allBrokers}
          onClose={() => setSecureUploadItem(null)}
          onSuccess={() => {
            setSecureUploadItem(null);
            loadDueDiligence(selectedPropertyId);
          }}
        />
      )}

      {/* Document Paperwork Preview Modal */}
      {previewEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{previewEvidence.fileName}</h3>
                  <span className="text-[10px] text-emerald-700 font-semibold uppercase">
                    {previewEvidence.documentType?.replace(/_/g, ' ') || tx('PAPERWORK', 'दस्तावेज़')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPreviewEvidence(null)}
                aria-label={tx('Close', 'बंद करें')}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Document / Registration No:', 'दस्तावेज़ / पंजीयन नं.:')}</span>
                  <span className="font-mono font-bold text-slate-900">{previewEvidence.documentNumber || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Issuing Authority:', 'जारी करने वाला प्राधिकरण:')}</span>
                  <span className="font-semibold text-slate-800">{previewEvidence.issuer || tx('Issuer not recorded', 'जारीकर्ता दर्ज नहीं')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Recorded On:', 'दर्ज होने की तारीख़:')}</span>
                  <span className="text-slate-700">{formatDateTime(previewEvidence.uploadedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Broker Sharing Scope:', 'ब्रोकर साझा दायरा:')}</span>
                  <span className="font-bold text-indigo-700">{stt(DD_SCOPE, previewEvidence.accessScope || 'ALL_VERIFIED_BROKERS')}</span>
                </div>
              </div>

              {previewEvidence.checksumSha256 && (
                <div className="rounded-lg bg-emerald-50/70 p-3 border border-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>{tx('SHA-256 fingerprint of the file', 'फ़ाइल का SHA-256 फ़िंगरप्रिंट')}</span>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-800 break-all select-all">
                    {previewEvidence.checksumSha256}
                  </div>
                </div>
              )}

              {previewEvidence.notes && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">{tx('Broker Attestation Notes:', 'ब्रोकर के सत्यापन नोट्स:')}</label>
                  <p className="mt-0.5 text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-200">
                    {previewEvidence.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t">
              <button
                type="button"
                onClick={() => setPreviewEvidence(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                {tx('Close', 'बंद करें')}
              </button>
              {(/^https:\/\//i.test(previewEvidence.fileUrl || '') || (!!previewEvidence.libraryDocId && String(previewEvidence.fileUrl || '').startsWith('/api/property-docs/'))) && (
                <a
                  href={previewEvidence.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 shadow-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{tx('Open file', 'फ़ाइल खोलें')}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Advance Approval Gate */}
      {gateModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tx('Advance Verification Approval Gate', 'सत्यापन अनुमोदन गेट आगे बढ़ाएँ')}</h3>
                <p className="text-xs text-slate-500">{th(gateModalItem.title)}</p>
              </div>
              <button
                onClick={() => setGateModalItem(null)}
                aria-label={tx('Close', 'बंद करें')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {gateError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-xs">
                {gateError}
              </div>
            )}

            <form onSubmit={handleAdvanceGate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Target Approval Gate Stage', 'अगला अनुमोदन चरण')}</label>
                <select
                  value={gateTargetStage}
                  onChange={(e) => setGateTargetStage(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none"
                >
                  {gateOptions.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
                {gateTargetStage === 'LEGAL_REVIEW_COMPLETED' && (
                  <p className="text-[11px] text-purple-700 mt-1 flex items-center gap-1 font-medium">
                    <Lock className="h-3 w-3" />
                    {tx('Only verified Legal Counsel or a Superadmin can sign off Gate 4.', 'गेट 4 की सहमति केवल सत्यापित लीगल काउंसल या सुपरएडमिन दे सकते हैं।')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Verification Method', 'सत्यापन का तरीक़ा')}</label>
                <select
                  value={gateVerificationMethod}
                  onChange={(e) => setGateVerificationMethod(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none"
                >
                  <option value="DOCUMENT_CROSS_CHECK">{tx('Document Cross-Check with Mother Deed', 'मदर डीड से दस्तावेज़ का मिलान')}</option>
                  <option value="GOVT_PORTAL_REGISTRY">{tx('Sub-Registrar / State Land-Records Portal', 'उप-पंजीयक / राज्य भू-अभिलेख पोर्टल')}</option>
                  <option value="PHYSICAL_INSPECTION">{tx('On-Site Physical Demarcation & Survey', 'साइट पर सीमांकन और सर्वे')}</option>
                  <option value="INDEPENDENT_LEGAL_OPINION">{tx('Independent Legal Search & Title Opinion', 'स्वतंत्र कानूनी खोज और टाइटल राय')}</option>
                  <option value="COURT_RECORD_SEARCH">{tx('e-Courts District Civil Court Case Search', 'ई-कोर्ट्स ज़िला दीवानी अदालत में केस खोज')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Review Notes / Verification Findings', 'समीक्षा नोट्स / सत्यापन के निष्कर्ष')}</label>
                <textarea
                  rows={3}
                  value={gateNotes}
                  onChange={(e) => setGateNotes(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('Record the verification result, deeds cross-checked, or municipal receipt checked...', 'सत्यापन का नतीजा, मिलाई गई डीड या जाँची गई नगर निगम रसीद दर्ज करें...')}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setGateModalItem(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isAdvancingGate}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isAdvancingGate ? tx('Validating...', 'जाँच हो रही है...') : tx('Sign Off This Gate', 'इस गेट की सहमति दें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log New Due Diligence Issue */}
      {showNewIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tx('File Due Diligence Defect (Issue Register)', 'ड्यू डिलिजेंस दोष दर्ज करें (समस्या रजिस्टर)')}</h3>
                <p className="text-xs text-slate-500">{tx('Record a material defect that must be resolved before the transaction', 'ऐसा बड़ा दोष दर्ज करें जिसे लेन-देन से पहले सुलझाना ज़रूरी है')}</p>
              </div>
              <button
                onClick={() => setShowNewIssueModal(false)}
                aria-label={tx('Close', 'बंद करें')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Severity', 'गंभीरता')}</label>
                  <select
                    value={issueSeverity}
                    onChange={(e: any) => setIssueSeverity(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none"
                  >
                    <option value="CRITICAL">{tx('CRITICAL (blocks readiness)', 'गंभीर (तैयारी रोकती है)')}</option>
                    <option value="HIGH">{tx('HIGH (major clarification required)', 'उच्च (बड़ा स्पष्टीकरण ज़रूरी)')}</option>
                    <option value="MEDIUM">{tx('MEDIUM (co-owner / document notice)', 'मध्यम (सह-मालिक / दस्तावेज़ नोटिस)')}</option>
                    <option value="LOW">{tx('LOW (minor clerical discrepancy)', 'कम (मामूली लिपिकीय अंतर)')}</option>
                    <option value="INFORMATIONAL">{tx('INFORMATIONAL (observation only)', 'सूचना (सिर्फ़ टिप्पणी)')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Target Resolution Deadline', 'हल करने की अंतिम तारीख़')}</label>
                  <input
                    type="date"
                    value={issueDeadline}
                    onChange={(e) => setIssueDeadline(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Issue Title', 'समस्या का शीर्षक')}</label>
                <input
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('e.g. Sub-Registrar 30-year search shows an unreleased mortgage from 2018', 'जैसे: उप-पंजीयक की 30 साल की खोज में 2018 का बिना-रिलीज़ बंधक मिला')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Detailed Description & Evidence Found', 'विस्तृत विवरण और मिले सबूत')}</label>
                <textarea
                  rows={3}
                  required
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('Describe the discrepancy, missing mother-deed link, co-owner succession issue or setback deviation...', 'अंतर, छूटी हुई मदर डीड की कड़ी, सह-मालिक के उत्तराधिकार का मुद्दा या सेटबैक विचलन बताएँ...')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Action Plan for Resolution', 'हल की कार्य-योजना')}</label>
                <input
                  type="text"
                  value={issueResolutionPlan}
                  onChange={(e) => setIssueResolutionPlan(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('e.g. Seller to obtain the Non-Encumbrance Certificate and bank NOC within 10 days', 'जैसे: विक्रेता 10 दिन में भार-मुक्त प्रमाणपत्र और बैंक NOC लाए')}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewIssueModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingIssue}
                  className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{isSavingIssue ? tx('Saving...', 'दर्ज हो रहा है...') : tx('Register Defect', 'दोष दर्ज करें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
