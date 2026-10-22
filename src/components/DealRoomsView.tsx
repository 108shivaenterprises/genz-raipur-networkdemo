import React, { useState, useEffect, useMemo } from 'react';
import {
  DealRoom,
  SiteVisit,
  UserProfile,
  DealTask,
  DealCommissionAgreement,
  TransactionReadinessReport,
  CollaborationOffer,
} from '../types/index.js';
import { DealTeamAccess } from './DealTeamAccess.js';
import { CommissionPayments } from './CommissionPayments.js';
import { LegalHelpPanel } from './LegalHelp.js';
import { api } from '../lib/api.js';
import { formatINR, formatDateTime, formatDate, printTarget } from '../lib/utils.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { useTemplateHi } from '../lib/templateHi.js';
import { DueDiligenceView } from './DueDiligenceView.js';
import { SiteVisitQrPassModal } from './SiteVisitQrPassModal.js';
import {
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileCheck2,
  AlertCircle,
  QrCode,
  KeyRound,
  Send,
  Loader2,
  ListTodo,
  FileText,
  Scale,
  Award,
  AlertTriangle,
  Upload,
  UserCheck,
  History,
  Download,
  PlusCircle,
  Check,
  X,
  Lock,
  Printer,
  ChevronRight,
  Shield,
  Eye,
  Info,
  MessageSquare,
  Phone,
  PhoneCall,
  Video,
  MapPin,
  Share2,
  ExternalLink,
  FolderLock,
  Sparkles,
} from 'lucide-react';
import { PropertyMediaAsset, MediaShareGrant, DealMessage } from '../types/index.js';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import { DealPipeline, StageStepper, NextSteps, MandatesBoard, DealCard } from './DealHub.js';
import { ShareToRoom } from './ShareToRoom.js';
import { SideFeePanel } from './SideFeePanel.js';
import { DealStatusPanel } from './DealStatusPanel.js';
import { PaymentRequestsPanel } from './PaymentRequestsPanel.js';
import { isClosed } from '../shared/dealClose.js';
import { ArrowLeft, ChevronLeft, Search as SearchIcon, LayoutGrid, FileSignature, MessagesSquare } from 'lucide-react';
import { ChatShell, ChatThread, type ThreadMsg } from './ChatKit.js';
import { lazyView } from '../lib/lazyView.js';
// v45 — the broker's client rooms sit next to his deal rooms (same Deals screen)
const ClientRoomsTab = lazyView(() => import('./ClientRooms.js'), 'ClientRoomsTab');

interface DealRoomsViewProps {
  deals: DealRoom[];
  currentUser: UserProfile;
  properties?: any[];
  offers?: CollaborationOffer[];
  onRefreshDeals: () => void;
  onRefreshOffers?: () => void;
  onOpenBrokerSafetyModal?: () => void;
  onOpenScheduleVisit: (dealId: string, propertyId: string) => void;
  onOpenVerifyVisitOtp: (visit: SiteVisit) => void;
  onOpenFileDispute: (dealId: string) => void;
  refreshTrigger?: number;
  /** Server-issued permission list. Tabs and calls the role may not use are never shown/made (the API enforces the same rules). */
  permissions?: string[];
}

const ASSET_CAT_HI: Record<string, string> = {
  PHOTOGRAPH: 'फ़ोटो', WALKTHROUGH_VIDEO: 'वॉकथ्रू वीडियो', OWNERSHIP_TITLE_DEED: 'मालिकाना / टाइटल डीड', SALE_DEED_CHAIN: 'पिछली बिक्री-डीड की चेन',
  LAYOUT_SITE_PLAN: 'मंज़ूर लेआउट / नक़्शा', SURVEY_MEASUREMENT: 'ज़मीन नाप / सीमांकन', TAX_RECEIPT_NOC: 'टैक्स रसीद / NOC', OTHER_ATTACHMENT: 'अन्य संलग्नक',
};
const SENSITIVITY_HI: Record<string, string> = { PUBLIC: 'सार्वजनिक', CONFIDENTIAL: 'गोपनीय', HIGHLY_SENSITIVE: 'अति संवेदनशील' };
const GRANT_TYPE_HI: Record<string, string> = {
  DEAL_ROOM_PARTICIPANTS: 'डील रूम के सदस्य', BROKER: 'चुना हुआ ब्रोकर', CONNECTOR: 'कनेक्टर', BUYER: 'वेरिफ़ाइड खरीदार', VERIFIED_GROUP: 'सभी वेरिफ़ाइड ब्रोकर',
};
const GRANT_PERM_HI: Record<string, string> = { PREVIEW: 'सिर्फ़ प्रीव्यू', VIEW: 'पूरा व्यू', DOWNLOAD: 'डाउनलोड की अनुमति' };
const PRECISION_HI: Record<string, string> = { EXACT_PIN: 'सटीक पिन', GENERAL_AREA: 'सामान्य इलाका (1 किमी)', APPROXIMATE_LOCALITY: 'सिर्फ़ मोटा इलाका' };

const TASK_CAT_HI: Record<string, string> = {
  INTRO_COMMUNICATION: 'परिचय और संवाद', DUE_DILIGENCE_LEGAL: 'Due diligence / क़ानूनी', FINANCIAL_LOAN: 'वित्त / लोन',
  REGISTRATION_GOVT: 'रजिस्ट्री / सरकारी', HANDOVER_CONSTRUCTION: 'हैंडओवर / निर्माण',
};
const ACCEPT_HI: Record<string, string> = { PENDING_ACCEPTANCE: 'स्वीकृति बाकी', ACCEPTED: 'स्वीकार', REJECTED: 'अस्वीकार' };
const TASK_STATUS_HI: Record<string, string> = { NOT_STARTED: 'शुरू नहीं', IN_PROGRESS: 'चल रहा', COMPLETED: 'पूरा', BLOCKED: 'रुका हुआ', WAIVED: 'छूट दी गई' };
const TASK_VERIFY_HI: Record<string, string> = { UNVERIFIED: 'जाँच बाकी', UNDER_REVIEW: 'जाँच चल रही', VERIFIED: 'जाँचा हुआ', REJECTED: 'अस्वीकृत' };
const AGR_STATUS_HI: Record<string, string> = {
  DRAFT: 'ड्राफ़्ट', SENT_TO_PARTICIPANTS: 'मंज़ूरी के लिए भेजा', ACCEPTED: 'स्वीकृत', ACTIVE: 'चालू', AMENDED: 'संशोधित', COMPLETED: 'पूरा', CANCELLED: 'रद्द', DISPUTED: 'विवाद में',
};
const ENTITLEMENT_HI: Record<string, string> = { AGREED: 'तय', EARNED: 'अर्जित', RECEIVABLE: 'मिलना बाकी', PAID: 'चुकाया', DISPUTED: 'विवाद में' };
const PAYER_HI: Record<string, string> = { SELLER: 'विक्रेता', BUYER: 'खरीदार', SPLIT_EQUAL: 'खरीदार-विक्रेता आधा-आधा', BUILDER_DEVELOPER: 'बिल्डर / डेवलपर' };
const AUTH_METHOD_HI: Record<string, string> = { COMPLIANT_E_SIGN_PKEY: 'डिजिटल मंज़ूरी', AADHAAR_ESIGN_GATEWAY: 'आधार e-Sign', DIGITAL_SEAL: 'डिजिटल सील' };

const OFFER_STATUS_HI: Record<string, string> = { PENDING: 'जवाब बाकी', ACCEPTED: 'मंज़ूर', REJECTED: 'ठुकराया', COUNTERED: 'काउंटर भेजा' };
const LEGAL_OPINION_HI: Record<string, string> = { TITLE_CLEAR_MARKETABLE: 'क़ानूनी समीक्षा पूरी', SUBJECT_TO_CONDITIONS: 'शर्तों के साथ', DEFECT_FOUND: 'कमी मिली', PENDING_OPINION: 'राय बाकी' };
const LEGAL_OPINION_EN: Record<string, string> = { TITLE_CLEAR_MARKETABLE: 'Legal review done', SUBJECT_TO_CONDITIONS: 'Subject to conditions', DEFECT_FOUND: 'Defect found', PENDING_OPINION: 'Opinion pending' };

/** The readiness engine writes its blockers in English; these are the Hindi readings of each known line. */
const blockerHi = (b: string): string => {
  let m = b.match(/^Blocked by (\d+) unresolved CRITICAL due diligence issue\(s\)\.$/);
  if (m) return `${m[1]} गंभीर (CRITICAL) due diligence मुद्दे अभी खुले हैं।`;
  if (b === 'Formal legal title review & opinion by qualified advocate is pending.') return 'योग्य वकील की औपचारिक टाइटल समीक्षा और राय बाकी है।';
  m = b.match(/^Overall due diligence completion is only (\d+)% \(minimum 70% required for registry scheduling\)\.$/);
  if (m) return `कुल due diligence सिर्फ़ ${m[1]}% पूरा है (रजिस्ट्री तय करने के लिए कम से कम 70% चाहिए)।`;
  if (b === 'Pending acceptance of task responsibilities by one or more participants in the Deal Room.') return 'डील रूम में एक या अधिक सदस्यों ने अपनी ज़िम्मेदारियाँ अभी स्वीकार नहीं कीं।';
  return b;
};
const DISCLAIMER_EN = 'CONFIDENTIAL WORKFLOW REPORT: Platform verification is an internal risk assessment mechanism and does not constitute a statutory government title guarantee, judicial certification, or substitute for registered deed vetting by an independent advocate.';
const DISCLAIMER_HI = 'गोपनीय वर्कफ़्लो रिपोर्ट: प्लेटफ़ॉर्म की जाँच एक अंदरूनी जोखिम-आकलन है। यह सरकारी टाइटल गारंटी, न्यायिक प्रमाणन या किसी स्वतंत्र वकील द्वारा रजिस्टर्ड डीड की जाँच का विकल्प नहीं है।';

export type DealSubTab =
  | 'overview'
  | 'antibypass_protocol'
  | 'responsibilities'
  | 'commission_agreement'
  | 'due_diligence'
  | 'readiness_report'
  | 'chat_call'
  | 'media_vault'
  | 'disputes_holds'
  | 'legal_help';

