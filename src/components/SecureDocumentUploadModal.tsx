import React, { useState, useRef } from 'react';
import { DueDiligenceChecklistItem, UserProfile } from '../types/index.js';
import { api } from '../lib/api.js';
import { reraAuthorityOf } from '../shared/india.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { preparePaper } from '../lib/paperFile.js';
import { ScanToPdf } from './ScanToPdf.js';
import { PROP_DOC_MAX_BYTES } from '../shared/propDocs.js';

/** DD preset / category id → Property Papers library type */
const LIB_TYPE: Record<string, string> = {
  TITLE_DEED: 'SALE_DEED', RERA_CERT: 'RERA_CERT', RERA_REGISTRATION_CERTIFICATE: 'RERA_CERT', KHASRA_B1: 'KHASRA_B1', KHASRA_B1_NAKAL: 'KHASRA_B1',
  NON_ENCUMBRANCE: 'ENCUMBRANCE', ENCUMBRANCE_CERTIFICATE: 'ENCUMBRANCE', TNCP_SANCTION: 'SANCTION_OC_CC', TNCP_LAYOUT_SANCTION: 'SANCTION_OC_CC',
  REVENUE_DIVERSION_ORDER: 'SANCTION_OC_CC', MUNICIPAL_TAX: 'TAX_RECEIPT', MUNICIPAL_TAX_RECEIPT: 'TAX_RECEIPT',
};
import {
  ShieldCheck,
  Lock,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Share2,
  Users,
  Eye,
  FileBadge,
  HardDrive,
  Copy,
  Check,
} from 'lucide-react';

interface SecureDocumentUploadModalProps {
  item: DueDiligenceChecklistItem;
  propertyTitle?: string;
  propertyState?: string;
  currentUser: UserProfile;
  allBrokers?: UserProfile[];
  onClose: () => void;
  onSuccess: () => void;
}

