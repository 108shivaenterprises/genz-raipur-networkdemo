import React, { useState } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, X, ArrowRight, Clipboard, User, Phone, IndianRupee, Building, Mail, MapPin } from 'lucide-react';
import { parseRawLeadText, type ParsedLeadData } from '../shared/vastuAiParser.js';
import { api } from '../lib/api.js';
import { useUI } from '../lib/ui.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

interface SmartLeadParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadCreated: () => void;
  projects?: { id: string; projectName: string; locality?: string }[];
}

export function SmartLeadParserModal({
  isOpen,
  onClose,
  onLeadCreated,
  projects = [],
}: SmartLeadParserModalProps) {
  const t = useTx();
  const { toast } = useUI();
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedLeadData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setRawText(text);
    if (text.trim().length > 10) {
      const result = parseRawLeadText(text);
      setParsed(result);
    } else {
      setParsed(null);
    }
  };

  const handlePasteSample = () => {
    const sample = `Hi Rajesh Sharma here, looking for a 3 BHK in Shankar Nagar or Telibandha, Raipur. Budget is 80 lakh to 1.2 Cr. Need ready possession. Contact 9000000000. Ready to visit site this Sunday.`;
    handleTextChange(sample);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || !parsed.phone) {
      toast(t('Valid 10-digit mobile number is required', 'मान्य 10 अंकों का मोबाइल नंबर आवश्यक है'), 'warning');
      return;
    }
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }

    setLoading(true);
    try {
      await api.crmCreateLead({
        projectId: selectedProjectId || projects[0]?.id,
        name: parsed.name,
        phone: parsed.phone,
        email: parsed.email,
        unitInterest: parsed.unitInterest,
        budgetMax: parsed.budgetMax,
        note: parsed.note,
        source: 'WHATSAPP_INBOUND',
        sourceDetail: 'Vastu AI Ingested',
        consent: true,
      });

      toast(t('Lead successfully parsed and registered!', 'लीड सफलतापूर्वक पंजीकृत हो गई!'), 'success');
      onLeadCreated();
      onClose();
    } catch (err: any) {
      toast(err.message || t('Failed to register lead', 'लीड दर्ज करने में विफल'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {t('Vastu AI Smart Lead Ingestion', 'वास्तु AI स्मार्ट लीड पार्सर')}
              <span className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
                Auto-Extract
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('Paste raw WhatsApp chats, SMS, or portal alerts to auto-fill leads.', 'व्हाट्सएप चैट या पोर्टल इंक्वायरी पेस्ट करें और सीधे लीड बनाएं।')}
            </p>
          </div>
        </div>

        {/* Input Text Area */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('Paste Raw Message / Chat Text', 'कच्चा संदेश या चैट पेस्ट करें')}
            </label>
            <button
              type="button"
              onClick={handlePasteSample}
              className="text-[11px] text-purple-600 hover:text-purple-700 dark:text-purple-400 font-medium underline"
            >
              {t('Load Sample WhatsApp Lead', 'नमूना लीड लोड करें')}
            </button>
          </div>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={t(
              'e.g. "Hi Rajesh here, looking for 3BHK in Shankar Nagar, budget 80 lakh to 1.2 Cr, contact 9000000000 ready for visit Sunday"',
              'उदा. "राजेश शर्मा 3 BHK शंकर नगर में ढूंढ रहे हैं, बजट 80 लाख से 1.2 करोड़, फोन 9000000000"'
            )}
            className="w-full text-xs p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
          />
        </div>

        {/* Parsed Output Card */}
        {parsed && (
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl p-4">
              <div className="text-xs font-bold text-purple-900 dark:text-purple-200 mb-2 flex items-center justify-between">
                <span>{t('Extracted Lead Parameters', 'निकाले गए लीड विवरण')}</span>
                <span className="text-[10px] text-purple-700 dark:text-purple-300 font-medium">
                  {parsed.rawConfidence.hasPhone ? '✓ Mobile Verified' : '⚠ Missing Mobile'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">{t('Client Name', 'ग्राहक का नाम')}</label>
                  <input
                    type="text"
                    value={parsed.name}
                    onChange={(e) => setParsed({ ...parsed, name: e.target.value })}
                    className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 font-medium"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">{t('Mobile Number', 'मोबाइल नंबर')}</label>
                  <input
                    type="text"
                    value={parsed.phone}
                    onChange={(e) => setParsed({ ...parsed, phone: e.target.value.replace(/\D/g, '').slice(-10) })}
                    className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 font-mono font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">{t('Unit Interest / BHK', 'पसंद (BHK / विला)')}</label>
                  <input
                    type="text"
                    value={parsed.unitInterest || ''}
                    onChange={(e) => setParsed({ ...parsed, unitInterest: e.target.value })}
                    className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                    placeholder="e.g. 3 BHK"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">{t('Max Budget ₹', 'अधिकतम बजट ₹')}</label>
                  <input
                    type="number"
                    value={parsed.budgetMax || ''}
                    onChange={(e) => setParsed({ ...parsed, budgetMax: Number(e.target.value) || undefined })}
                    className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                    placeholder="e.g. 35000000"
                  />
                  {parsed.budgetMax && (
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                      {formatINR(parsed.budgetMax)}
                    </span>
                  )}
                </div>
              </div>

              {projects.length > 0 && (
                <div className="mt-3 pt-2 border-t border-purple-200 dark:border-purple-800/40">
                  <label className="text-[10px] text-slate-500 font-semibold block mb-1">
                    {t('Assign to Project / Mandate', 'प्रोजेक्ट चुनें')}
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectName} {p.locality ? `(${p.locality})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !parsed.phone}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? t('Creating Lead...', 'लीड बनाई जा रही है...') : t('1-Click Confirm & Register Lead', '1-क्लिक में लीड दर्ज करें')}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