export const DealRoomsView: React.FC<DealRoomsViewProps> = ({
  deals,
  currentUser,
  properties = [],
  offers = [],
  onRefreshDeals,
  onRefreshOffers,
  onOpenBrokerSafetyModal,
  onOpenScheduleVisit,
  onOpenVerifyVisitOtp,
  onOpenFileDispute,
  refreshTrigger,
  permissions,
}) => {
  const tx = useTx();
  const label = useLabel();
  const th = useTemplateHi();
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const enumLabel = (map: Record<string, string>, v?: string) => (hi ? map[v || ''] ?? (v || '').replace(/_/g, ' ') : (v || '').replace(/_/g, ' '));
  // No list passed → do not hide anything in the UI (the server still enforces every call).
  const perm = (...p: string[]) => !permissions || p.some((x) => permissions.includes(x));
  const urlQ = (() => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } })();
  const [selectedDealId, setSelectedDealId] = useState<string>(urlQ.get('deal') || deals[0]?.id || '');
  const [dealDetail, setDealDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<DealSubTab>(urlQ.get('sub') === 'chat_call' ? 'chat_call' : 'overview');
  const [selectedVisitForQrPass, setSelectedVisitForQrPass] = useState<SiteVisit | null>(null);

  // Top-Level Mode: Deal Rooms vs Collaboration Proposals
  // owners and employees of a broker are not parties to the broker↔broker commission: they get the redacted view
  const isOwnerViewer = currentUser.role === 'PROPERTY_OWNER' || currentUser.role === 'TEAM_MEMBER';
  // v37 — Deal Hub: the pipeline (board / list) is the home of this tab; a deal room opens from a card
  const [mainMode, setMainMode] = useState<'PIPELINE' | 'DEAL_ROOMS' | 'PROPOSALS' | 'MANDATES' | 'ROOMS'>(() => {
    if (urlQ.get('deal')) return 'DEAL_ROOMS';
    const v = urlQ.get('view');
    return v === 'mandates' ? 'MANDATES' : v === 'proposals' ? 'PROPOSALS' : v === 'room' ? 'DEAL_ROOMS' : v === 'rooms' ? 'ROOMS' : 'PIPELINE';
  });
  // v45 — my client rooms, to show them beside the deals and to link a deal to the rooms that carry its property
  const canRooms = perm('clientroom:use') && currentUser.role === 'BROKER';
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [roomKey, setRoomKey] = useState(0);
  useEffect(() => {
    if (!canRooms) return;
    let live = true;
    const pull = () => { api.crList().then(r => { if (live) setMyRooms((r.rooms || []).filter((x: any) => x.status === 'ACTIVE')); }).catch(() => undefined); };
    pull();
    window.addEventListener('genz:rooms-changed', pull);
    return () => { live = false; window.removeEventListener('genz:rooms-changed', pull); };
  }, [canRooms, mainMode]);
  const roomsFor = (propertyId: string) => myRooms.filter((r: any) => (r.propertyIds || []).includes(propertyId));
  const openClientRoom = (roomId?: string) => {
    try { const u = new URL(window.location.href); if (roomId) u.searchParams.set('room', roomId); else u.searchParams.delete('room'); window.history.replaceState(null, '', u.toString()); } catch { /* old browser */ }
    setRoomKey(k => k + 1);
    setMainMode('ROOMS');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* old browser */ }
  };
  const roomsAlert = myRooms.some((r: any) => r.unread > 0 || r.openVisits > 0 || r.codeAsk);
  // keep the chosen mode's button in view on a phone (the switch scrolls sideways)
  useEffect(() => { try { document.querySelector(`[data-testid="deal-mode-${mainMode}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch { /* old browser */ } }, [mainMode]);
  const [hub, setHub] = useState<any>(null);
  const [listQ, setListQ] = useState('');
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'MINE' | 'OPEN' | 'OVERDUE' | 'REVIEW'>('ALL');
  const [proposalSubTab, setProposalSubTab] = useState<'INCOMING' | 'SENT'>('INCOMING');
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [counterModal, setCounterModal] = useState<{
    open: boolean;
    offer: CollaborationOffer;
    introShare: number;
    closeShare: number;
    notes: string;
  } | null>(null);
  const [isSubmittingCounter, setIsSubmittingCounter] = useState(false);
  // v41: counter a % split with "apna-apna side" (each broker keeps his own client's fee)
  const [ownCounter, setOwnCounter] = useState<{ offer: CollaborationOffer; side: 'SELLER' | 'BUYER' } | null>(null);
  const sendOwnSideCounter = async () => {
    if (!ownCounter) return;
    setIsSubmittingCounter(true);
    try {
      const res = await api.respondOffer(ownCounter.offer.id, { decision: 'COUNTER', counterFeeMode: 'OWN_SIDE', mySide: ownCounter.side });
      if (res.success) { alert(tx('Counter-proposal sent.', 'काउंटर-प्रस्ताव भेज दिया गया।')); setOwnCounter(null); onRefreshOffers?.(); }
    } catch (err: any) {
      alert(err.message || tx('Could not send the counter offer', 'काउंटर ऑफ़र भेजा नहीं जा सका'));
    } finally { setIsSubmittingCounter(false); }
  };

  // Filter offers for current user
  const incomingOffers = useMemo(() => {
    return (offers || []).filter(
      (o) =>
        o.receivingBrokerId === currentUser.id ||
        currentUser.role === 'SUPERADMIN' ||
        currentUser.role === 'ADMIN'
    );
  }, [offers, currentUser]);

  const sentOffers = useMemo(() => {
    return (offers || []).filter((o) => o.proposingBrokerId === currentUser.id);
  }, [offers, currentUser]);

  const pendingIncomingCount = useMemo(() => {
    return incomingOffers.filter((o) => o.status === 'PENDING').length;
  }, [incomingOffers]);

  // Tasks state (Module A1)
  const [tasks, setTasks] = useState<DealTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Complete task modal
  const [completeTaskItem, setCompleteTaskItem] = useState<DealTask | null>(null);
  const [completeNote, setCompleteNote] = useState('');
  const [completeEvidenceName, setCompleteEvidenceName] = useState('');
  const [completeEvidenceUrl, setCompleteEvidenceUrl] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Verify task modal
  const [verifyTaskItem, setVerifyTaskItem] = useState<DealTask | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'VERIFIED' | 'REJECTED'>('VERIFIED');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [isVerifyingTask, setIsVerifyingTask] = useState(false);

  // Reassign task modal
  const [reassignTaskItem, setReassignTaskItem] = useState<DealTask | null>(null);
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  // Only people who are IN this deal (participants, their allotted employees, the empanelled legal counsel, the GENZ desk) — the server decides the list
  const [reassignCandidates, setReassignCandidates] = useState<{ id: string; name: string; role: string; group: 'PARTICIPANT' | 'TEAM' | 'LEGAL' | 'DESK'; title?: string; employerName?: string }[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);
  useEffect(() => {
    if (!reassignTaskItem || !selectedDealId) return;
    setReassignLoading(true); setReassignUserId('');
    api.dealAssignees(selectedDealId)
      .then((r) => setReassignCandidates(r.assignees.filter((a) => a.id !== reassignTaskItem.assignedParticipantId)))
      .catch(() => setReassignCandidates([]))
      .finally(() => setReassignLoading(false));
  }, [reassignTaskItem, selectedDealId]);
  const [isReassigningTask, setIsReassigningTask] = useState(false);

  // Commission Agreements state (Module A2 & A3)
  const [agreements, setAgreements] = useState<DealCommissionAgreement[]>([]);
  const [selectedAgreementVersion, setSelectedAgreementVersion] = useState<number>(1);
  const [showProposeAgreementModal, setShowProposeAgreementModal] = useState(false);
  const [showESignModal, setShowESignModal] = useState(false);
  const [eSignNotes, setESignNotes] = useState('');
  const [isSubmittingESign, setIsSubmittingESign] = useState(false);

  // Proposal form state
  const [propTotalFee, setPropTotalFee] = useState(0);
  const [propDealValue, setPropDealValue] = useState(0);
  const [propPayer, setPropPayer] = useState<'SPLIT_EQUAL' | 'SELLER' | 'BUYER' | 'BUILDER_DEVELOPER'>('SPLIT_EQUAL');
  const [propIntroPct, setPropIntroPct] = useState(50);
  const [propClosePct, setPropClosePct] = useState(50);
  const [propReason, setPropReason] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  // Readiness Report state (Module B6)
  const [readinessReport, setReadinessReport] = useState<TransactionReadinessReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Load selected deal detail
  const loadDetail = async (id: string) => {
    setSelectedDealId(id);
    setLoadingDetail(true);
    try {
      const res = await api.getDeal(id);
      setDealDetail(res);
      setLoadingDetail(false);
      // v21: a GENZ admin gets the summary only (no open dispute) — nothing inside the room is requested, the tabs are hidden
      if (res.access?.level === 'SUMMARY') {
        setActiveSubTab('overview');
        setTasks([]); setAgreements([]); setMessages([]);
        return;
      }
      // Only call what this role may read — e.g. legal counsel has no chat/agreements, an employee has no vault/readiness.
      if (perm('task:read')) loadTasks(id);
      if (!isOwnerViewer && perm('agreement:read')) loadAgreements(id);
      if (perm('dd:read')) loadReadinessReport(id);
      if (perm('deal:chat')) loadMessages(id);
      if (res.property?.id) {
        if (perm('property:read')) loadVault(res.property.id);
        // Pre-fill location state
        setLocState(res.property.state || '');
        setLocCity(res.property.city || '');
        setLocLocality(res.property.locality || '');
        setLocVillage(res.property.village || '');
        setLocStreet(res.property.street || '');
        setLocPincode(res.property.pincode || '');
        setLocLandmark(res.property.landmark || '');
        setLocMapsUrl(res.property.googleMapsUrl || '');
        setLocPrecision(res.property.locationPrecision || 'EXACT_PIN');
      }
    } catch (err) {
      console.error(err);
      setLoadingDetail(false);
    }
  };

  const loadTasks = async (dealId: string) => {
    setLoadingTasks(true);
    try {
      const res = await api.getDealTasks(dealId);
      setTasks(res.tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const loadAgreements = async (dealId: string) => {
    try {
      const res = await api.getDealCommissionAgreements(dealId);
      setAgreements(res.agreements);
      if (res.agreements.length > 0) {
        setSelectedAgreementVersion(res.agreements[res.agreements.length - 1].version);
      }
    } catch (err) {
      if (!/Forbidden/i.test(String(err))) console.error('Failed to load commission agreements:', err); // roles without agreement access simply see none
    }
  };

  const loadReadinessReport = async (dealId: string) => {
    setLoadingReport(true);
    try {
      const res = await api.getReadinessReport(dealId);
      setReadinessReport(res.report);
    } catch (err) {
      console.error('Failed to load readiness report:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      setRespondingOfferId(offerId);
      const res = await api.respondOffer(offerId, { decision: 'ACCEPT' });
      if (res.success) {
        alert(tx('Collaboration offer accepted! A new Deal Room has been created. The anti-bypass rule applies.', 'कोलैबोरेशन ऑफ़र मंज़ूर! नया डील रूम बन गया है। एंटी-बायपास नियम लागू है।'));
        onRefreshDeals();
        onRefreshOffers?.();
        if (res.dealRoom?.id) {
          setSelectedDealId(res.dealRoom.id);
          setMainMode('DEAL_ROOMS');
        }
      }
    } catch (err: any) {
      alert(err.message || tx('Could not accept the proposal', 'प्रस्ताव मंज़ूर नहीं हो पाया'));
    } finally {
      setRespondingOfferId(null);
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (!confirm(tx('Decline this collaboration proposal?', 'यह कोलैबोरेशन प्रस्ताव ठुकराएँ?'))) return;
    try {
      setRespondingOfferId(offerId);
      const res = await api.respondOffer(offerId, { decision: 'REJECT' });
      if (res.success) {
        alert(tx('Collaboration proposal declined.', 'प्रस्ताव ठुकरा दिया गया।'));
        onRefreshOffers?.();
      }
    } catch (err: any) {
      alert(err.message || tx('Could not decline the proposal', 'प्रस्ताव ठुकराया नहीं जा सका'));
    } finally {
      setRespondingOfferId(null);
    }
  };

  const handleSendCounterOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterModal) return;
    if (counterModal.introShare + counterModal.closeShare !== 100) {
      alert(tx('Shares must total exactly 100%', 'दोनों हिस्से मिलकर ठीक 100% होने चाहिए'));
      return;
    }
    setIsSubmittingCounter(true);
    try {
      const res = await api.respondOffer(counterModal.offer.id, {
        decision: 'COUNTER',
        counterIntroducingShare: counterModal.introShare,
        counterClosingShare: counterModal.closeShare,
        notes: counterModal.notes,
      });
      if (res.success) {
        alert(tx('Counter-proposal sent.', 'काउंटर-प्रस्ताव भेज दिया गया।'));
        setCounterModal(null);
        onRefreshOffers?.();
      }
    } catch (err: any) {
      alert(err.message || tx('Could not send the counter offer', 'काउंटर ऑफ़र भेजा नहीं जा सका'));
    } finally {
      setIsSubmittingCounter(false);
    }
  };

  // Chat & Call state
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [chatErr, setChatErr] = useState('');

  // Property Media Vault & Selective Sharing state
  const [vaultAssets, setVaultAssets] = useState<PropertyMediaAsset[]>([]);
  const [vaultGrants, setVaultGrants] = useState<MediaShareGrant[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);
  const [isOwnerOrListingBroker, setIsOwnerOrListingBroker] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Upload Asset Form State
  const [uploadCategory, setUploadCategory] = useState<'PHOTOGRAPH' | 'WALKTHROUGH_VIDEO' | 'OWNERSHIP_TITLE_DEED' | 'SALE_DEED_CHAIN' | 'LAYOUT_SITE_PLAN' | 'SURVEY_MEASUREMENT' | 'TAX_RECEIPT_NOC' | 'OTHER_ATTACHMENT'>('PHOTOGRAPH');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileUrl, setUploadFileUrl] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadSensitivity, setUploadSensitivity] = useState<'PUBLIC' | 'CONFIDENTIAL' | 'HIGHLY_SENSITIVE'>('CONFIDENTIAL');
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);

  // Sharing Grant Form State
  const [grantRecipientType, setGrantRecipientType] = useState<'BROKER' | 'CONNECTOR' | 'BUYER' | 'DEAL_ROOM_PARTICIPANTS' | 'VERIFIED_GROUP'>('DEAL_ROOM_PARTICIPANTS');
  const [grantRecipientName, setGrantRecipientName] = useState('');
  const [grantAssetIds, setGrantAssetIds] = useState<string[]>([]);
  const [grantPermission, setGrantPermission] = useState<'PREVIEW' | 'VIEW' | 'DOWNLOAD'>('VIEW');
  const [grantLocationPrecision, setGrantLocationPrecision] = useState<'APPROXIMATE_LOCALITY' | 'GENERAL_AREA' | 'EXACT_PIN'>('EXACT_PIN');
  const [grantExpiresDays, setGrantExpiresDays] = useState(30);
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

  // Location Editor State
  const [locState, setLocState] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locLocality, setLocLocality] = useState('');
  const [locVillage, setLocVillage] = useState('');
  const [locStreet, setLocStreet] = useState('');
  const [locPincode, setLocPincode] = useState('');
  const [locLandmark, setLocLandmark] = useState('');
  const [locMapsUrl, setLocMapsUrl] = useState('');
  const [locPrecision, setLocPrecision] = useState<'APPROXIMATE_LOCALITY' | 'GENERAL_AREA' | 'EXACT_PIN'>('EXACT_PIN');
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  const loadMessages = async (dealId: string) => {
    try {
      const res = await api.getDealMessages(dealId);
      setMessages(res.messages);
    } catch (err) {
      if (!/Forbidden/i.test(String(err))) console.error('Failed to load messages:', err);
    }
  };

  const loadVault = async (propertyId: string) => {
    setLoadingVault(true);
    try {
      const res = await api.getVaultAssets(propertyId);
      setVaultAssets(res.assets);
      setIsOwnerOrListingBroker(res.isOwnerOrListingBroker);
      if (res.isOwnerOrListingBroker) {
        const grantsRes = await api.getVaultGrants(propertyId);
        setVaultGrants(grantsRes.grants);
      }
    } catch (err) {
      console.error('Failed to load vault assets:', err);
    } finally {
      setLoadingVault(false);
    }
  };

  // v50 — send from the chat screen (the text stays in the box when it is refused)
  const sendChat = async (text: string) => {
    if (!selectedDealId) return false;
    setChatErr('');
    try {
      const res = await api.sendDealMessage(selectedDealId, { text });
      setMessages(prev => [...prev, res.message]);
      window.dispatchEvent(new Event('genz:chats-changed'));
      return true;
    } catch (err: any) {
      setChatErr(err.message || tx('Could not send the message', 'संदेश भेजा नहीं जा सका'));
      return false;
    }
  };
  // v50 — while the chat is open: tell the server how far I have read, and look for new messages every 12 seconds
  const chatOpen = activeSubTab === 'chat_call' && mainMode === 'DEAL_ROOMS';
  useEffect(() => {
    if (!chatOpen || !selectedDealId) return;
    const id = selectedDealId;
    const seen = () => api.chatRead(id).then(() => window.dispatchEvent(new Event('genz:chats-changed'))).catch(() => undefined);
    seen();
    const t = setInterval(() => { if (!document.hidden) loadMessages(id).then(seen); }, 12000);
    return () => clearInterval(t);
  }, [chatOpen, selectedDealId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDealId && deals.length > 0) {
      setSelectedDealId(deals[0].id);
    }
  }, [deals, selectedDealId]);

  useEffect(() => {
    if (selectedDealId && mainMode === 'DEAL_ROOMS') {
      loadDetail(selectedDealId);
    }
  }, [selectedDealId, refreshTrigger, mainMode === 'DEAL_ROOMS']); // eslint-disable-line react-hooks/exhaustive-deps

  // v37 — Deal Hub data (pipeline cards, KPIs, next steps). If it cannot load, the cards are built from the deal list itself.
  const fallbackHub = () => ({
    stages, stalledDays: 14,
    deals: deals.map((d) => ({ id: d.id, stage: d.stage, stageIndex: stages.indexOf(d.stage), propertyId: d.propertyId, propertyTitle: (properties || []).find((p: any) => p.id === d.propertyId)?.title || d.propertyId, locality: '', city: '', myRole: d.introducingBrokerId === currentUser.id ? 'INTRODUCING' : d.closingBrokerId === currentUser.id ? 'CLOSING' : d.ownerId === currentUser.id ? 'OWNER' : 'OTHER', next: [], needsMe: false, lastActivityAt: d.updatedAt, idleDays: 0, stalled: false, openDispute: d.stage === 'Disputed' })),
    kpis: { total: deals.length, live: deals.filter((d) => d.stage !== 'Settled').length, settled: deals.filter((d) => d.stage === 'Settled').length, needsMe: 0, stalled: 0, disputes: 0, myPipeline: 0, hasMoney: false },
  });
  const loadHub = () => api.dealHub().then(setHub).catch(() => setHub(fallbackHub()));
  useEffect(() => { loadHub(); }, [deals, refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps
  const hubItemOf = (id?: string) => (hub?.deals || []).find((x: any) => x.id === id);
  const tabAllowed = (t?: string): t is DealSubTab => !!t && (t === 'overview' || t === 'antibypass_protocol'
    || (t === 'chat_call' && perm('deal:chat')) || (t === 'responsibilities' && perm('task:read'))
    || (t === 'commission_agreement' && !isOwnerViewer && perm('agreement:read'))
    || ((t === 'due_diligence' || t === 'readiness_report') && perm('dd:read')) || (t === 'media_vault' && perm('property:read'))
    || (t === 'disputes_holds' && perm('dispute:read', 'dispute:create')));
  const filterFor = (kind?: string) => (kind === 'TASKS_TO_VERIFY' ? 'REVIEW' : kind === 'TASKS_OVERDUE' ? 'OVERDUE' : kind === 'TASKS_TO_ACCEPT' || kind === 'TASKS_TO_DO' ? 'MINE' : 'ALL') as typeof taskFilter;
  const openDeal = (id: string, tab?: string, kind?: string) => {
    setSelectedDealId(id);
    setActiveSubTab(tabAllowed(tab) ? tab : 'overview');
    setTaskFilter(filterFor(kind));
    setMainMode('DEAL_ROOMS');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* old browser */ }
  };

  const stages = [
    'Lead',
    'Introduction',
    'Site Visit Done',
    'Negotiation',
    'Agreement',
    'Handover',
    'Settled',
  ];

  const handleStageChange = async (newStage: string) => {
    if (!dealDetail) return;
    try {
      await api.updateDealStage(dealDetail.deal.id, newStage);
      loadDetail(dealDetail.deal.id);
      onRefreshDeals();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Task Handlers
  const handleAcceptTask = async (taskId: string, acceptance: 'ACCEPTED' | 'REJECTED') => {
    try {
      await api.acceptDealTask(selectedDealId, taskId, acceptance);
      loadTasks(selectedDealId);
      loadReadinessReport(selectedDealId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeTaskItem) return;
    setIsSubmittingTask(true);
    try {
      await api.completeDealTask(selectedDealId, completeTaskItem.id, {
        completionNote: completeNote.trim(),
        // Only a real https link is stored as evidence; a bare name is kept as a reference note (no invented file).
        evidenceAttachments: completeEvidenceName.trim() || completeEvidenceUrl.trim()
          ? [{ name: completeEvidenceName.trim() || tx('Evidence link', 'सबूत का लिंक'), url: completeEvidenceUrl.trim() }]
          : [],
      });
      setCompleteTaskItem(null);
      setCompleteNote('');
      setCompleteEvidenceName('');
      setCompleteEvidenceUrl('');
      loadTasks(selectedDealId);
      loadReadinessReport(selectedDealId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleVerifyTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTaskItem) return;
    setIsVerifyingTask(true);
    try {
      await api.verifyDealTask(selectedDealId, verifyTaskItem.id, {
        verificationStatus: verifyStatus,
        verificationNotes: verifyNotes.trim() || `${verifyStatus === 'VERIFIED' ? 'Verified' : 'Rejected'} by ${currentUser.name}`,
      });
      setVerifyTaskItem(null);
      setVerifyNotes('');
      loadTasks(selectedDealId);
      loadReadinessReport(selectedDealId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsVerifyingTask(false);
    }
  };

  const handleReassignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTaskItem || !reassignUserId) return;
    setIsReassigningTask(true);
    try {
      const targetUser = reassignCandidates.find((u) => u.id === reassignUserId);
      if (!targetUser) throw new Error(tx('User not found', 'यूज़र नहीं मिला'));

      await api.assignDealTask(selectedDealId, reassignTaskItem.id, {
        assignedParticipantId: targetUser.id,
        assignedParticipantName: targetUser.name,
        assignedParticipantRole: targetUser.role,
        reason: reassignReason.trim(),
      });
      setReassignTaskItem(null);
      setReassignReason('');
      loadTasks(selectedDealId);
      loadReadinessReport(selectedDealId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsReassigningTask(false);
    }
  };

  // Commission Agreement Handlers
  const handleProposeAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (propIntroPct + propClosePct !== 100) {
      setProposalError(tx('Allocations must total exactly 100%', 'दोनों हिस्से मिलकर ठीक 100% होने चाहिए'));
      return;
    }
    setIsSubmittingProposal(true);
    setProposalError('');
    try {
      const introUser = dealDetail?.participants?.introducingBroker;
      const closeUser = dealDetail?.participants?.closingBroker;
      if (!introUser?.id || !closeUser?.id) throw new Error(tx('Both brokers must be part of this deal room', 'इस डील रूम में दोनों ब्रोकर होने चाहिए'));
      // TDS % is the builder/CA's call per project — never hard-coded here; the server applies the project default when this is empty.
      const prevTds = (pid: string) => currentAgreement?.allocations?.find((a) => a.participantId === pid)?.taxDeductionTdsPct;

      const allocations = [
        {
          participantId: introUser.id,
          participantName: introUser.name,
          role: 'BROKER',
          allocationPct: propIntroPct,
          basisDescription: `${propIntroPct}% for buyer introduction, client qualification & inspection coordination`,
          taxDeductionTdsPct: prevTds(introUser.id),
          invoiceRequired: true,
        },
        {
          participantId: closeUser.id,
          participantName: closeUser.name,
          role: 'BROKER',
          allocationPct: propClosePct,
          basisDescription: `${propClosePct}% for exclusive owner mandate, document collection & registry execution`,
          taxDeductionTdsPct: prevTds(closeUser.id),
          invoiceRequired: true,
        },
      ];

      const res = await api.proposeCommissionAgreement(selectedDealId, {
        totalAgreedBrokerage: propTotalFee,
        ...(propDealValue > 0 ? { dealValue: propDealValue } : {}),
        payer: propPayer,
        contractualBasis: 'Co-brokerage mandate and anti-bypass rule (GENZ platform terms)',
        calculationBasis: 'PERCENTAGE_OF_TOTAL_DEAL_VALUE',
        allocations,
        proposalReason: propReason.trim(),
      });

      setShowProposeAgreementModal(false);
      loadAgreements(selectedDealId);
      setSelectedAgreementVersion(res.agreement.version);
      onRefreshDeals();
    } catch (err: any) {
      setProposalError(err.message);
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleSignAgreement = async () => {
    const activeAgreement = agreements.find((a) => a.version === selectedAgreementVersion);
    if (!activeAgreement) return;
    setIsSubmittingESign(true);
    try {
      await api.approveCommissionAgreement(selectedDealId, activeAgreement.id, {
        authMethod: 'COMPLIANT_E_SIGN_PKEY',
        signerNotes: eSignNotes.trim() || 'Terms approved',
      });
      setShowESignModal(false);
      setESignNotes('');
      loadAgreements(selectedDealId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingESign(false);
    }
  };

  const handleGenerateReadinessReport = async () => {
    try {
      const res = await api.generateReadinessReport(selectedDealId);
      setReadinessReport(res.report);
      alert(tx('Readiness report compiled and saved with a SHA-256 integrity hash.', 'तैयारी रिपोर्ट बन गई और SHA-256 हैश के साथ सेव हो गई।'));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const activeDeal = dealDetail?.deal;
  // v21: a GENZ admin without an open dispute sees the summary only; the brokers see a notice about when GENZ may look inside
  const summaryOnly = dealDetail?.access?.level === 'SUMMARY';
  const isDealBrokerViewer = !!activeDeal && (activeDeal.introducingBrokerId === currentUser.id || activeDeal.closingBrokerId === currentUser.id);
  // The commission split between the two brokers is confidential: owners never see it.
  const hideCommercials = isOwnerViewer || !!activeDeal?.commercialsHidden;
  const activeProperty = dealDetail?.property;
  const activeVisits = dealDetail?.siteVisits || [];
  const participants = dealDetail?.participants;
  // The other broker in this deal (vault grants can target exactly this person).
  const otherBroker: any = [participants?.introducingBroker, participants?.closingBroker].find((b: any) => b?.id && b.id !== currentUser.id);
  const otherBrokerId: string = otherBroker?.id || '';
  const otherBrokerName: string = otherBroker?.name || '';

  const currentAgreement = agreements.find((a) => a.version === selectedAgreementVersion) || agreements[agreements.length - 1];

  // Responsibility Matrix metrics
  const applicableTasks = tasks.filter((t) => t.isApplicable);
  const acceptedTasksCount = applicableTasks.filter((t) => t.assignmentAcceptance === 'ACCEPTED').length;
  const completedTasksCount = applicableTasks.filter((t) => t.taskStatus === 'COMPLETED').length;
  const verifiedTasksCount = applicableTasks.filter((t) => t.verificationStatus === 'VERIFIED').length;

  return (
    <div className="space-y-6">
      {/* v37 — Deal Hub header: title + one segmented switch for Pipeline / Deal room / Proposals / Mandates */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{tx('Broker-to-broker Deal Rooms', 'ब्रोकर-से-ब्रोकर डील रूम')}</span>
            <span aria-hidden="true">·</span>
            <span>{deals.length} {tx('deal rooms', 'डील रूम')}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-medium">{tx('anti-bypass rule applies', 'एंटी-बायपास नियम लागू')}</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {mainMode === 'PIPELINE' ? tx('Deal pipeline', 'डील पाइपलाइन')
              : mainMode === 'MANDATES' ? tx('Owners — brokerage terms', 'मालिक — ब्रोकरेज की शर्तें')
              : mainMode === 'ROOMS' ? tx('Client rooms', 'क्लाइंट रूम')
              : mainMode === 'PROPOSALS' && !isOwnerViewer ? tx('Co-broking offers', 'को-ब्रोकिंग ऑफ़र')
              : tx('Deal room', 'डील रूम')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {mainMode === 'PIPELINE' ? tx('Every deal by stage — what needs you first. Tap a card to open its deal room.', 'हर डील स्टेज के हिसाब से — पहले वो जिसमें आपका काम बाकी है। डील रूम खोलने के लिए कार्ड दबाएँ।')
              : mainMode === 'MANDATES' ? tx('Brokerage mandates signed by owners — status, terms and protection days left.', 'मालिकों के साइन किए ब्रोकरेज मैंडेट — स्थिति, शर्तें और सुरक्षा के बचे दिन।')
              : mainMode === 'ROOMS' ? tx('Your buyers’ private rooms — share homes, chat, and book visits. A deal shows the rooms that have its property.', 'आपके खरीदारों के निजी रूम — प्रॉपर्टी भेजें, बात करें, विज़िट तय करें। हर डील में वो रूम दिखते हैं जिनमें उसकी प्रॉपर्टी है।')
              : mainMode === 'PROPOSALS' && !isOwnerViewer ? tx('Offers other brokers sent on your listings, and the ones you sent. Accepting one opens a deal room.', 'आपकी लिस्टिंग पर दूसरे ब्रोकरों के ऑफ़र, और आपके भेजे ऑफ़र। मंज़ूर करते ही डील रूम खुलता है।')
              : tx('Who does what, the brokerage agreement, title check and registry — all for this deal in one place.', 'कौन क्या करेगा, ब्रोकरेज समझौता, टाइटल जाँच और रजिस्ट्री — इस डील का सब एक जगह।')}
          </p>
        </div>
      </div>
      <div className="-mt-2 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" data-testid="deal-modes">
        {([
          ['PIPELINE', LayoutGrid, tx('Pipeline', 'पाइपलाइन'), hub?.kpis?.live ?? deals.length, (hub?.kpis?.needsMe || 0) > 0],
          ['DEAL_ROOMS', Briefcase, selectedDealId && mainMode === 'DEAL_ROOMS' ? `${tx('Deal room', 'डील रूम')} · ${selectedDealId}` : tx('Deal room', 'डील रूम'), undefined, false],
          ...(!isOwnerViewer ? [['PROPOSALS', Sparkles, tx('Offers', 'ऑफ़र'), (offers || []).length, pendingIncomingCount > 0]] : []),
          ...(canRooms ? [['ROOMS', MessagesSquare, tx('Client rooms', 'क्लाइंट रूम'), myRooms.length, roomsAlert]] : []),
          ...(perm('mandate:read') ? [['MANDATES', FileSignature, tx('Owners', 'मालिक'), undefined, false]] : []),
        ] as [typeof mainMode, React.ElementType, string, number | undefined, boolean][]).map(([id, Icon, text, n, dot]) => (
          <button key={id} type="button" role="tab" aria-selected={mainMode === id}
            onClick={() => (id === 'DEAL_ROOMS' && !selectedDealId && deals[0] ? openDeal(deals[0].id) : id === 'ROOMS' ? openClientRoom() : setMainMode(id))}
            className={`relative inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${mainMode === id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} data-testid={`deal-mode-${id}`}>
            <Icon className="h-3.5 w-3.5" /><span className="whitespace-nowrap">{text}</span>
            {n !== undefined && <span className={`rounded-full px-1.5 text-[10px] font-bold ${mainMode === id ? 'bg-white/20 text-white' : 'bg-white text-slate-700'}`}>{n}</span>}
            {dot && <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {mainMode === 'PIPELINE' ? (
        <DealPipeline hub={hub} onOpen={openDeal} showRoles={currentUser.role === 'BROKER'} />
      ) : mainMode === 'MANDATES' ? (
        <MandatesBoard currentUser={currentUser} deals={hub?.deals || []} onOpenDeal={(id) => openDeal(id)} />
      ) : mainMode === 'ROOMS' && canRooms ? (
        <React.Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}>
          <div data-testid="deals-client-rooms"><ClientRoomsTab key={roomKey} /></div>
        </React.Suspense>
      ) : mainMode === 'DEAL_ROOMS' || isOwnerViewer ? (
      /* Main Grid: Left List + Right Deal Room Details */
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Left Column: Deal List (v37: search, property names, progress, next step) */}
        <div className="hidden space-y-3 lg:col-span-1 lg:block">
          <button type="button" onClick={() => setMainMode('PIPELINE')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900" data-testid="back-to-pipeline"><ArrowLeft className="h-3.5 w-3.5" />{tx('All deals', 'सभी डील')}</button>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-xs" value={listQ} onChange={(e) => setListQ(e.target.value)} placeholder={tx('Find a deal…', 'डील खोजें…')} />
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {(hub?.deals || fallbackHub().deals)
              .filter((d: any) => !listQ.trim() || [d.id, d.propertyId, d.propertyTitle, d.locality, d.counterpartName].filter(Boolean).some((x: string) => x.toLowerCase().includes(listQ.trim().toLowerCase())))
              .map((d: any) => <DealCard key={d.id} d={d} compact selected={d.id === selectedDealId} onOpen={(id) => openDeal(id)} />)}
          </div>
        </div>

        {/* Right Column: Active Deal Room Hub */}
        <div className="space-y-5 lg:col-span-3">
          {/* v37 — on a phone the deal list is a switcher: back to the pipeline, pick a deal, previous / next */}
          {deals.length > 0 && (() => {
            const ids = (hub?.deals || deals).map((d: any) => d.id);
            const at = ids.indexOf(selectedDealId);
            const go = (k: number) => { const id = ids[(at + k + ids.length) % ids.length]; if (id) openDeal(id); };
            return (
              <div className="flex items-center gap-2 lg:hidden" data-testid="deal-switcher">
                <button type="button" onClick={() => setMainMode('PIPELINE')} className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-2.5" aria-label={tx('All deals', 'सभी डील')}><ArrowLeft className="h-4 w-4" /></button>
                <select value={selectedDealId} onChange={(e) => openDeal(e.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold">
                  {(hub?.deals || deals).map((d: any) => <option key={d.id} value={d.id}>{d.id} · {d.propertyTitle || d.propertyId} · {label('dealStage', d.stage)}</option>)}
                </select>
                {ids.length > 1 && <>
                  <button type="button" onClick={() => go(-1)} className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-2" aria-label={tx('Previous deal', 'पिछली डील')}><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={() => go(1)} className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-2" aria-label={tx('Next deal', 'अगली डील')}><ChevronRight className="h-4 w-4" /></button>
                </>}
              </div>
            );
          })()}
          {deals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              {tx('No deal room yet.', 'अभी कोई डील रूम नहीं।')} <button type="button" className="font-semibold underline" onClick={() => setMainMode('PIPELINE')}>{tx('Back to the pipeline', 'पाइपलाइन पर वापस')}</button>
            </div>
          ) : loadingDetail || !activeDeal ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              {tx('Loading deal room details...', 'डील रूम की जानकारी लोड हो रही है...')}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Deal Header Overview Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                      <span>{activeDeal.id}</span>
                      <span>·</span>
                      <span className="text-emerald-700 font-semibold">{activeDeal.propertyId}</span>
                      <span>·</span>
                      <span>{tx('Requirement', 'आवश्यकता')}: {activeDeal.requirementId}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {activeProperty?.title || tx('Property transaction', 'प्रॉपर्टी लेन-देन')}
                    </h3>
                    {currentUser.role === 'BROKER' && (activeDeal.introducingBrokerId === currentUser.id || activeDeal.closingBrokerId === currentUser.id) && (
                      <DealTeamAccess dealId={activeDeal.id} allotted={activeDeal.teamMemberIds || []} onChanged={onRefreshDeals} />
                    )}
                  </div>

                  {/* v37: the stage is moved with the stepper below; here only previous / next deal on a big screen */}
                  {deals.length > 1 && (() => {
                    const ids = (hub?.deals || deals).map((d: any) => d.id);
                    const at = ids.indexOf(activeDeal.id);
                    const go = (k: number) => { const id = ids[(at + k + ids.length) % ids.length]; if (id) openDeal(id); };
                    return (
                      <div className="hidden items-center gap-1 lg:flex">
                        <button type="button" onClick={() => go(-1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700" data-testid="deal-prev"><ChevronLeft className="h-3.5 w-3.5" />{tx('Previous', 'पिछली')}</button>
                        <span className="px-1 text-[11px] text-slate-500">{at + 1}/{ids.length}</span>
                        <button type="button" onClick={() => go(1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700" data-testid="deal-next">{tx('Next', 'अगली')}<ChevronRight className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })()}
                </div>

                <StageStepper stage={activeDeal.stage} canEdit={currentUser.role !== 'TEAM_MEMBER' && perm('deal:update_stage') && !summaryOnly && !isClosed(dealDetail?.deal || activeDeal)} onChange={handleStageChange} />
                {!summaryOnly && <NextSteps item={hubItemOf(activeDeal.id)} onGo={(t, k) => { setActiveSubTab(tabAllowed(t) ? t : 'overview'); setTaskFilter(filterFor(k)); }} />}
                {/* v47 — close a deal that did not happen / reopen; a visit that happened outside the app */}
                {!summaryOnly && <DealStatusPanel deal={dealDetail?.deal || activeDeal} me={currentUser} verifiedVisits={hubItemOf(activeDeal.id)?.visits?.verified ?? 0}
                  onChanged={() => { onRefreshDeals(); loadHub(); loadDetail(activeDeal.id); }} />}
                {/* v48 — brokerage bills to the owner / buyer (Agreement stage on) */}
                {!summaryOnly && currentUser.role === 'BROKER' && (activeDeal.introducingBrokerId === currentUser.id || activeDeal.closingBrokerId === currentUser.id) && (
                  <PaymentRequestsPanel dealId={activeDeal.id} me={currentUser} stage={activeDeal.stage} />
                )}

                {/* Sub-Navigation Tabs */}
                <div className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-1 pb-1 text-xs" data-testid="deal-subtabs">
                  {[
                    { id: 'overview', label: tx('Overview & Milestones', 'ओवरव्यू और माइलस्टोन'), icon: Briefcase },
                    { id: 'antibypass_protocol', label: tx('Anti-Bypass Rules', 'एंटी-बायपास नियम'), icon: ShieldCheck },
                    ...(perm('deal:chat') ? [{ id: 'chat_call', label: `${tx('Broker Chat', 'ब्रोकर चैट')} (${messages.length})`, icon: MessageSquare }] : []),
                    ...(perm('property:read') ? [{ id: 'media_vault', label: `${tx('Media Vault & Location', 'मीडिया वॉल्ट और लोकेशन')} (${vaultAssets.length})`, icon: FolderLock }] : []),
                    ...(perm('task:read') ? [{ id: 'responsibilities', label: `${tx('Responsibility Matrix', 'ज़िम्मेदारी तालिका')} (${applicableTasks.length})`, icon: ListTodo }] : []),
                    ...(hideCommercials || !perm('agreement:read') ? [] : [{ id: 'commission_agreement', label: tx('Commission Agreement', 'कमीशन समझौता'), icon: FileCheck2 }]),
                    ...(perm('dd:read') ? [{ id: 'due_diligence', label: tx('Property Due Diligence', 'प्रॉपर्टी Due Diligence'), icon: ShieldCheck }] : []),
                    ...(perm('dd:read') ? [{ id: 'readiness_report', label: tx('Registry Readiness', 'रजिस्ट्री तैयारी'), icon: Award }] : []),
                    ...(perm('legal:request') && currentUser.role === 'BROKER' && (activeDeal.introducingBrokerId === currentUser.id || activeDeal.closingBrokerId === currentUser.id) ? [{ id: 'legal_help', label: tx('Legal Help', 'क़ानूनी मदद'), icon: Scale }] : []),
                    ...(perm('dispute:read', 'dispute:create') ? [{ id: 'disputes_holds', label: tx('Disputes & Commission Holds', 'विवाद और कमीशन होल्ड'), icon: Scale }] : []),
                  ].filter((tab) => !summaryOnly || ['overview', 'antibypass_protocol', 'disputes_holds'].includes(tab.id)).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeSubTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id as DealSubTab)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                          isActive
                            ? 'bg-slate-900 text-white font-semibold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{tab.label}</span>
                        {!isActive && (hubItemOf(activeDeal.id)?.next || []).some((n: any) => n.tab === tab.id && n.kind !== 'STALLED') && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TAB 1: OVERVIEW & MILESTONES */}
              {activeSubTab === 'overview' && (
                <div className="space-y-5">
                  {/* v21: who may read inside this deal room */}
                  {summaryOnly && (
                    <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2" data-testid="deal-summary-banner">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-400">{tx('GENZ summary view', 'GENZ का सारांश-दृश्य')}</div>
                        <div className="text-xs text-slate-300">{tx('Stage', 'स्टेज')}: <strong className="text-white">{label('dealStage', activeDeal.stage)}</strong></div>
                      </div>
                      <div className="text-sm">
                        {tx('Deal value', 'डील वैल्यू')}: <strong className="text-emerald-400">{activeDeal.dealValue ? formatINR(activeDeal.dealValue) : tx('not entered yet', 'अभी दर्ज नहीं')}</strong>
                      </div>
                      <p className="text-xs text-slate-300">
                        {tx(
                          'The chat, notes, commission terms, documents, tasks and site-visit feedback of a broker-to-broker deal room stay between the brokers. GENZ can open them only while a dispute is open on this deal room, or when GENZ itself is a party to the deal.',
                          'ब्रोकर-से-ब्रोकर डील रूम की चैट, नोट्स, कमीशन शर्तें, दस्तावेज़, टास्क और साइट-विज़िट फ़ीडबैक ब्रोकरों के बीच ही रहते हैं। GENZ इन्हें तभी खोल सकता है जब इस डील रूम पर विवाद खुला हो, या GENZ खुद इस डील का पक्ष हो।',
                        )}
                      </p>
                    </div>
                  )}
                  {!summaryOnly && isDealBrokerViewer && (
                    dealDetail?.access?.adminCanSee ? (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3" data-testid="deal-admin-open-banner">
                        <Eye className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-xs text-rose-950">
                          <div className="font-bold">{tx('A dispute is open — the GENZ admin may read this deal room', 'विवाद खुला है — GENZ एडमिन यह डील रूम पढ़ सकता है')} ({dealDetail.access.openDisputeId})</div>
                          <p className="text-rose-800">{tx('The access ends when the dispute is resolved. Every time the admin opens this room, a line is written to the audit trail (Audit Trail tab), which you can read.', 'विवाद सुलझते ही यह एक्सेस खत्म हो जाता है। एडमिन जितनी बार यह रूम खोलता है, ऑडिट ट्रेल (Audit Trail टैब) में एक लाइन दर्ज होती है, जिसे आप पढ़ सकते हैं।')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-3" data-testid="deal-admin-closed-banner">
                        <Lock className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600">{tx('Your chat, notes, commission terms and documents are private to you and the other broker. GENZ sees only the deal value and the totals on its dashboard. The GENZ admin can read this deal room only if you or the other broker raise a dispute.', 'आपकी चैट, नोट्स, कमीशन शर्तें और दस्तावेज़ सिर्फ़ आपके और दूसरे ब्रोकर के हैं। GENZ को अपने डैशबोर्ड पर सिर्फ़ डील वैल्यू और कुल आँकड़े दिखते हैं। GENZ एडमिन यह डील रूम तभी पढ़ सकता है जब आप या दूसरा ब्रोकर विवाद दर्ज करें।')}</p>
                      </div>
                    )
                  )}

                  {/* Protection tail clause banner */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs text-emerald-950">
                      <div className="font-bold">
                        {tx(`${(activeDeal as any).antiBypassTailDays || 30}-day anti-bypass protection active until `, `${(activeDeal as any).antiBypassTailDays || 30} दिन की एंटी-बायपास सुरक्षा चालू, अंतिम तारीख़: `)}{formatDate(activeDeal.ownerProtectionExpiresAt)}
                      </div>
                      <p className="text-emerald-800">
                        {tx(
                          "The listing mandate and the introducing broker's name are kept in this deal's activity log. If someone bypasses the introducing broker, a dispute can be filed — it marks the commission record 'on hold' until an admin reviews it. GENZ does not hold or move any money.",
                          "लिस्टिंग मैंडेट और इंट्रोड्यूस करने वाले ब्रोकर का नाम इस डील के एक्टिविटी लॉग में दर्ज रहता है। अगर कोई इंट्रोड्यूस करने वाले ब्रोकर को बायपास करे तो विवाद दर्ज हो सकता है — एडमिन की समीक्षा तक कमीशन रिकॉर्ड 'होल्ड' पर रहता है। GENZ कोई पैसा नहीं रखता या भेजता।",
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Participants Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                          {tx('Introducing Broker', 'इंट्रोड्यूस करने वाला ब्रोकर')}
                        </span>
                        {participants?.introducingBroker && (
                          <TrustScoreBadge user={participants.introducingBroker} variant="pill" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {participants?.introducingBroker?.name || tx('Assigned broker', 'तय ब्रोकर')}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {participants?.introducingBroker?.brokerId || '—'}
                        </div>
                      </div>
                      {!hideCommercials && activeDeal.feeMode !== 'OWN_SIDE' && (
                        <div className="text-[11px] text-emerald-700 font-semibold pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span>{tx('Entitlement:', 'हिस्सा:')}</span>
                          <span>{activeDeal.introducingBrokerSharePct}%</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                          {tx('Closing / Listing Broker', 'क्लोज़िंग / लिस्टिंग ब्रोकर')}
                        </span>
                        {participants?.closingBroker && (
                          <TrustScoreBadge user={participants.closingBroker} variant="pill" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {participants?.closingBroker?.name || tx('Listing broker', 'लिस्टिंग ब्रोकर')}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {participants?.closingBroker?.brokerId || '—'}
                        </div>
                      </div>
                      {!hideCommercials && activeDeal.feeMode !== 'OWN_SIDE' && (
                        <div className="text-[11px] text-emerald-700 font-semibold pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span>{tx('Entitlement:', 'हिस्सा:')}</span>
                          <span>{activeDeal.closingBrokerSharePct}%</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                        {tx('Property Owner & Customer', 'प्रॉपर्टी मालिक और ग्राहक')}
                      </span>
                      <div className="text-sm font-bold text-slate-900">
                        {participants?.owner?.name || tx('Owner', 'मालिक')}
                      </div>
                      <div className="text-xs text-slate-500">
                        {tx('Protected customer', 'सुरक्षित ग्राहक')}: {activeDeal.customerId}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium pt-1">
                        {tx('Mandate confirmed by owner', 'मालिक की मैंडेट पुष्टि')}: {activeDeal.ownerRemunerationConfirmed ? tx('Yes', 'हाँ') : tx('Pending', 'बाकी')}
                      </div>
                      {/* v45 — the owner's terms and my client rooms for this property, one tap away */}
                      <div className="flex flex-wrap gap-1.5 pt-2" data-testid="deal-links">
                        {perm('mandate:read') && (
                          <button type="button" onClick={() => setMainMode('MANDATES')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:border-slate-900" data-testid="deal-owner-terms">
                            <FileSignature className="h-3.5 w-3.5" />{tx('Owner’s terms', 'मालिक की शर्तें')}
                          </button>
                        )}
                        {canRooms && roomsFor(activeDeal.propertyId).map((r: any) => (
                          <button key={r.id} type="button" onClick={() => openClientRoom(r.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-800 hover:border-indigo-500" data-testid="deal-client-room">
                            <MessagesSquare className="h-3.5 w-3.5" />{tx('Client room', 'क्लाइंट रूम')}: {r.clientName}{r.unread > 0 ? ` (${r.unread})` : ''}
                          </button>
                        ))}
                      </div>
                      {canRooms && roomsFor(activeDeal.propertyId).length === 0 && (
                        <p className="pt-1 text-[11px] text-slate-500">{tx('None of your client rooms has this property yet — use “Send to client room” below.', 'आपके किसी क्लाइंट रूम में यह प्रॉपर्टी नहीं है — नीचे “क्लाइंट रूम में भेजें” दबाएँ।')}</p>
                      )}
                    </div>
                  </div>

                  {/* Site Visits Section */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{tx('Verified site visits', 'वेरिफ़ाइड साइट विज़िट')}</h4>
                        <p className="text-xs text-slate-500">
                          {tx('OTP-confirmed site visits (with location where GPS was shared)', 'OTP से पुष्ट साइट विज़िट (जहाँ GPS मिला वहाँ लोकेशन के साथ)')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                      {perm('clientroom:use') && currentUser.role === 'BROKER' && activeDeal.stage !== 'Settled' && <ShareToRoom propertyId={activeDeal.propertyId} />}
                      {perm('sitevisit:create') && (
                      <button
                        onClick={() => onOpenScheduleVisit(activeDeal.id, activeDeal.propertyId)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                        data-testid="deal-schedule-visit"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>{tx('Schedule Visit', 'विज़िट तय करें')}</span>
                      </button>
                      )}
                      </div>
                    </div>

                    {activeVisits.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-lg">
                        {tx('No site visits logged yet for this deal room.', 'इस डील रूम में अभी कोई साइट विज़िट दर्ज नहीं है।')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeVisits.map((visit: SiteVisit) => (
                          <div
                            key={visit.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{visit.id}</span>
                                <span className="text-slate-400">·</span>
                                <span className="font-medium text-slate-800">{visit.customerName}</span>
                                {!visit.isVerified && visit.ackStatus === 'PENDING' && <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">{tx('Buyer not confirmed yet', 'खरीदार की पुष्टि बाकी')}</span>}
                                {visit.isVerified ? (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                                    {tx('Verified via', 'वेरिफ़ाइड:')} {visit.verificationMethod}
                                  </span>
                                ) : (
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                                    {tx('OTP Pending', 'OTP बाकी')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {tx('Scheduled', 'तय समय')}: {formatDateTime(visit.scheduledTime)}
                              </div>
                              {visit.feedbackNotes && (
                                <p className="text-slate-600 italic text-[11px] mt-1">"{visit.feedbackNotes}"</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setSelectedVisitForQrPass(visit)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shrink-0 shadow-2xs"
                                title={tx('Open digital visit QR pass & check-in scanner', 'डिजिटल विज़िट QR पास और चेक-इन स्कैनर खोलें')}
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                <span>{tx('Visit QR Pass', 'विज़िट QR पास')}</span>
                              </button>

                              {!visit.isVerified && (
                                <button
                                  onClick={() => onOpenVerifyVisitOtp(visit)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-xs shrink-0"
                                >
                                  {tx('Enter OTP', 'OTP डालें')}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: ANTI-BYPASS RULES */}
              {activeSubTab === 'antibypass_protocol' && (
                <div className="space-y-5">
                  {/* Anti-Bypass Header Card */}
                  <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white rounded-xl p-5 shadow-sm space-y-3 border border-emerald-900/50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                          <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-emerald-300">{tx('GENZ platform rule', 'GENZ प्लेटफ़ॉर्म नियम')}</span>
                            <span className="rounded bg-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                              {tx('Protection active', 'सुरक्षा चालू')}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-0.5">
                            {tx(`${(activeDeal as any).antiBypassTailDays || 30}-day anti-bypass protection active until `, `${(activeDeal as any).antiBypassTailDays || 30} दिन की एंटी-बायपास सुरक्षा चालू, अंतिम तारीख़: `)}{formatDate(activeDeal.ownerProtectionExpiresAt)}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onOpenBrokerSafetyModal && (
                          <button
                            onClick={onOpenBrokerSafetyModal}
                            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-xs"
                          >
                            {tx('Open Safety Protocols', 'सुरक्षा नियम खोलें')}
                          </button>
                        )}
                        <button
                          onClick={() => onOpenFileDispute(activeDeal.id)}
                          className="px-3.5 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {tx('File Dispute', 'विवाद दर्ज करें')}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-700/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
                      {!hideCommercials && (
                        <div>
                          <span className="text-slate-400">{tx('Agreement hash:', 'समझौता हैश:')} </span>
                          <span className="font-mono text-emerald-300">{activeDeal.agreementHash}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">{tx('Listing Broker Mandate:', 'लिस्टिंग मैंडेट ब्रोकर:')} </span>
                        <span className="font-bold text-white">{participants?.closingBroker?.name || activeDeal.closingBrokerId}</span>
                      </div>
                    </div>
                  </div>

                  {/* The 4 Core Anti-Bypass Rules */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-600" />
                      {tx('GENZ co-brokerage anti-bypass rules', 'GENZ को-ब्रोकरेज एंटी-बायपास नियम')}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">1</span>
                          <span>{tx('Client Masking & Non-Circumvention', 'ग्राहक की पहचान गोपनीय और सीधा संपर्क नहीं')}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {tx(
                            'The other broker never sees the buyer or seller phone number or email. On the platform, co-broking brokers agree not to approach the client directly without mutual consent.',
                            'दूसरे ब्रोकर को खरीदार या विक्रेता का फ़ोन नंबर / ईमेल नहीं दिखता। प्लेटफ़ॉर्म पर को-ब्रोकिंग करने वाले ब्रोकर मानते हैं कि आपसी सहमति के बिना ग्राहक से सीधे संपर्क नहीं करेंगे।',
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">2</span>
                          <span>{tx('OTP-verified site visits', 'OTP से पुष्ट साइट विज़िट')}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {tx(
                            'Every site visit is confirmed with a one-time OTP. If GPS is shared, the place and time are recorded in the activity log as supporting evidence of the introduction.',
                            'हर साइट विज़िट एक बार वाले OTP से पुष्ट होती है। GPS साझा हो तो जगह और समय एक्टिविटी लॉग में इंट्रोडक्शन के सहायक सबूत के तौर पर दर्ज होते हैं।',
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">3</span>
                          <span>{tx('30-day introduction protection', '30 दिन की इंट्रोडक्शन सुरक्षा')}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {tx(
                            "For 30 days after the introduction, the deal is credited to the introducing broker. If the buyer closes directly with the owner in that window, the introducing broker can file a dispute and an admin reviews it under platform rules. GENZ does not collect or pay commission.",
                            'इंट्रोडक्शन के बाद 30 दिन तक डील का श्रेय इंट्रोड्यूस करने वाले ब्रोकर को मिलता है। इस दौरान खरीदार सीधे मालिक से डील कर ले तो इंट्रोड्यूस करने वाला ब्रोकर विवाद दर्ज कर सकता है और एडमिन प्लेटफ़ॉर्म नियमों के तहत समीक्षा करता है। GENZ कमीशन न लेता है, न देता है।',
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">4</span>
                          <span>{tx('Tamper-evident activity log & hold', 'छेड़छाड़ पकड़ने वाला एक्टिविटी लॉग और होल्ड')}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {tx(
                            "Milestones, price changes and agreements are written to a hash-chained activity log, so later edits show up. Filing a dispute marks the commission record 'on hold' until an admin reviews it.",
                            "माइलस्टोन, कीमत के बदलाव और समझौते हैश-चेन वाले एक्टिविटी लॉग में लिखे जाते हैं, इसलिए बाद में हुआ बदलाव पकड़ में आता है। विवाद दर्ज होते ही एडमिन की समीक्षा तक कमीशन रिकॉर्ड 'होल्ड' पर रहता है।",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Site Visits OTP Evidence for this Deal */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-blue-600" />
                        {tx('Site visit evidence', 'साइट विज़िट के सबूत')} ({activeVisits.length})
                      </h4>
                      {perm('sitevisit:create') && (
                      <button
                        onClick={() => onOpenScheduleVisit(activeDeal.id, activeDeal.propertyId)}
                        className="text-xs font-semibold text-slate-900 hover:underline flex items-center gap-1"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>{tx('Schedule New Stamped Visit', 'नई विज़िट तय करें')}</span>
                      </button>
                      )}
                    </div>

                    {activeVisits.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-lg">
                        {tx('No site visit inspections recorded yet. Schedule a visit to generate OTP anti-bypass evidence.', 'अभी कोई साइट विज़िट दर्ज नहीं। विज़िट तय करें — OTP से पुष्ट होने पर वही सबूत बनेगा।')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeVisits.map((visit: SiteVisit) => (
                          <div
                            key={visit.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{visit.id}</span>
                                <span className="text-slate-400">·</span>
                                <span className="font-medium text-slate-800">{visit.customerName}</span>
                                {visit.isVerified ? (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                    {tx('Verified via', 'वेरिफ़ाइड:')} {visit.verificationMethod}
                                  </span>
                                ) : (
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                                    {tx('OTP Challenge Pending', 'OTP बाकी')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                {tx('Scheduled', 'तय समय')}: {formatDateTime(visit.scheduledTime)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedVisitForQrPass(visit)}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-xs"
                              >
                                {tx('QR Pass', 'QR पास')}
                              </button>
                              {!visit.isVerified && (
                                <button
                                  onClick={() => onOpenVerifyVisitOtp(visit)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-xs"
                                >
                                  {tx('Enter OTP', 'OTP डालें')}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: BROKER CHAT — v50: the whole screen on a phone (message box pinned at the bottom, ← back to the deal), a plain card on a big screen */}
              {activeSubTab === 'chat_call' && (() => {
                const otherBroker: any = currentUser.id === activeDeal.introducingBrokerId ? participants?.closingBroker : participants?.introducingBroker;
                const phone = typeof otherBroker?.phone === 'string' ? otherBroker.phone : '';
                const names = [...new Set([participants?.introducingBroker, participants?.closingBroker, participants?.owner].filter((p: any) => p && p.id !== currentUser.id).map((p: any) => p.name as string))];
                const thread: ThreadMsg[] = messages.map(m => ({ id: m.id, mine: m.senderId === currentUser.id, who: m.senderName, text: m.text, at: m.timestamp, link: m.mediaUrl }));
                const others = new Set(messages.filter(m => m.senderId !== currentUser.id).map(m => m.senderId));
                return (
                  <ChatShell
                    onBack={() => setActiveSubTab('overview')} testId="deal-room-chat"
                    avatar={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"><MessageSquare className="h-5 w-5" aria-hidden /></span>}
                    title={names.join(' · ') || tx('Deal chat', 'डील चैट')}
                    subtitle={`${activeProperty?.title || activeDeal.propertyId} · ${tx('saved in the deal record', 'डील रिकॉर्ड में सेव')}`}
                    actions={phone ? <a href={`tel:${phone.replace(/\s+/g, '')}`} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-sm font-semibold text-white" aria-label={tx('Call', 'कॉल करें')} data-testid="deal-chat-call"><Phone className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{tx('Call', 'कॉल')}</span></a> : undefined}
                  >
                    <ChatThread
                      msgs={thread} onSend={sendChat} error={chatErr} showWho={others.size > 1}
                      placeholder={tx('Message…', 'संदेश लिखें…')}
                      emptyHint={tx('No messages yet. Talk about the visit, token, registry dates here.', 'अभी कोई संदेश नहीं। यहाँ विज़िट, टोकन, रजिस्ट्री की तारीख़ की बात करें।')}
                      ids={{ root: 'deal-chat-root', chat: 'deal-chat-messages', input: 'deal-chat-input', send: 'deal-chat-send' }}
                    />
                  </ChatShell>
                );
              })()}

              {/* TAB: MEDIA VAULT, LOCATION & SELECTIVE SHARING */}
              {activeSubTab === 'media_vault' && (
                <div className="space-y-6">
                  {/* Top Bar: Vault summary & action buttons */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <FolderLock className="h-5 w-5 text-amber-600" />
                        <h4 className="text-base font-bold text-slate-900">{tx('Private Property Vault & Selective Sharing', 'प्रॉपर्टी वॉल्ट और चुनिंदा शेयरिंग')}</h4>
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          {tx('Confidential Storage', 'गोपनीय')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {tx(
                          'Title deeds, walkthrough videos and sanctioned maps are kept here as links. You choose who can see which file, and for how many days.',
                          'टाइटल डीड, वॉकथ्रू वीडियो और मंज़ूर नक़्शे यहाँ लिंक के रूप में रखे जाते हैं। कौन-सी फ़ाइल कौन, कितने दिन देख सकता है — यह आप तय करते हैं।',
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isOwnerOrListingBroker && (
                        <>
                          <button
                            onClick={() => setShowUploadModal(true)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>{tx('+ Add file', '+ फ़ाइल जोड़ें')}</span>
                          </button>
                          <button
                            onClick={() => setShowGrantModal(true)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            <span>{tx('+ Grant Selective Access', '+ चुनिंदा एक्सेस दें')}</span>
                          </button>
                          <button
                            onClick={() => setShowLocationModal(true)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{tx('Configure Site Location', 'साइट लोकेशन सेट करें')}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Property Site Location & Google Maps Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-600" />
                        <h5 className="text-sm font-bold text-slate-900">{tx('Site location & Google Maps', 'साइट लोकेशन और Google Maps')}</h5>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        {tx('Precision', 'सटीकता')}: <strong className="text-slate-800">{enumLabel(PRECISION_HI, activeProperty?.locationPrecision || 'APPROXIMATE_LOCALITY')}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-lg">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-semibold">{tx('State & City', 'राज्य और शहर')}</span>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {[activeProperty?.city, activeProperty?.state].filter(Boolean).join(', ') || tx('Location not set', 'लोकेशन तय नहीं')}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-semibold">{tx('Locality / Village', 'इलाका / गाँव')}</span>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {activeProperty?.locality} {activeProperty?.village ? `(${activeProperty.village})` : ''}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-semibold">{tx('Street & Landmark', 'सड़क और लैंडमार्क')}</span>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {[activeProperty?.street, activeProperty?.landmark].filter(Boolean).join(', ') || '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-semibold">{tx('PIN Code', 'पिन कोड')}</span>
                        <div className="font-bold text-slate-900 mt-0.5 font-mono">
                          {activeProperty?.pincode || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {activeProperty?.googleMapsUrl ? (
                        <a
                          href={activeProperty.googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>{tx('Open Location in Google Maps', 'Google Maps में लोकेशन खोलें')}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 italic">{tx('No Google Maps URL configured yet.', 'Google Maps का लिंक अभी नहीं जोड़ा गया।')}</span>
                      )}

                      {activeProperty?.videoUrl && (
                        <a
                          href={activeProperty.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg border border-purple-200 transition-colors"
                        >
                          <Video className="h-3.5 w-3.5" />
                          <span>{tx('Watch Video Walkthrough', 'वीडियो वॉकथ्रू देखें')}</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Vault Assets Grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-bold text-slate-900">
                        {tx('Files in vault', 'वॉल्ट की फ़ाइलें')} ({vaultAssets.length})
                      </h5>
                      <span className="text-xs text-slate-500">
                        {isOwnerOrListingBroker ? tx('All stored files', 'सभी फ़ाइलें') : tx('Files shared with you', 'आपके साथ साझा फ़ाइलें')}
                      </span>
                    </div>

                    {loadingVault ? (
                      <div className="p-8 text-center text-slate-400 text-xs">{tx('Loading media vault assets...', 'वॉल्ट की फ़ाइलें लोड हो रही हैं...')}</div>
                    ) : vaultAssets.length === 0 ? (
                      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-400 text-xs">
                        {tx('No files in vault or you have not been granted access yet.', 'वॉल्ट में कोई फ़ाइल नहीं है, या आपको अभी एक्सेस नहीं मिला।')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {vaultAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 hover:border-slate-300 transition-all flex flex-col justify-between"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  asset.category === 'PHOTOGRAPH' ? 'bg-sky-100 text-sky-800' :
                                  asset.category === 'WALKTHROUGH_VIDEO' ? 'bg-purple-100 text-purple-800' :
                                  asset.category === 'OWNERSHIP_TITLE_DEED' ? 'bg-rose-100 text-rose-800' :
                                  'bg-amber-100 text-amber-800'
                                }`}>
                                  {enumLabel(ASSET_CAT_HI, asset.category)}
                                </span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  asset.sensitivity === 'PUBLIC' ? 'bg-slate-100 text-slate-700' :
                                  asset.sensitivity === 'CONFIDENTIAL' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {enumLabel(SENSITIVITY_HI, asset.sensitivity)}
                                </span>
                              </div>

                              {/* Asset preview if photo */}
                              {asset.category === 'PHOTOGRAPH' && (
                                <img
                                  src={asset.fileUrl}
                                  alt={asset.description}
                                  className="h-32 w-full object-cover rounded-lg border border-slate-100"
                                />
                              )}

                              <div>
                                <h6 className="text-xs font-bold text-slate-900 truncate" title={asset.originalFileName}>
                                  {asset.originalFileName}
                                </h6>
                                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                  {asset.description || tx('No description.', 'कोई विवरण नहीं।')}
                                </p>
                              </div>

                              <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100">
                                v{asset.version}
                              </div>
                            </div>

                            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                              <a
                                href={asset.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>{tx('View Asset', 'फ़ाइल खोलें')}</span>
                              </a>
                              <span className="text-[10px] text-slate-400">
                                {tx('Added by', 'जोड़ने वाला')} {asset.uploaderName.split(' ')[0]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selective Sharing Grants List (For Listing Owner/Broker) */}
                  {isOwnerOrListingBroker && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Share2 className="h-4 w-4 text-blue-600" />
                          <h5 className="text-sm font-bold text-slate-900">{tx('Active sharing grants', 'चालू शेयरिंग एक्सेस')} ({vaultGrants.length})</h5>
                        </div>
                        <span className="text-xs text-slate-500">{tx('Fine-grained recipient permissions', 'किसे क्या दिखे — अलग-अलग तय करें')}</span>
                      </div>

                      {vaultGrants.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-lg">
                          {tx('No external selective access grants issued for this property yet.', 'इस प्रॉपर्टी के लिए अभी किसी को चुनिंदा एक्सेस नहीं दिया गया।')}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {vaultGrants.map((grant) => (
                            <div key={grant.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{grant.recipientName}</span>
                                  <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                                    {enumLabel(GRANT_TYPE_HI, grant.recipientType)}
                                  </span>
                                  {grant.isRevoked ? (
                                    <span className="bg-red-100 text-red-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                                      {tx('Revoked', 'रद्द')}
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                                      {tx('Active Access', 'एक्सेस चालू')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {tx('Files', 'फ़ाइलें')}: {grant.assetIds.length} · {tx('Permission', 'अनुमति')}: {enumLabel(GRANT_PERM_HI, grant.permissionLevel)} · {tx('Location', 'लोकेशन')}: {enumLabel(PRECISION_HI, grant.locationPrecisionPermitted)}
                                </div>
                              </div>

                              {!grant.isRevoked && (
                                <button
                                  onClick={async () => {
                                    if (confirm(tx('Revoke access for this recipient now?', 'इस व्यक्ति का एक्सेस अभी रद्द करें?'))) {
                                      try {
                                        await api.revokeVaultGrant(activeDeal.propertyId, grant.id, 'Manually revoked by broker');
                                        loadVault(activeDeal.propertyId);
                                      } catch (err: any) {
                                        alert(err.message);
                                      }
                                    }
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded self-start sm:self-auto"
                                >
                                  {tx('Revoke Grant', 'एक्सेस रद्द करें')}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RESPONSIBILITY MATRIX (MODULE A1) */}
              {activeSubTab === 'responsibilities' && (
                <div className="space-y-4">
                  {/* Matrix Progress Scorecard */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">{tx('Total Applicable Tasks', 'लागू काम')}</div>
                      <div className="text-lg font-bold text-slate-900 mt-1">{applicableTasks.length} / {tasks.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">{tx('Accepted Responsibilities', 'स्वीकार की गई ज़िम्मेदारियाँ')}</div>
                      <div className="text-lg font-bold text-blue-600 mt-1">{acceptedTasksCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">{tx('Completed Duties', 'पूरे हुए काम')}</div>
                      <div className="text-lg font-bold text-purple-600 mt-1">{completedTasksCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">{tx('Independently Verified', 'स्वतंत्र रूप से जाँचे गए')}</div>
                      <div className="text-lg font-bold text-emerald-600 mt-1">{verifiedTasksCount}</div>
                    </div>
                  </div>

                  {/* Task Matrix List */}
                  <div className="space-y-3">
                    {/* v37 — filter the duties: mine / open / overdue / to check */}
                    {!loadingTasks && tasks.length > 0 && (() => {
                      const now = Date.now();
                      const open = (t: DealTask) => t.isApplicable && t.taskStatus !== 'COMPLETED' && t.taskStatus !== 'WAIVED';
                      const f: [typeof taskFilter, string, string, (t: DealTask) => boolean][] = [
                        ['ALL', 'All', 'सभी', () => true],
                        ['MINE', 'Mine', 'मेरी', (t) => t.assignedParticipantId === currentUser.id && open(t)],
                        ['OPEN', 'Not done', 'बाकी', open],
                        ['OVERDUE', 'Overdue', 'तारीख़ निकली', (t) => open(t) && !!t.dueDate && Date.parse(t.dueDate) < now],
                        ['REVIEW', 'For me to check', 'मुझे जाँचनी', (t) => t.reviewingParticipantId === currentUser.id && t.taskStatus === 'COMPLETED' && t.verificationStatus !== 'VERIFIED' && t.verificationStatus !== 'REJECTED'],
                      ];
                      return (
                        <div className="flex flex-wrap gap-1.5" data-testid="task-filters">
                          {f.map(([id, en, hiT, fn]) => {
                            const n = tasks.filter(fn).length;
                            return <button key={id} type="button" onClick={() => setTaskFilter(id)} className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold ${taskFilter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`} data-testid={`task-filter-${id}`}>{tx(en, hiT)} <span className="opacity-70">{n}</span></button>;
                          })}
                        </div>
                      );
                    })()}
                    {loadingTasks ? (
                      <div className="p-8 text-center text-slate-400 text-xs">{tx('Loading task assignments...', 'काम की सूची लोड हो रही है...')}</div>
                    ) : (
                      tasks.filter((t) => {
                        const now = Date.now();
                        const open = t.isApplicable && t.taskStatus !== 'COMPLETED' && t.taskStatus !== 'WAIVED';
                        if (taskFilter === 'MINE') return t.assignedParticipantId === currentUser.id && open;
                        if (taskFilter === 'OPEN') return open;
                        if (taskFilter === 'OVERDUE') return open && !!t.dueDate && Date.parse(t.dueDate) < now;
                        if (taskFilter === 'REVIEW') return t.reviewingParticipantId === currentUser.id && t.taskStatus === 'COMPLETED' && t.verificationStatus !== 'VERIFIED' && t.verificationStatus !== 'REJECTED';
                        return true;
                      }).map((task) => {
                        const isAssignedToCurrent = task.assignedParticipantId === currentUser.id;
                        const isPendingAcceptance = task.assignmentAcceptance === 'PENDING_ACCEPTANCE';
                        const isCompleted = task.taskStatus === 'COMPLETED';
                        const isVerified = task.verificationStatus === 'VERIFIED';
                        const isWaived = !task.isApplicable;

                        return (
                          <div
                            key={task.id}
                            className={`bg-white border rounded-xl p-4 transition-all space-y-3 ${
                              isWaived
                                ? 'border-slate-200 bg-slate-50 opacity-60'
                                : isVerified
                                ? 'border-emerald-200 bg-emerald-50/10'
                                : isCompleted
                                ? 'border-blue-200 bg-blue-50/10'
                                : 'border-slate-200'
                            }`}
                          >
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                              <div className="space-y-1 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-mono text-slate-400 font-bold">{task.id}</span>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-[10px] uppercase font-semibold text-slate-500">
                                    {enumLabel(TASK_CAT_HI, task.category)}
                                  </span>
                                  <span className="text-slate-300">·</span>

                                  {/* Acceptance Status */}
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      task.assignmentAcceptance === 'ACCEPTED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : task.assignmentAcceptance === 'REJECTED'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {tx('Acceptance', 'स्वीकृति')}: {enumLabel(ACCEPT_HI, task.assignmentAcceptance)}
                                  </span>

                                  {/* Task Status */}
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      isCompleted
                                        ? 'bg-blue-100 text-blue-800'
                                        : task.taskStatus === 'IN_PROGRESS'
                                        ? 'bg-slate-200 text-slate-800'
                                        : isWaived
                                        ? 'bg-slate-200 text-slate-500'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {tx('Status', 'स्थिति')}: {enumLabel(TASK_STATUS_HI, task.taskStatus)}
                                  </span>

                                  {/* Independent Verification Status */}
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      isVerified
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : task.verificationStatus === 'UNDER_REVIEW'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {tx('Verification', 'जाँच')}: {enumLabel(TASK_VERIFY_HI, task.verificationStatus)}
                                  </span>
                                </div>

                                <h4 className="text-sm font-bold text-slate-900">{th(task.title)}</h4>
                                <p className="text-xs text-slate-600">{th(task.description)}</p>

                                {/* RACI & Assignee Details */}
                                <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                  <div>
                                    <span className="text-slate-400">{tx('Responsible Assignee:', 'ज़िम्मेदार:')}</span>{' '}
                                    <strong className="text-slate-900">{task.assignedParticipantName}</strong>{' '}
                                    <span className="text-[10px] text-slate-500">({label('role', task.assignedParticipantRole)})</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">{tx('Due Date:', 'अंतिम तारीख़:')}</span>{' '}
                                    {formatDate(task.dueDate)}
                                  </div>
                                  {task.acceptedAt && (
                                    <div className="text-[11px] text-emerald-700">
                                      {tx('Accepted on', 'स्वीकार किया')} {formatDateTime(task.acceptedAt)}
                                    </div>
                                  )}
                                </div>

                                {/* Completion note and attachments if completed */}
                                {task.completionNote && (
                                  <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-700 mt-2">
                                    <strong>{tx('Completion note', 'पूरा होने का नोट')}:</strong> {task.completionNote}
                                    {task.completionTimestamp && (
                                      <span className="text-[10px] text-slate-400 ml-2">
                                        ({formatDateTime(task.completionTimestamp)})
                                      </span>
                                    )}
                                  </div>
                                )}

                                {task.evidenceAttachments.length > 0 && (
                                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                                    {task.evidenceAttachments.map((ev) => (
                                      <div
                                        key={ev.id}
                                        className="flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-md text-[11px]"
                                      >
                                        <FileText className="h-3 w-3" />
                                        {ev.url && /^https?:\/\//i.test(ev.url) ? (
                                          <a href={ev.url} target="_blank" rel="noreferrer" className="underline">{ev.name}</a>
                                        ) : (
                                          <span>{ev.name}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {task.verificationNotes && (
                                  <div className="text-[11px] text-emerald-700 pt-1 flex items-center gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    <span>
                                      {tx('Verified by', 'जाँचा:')} <strong>{task.verifiedBy}</strong> · {formatDateTime(task.verifiedAt || '')}
                                    </span>
                                  </div>
                                )}

                                {task.reassignmentHistory.length > 0 && (
                                  <div className="text-[10px] text-slate-400 pt-1">
                                    {tx('Reassigned', 'दोबारा सौंपा गया')} {task.reassignmentHistory.length} {tx('time(s). Last reason', 'बार। आख़िरी कारण')}: {task.reassignmentHistory[task.reassignmentHistory.length - 1].reason}
                                  </div>
                                )}
                              </div>

                              {/* Right Action Buttons */}
                              <div className="flex flex-wrap md:flex-col items-center gap-2 shrink-0 pt-2 md:pt-0">
                                {/* Explicit Acceptance Buttons if assigned to current user */}
                                {isAssignedToCurrent && isPendingAcceptance && (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleAcceptTask(task.id, 'ACCEPTED')}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors"
                                    >
                                      {tx('Accept Duty', 'काम स्वीकारें')}
                                    </button>
                                    <button
                                      onClick={() => handleAcceptTask(task.id, 'REJECTED')}
                                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded transition-colors"
                                    >
                                      {tx('Decline', 'मना करें')}
                                    </button>
                                  </div>
                                )}

                                {/* Mark Complete Button */}
                                {!isCompleted && !isWaived && (
                                  <button
                                    onClick={() => {
                                      setCompleteTaskItem(task);
                                      setCompleteEvidenceName('');
                                      setCompleteEvidenceUrl('');
                                      setCompleteNote('');
                                    }}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>{tx('Complete Duty', 'काम पूरा करें')}</span>
                                  </button>
                                )}

                                {/* Independent Verification Action */}
                                {isCompleted && !isVerified && (
                                  <button
                                    onClick={() => {
                                      setVerifyTaskItem(task);
                                      setVerifyStatus('VERIFIED');
                                    }}
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    <span>{tx('Independent Audit', 'स्वतंत्र जाँच')}</span>
                                  </button>
                                )}

                                {/* Reassign Task Button */}
                                <button
                                  onClick={() => setReassignTaskItem(task)}
                                  className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-[11px] font-medium transition-colors"
                                >
                                  {tx('Reassign', 'दोबारा सौंपें')}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: COMMISSION AGREEMENT (MODULE A2 & A3) */}
              {activeSubTab === 'commission_agreement' && activeDeal?.feeMode === 'OWN_SIDE' && isDealBrokerViewer && (
                <SideFeePanel dealId={activeDeal.id} onChanged={() => { onRefreshDeals(); api.getDeal(activeDeal.id).then(setDealDetail).catch(() => {}); }} />
              )}
              {activeSubTab === 'commission_agreement' && activeDeal?.feeMode !== 'OWN_SIDE' && (
                <div className="space-y-5">
                  {/* Agreement Version Selector & Actions Toolbar */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                        {tx('Agreement Versions:', 'समझौते के वर्ज़न:')}
                      </span>
                      <div className="flex items-center gap-1">
                        {agreements.map((agr) => (
                          <button
                            key={agr.id}
                            onClick={() => setSelectedAgreementVersion(agr.version)}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                              selectedAgreementVersion === agr.version
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {tx('Version', 'वर्ज़न')} {agr.version} ({enumLabel(AGR_STATUS_HI, agr.status)})
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowProposeAgreementModal(true);
                          setProposalError('');
                          setPropReason('');
                          setPropIntroPct(activeDeal?.introducingBrokerSharePct ?? 50);
                          setPropClosePct(activeDeal?.closingBrokerSharePct ?? 50);
                          setPropTotalFee(currentAgreement?.totalAgreedBrokerage || activeDeal?.totalCommissionExpected || 0);
                          setPropDealValue(currentAgreement?.dealValue || activeDeal?.dealValue || 0);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span>{tx('Propose Amendment', 'संशोधन प्रस्तावित करें')} (V{agreements.length + 1})</span>
                      </button>

                      <button
                        onClick={() => {
                          const recordStr = JSON.stringify(currentAgreement, null, 2);
                          const blob = new Blob([recordStr], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `Commission_Agreement_${currentAgreement?.id}.json`;
                          a.click();
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{tx('Download Record', 'रिकॉर्ड डाउनलोड करें')}</span>
                      </button>
                    </div>
                  </div>

                  {currentAgreement && (
                    <div className="space-y-4">
                      {/* Agreement Meta Summary Card */}
                      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
                              <span>{currentAgreement.id}</span>
                              <span>·</span>
                              <span>{tx('Status', 'स्थिति')}: {enumLabel(AGR_STATUS_HI, currentAgreement.status)}</span>
                            </div>
                            <h3 className="text-base font-bold text-white mt-0.5">
                              {th(currentAgreement.contractualBasis)}
                            </h3>
                            <p className="text-xs text-slate-300">
                              {tx('Proposed by', 'प्रस्तावक')} {currentAgreement.proposedByName} · {tx('Reason', 'कारण')}: {currentAgreement.proposalReason}
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                              {tx('Total Agreed Brokerage Fee', 'तय कुल ब्रोकरेज')}
                            </div>
                            <div className="text-xl font-bold text-emerald-400">
                              {formatINR(currentAgreement.totalAgreedBrokerage)}
                            </div>
                            <div className="text-[11px] text-slate-400">{tx('Payer', 'भुगतान करने वाला')}: {enumLabel(PAYER_HI, currentAgreement.payer)}</div>
                          </div>
                        </div>

                        {/* Record hash */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400 gap-2 font-mono">
                          <div className="flex items-center gap-1.5 truncate">
                            <Shield className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{tx('SHA-256 record hash', 'SHA-256 रिकॉर्ड हैश')}: {currentAgreement.cryptoSealHash}</span>
                          </div>
                          <span className="shrink-0">{formatDateTime(currentAgreement.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Participant Allocations Table */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                        <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          {tx('Entitlement & payout record', 'हिस्सेदारी और भुगतान का रिकॉर्ड')}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {currentAgreement.allocations.map((alloc) => (
                            <div key={alloc.participantId} className="border border-slate-200 rounded-lg p-3.5 space-y-2 bg-slate-50/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-bold text-slate-900">{alloc.participantName}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{alloc.participantId} ({label('role', alloc.role)})</div>
                                </div>
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                                    alloc.entitlementStatus === 'PAID'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : alloc.entitlementStatus === 'DISPUTED'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {enumLabel(ENTITLEMENT_HI, alloc.entitlementStatus)}
                                </span>
                              </div>

                              <div className="text-xs text-slate-600">{alloc.basisDescription}</div>

                              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">{tx('Agreed Entitlement', 'तय हिस्सा')}</span>
                                  <strong className="text-slate-900">{formatINR(alloc.allocationAmount)}</strong> ({alloc.allocationPct}%)
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">{tx('Paid Amount', 'चुकाई गई रकम')}</span>
                                  <strong className="text-emerald-700">{formatINR(alloc.paidAmount || 0)}</strong>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">{tx('Disputed / Held', 'विवाद / होल्ड')}</span>
                                  <strong className="text-rose-700">{formatINR(alloc.disputedAmount || 0)}</strong>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                <span>{tx('TDS rate on this share', 'इस हिस्से पर TDS दर')}: {alloc.taxDeductionTdsPct}% {tx('(as set for the project — confirm with your CA)', '(प्रोजेक्ट में तय — अपने CA से पुष्टि करें)')}</span>
                                <span>{tx('GST invoice', 'GST इनवॉइस')}: {alloc.invoiceRequired ? tx('Required', 'ज़रूरी') : tx('Optional', 'वैकल्पिक')}</span>
                              </div>

                              <CommissionPayments
                                dealId={activeDeal.id}
                                agreement={currentAgreement}
                                alloc={alloc}
                                meId={currentUser.id}
                                iAmDealBroker={activeDeal.introducingBrokerId === currentUser.id || activeDeal.closingBrokerId === currentUser.id}
                                frozen={activeDeal.settlementStatus === 'DISPUTED' || !!dealDetail?.access?.adminCanSee}
                                soloDeal={activeDeal.introducingBrokerId === activeDeal.closingBrokerId}
                                onChanged={() => { loadAgreements(selectedDealId); onRefreshDeals(); api.getDeal(selectedDealId).then(setDealDetail).catch(() => {}); }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Payment Triggers Milestone Table */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                        <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          {tx('When payment is due — stage milestones', 'भुगतान कब देय — स्टेज माइलस्टोन')}
                        </div>
                        <div className="space-y-2">
                          {currentAgreement.paymentTriggers.map((trig) => (
                            <div
                              key={trig.triggerId}
                              className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-900">{th(trig.milestoneName)}</div>
                                <div className="text-[11px] text-slate-500">{tx('Stage', 'स्टेज')}: {label('dealStage', trig.stage)} · {trig.percentage}% {tx('of fee', 'फ़ीस का')}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-slate-900">{formatINR(trig.amount)}</div>
                                <div className={`text-[10px] font-semibold ${trig.isMet ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {trig.isMet ? tx('Milestone reached', 'माइलस्टोन पूरा') : tx('Milestone pending', 'माइलस्टोन बाकी')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Required Approvals & Electronic Signature Signoff */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                              {tx('Digital approvals (audit trail)', 'डिजिटल मंज़ूरी (ऑडिट ट्रेल)')}
                            </div>
                            <p className="text-xs text-slate-500">
                              {tx('All entitled parties must approve before the agreement takes effect', 'समझौता लागू होने से पहले सभी हिस्सेदारों की मंज़ूरी ज़रूरी है')}
                            </p>
                          </div>

                          {currentAgreement.requiredApprovals.some((ap) => ap.userId === currentUser.id && !ap.hasAccepted) && (
                            <button
                              onClick={() => setShowESignModal(true)}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>{tx('Approve agreement', 'मंज़ूरी दें')}</span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {currentAgreement.requiredApprovals.map((ap) => (
                            <div
                              key={ap.userId}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs gap-2"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{ap.userName}</span>
                                  <span className="text-[10px] text-slate-500">({label('role', ap.role)})</span>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      ap.hasAccepted
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {ap.hasAccepted ? tx('Approved', 'मंज़ूर') : tx('Approval pending', 'मंज़ूरी बाकी')}
                                  </span>
                                </div>
                                {ap.signatureAuditTrail && (
                                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                                    {tx('Method', 'तरीका')}: {enumLabel(AUTH_METHOD_HI, ap.signatureAuditTrail.authMethod)} · {tx('Time', 'समय')}: {formatDateTime(ap.signatureAuditTrail.timestamp)}
                                  </div>
                                )}
                              </div>

                              {ap.hasAccepted && ap.signatureAuditTrail && (
                                <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                                  {tx('Hash', 'हैश')}: {ap.signatureAuditTrail.cryptoHash.slice(0, 24)}...
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Clauses: Cancellation & Dispute */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                            {tx('Transaction Cancellation Terms', 'लेन-देन रद्द होने की शर्तें')}
                          </span>
                          <p className="text-slate-700">{th(currentAgreement.cancellationClause)}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                            {tx('Dispute process', 'विवाद की प्रक्रिया')}
                          </span>
                          <p className="text-slate-700">{th(currentAgreement.disputeProcess)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: DUE DILIGENCE CHECKLIST EMBEDDED */}
              {activeSubTab === 'due_diligence' && (
                <DueDiligenceView
                  properties={properties.length > 0 ? properties : [activeProperty].filter(Boolean)}
                  currentUser={currentUser}
                  initialPropertyId={activeDeal.propertyId}
                  permissions={permissions}
                />
              )}

              {/* TAB 5: REGISTRY READINESS REPORT (MODULE B6) */}
              {activeSubTab === 'readiness_report' && (
                <div className="space-y-5">
                  <div className="print-target bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {tx('Internal checklist report', 'अंदरूनी चेकलिस्ट रिपोर्ट')}
                        </div>
                        <h3 className="text-base font-bold text-slate-900">
                          {tx('Registry readiness & handover report', 'रजिस्ट्री तैयारी और हैंडओवर रिपोर्ट')}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 print:hidden">
                        <button
                          onClick={handleGenerateReadinessReport}
                          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>{tx('Compile report', 'रिपोर्ट तैयार करें')}</span>
                        </button>
                        <button
                          onClick={() => printTarget()}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>{tx('Print Summary', 'सारांश प्रिंट करें')}</span>
                        </button>
                      </div>
                    </div>

                    {loadingReport || !readinessReport ? (
                      <div className="p-8 text-center text-slate-400 text-xs">{tx('Loading readiness audit data...', 'तैयारी का डेटा लोड हो रहा है...')}</div>
                    ) : (
                      <div className="space-y-5 pt-2">
                        {/* Big Status Badge */}
                        <div
                          className={`rounded-xl p-5 border text-center space-y-1 ${
                            readinessReport.isReadyForRegistry
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : 'bg-rose-50 border-rose-300 text-rose-950'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {readinessReport.isReadyForRegistry ? (
                              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="h-6 w-6 text-rose-600" />
                            )}
                            <h4 className="text-lg font-bold tracking-tight">
                              {readinessReport.isReadyForRegistry
                                ? tx('Checklist complete — ready to book the registry', 'चेकलिस्ट पूरी — रजिस्ट्री तय करने के लिए तैयार')
                                : tx('Registry on hold — defects / reviews still pending', 'रजिस्ट्री अभी रुकी है — कमियाँ / समीक्षा बाकी')}
                            </h4>
                          </div>

                          {readinessReport.blockers.length > 0 && (
                            <div className="pt-2 text-xs text-rose-800 max-w-xl mx-auto space-y-1 text-left bg-white/80 rounded-lg p-3 border border-rose-200">
                              <span className="font-bold block">{tx('Current Transaction Blockers:', 'अभी की रुकावटें:')}</span>
                              <ul className="list-disc list-inside space-y-0.5">
                                {readinessReport.blockers.map((b, i) => (
                                  <li key={i}>{hi ? blockerHi(b) : b}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <span className="text-slate-500 block">{tx('Checklist Completion', 'चेकलिस्ट पूरी')}</span>
                            <strong className="text-base text-slate-900">
                              {readinessReport.checklistCompletion.percentage}%
                            </strong>{' '}
                            ({readinessReport.checklistCompletion.verifiedCount}/{readinessReport.checklistCompletion.totalItems} {tx('verified', 'जाँचे गए')})
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <span className="text-slate-500 block">{tx('Critical Unresolved Defect Issues', 'खुले गंभीर मुद्दे')}</span>
                            <strong className="text-base text-rose-600">
                              {readinessReport.criticalIssuesCount}
                            </strong>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <span className="text-slate-500 block">{tx('Legal opinion', 'क़ानूनी राय')}</span>
                            <strong className="text-xs text-slate-900 block mt-1">
                              {(hi ? LEGAL_OPINION_HI : LEGAL_OPINION_EN)[readinessReport.legalReviewerDetails.legalOpinionStatus] ?? readinessReport.legalReviewerDetails.legalOpinionStatus}
                            </strong>
                            <span className="text-[10px] text-slate-500">{readinessReport.legalReviewerDetails.name}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <span className="text-slate-500 block">{tx('Registry Owner / Coordinator', 'रजिस्ट्री समन्वयक')}</span>
                            <strong className="text-xs text-slate-900 block mt-1">
                              {readinessReport.registryCoordinationOwner.name}
                            </strong>
                            <span className="text-[10px] text-slate-500">{label('role', readinessReport.registryCoordinationOwner.role)}</span>
                          </div>
                        </div>

                        {/* Pending Documents List */}
                        {readinessReport.pendingDocuments.length > 0 && (
                          <div className="border border-slate-200 rounded-lg p-4 space-y-2 text-xs bg-slate-50">
                            <div className="font-bold text-slate-800">{tx('Pending Documentation Required:', 'बाकी दस्तावेज़:')}</div>
                            <ul className="list-disc list-inside text-slate-600 space-y-1">
                              {readinessReport.pendingDocuments.map((doc, idx) => (
                                <li key={idx}>{th(doc)}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Statutory Disclaimer (Mandatory) */}
                        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3.5 text-xs text-slate-600 flex items-start gap-2">
                          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                          <span>{hi && readinessReport.statutoryDisclaimer === DISCLAIMER_EN ? DISCLAIMER_HI : readinessReport.statutoryDisclaimer}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: DISPUTES & HOLDS (MODULE A4) */}
              {activeSubTab === 'legal_help' && !summaryOnly && <LegalHelpPanel dealId={activeDeal.id} />}

              {activeSubTab === 'disputes_holds' && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{tx('Disputes & commission holds', 'विवाद और कमीशन होल्ड')}</h4>
                        <p className="text-xs text-slate-500">
                          {tx('Formal grievances, bypass claims, counterparty responses, and temporary holds', 'शिकायतें, बायपास के दावे और अस्थायी होल्ड')}
                        </p>
                      </div>
                      {perm('dispute:create') && (
                      <button
                        onClick={() => onOpenFileDispute(activeDeal.id)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                      >
                        <Scale className="h-3.5 w-3.5" />
                        <span>{tx('File Formal Dispute', 'विवाद दर्ज करें')}</span>
                      </button>
                      )}
                    </div>

                    {dealDetail?.dispute ? (
                      <div className="border border-rose-200 bg-rose-50/20 rounded-lg p-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-rose-900">
                            {dealDetail.dispute.id} — {tx('Reason', 'कारण')}: {label('disputeReason', dealDetail.dispute.reason)}
                          </div>
                          <span className="font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded">
                            {label('disputeStatus', dealDetail.dispute.status)}
                          </span>
                        </div>
                        <p className="text-slate-700">{dealDetail.dispute.description}</p>
                        <div className="text-[11px] text-slate-500">
                          {tx('Filed by', 'दर्ज करने वाला')}: <strong>{dealDetail.dispute.complainantName}</strong> ({label('role', dealDetail.dispute.complainantRole)}) {tx('vs', 'बनाम')}{' '}
                          <strong>{dealDetail.dispute.counterpartyName}</strong>
                        </div>
                        {dealDetail.dispute.resolutionNotes && (
                          <div className="bg-white border border-rose-200 p-2.5 rounded text-slate-800 mt-2">
                            <strong>{tx('Admin review notes', 'एडमिन की समीक्षा का निष्कर्ष')}:</strong> {dealDetail.dispute.resolutionNotes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-lg">
                        {tx('No active disputes filed for this transaction. Commission settlement terms are uncontested.', 'इस लेन-देन पर कोई विवाद दर्ज नहीं है।')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      ) : (
        /* Proposals Management Center */
        <div className="space-y-5">
          {/* Proposals Sub-Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProposalSubTab('INCOMING')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
                  proposalSubTab === 'INCOMING'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{tx('Incoming Proposals', 'आए हुए प्रस्ताव')} ({incomingOffers.length})</span>
                {pendingIncomingCount > 0 && (
                  <span className="rounded-full bg-red-500 text-white px-1.5 py-0.2 text-[10px]">
                    {pendingIncomingCount} {tx('New', 'नए')}
                  </span>
                )}
              </button>

              <button
                onClick={() => setProposalSubTab('SENT')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
                  proposalSubTab === 'SENT'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{tx('Sent Proposals', 'भेजे हुए प्रस्ताव')} ({sentOffers.length})</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 hidden sm:flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>{tx('Protected by the anti-bypass rule', 'एंटी-बायपास सुरक्षा लागू')}</span>
            </div>
          </div>

          {/* Proposal Cards List */}
          {proposalSubTab === 'INCOMING' ? (
            incomingOffers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400 space-y-2">
                <Briefcase className="h-8 w-8 mx-auto text-slate-300" />
                <div className="text-sm font-semibold text-slate-700">{tx('No Incoming Collaboration Proposals Yet', 'अभी कोई कोलैबोरेशन प्रस्ताव नहीं आया')}</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {tx('When another broker proposes a co-broking commission split on one of your property listings, it will appear here in real time.', 'जब कोई दूसरा ब्रोकर आपकी किसी लिस्टिंग पर को-ब्रोकिंग कमीशन स्प्लिट का प्रस्ताव भेजेगा, वह यहीं दिखेगा।')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {incomingOffers.map((offer) => {
                  const prop = offer.property || properties.find((p) => p.id === offer.propertyId);
                  const isPending = offer.status === 'PENDING';
                  const isAccepted = offer.status === 'ACCEPTED';
                  const isCountered = offer.status === 'COUNTERED';

                  return (
                    <div
                      key={offer.id}
                      className={`rounded-xl border bg-white p-5 shadow-xs flex flex-col justify-between gap-4 transition-all ${
                        isPending
                          ? 'border-amber-300 ring-1 ring-amber-200'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Top Bar */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{offer.id}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{formatDateTime(offer.createdAt)}</span>
                          </div>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              isPending
                                ? 'bg-amber-100 text-amber-900'
                                : isAccepted
                                ? 'bg-emerald-100 text-emerald-900'
                                : isCountered
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {enumLabel(OFFER_STATUS_HI, offer.status)}
                          </span>
                        </div>

                        {/* Property Info */}
                        <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                            {tx('Target Listing Mandate', 'लिस्टिंग')}
                          </div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5 line-clamp-1">
                            {prop?.title || offer.propertyId}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                            <span>{prop?.locality || prop?.city || ''}</span>
                            {prop?.askingPrice && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-bold text-slate-900">{formatINR(prop.askingPrice)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Proposing Broker */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <div>
                            <span className="text-slate-500">{tx('Proposing broker', 'प्रस्ताव भेजने वाला ब्रोकर')}: </span>
                            <span className="font-bold text-slate-900">
                              {offer.proposingBroker?.name || offer.proposingBrokerId}
                            </span>
                            {offer.proposingBroker?.companyName && (
                              <span className="text-slate-500 text-[11px] block">
                                {offer.proposingBroker.companyName}
                              </span>
                            )}
                          </div>
                          {offer.proposingBroker && (
                            <TrustScoreBadge user={offer.proposingBroker} variant="minimal" />
                          )}
                        </div>

                        {/* v41: apna-apna side — nothing is shared */}
                        {offer.feeMode === 'OWN_SIDE' && (
                          <div data-testid="offer-own-side" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
                            <div className="font-bold">{tx('Apna-apna side — no split', 'अपना-अपना साइड — कोई बँटवारा नहीं')}</div>
                            <p>
                              {tx('He acts for the', 'वह इस तरफ़ है')}: <b>{offer.proposerSide === 'SELLER' ? tx('Seller', 'विक्रेता') : tx('Buyer', 'खरीदार')}</b>
                              {' · '}{tx('You act for the', 'आप इस तरफ़ होंगे')}: <b>{offer.proposerSide === 'SELLER' ? tx('Buyer', 'खरीदार') : tx('Seller', 'विक्रेता')}</b>
                            </p>
                            <p>{tx('Each of you takes brokerage only from your own client. Neither fee is shown to the other.', 'आप दोनों सिर्फ़ अपने-अपने क्लाइंट से ब्रोकरेज लेंगे। किसी की फ़ीस दूसरे को नहीं दिखेगी।')}</p>
                          </div>
                        )}

                        {/* Proposed Commission Split Display */}
                        {offer.feeMode !== 'OWN_SIDE' && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{tx('Proposed Commission Split', 'प्रस्तावित कमीशन स्प्लिट')}</span>
                            <span className="font-mono font-bold text-slate-900">
                              {offer.proposedIntroducingShare}% {tx('Introducer', 'इंट्रोड्यूसर')} / {offer.proposedClosingShare}% {tx('Closer', 'क्लोज़र')}
                            </span>
                          </div>

                          {/* Progress visualizer */}
                          <div className="h-2 w-full rounded-full bg-slate-100 flex overflow-hidden">
                            <div
                              style={{ width: `${offer.proposedIntroducingShare}%` }}
                              className="bg-blue-600 h-full"
                              title={`${tx('Introducer', 'इंट्रोड्यूसर')}: ${offer.proposedIntroducingShare}%`}
                            />
                            <div
                              style={{ width: `${offer.proposedClosingShare}%` }}
                              className="bg-amber-500 h-full"
                              title={`${tx('Closer', 'क्लोज़र')}: ${offer.proposedClosingShare}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>{tx('Introducer', 'इंट्रोड्यूसर')} ({offer.proposedIntroducingShare}%)</span>
                            <span>{tx('Closing Broker', 'क्लोज़िंग ब्रोकर')} ({offer.proposedClosingShare}%)</span>
                          </div>
                        </div>
                        )}

                        {/* Terms & Notes */}
                        {offer.terms && (
                          <div className="text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                            <span className="font-semibold text-slate-700">{tx('Terms', 'शर्तें')}: </span>
                            "{offer.terms}"
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>{tx('The anti-bypass rule applies once accepted', 'मंज़ूर होने पर एंटी-बायपास सुरक्षा लागू होगी')}</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleAcceptOffer(offer.id)}
                              disabled={respondingOfferId === offer.id}
                              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                            >
                              {respondingOfferId === offer.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              <span>{tx('Accept & create Deal Room', 'मंज़ूर करें और डील रूम बनाएँ')}</span>
                            </button>

                            <button
                              onClick={() =>
                                setCounterModal({
                                  open: true,
                                  offer,
                                  introShare: 100 - offer.proposedIntroducingShare,
                                  closeShare: offer.proposedIntroducingShare,
                                  notes: '',
                                })
                              }
                              disabled={respondingOfferId === offer.id}
                              className="py-2 px-3 rounded-lg border border-blue-300 bg-blue-50/70 hover:bg-blue-100 text-blue-800 font-semibold text-xs transition-colors"
                            >
                              {offer.feeMode === 'OWN_SIDE' ? tx('Counter with a % split', '% बँटवारे का काउंटर') : tx('Counter Offer', 'काउंटर ऑफ़र')}
                            </button>

                            {offer.feeMode !== 'OWN_SIDE' && (
                              <button
                                data-testid="counter-own-side"
                                onClick={() => setOwnCounter({ offer, side: 'SELLER' })}
                                disabled={respondingOfferId === offer.id}
                                className="py-2 px-3 rounded-lg border border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs transition-colors"
                              >
                                {tx('Apna-apna side', 'अपना-अपना साइड')}
                              </button>
                            )}

                            <button
                              onClick={() => handleRejectOffer(offer.id)}
                              disabled={respondingOfferId === offer.id}
                              className="py-2 px-3 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold text-xs transition-colors"
                            >
                              {tx('Decline', 'मना करें')}
                            </button>
                          </>
                        )}

                        {isAccepted && (
                          <button
                            onClick={() => {
                              const matchingDeal = deals.find((d) => d.propertyId === offer.propertyId);
                              if (matchingDeal) setSelectedDealId(matchingDeal.id);
                              setMainMode('DEAL_ROOMS');
                            }}
                            className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Briefcase className="h-3.5 w-3.5 text-amber-400" />
                            <span>{tx('Open Deal Room', 'डील रूम खोलें')} →</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            sentOffers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400 space-y-2">
                <Send className="h-8 w-8 mx-auto text-slate-300" />
                <div className="text-sm font-semibold text-slate-700">{tx('No Sent Proposals Yet', 'अभी कोई प्रस्ताव नहीं भेजा')}</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {tx(
                    "You haven't sent any co-broking offer yet. Open Properties and tap \"Co-broking offer\" on a listing.",
                    'आपने अभी कोई को-ब्रोकिंग ऑफ़र नहीं भेजा। प्रॉपर्टी खोलें और किसी लिस्टिंग पर "को-ब्रोकिंग ऑफ़र" दबाएँ।',
                  )}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sentOffers.map((offer) => {
                  const prop = offer.property || properties.find((p) => p.id === offer.propertyId);
                  return (
                    <div
                      key={offer.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-slate-900">{offer.id}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              offer.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-900'
                                : offer.status === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {enumLabel(OFFER_STATUS_HI, offer.status)}
                          </span>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                            {tx('Listing Mandate', 'लिस्टिंग')}
                          </div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">
                            {prop?.title || offer.propertyId}
                          </div>
                        </div>

                        <div className="text-xs text-slate-600">
                          <span className="text-slate-500">{tx('Sent to listing broker', 'लिस्टिंग ब्रोकर को भेजा')}: </span>
                          <span className="font-bold text-slate-900">
                            {offer.receivingBroker?.name || offer.receivingBrokerId}
                          </span>
                        </div>

                        <div className="text-xs font-mono font-bold text-slate-800">
                          {offer.feeMode === 'OWN_SIDE'
                            ? tx('Apna-apna side — each keeps his own client\'s fee', 'अपना-अपना साइड — हर ब्रोकर अपने क्लाइंट की फ़ीस रखता है')
                            : <>{tx('Split', 'स्प्लिट')}: {offer.proposedIntroducingShare}% {tx('Introducer', 'इंट्रोड्यूसर')} / {offer.proposedClosingShare}% {tx('Closer', 'क्लोज़र')}</>}
                        </div>

                        {offer.terms && (
                          <div className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded">
                            "{offer.terms}"
                          </div>
                        )}
                      </div>

                      {offer.status === 'ACCEPTED' && (
                        <button
                          onClick={() => {
                            const matchingDeal = deals.find((d) => d.propertyId === offer.propertyId);
                            if (matchingDeal) setSelectedDealId(matchingDeal.id);
                            setMainMode('DEAL_ROOMS');
                          }}
                          className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Briefcase className="h-3.5 w-3.5 text-amber-400" />
                          <span>{tx('Open Deal Room', 'डील रूम खोलें')} →</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* Modal: Complete Task (Module A1) */}
      {completeTaskItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tx('Complete Assigned Duty', 'सौंपा हुआ काम पूरा करें')}</h3>
                <p className="text-xs text-slate-500">{th(completeTaskItem.title)}</p>
              </div>
              <button onClick={() => setCompleteTaskItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteTask} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Completion Summary Notes', 'पूरा होने का सारांश')}</label>
                <textarea
                  rows={3}
                  required
                  value={completeNote}
                  onChange={(e) => setCompleteNote(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('Detail the actions taken, Sub-Registrar coordination completed, or client signoff...', 'क्या किया, कौन-सा समन्वय पूरा हुआ या ग्राहक की सहमति — लिखें...')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Evidence name (optional)', 'सबूत का नाम (वैकल्पिक)')}</label>
                <input
                  type="text"
                  value={completeEvidenceName}
                  onChange={(e) => setCompleteEvidenceName(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('e.g. Registered agreement copy', 'जैसे रजिस्टर्ड समझौते की कॉपी')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Evidence link (optional, https)', 'सबूत का लिंक (वैकल्पिक, https)')}</label>
                <input
                  type="url"
                  value={completeEvidenceUrl}
                  onChange={(e) => setCompleteEvidenceUrl(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder="https://..."
                />
                <p className="mt-1 text-[11px] text-slate-400">{tx('GENZ keeps only the link, not the file.', 'GENZ सिर्फ़ लिंक रखता है, फ़ाइल नहीं।')}</p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setCompleteTaskItem(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isSubmittingTask ? tx('Saving...', 'सेव हो रहा है...') : tx('Mark as done', 'पूरा हुआ दर्ज करें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Independent Verify Task */}
      {verifyTaskItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tx('Independent review', 'स्वतंत्र जाँचकर्ता की समीक्षा')}</h3>
                <p className="text-xs text-slate-500">{th(verifyTaskItem.title)}</p>
              </div>
              <button onClick={() => setVerifyTaskItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyTask} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Audit Determination', 'जाँच का निर्णय')}</label>
                <select
                  value={verifyStatus}
                  onChange={(e: any) => setVerifyStatus(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none"
                >
                  <option value="VERIFIED">{tx('VERIFIED (Evidence & Standard Met)', 'जाँचा हुआ (सबूत और मानक पूरे)')}</option>
                  <option value="REJECTED">{tx('REJECTED (Defect Found / Incomplete)', 'अस्वीकृत (कमी मिली / अधूरा)')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Reviewer Notes', 'जाँचकर्ता के नोट')}</label>
                <textarea
                  rows={3}
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('Record verification verification findings...', 'जाँच में क्या मिला — लिखें...')}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setVerifyTaskItem(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingTask}
                  className="px-4 py-2 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isVerifyingTask ? tx('Saving...', 'सेव हो रहा है...') : tx('Record review', 'समीक्षा दर्ज करें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reassign Task */}
      {reassignTaskItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tx('Reassign Task Responsibility', 'काम की ज़िम्मेदारी बदलें')}</h3>
                <p className="text-xs text-slate-500">{th(reassignTaskItem.title)}</p>
              </div>
              <button onClick={() => setReassignTaskItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReassignTask} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Assign To Participant', 'किसे सौंपना है')}</label>
                <select
                  required
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none"
                >
                  <option value="">{reassignLoading ? tx('Loading...', 'लोड हो रहा है...') : tx('Select participant...', 'सदस्य चुनें...')}</option>
                  {(['PARTICIPANT', 'TEAM', 'LEGAL', 'DESK'] as const).map((g) => {
                    const rows = reassignCandidates.filter((u) => u.group === g);
                    if (!rows.length) return null;
                    const head = { PARTICIPANT: tx('In this deal room', 'इस डील रूम के सदस्य'), TEAM: tx('Employees allotted to this deal', 'इस डील में लगे कर्मचारी'), LEGAL: tx('Empanelled legal counsel', 'पैनल के क़ानूनी सलाहकार'), DESK: tx('GENZ desk', 'GENZ डेस्क') }[g];
                    return (
                      <optgroup key={g} label={head}>
                        {rows.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.group === 'TEAM' ? `${u.title ? th(u.title) : tx('Employee', 'कर्मचारी')}${u.employerName ? ` · ${u.employerName}` : ''}` : label('role', u.role)})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">
                  {!reassignLoading && reassignCandidates.length === 0
                    ? tx('No one else is in this deal room yet. Allot your employee to this deal first (Team → deal access).', 'इस डील रूम में अभी कोई और नहीं है। पहले अपने कर्मचारी को इस डील में जोड़ें (टीम → डील एक्सेस)।')
                    : tx('Only people who are part of this deal are listed — not other users of the network.', 'सिर्फ़ इसी डील से जुड़े लोग दिखते हैं — नेटवर्क के बाकी यूज़र नहीं।')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Reassignment Justification Reason', 'दोबारा सौंपने का कारण')}</label>
                <input
                  type="text"
                  required
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('e.g. Mutual consensus: Legal counsel to review Sub-Registrar boundary documents', 'जैसे आपसी सहमति: क़ानूनी सलाहकार सीमा के दस्तावेज़ देखेंगे')}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setReassignTaskItem(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isReassigningTask}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  {isReassigningTask ? tx('Saving...', 'सेव हो रहा है...') : tx('Confirm reassignment', 'दोबारा सौंपना पक्का करें')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Propose Commission Amendment (Module A3) */}
      {showProposeAgreementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {tx('Propose Commission Amendment', 'कमीशन संशोधन प्रस्तावित करें')} ({tx('Version', 'वर्ज़न')} {agreements.length + 1})
                </h3>
                <p className="text-xs text-slate-500">
                  {tx('Creates a new versioned agreement requiring mutual approval from all affected participants', 'नया वर्ज़न बनेगा जिसे सभी संबंधित सदस्यों की मंज़ूरी चाहिए')}
                </p>
              </div>
              <button onClick={() => setShowProposeAgreementModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {proposalError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-xs">
                {proposalError}
              </div>
            )}

            <form onSubmit={handleProposeAgreement} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Total Agreed Brokerage (₹)', 'तय कुल ब्रोकरेज (₹)')}</label>
                  <input
                    type="number"
                    required
                    value={propTotalFee}
                    onChange={(e) => setPropTotalFee(Number(e.target.value))}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700">{tx('Deal value — the price the property sells for (₹)', 'डील वैल्यू — जिस भाव पर प्रॉपर्टी बिक रही है (₹)')}</label>
                  <input
                    type="number"
                    min={0}
                    value={propDealValue || ''}
                    onChange={(e) => setPropDealValue(Number(e.target.value))}
                    placeholder={tx('e.g. 11500000', 'जैसे 11500000')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">{tx('GENZ sees only the total of all deal values on its dashboard — never your brokerage terms or chat.', 'GENZ को अपने डैशबोर्ड पर सिर्फ़ सभी डील वैल्यू का कुल दिखता है — आपकी ब्रोकरेज शर्तें या चैट कभी नहीं।')}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Fee Payer', 'फ़ीस कौन देगा')}</label>
                  <select
                    value={propPayer}
                    onChange={(e: any) => setPropPayer(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none"
                  >
                    <option value="SPLIT_EQUAL">{tx('Buyer & Seller Equal Split', 'खरीदार और विक्रेता आधा-आधा')}</option>
                    <option value="SELLER">{tx('Seller Full Brokerage', 'विक्रेता पूरी ब्रोकरेज देगा')}</option>
                    <option value="BUYER">{tx('Buyer Full Brokerage', 'खरीदार पूरी ब्रोकरेज देगा')}</option>
                    <option value="BUILDER_DEVELOPER">{tx('Builder / Developer Fee', 'बिल्डर / डेवलपर देगा')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Introducing Broker Share (%)', 'इंट्रोड्यूस करने वाले ब्रोकर का हिस्सा (%)')}</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    value={propIntroPct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPropIntroPct(val);
                      setPropClosePct(100 - val);
                    }}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Closing Broker Share (%)', 'क्लोज़िंग ब्रोकर का हिस्सा (%)')}</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    value={propClosePct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPropClosePct(val);
                      setPropIntroPct(100 - val);
                    }}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Proposal Reason / Modification Justification', 'प्रस्ताव का कारण / बदलाव की वजह')}</label>
                <input
                  type="text"
                  required
                  value={propReason}
                  onChange={(e) => setPropReason(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('e.g. Revised after buyer agreed to pay legal documentation expenses', 'जैसे खरीदार ने क़ानूनी दस्तावेज़ का खर्च देना मान लिया')}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowProposeAgreementModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposal}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  {isSubmittingProposal ? tx('Sending...', 'भेज रहे हैं...') : tx('Send for mutual approval', 'आपसी मंज़ूरी के लिए भेजें')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: E-Sign Agreement (Compliant Electronic Signature) */}
      {showESignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tx('Digital approval', 'डिजिटल मंज़ूरी')}</h3>
                <p className="text-xs text-slate-500">{tx('Commission terms — version', 'कमीशन शर्तें — वर्ज़न')} {currentAgreement?.version}</p>
              </div>
              <button onClick={() => setShowESignModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">{tx('Signer Profile & Audit Metadata', 'मंज़ूर करने वाले की जानकारी')}</div>
                <div className="font-bold text-slate-900">{currentUser.name}</div>
                <div className="text-[11px] text-slate-500">{currentUser.email} · {tx('Role', 'भूमिका')}: {label('role', currentUser.role)}</div>
                <div className="text-[10px] text-emerald-700 font-mono">{tx('Method: digital approval (SHA-256 hash-chained)', 'तरीका: डिजिटल मंज़ूरी (SHA-256 हैश-चेन)')}</div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs">
                <strong>{tx('Please confirm:', 'कृपया पुष्टि करें:')}</strong>{' '}
                {tx(
                  'By approving, you confirm you have read the commission split, the TDS / GST terms, the cancellation terms and the anti-bypass rule, and you agree to them. This is a platform approval record — it is not an Aadhaar e-Sign. For a formal agreement, have an advocate review it.',
                  'मंज़ूरी देकर आप मानते हैं कि आपने कमीशन स्प्लिट, TDS / GST की शर्तें, रद्द होने की शर्तें और एंटी-बायपास नियम पढ़ लिया है और इनसे सहमत हैं। यह प्लेटफ़ॉर्म का मंज़ूरी रिकॉर्ड है — आधार e-Sign नहीं। औपचारिक समझौते के लिए किसी वकील से जँचवाएँ।',
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Signer Acknowledgement Notes', 'मंज़ूरी का नोट')}</label>
                <input
                  type="text"
                  value={eSignNotes}
                  onChange={(e) => setESignNotes(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  placeholder={tx('e.g. Terms read and accepted', 'जैसे शर्तें पढ़कर मंज़ूर कीं')}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowESignModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="button"
                  onClick={handleSignAgreement}
                  disabled={isSubmittingESign}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isSubmittingESign ? tx('Saving...', 'सेव हो रहा है...') : tx('Approve', 'मंज़ूरी दें')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD VAULT ASSET MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <FolderLock className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">{tx('Add file to vault', 'वॉल्ट में फ़ाइल जोड़ें')}</h3>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSubmittingUpload(true);
                try {
                  await api.uploadVaultAsset(activeDeal.propertyId, {
                    originalFileName: uploadFileName,
                    category: uploadCategory,
                    fileUrl: uploadFileUrl.trim(),
                    description: uploadDescription,
                    sensitivity: uploadSensitivity,
                  });
                  alert(tx('File added to the vault.', 'फ़ाइल वॉल्ट में जुड़ गई।'));
                  setShowUploadModal(false);
                  setUploadFileName('');
                  setUploadFileUrl('');
                  setUploadDescription('');
                  loadVault(activeDeal.propertyId);
                } catch (err: any) {
                  alert(err.message);
                } finally {
                  setIsSubmittingUpload(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Media Category', 'फ़ाइल का प्रकार')}</label>
                <select
                  value={uploadCategory}
                  onChange={(e: any) => setUploadCategory(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                >
                  <option value="PHOTOGRAPH">{tx('Property Photograph', 'प्रॉपर्टी फ़ोटो')}</option>
                  <option value="WALKTHROUGH_VIDEO">{tx('Property Walkthrough & Site Video', 'वॉकथ्रू / साइट वीडियो')}</option>
                  <option value="OWNERSHIP_TITLE_DEED">{tx('Ownership & Title Deed', 'मालिकाना और टाइटल डीड')}</option>
                  <option value="SALE_DEED_CHAIN">{tx('Prior Sale Deed Chain (30-Year Chain)', 'पिछली बिक्री-डीड की चेन (30 साल)')}</option>
                  <option value="LAYOUT_SITE_PLAN">{tx('Approved Layout / Sanctioned Floor Plan', 'मंज़ूर लेआउट / फ़्लोर प्लान')}</option>
                  <option value="SURVEY_MEASUREMENT">{tx('Land Measurement & Demarcation Survey', 'ज़मीन नाप और सीमांकन सर्वे')}</option>
                  <option value="TAX_RECEIPT_NOC">{tx('Municipal Tax Receipts & NOCs', 'नगर निगम टैक्स रसीद और NOC')}</option>
                  <option value="OTHER_ATTACHMENT">{tx('Other Supporting Attachment', 'अन्य सहायक दस्तावेज़')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Original File Name', 'फ़ाइल का नाम')}</label>
                <input
                  type="text"
                  required
                  value={uploadFileName}
                  onChange={(e) => setUploadFileName(e.target.value)}
                  placeholder={tx('e.g. villa_khasra_b1_p2_2026.pdf or master_bedroom_interior.jpg', 'जैसे villa_khasra_2026.pdf या bedroom.jpg')}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('File link (https)', 'फ़ाइल का लिंक (https)')}</label>
                <input
                  type="url"
                  required
                  value={uploadFileUrl}
                  onChange={(e) => setUploadFileUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                />
              </div>

              <p className="text-[11px] text-slate-400">{tx('GENZ keeps only the link, not the file itself. Use a link you control (Drive, Dropbox…) and set its sharing yourself.', 'GENZ सिर्फ़ लिंक रखता है, फ़ाइल नहीं। अपने कंट्रोल वाला लिंक (Drive, Dropbox…) दें और उसकी शेयरिंग खुद तय करें।')}</p>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Description', 'विवरण')}</label>
                <textarea
                  rows={2}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder={tx('Notes on the document or photo...', 'दस्तावेज़ या फ़ोटो के बारे में नोट...')}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Sensitivity Classification', 'गोपनीयता स्तर')}</label>
                <select
                  value={uploadSensitivity}
                  onChange={(e: any) => setUploadSensitivity(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                >
                  <option value="CONFIDENTIAL">{tx('Confidential (Selective sharing required)', 'गोपनीय (चुनिंदा शेयरिंग ज़रूरी)')}</option>
                  <option value="HIGHLY_SENSITIVE">{tx('Highly Sensitive (Title deeds & owner IDs)', 'अति संवेदनशील (टाइटल डीड और मालिक की ID)')}</option>
                  <option value="PUBLIC">{tx('Public (Visible on property gallery)', 'सार्वजनिक (प्रॉपर्टी गैलरी में दिखेगी)')}</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUpload}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isSubmittingUpload ? tx('Saving...', 'सेव हो रहा है...') : tx('Save to vault', 'वॉल्ट में सेव करें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SELECTIVE SHARING GRANT MODAL */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">{tx('Grant Selective Access to Vault Files', 'वॉल्ट की फ़ाइलों का चुनिंदा एक्सेस दें')}</h3>
              </div>
              <button onClick={() => setShowGrantModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (grantAssetIds.length === 0) {
                  alert(tx('Select at least one file.', 'कम से कम एक फ़ाइल चुनें।'));
                  return;
                }
                setIsSubmittingGrant(true);
                try {
                  await api.createVaultGrant(activeDeal.propertyId, {
                    recipientType: grantRecipientType,
                    recipientId:
                      grantRecipientType === 'DEAL_ROOM_PARTICIPANTS' ? activeDeal.id
                      : grantRecipientType === 'VERIFIED_GROUP' ? 'VERIFIED_ALL'
                      : otherBrokerId,
                    assetIds: grantAssetIds,
                    permissionLevel: grantPermission,
                    locationPrecisionPermitted: grantLocationPrecision,
                    expiresInDays: grantExpiresDays,
                  });
                  alert(tx('Access granted.', 'एक्सेस दे दिया गया।'));
                  setShowGrantModal(false);
                  loadVault(activeDeal.propertyId);
                } catch (err: any) {
                  alert(err.message);
                } finally {
                  setIsSubmittingGrant(false);
                }
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700">{tx('Who can see these files', 'ये फ़ाइलें कौन देख सकता है')}</label>
                  <select
                    value={grantRecipientType}
                    onChange={(e: any) => setGrantRecipientType(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                  >
                    <option value="DEAL_ROOM_PARTICIPANTS">{tx('Everyone in this Deal Room', 'इस डील रूम के सभी सदस्य')}</option>
                    {otherBrokerId && <option value="BROKER">{tx('Only the other broker', 'सिर्फ़ दूसरा ब्रोकर')}{otherBrokerName ? ` (${otherBrokerName})` : ''}</option>}
                    <option value="VERIFIED_GROUP">{tx('All verified members', 'सभी वेरिफ़ाइड सदस्य')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{tx('Select Permitted Files', 'दिखाने वाली फ़ाइलें चुनें')}</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {vaultAssets.map((asset) => (
                    <label key={asset.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={grantAssetIds.includes(asset.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setGrantAssetIds(prev => [...prev, asset.id]);
                          } else {
                            setGrantAssetIds(prev => prev.filter(id => id !== asset.id));
                          }
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="font-medium text-slate-800 truncate flex-1">{asset.originalFileName}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{asset.category.split('_')[0]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Permission', 'अनुमति')}</label>
                  <select
                    value={grantPermission}
                    onChange={(e: any) => setGrantPermission(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                  >
                    <option value="PREVIEW">{tx('Preview Only', 'सिर्फ़ प्रीव्यू')}</option>
                    <option value="VIEW">{tx('Full View', 'पूरा व्यू')}</option>
                    <option value="DOWNLOAD">{tx('Download Permitted', 'डाउनलोड की अनुमति')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Location Precision', 'लोकेशन कितनी सटीक')}</label>
                  <select
                    value={grantLocationPrecision}
                    onChange={(e: any) => setGrantLocationPrecision(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                  >
                    <option value="EXACT_PIN">{tx('Exact Site Pin', 'सटीक साइट पिन')}</option>
                    <option value="GENERAL_AREA">{tx('General Area (1 km radius)', 'सामान्य इलाका (1 किमी)')}</option>
                    <option value="APPROXIMATE_LOCALITY">{tx('Approximate Locality Only', 'सिर्फ़ मोटा इलाका')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Access Expiry', 'एक्सेस कब तक')}</label>
                  <select
                    value={grantExpiresDays}
                    onChange={(e) => setGrantExpiresDays(Number(e.target.value))}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                  >
                    <option value={7}>{tx('7 Days', '7 दिन')}</option>
                    <option value={15}>{tx('15 Days', '15 दिन')}</option>
                    <option value={30}>{tx('30 Days (Standard)', '30 दिन (सामान्य)')}</option>
                    <option value={90}>{tx('90 Days', '90 दिन')}</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowGrantModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGrant}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>{isSubmittingGrant ? tx('Saving...', 'सेव हो रहा है...') : tx('Give access', 'एक्सेस दें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOCATION & GOOGLE MAPS CONFIGURATION MODAL */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">{tx('Configure Site Location & Google Maps', 'साइट लोकेशन और Google Maps सेट करें')}</h3>
              </div>
              <button onClick={() => setShowLocationModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSavingLocation(true);
                try {
                  await api.updatePropertyLocation(activeDeal.propertyId, {
                    state: locState,
                    city: locCity,
                    locality: locLocality,
                    village: locVillage,
                    street: locStreet,
                    pincode: locPincode,
                    landmark: locLandmark,
                    googleMapsUrl: locMapsUrl,
                    locationPrecision: locPrecision,
                  });
                  alert(tx('Location saved.', 'लोकेशन सेव हो गई।'));
                  setShowLocationModal(false);
                  loadDetail(activeDeal.id);
                } catch (err: any) {
                  alert(err.message);
                } finally {
                  setIsSavingLocation(false);
                }
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('State', 'राज्य')}</label>
                  <input
                    type="text"
                    required
                    value={locState}
                    onChange={(e) => setLocState(e.target.value)}
                    placeholder={tx('e.g. Maharashtra, Karnataka, etc.', 'जैसे छत्तीसगढ़, महाराष्ट्र')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('City / District', 'शहर / ज़िला')}</label>
                  <input
                    type="text"
                    required
                    value={locCity}
                    onChange={(e) => setLocCity(e.target.value)}
                    placeholder={tx('e.g. Pune, Jaipur, Raipur...', 'जैसे रायपुर, पुणे, जयपुर...')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Locality', 'इलाका')}</label>
                  <input
                    type="text"
                    required
                    value={locLocality}
                    onChange={(e) => setLocLocality(e.target.value)}
                    placeholder={tx('e.g. Shankar Nagar, VIP Road...', 'जैसे शंकर नगर, VIP रोड...')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Village / Tehsil (if rural/semi-urban)', 'गाँव / तहसील (ग्रामीण हो तो)')}</label>
                  <input
                    type="text"
                    value={locVillage}
                    onChange={(e) => setLocVillage(e.target.value)}
                    placeholder={tx('e.g. Daldal Seoni / Mandir Hasaud', 'जैसे दलदल सिवनी / मंदिर हसौद')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('Street / Road Address', 'सड़क / पता')}</label>
                  <input
                    type="text"
                    value={locStreet}
                    onChange={(e) => setLocStreet(e.target.value)}
                    placeholder={tx('e.g. Canal Road, Sector 3...', 'जैसे कैनाल रोड, सेक्टर 3...')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{tx('PIN Code', 'पिन कोड')}</label>
                  <input
                    type="text"
                    value={locPincode}
                    onChange={(e) => setLocPincode(e.target.value)}
                    placeholder={tx('e.g. 492007', 'जैसे 492007')}
                    className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Google Maps URL', 'Google Maps लिंक')}</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="url"
                    value={locMapsUrl}
                    onChange={(e) => setLocMapsUrl(e.target.value)}
                    placeholder={tx('https://maps.google.com/?q=21.2514,81.6296 or https://maps.app.goo.gl/...', 'https://maps.google.com/?q=... या https://maps.app.goo.gl/...')}
                    className="flex-1 text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const lat = pos.coords.latitude.toFixed(6);
                            const lng = pos.coords.longitude.toFixed(6);
                            setLocMapsUrl(`https://maps.google.com/?q=${lat},${lng}`);
                          },
                          () => {
                            alert(tx('Could not detect the location. Please paste a Google Maps link.', 'लोकेशन नहीं मिली। कृपया Google Maps का लिंक चिपकाएँ।'));
                          }
                        );
                      } else {
                        alert(tx('Location is not available on this device. Please paste a Google Maps link.', 'इस डिवाइस पर लोकेशन उपलब्ध नहीं। कृपया Google Maps का लिंक चिपकाएँ।'));
                      }
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg shrink-0"
                  >
                    {tx('Auto-Detect', 'अभी की लोकेशन लें')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{tx('Default Location Precision', 'लोकेशन की सामान्य सटीकता')}</label>
                <select
                  value={locPrecision}
                  onChange={(e: any) => setLocPrecision(e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white"
                >
                  <option value="EXACT_PIN">{tx('Exact Property Pin', 'प्रॉपर्टी का सटीक पिन')}</option>
                  <option value="GENERAL_AREA">{tx('General Area (1 km radius)', 'सामान्य इलाका (1 किमी)')}</option>
                  <option value="APPROXIMATE_LOCALITY">{tx('Approximate Locality Only', 'सिर्फ़ मोटा इलाका')}</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingLocation}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{isSavingLocation ? tx('Saving...', 'सेव हो रहा है...') : tx('Save location', 'लोकेशन सेव करें')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: counter with "apna-apna side" (v41) */}
      {ownCounter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
          <div data-testid="own-counter-modal" className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">{tx('Counter: apna-apna side', 'काउंटर: अपना-अपना साइड')}</h3>
            <p className="text-xs text-slate-600">{tx('No split: you take brokerage from your own client, he from his. Which side are you on?', 'कोई बँटवारा नहीं: आप अपने क्लाइंट से लेंगे, वह अपने से। आप किस तरफ़ हैं?')}</p>
            <div className="flex gap-2">
              {([['SELLER', tx('Seller side', 'विक्रेता की तरफ़')], ['BUYER', tx('Buyer side', 'खरीदार की तरफ़')]] as const).map(([k, label]) => (
                <button key={k} type="button" data-testid={`own-counter-${k}`} onClick={() => setOwnCounter({ ...ownCounter, side: k })}
                  className={`flex-1 py-2 rounded-lg border text-xs font-bold ${ownCounter.side === k ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-700'}`}>{label}</button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOwnCounter(null)} className="px-3 py-2 text-xs font-semibold text-slate-600">{tx('Cancel', 'रद्द')}</button>
              <button data-testid="own-counter-send" onClick={sendOwnSideCounter} disabled={isSubmittingCounter} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50">{tx('Send counter', 'काउंटर भेजें')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Counter Split Proposal */}
      {counterModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{tx('Send Counter-Split Offer', 'काउंटर-स्प्लिट ऑफ़र भेजें')}</h3>
              <button onClick={() => setCounterModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendCounterOffer} className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-2.5 text-xs">
                <span className="text-slate-500">{tx('Property', 'प्रॉपर्टी')}: </span>
                <span className="font-bold text-slate-900">{counterModal.offer.propertyId}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Introducer Share (%):', 'इंट्रोड्यूसर का हिस्सा (%):')}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={counterModal.introShare}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCounterModal({
                        ...counterModal,
                        introShare: val,
                        closeShare: 100 - val,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Closing Broker Share (%):', 'क्लोज़िंग ब्रोकर का हिस्सा (%):')}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={counterModal.closeShare}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCounterModal({
                        ...counterModal,
                        closeShare: val,
                        introShare: 100 - val,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Counter Notes &amp; Terms:', 'काउंटर नोट और शर्तें:')}</label>
                <textarea
                  rows={3}
                  required
                  value={counterModal.notes}
                  onChange={(e) =>
                    setCounterModal({
                      ...counterModal,
                      notes: e.target.value,
                    })
                  }
                  placeholder={tx('e.g. Proposing revised split due to title verification and client coordination already completed.', 'जैसे टाइटल जाँच और ग्राहक से तालमेल पहले ही हो चुका है, इसलिए नया स्प्लिट प्रस्तावित है।')}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCounterModal(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCounter}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:bg-slate-300"
                >
                  {isSubmittingCounter ? tx('Sending...', 'भेज रहे हैं...') : tx('Send counter offer', 'काउंटर ऑफ़र भेजें')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Digital Site Visit QR Pass Modal */}
      {selectedVisitForQrPass && (
        <SiteVisitQrPassModal
          isOpen={Boolean(selectedVisitForQrPass)}
          visit={selectedVisitForQrPass}
          property={activeProperty}
          dealId={activeDeal?.id}
          currentUser={currentUser}
          onClose={() => setSelectedVisitForQrPass(null)}
          onSuccess={() => {
            if (selectedDealId) loadDetail(selectedDealId);
            onRefreshDeals();
          }}
        />
      )}
    </div>
  );
};