export const SecureDocumentUploadModal: React.FC<SecureDocumentUploadModalProps> = ({
  item,
  propertyTitle,
  propertyState,
  currentUser,
  allBrokers = [],
  onClose,
  onSuccess,
}) => {
  const tx = useTx();
  const { lang } = useI18n();
  // Preset templates for quick filling based on item
  const [docCategory, setDocCategory] = useState<string>(() => {
    const titleLower = item.title.toLowerCase();
    if (titleLower.includes('rera')) return 'RERA_REGISTRATION_CERTIFICATE';
    if (titleLower.includes('sale deed') || titleLower.includes('title')) return 'TITLE_DEED';
    if (titleLower.includes('khasra') || titleLower.includes('b-1')) return 'KHASRA_B1_NAKAL';
    if (titleLower.includes('encumbrance') || titleLower.includes('form 15')) return 'ENCUMBRANCE_CERTIFICATE';
    if (titleLower.includes('tax') || titleLower.includes('receipt')) return 'MUNICIPAL_TAX_RECEIPT';
    if (titleLower.includes('diversion') || titleLower.includes('order')) return 'REVENUE_DIVERSION_ORDER';
    if (titleLower.includes('layout') || titleLower.includes('sanction')) return 'TNCP_LAYOUT_SANCTION';
    return 'PROPERTY_PAPERWORK';
  });

  const [fileName, setFileName] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string>('');
  const [contentSha256, setContentSha256] = useState<string>('');

  const [documentNumber, setDocumentNumber] = useState<string>('');
  const [issuer, setIssuer] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [accessScope, setAccessScope] = useState<'ALL_VERIFIED_BROKERS' | 'DEAL_PARTICIPANTS_ONLY' | 'OWNER_AND_ADMIN_ONLY' | 'CUSTOM_BROKERS'>('OWNER_AND_ADMIN_ONLY');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attest, setAttest] = useState(false);
  const [isConfidential, setIsConfidential] = useState<boolean>(false);
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [fileType, setFileType] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [scan, setScan] = useState(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suggested preset configurations (issuer names are generic / state-aware; no document numbers are invented)
  const reraAuthority = reraAuthorityOf(propertyState);
  const presets = [
    { id: 'TITLE_DEED', label: tx('Registered Title Deed (Sale Deed)', 'रजिस्टर्ड टाइटल डीड (सेल डीड)'), defaultIssuer: tx('Sub-Registrar Office', 'उप-पंजीयक कार्यालय') },
    { id: 'RERA_CERT', label: tx('RERA Registration Certificate', 'RERA पंजीयन प्रमाणपत्र'), defaultIssuer: reraAuthority },
    { id: 'KHASRA_B1', label: tx('Land Record (Khasra / Khatauni / 7-12 / Patta)', 'भूमि रिकॉर्ड (खसरा / खतौनी / 7-12 / पट्टा)'), defaultIssuer: tx('State Land Revenue / Tehsil Office', 'राज्य भू-राजस्व / तहसील कार्यालय') },
    { id: 'NON_ENCUMBRANCE', label: tx('Encumbrance Certificate (30 Yrs)', 'भार-मुक्त प्रमाणपत्र (30 वर्ष)'), defaultIssuer: tx('Sub-Registrar Office', 'उप-पंजीयक कार्यालय') },
    { id: 'TNCP_SANCTION', label: tx('Town & Country Planning / Development Authority Sanction', 'नगर तथा ग्राम निवेश / विकास प्राधिकरण की मंज़ूरी'), defaultIssuer: tx('Town & Country Planning / Development Authority', 'नगर तथा ग्राम निवेश / विकास प्राधिकरण') },
    { id: 'MUNICIPAL_TAX', label: tx('Municipal Property Tax Receipt', 'नगर निगम संपत्ति कर रसीद'), defaultIssuer: tx('Municipal Corporation / Nagar Nigam', 'नगर निगम') },
  ];

  const handleApplyPreset = (preset: typeof presets[0]) => {
    setDocCategory(preset.id);
    setIssuer(preset.defaultIssuer);
  };

  // Fingerprint the chosen file in the browser (SHA-256 of the real bytes). The file itself is not uploaded.
  const pickFile = async (file: File) => {
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setFileType(file.type || '');
    setContentSha256('');
    try {
      if (file.size <= 25 * 1024 * 1024 && globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        setContentSha256(Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join(''));
      }
    } catch {
      /* fingerprint is optional */
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) void pickFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) void pickFile(e.dataTransfer.files[0]);
  };

  const toggleBroker = (brokerId: string) => {
    if (selectedBrokerIds.includes(brokerId)) {
      setSelectedBrokerIds(selectedBrokerIds.filter((id) => id !== brokerId));
    } else {
      setSelectedBrokerIds([...selectedBrokerIds, brokerId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      setError(tx('Please choose a file or type the document name.', 'कृपया फ़ाइल चुनें या दस्तावेज़ का नाम लिखें।'));
      return;
    }
    if (fileUrl.trim() && !/^https:\/\//i.test(fileUrl.trim())) {
      setError(tx('The document link must start with https://', 'दस्तावेज़ का लिंक https:// से शुरू होना चाहिए'));
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      // 1) the real file goes to the Property Papers library (server disk); 2) the checklist item links to that stored copy
      let libraryDocId: string | undefined;
      if (selectedFile) {
        if (!attest) { setError(tx('Please tick the confirmation box.', 'कृपया पुष्टि वाला बॉक्स टिक करें।')); setIsUploading(false); return; }
        const p = await preparePaper(selectedFile, lang === 'hi' ? 'hi' : 'en');
        const up = await api.propDocUpload({
          propertyId: item.propertyId, ddItemId: item.id, type: LIB_TYPE[docCategory] || 'OTHER',
          title: (item.title || fileName).slice(0, 120), refNo: documentNumber || undefined,
          fileName: p.fileName, data: p.data, attest: true,
          visibility: accessScope === 'DEAL_PARTICIPANTS_ONLY' ? 'DEAL_PARTICIPANTS' : accessScope === 'ALL_VERIFIED_BROKERS' && !isConfidential ? 'VERIFIED_BROKERS' : 'PRIVATE',
        });
        libraryDocId = up.doc.id;
      }
      await api.uploadDueDiligenceEvidence(item.id, {
        fileName: fileName.trim(),
        fileUrl: selectedFile ? undefined : fileUrl.trim() || undefined,
        documentType: docCategory,
        documentNumber: documentNumber || undefined,
        issuer: issuer || undefined,
        issueDate: issueDate || undefined,
        fileSizeBytes: fileSize || undefined,
        mimeType: fileType || undefined,
        contentSha256: contentSha256 || undefined,
        isConfidential,
        accessScope,
        sharedBrokerIds: accessScope === 'CUSTOM_BROKERS' ? selectedBrokerIds : undefined,
        notes: notes || undefined,
        libraryDocId,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || tx('Failed to record the document', 'दस्तावेज़ दर्ज नहीं हो सका'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
        {/* Sticky Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/90">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{tx('Property Paperwork Record', 'प्रॉपर्टी दस्तावेज़ रिकॉर्ड')}</h3>
                {contentSha256 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <Lock className="h-3 w-3" />
                    {tx('SHA-256 fingerprint', 'SHA-256 फ़िंगरप्रिंट')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {tx('Item', 'मद')}: <strong className="text-slate-800">{item.title}</strong>
                {propertyTitle && ` · ${propertyTitle}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={tx('Close', 'बंद करें')}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Quick Template Presets */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                {tx('Quick Document Category Presets:', 'दस्तावेज़ की श्रेणी चुनें:')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {presets.map((p) => {
                  const isSelected = docCategory === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <FileBadge className={`h-3.5 w-3.5 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`} />
                        <span className="truncate">{p.label.split('(')[0]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {tx('Paperwork file (PDF, JPG, PNG, WebP — up to 10 MB):', 'दस्तावेज़ की फ़ाइल (PDF, JPG, PNG, WebP — 10 MB तक):')}
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-600 mb-2">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-900">
                  {tx('Click to select or drag & drop the property document', 'क्लिक करके चुनें या दस्तावेज़ यहाँ खींचकर छोड़ें')}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {tx('The file is saved securely on the GENZ server and also kept in your Property Papers. Only the people you choose below (plus the owner, listing broker and GENZ admins) can open it. No file? Type the name and add a link instead.', 'फ़ाइल GENZ सर्वर पर सुरक्षित सेव होती है और आपके प्रॉपर्टी पेपर्स में भी रहती है। नीचे आप जिन्हें चुनेंगे (और मालिक, लिस्टिंग ब्रोकर व GENZ एडमिन) वही खोल सकेंगे। फ़ाइल नहीं है? नाम लिखें और लिंक जोड़ें।')}
                </p>

                {fileName && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5 shadow-2xs">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-mono font-medium text-slate-900 truncate max-w-xs">{fileName}</span>
                    {fileSize > 0 && (
                      <span className="text-[11px] text-slate-500 font-sans">
                        ({(fileSize / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setScan(true)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800" data-testid="dd-scan">
                <FileText className="h-4 w-4" />{tx('No PDF? Make one from photos of the pages', 'PDF नहीं है? पेज की फ़ोटो से बनाइए')}
              </button>
              {scan && <ScanToPdf title={item.title} maxBytes={PROP_DOC_MAX_BYTES} onClose={() => setScan(false)} onDone={f => { setScan(false); void pickFile(f); }} />}
            </div>

            {/* Document Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Document File Name:', 'दस्तावेज़ की फ़ाइल का नाम:')}</label>
                <input
                  type="text"
                  required
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 font-mono"
                  placeholder={tx('e.g. Sale_Deed_Plot_18.pdf', 'जैसे: Sale_Deed_Plot_18.pdf')}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Registration / Deed / Certificate No.:', 'पंजीयन / डीड / प्रमाणपत्र नंबर:')}</label>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 font-mono"
                  placeholder={tx('e.g. your RERA number or Deed # 4921/2014', 'जैसे: आपका RERA नंबर या डीड # 4921/2014')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Issuing Authority / Revenue Office:', 'जारी करने वाला प्राधिकरण / राजस्व कार्यालय:')}</label>
                <input
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                  placeholder={tx('e.g. Sub-Registrar Office, State RERA, Land Records Portal', 'जैसे: उप-पंजीयक कार्यालय, राज्य RERA, भूमि रिकॉर्ड पोर्टल')}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Official Issue / Registration Date:', 'जारी / पंजीयन की आधिकारिक तारीख़:')}</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Document share link (optional, https)', 'दस्तावेज़ का शेयर लिंक (वैकल्पिक, https)')}</label>
              <input
                type="url"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 font-mono"
                placeholder={tx('e.g. Google Drive / DigiLocker share link', 'जैसे: Google Drive / DigiLocker का शेयर लिंक')}
              />
            </div>

            {/* Sharing & Access Control Section */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Share2 className="h-4 w-4 text-indigo-600" />
                  <span>{tx('Paperwork Sharing & Broker Permissions', 'दस्तावेज़ साझा करना और ब्रोकर अनुमतियाँ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isConfidential}
                      onChange={(e) => setIsConfidential(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span className="font-semibold text-purple-900">{tx('Mark Confidential', 'गोपनीय चिह्नित करें')}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {tx('Access Scope on the Network:', 'नेटवर्क पर पहुँच का दायरा:')}
                </label>
                <select
                  value={accessScope}
                  onChange={(e) => setAccessScope(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 bg-white"
                >
                  <option value="ALL_VERIFIED_BROKERS">
                    {tx('All Verified Brokers (visible in the Due Diligence list for deal discovery)', 'सभी सत्यापित ब्रोकर (डील खोजने के लिए ड्यू डिलिजेंस सूची में दिखेगा)')}
                  </option>
                  <option value="DEAL_PARTICIPANTS_ONLY">
                    {tx('Active Deal Room Participants Only (introducing & closing brokers)', 'केवल सक्रिय डील रूम के भागीदार (परिचय कराने वाले और क्लोज़िंग ब्रोकर)')}
                  </option>
                  <option value="CUSTOM_BROKERS">
                    {tx('Custom Authorized Brokers (pick specific verified partners below)', 'चुने हुए ब्रोकर (नीचे से ख़ास सत्यापित पार्टनर चुनें)')}
                  </option>
                  <option value="OWNER_AND_ADMIN_ONLY">
                    {tx('Restricted: Property Owner & Platform Admins Only', 'सीमित: केवल प्रॉपर्टी मालिक और प्लेटफ़ॉर्म एडमिन')}
                  </option>
                </select>
              </div>

              {accessScope === 'CUSTOM_BROKERS' && allBrokers.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">
                    {tx('Select the brokers who may view this document:', 'जिन ब्रोकर को यह दस्तावेज़ देखने देना है उन्हें चुनें:')}
                  </label>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 divide-y divide-slate-100">
                    {allBrokers.map((broker) => {
                      const isSelected = selectedBrokerIds.includes(broker.id);
                      return (
                        <div
                          key={broker.id}
                          onClick={() => toggleBroker(broker.id)}
                          className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-50 cursor-pointer rounded text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-900">{broker.name}</span>
                            <span className="text-slate-500 text-[11px] ml-1.5">
                              ({broker.companyName || broker.city})
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="rounded border-slate-300 text-slate-900 pointer-events-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Broker Attestation Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Broker Attestation & Audit Notes:', 'ब्रोकर का सत्यापन और ऑडिट नोट्स:')}</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tx('e.g. Original deed seen and matched with the Sub-Registrar index; RERA QR code checked.', 'जैसे: असली डीड देखी और उप-पंजीयक सूचकांक से मिलाई; RERA QR कोड जाँचा।')}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
          </div>

          {selectedFile && (
            <label className="mx-5 mb-3 flex shrink-0 items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>{tx('I am the owner of this property, or the owner has allowed me to keep this paper here. It has no Aadhaar / PAN number visible.', 'मैं इस प्रॉपर्टी का मालिक हूँ, या मालिक ने मुझे यह कागज़ यहाँ रखने की अनुमति दी है। इसमें आधार / PAN नंबर दिखाई नहीं दे रहे।')}</span>
            </label>
          )}

          {/* Sticky Action Footer */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/90">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <HardDrive className="h-3.5 w-3.5 text-slate-400" />
              <span>{contentSha256 ? tx('The file’s SHA-256 fingerprint will be recorded', 'फ़ाइल का SHA-256 फ़िंगरप्रिंट दर्ज होगा') : tx('No file chosen — only the details will be recorded', 'फ़ाइल नहीं चुनी — सिर्फ़ ब्योरा दर्ज होगा')}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {tx('Cancel', 'रद्द करें')}
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{isUploading ? tx('Saving...', 'दर्ज हो रहा है...') : tx('Record Paperwork', 'दस्तावेज़ दर्ज करें')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
