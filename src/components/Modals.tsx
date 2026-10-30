import React, { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api.js';
import { BondBlockedNotice } from './BuyerBond.js';
import { VisitAckPanel } from './VisitAckPanel.js';
import { ScanPointSelect, ScanLineNote } from './ScanPoint.js';
import { SiteVisit, UserProfile } from '../types/index.js';
import { PROPERTY_TYPES, INDIA_STATES, citiesOf, localitiesOf, findState, stateOfCity } from '../shared/india.js';
import { areasOf, canonPlace } from '../shared/places.js';
import { LocationFields, LocationValue } from './LocationFields.js';
import { shrinkImage, readAsDataUrl } from '../lib/imgShrink.js';
import { formatINR } from '../lib/utils.js';
import { TagPicker } from './TagPicker.js';
import { BoardPicker, Face } from './LeadBoard.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import {
  X,
  ShieldCheck,
  Lock,
  Building,
  UserCheck,
  HardHat,
  AlertTriangle,
  KeyRound,
  Image as ImageIcon,
  Video as VideoIcon,
  Upload,
  Trash2,
  Film,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Calendar,
  Clock,
  Phone,
  User,
  QrCode,
  Share2,
} from 'lucide-react';

// ==========================================
// 1. ADD PROPERTY MODAL
// ==========================================

export const AddPropertyModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: UserProfile | null;
  /** verified brokers on the network (an owner may appoint one as listing broker while listing) */
  brokers?: UserProfile[];
}> = ({ isOpen, onClose, onSuccess, currentUser, brokers = [] }) => {
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const tx = (en: string, h: string) => (hi ? h : en);
  const label = useLabel();
  const isOwnerUser = currentUser?.role === 'PROPERTY_OWNER';
  // v28 — GENZ staff list on behalf of a broker (the server refuses a staff listing without a named broker / owner)
  const isStaffUser = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyType, setPropertyType] = useState<string>('Residential Flat');
  const [transactionType, setTransactionType] = useState('Sale');
  const [loc, setLoc] = useState<LocationValue>({ state: findState(currentUser?.state)?.name || stateOfCity(currentUser?.city) || '', city: currentUser?.city || '', locality: '', pincode: '' });
  const [tags, setTags] = useState<string[]>([]);
  const [listingBrokerId, setListingBrokerId] = useState('');
  // v74 — an owner lists either on GENZ's paid plan (live for all brokers) or FREE with one broker of his city's Leadership Board
  const [route, setRoute] = useState<'PAID' | 'FREE'>('PAID'); const [freeBroker, setFreeBroker] = useState<{ id: string; firstName: string; photoUrl: string } | null>(null);
  useEffect(() => { setFreeBroker(null); }, [loc.city]);
  const [village, setVillage] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  
  // Photo Media State (URL + Gallery upload)
  const [photoSourceMode, setPhotoSourceMode] = useState<'GALLERY' | 'URL'>('GALLERY');
  const [imageUrl, setImageUrl] = useState('');
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; url: string; size?: number }>>([]);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  // Video Media State (Gallery upload + URL)
  const [videoSourceMode, setVideoSourceMode] = useState<'GALLERY' | 'URL'>('GALLERY');
  const [mediaBusy, setMediaBusy] = useState(false); const [mediaErr, setMediaErr] = useState(''); const [quote, setQuote] = useState<any>(null);
  useEffect(() => { if (!isOpen || !isOwnerUser) return; let live = true; api.olQuote(transactionType, propertyType).then(q => { if (live) setQuote(q.plan || { none: true }); }).catch(() => { if (live) setQuote(null); }); return () => { live = false; }; }, [isOpen, isOwnerUser, transactionType, propertyType]);
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadedVideo, setUploadedVideo] = useState<{ name: string; url: string; size?: number } | null>(null);
  const [isVideoDragging, setIsVideoDragging] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const [addressHidden, setAddressHidden] = useState('');
  const [askingPrice, setAskingPrice] = useState<number | ''>('');
  const [ownerApprovedNetPrice, setOwnerApprovedNetPrice] = useState<number | ''>('');
  const [builtUpAreaSqFt, setBuiltUpAreaSqFt] = useState<number | ''>('');
  const [ownerName, setOwnerName] = useState(isOwnerUser ? currentUser?.name || '' : '');
  const [ownerPhone, setOwnerPhone] = useState(isOwnerUser ? currentUser?.phone || '' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle Photo File Upload from Device / Gallery
  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMediaBusy(true); setMediaErr('');
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { setMediaErr(hi ? 'सिर्फ़ फ़ोटो चुनें (JPG / PNG / WebP)।' : 'Choose photos only (JPG / PNG / WebP).'); continue; }
      try {
        const small = await shrinkImage(file, 1280, 400 * 1024);
        const r = await api.omPhoto(small);
        setGalleryImages((prev) => [...prev, { id: `IMG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, url: r.url, size: file.size }]);
      } catch (e: any) { setMediaErr(e?.message === 'bad image' ? (hi ? 'यह फ़ोटो पढ़ी नहीं जा सकी।' : 'This photo could not be read.') : (e?.message || (hi ? 'फ़ोटो अपलोड नहीं हुई।' : 'The photo did not upload.'))); }
    }
    setMediaBusy(false);
  };

  // Handle Video File Upload from Device / Gallery
  const handleVideoFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) { setMediaErr(hi ? 'सही वीडियो फ़ाइल चुनें (MP4, WebM, MOV)।' : 'Please select a valid video file (MP4, WebM, MOV).'); return; }
    if (file.size > 3 * 1024 * 1024) { setMediaErr(hi ? 'वीडियो 3 MB से बड़ा है — छोटी क्लिप (लगभग 15–20 सेकंड) बनाएँ, या YouTube / Drive का लिंक डालें।' : 'This video is over 3 MB — record a shorter clip (about 15–20 s) or paste a YouTube / Drive link.'); return; }
    setMediaBusy(true); setMediaErr('');
    try { const r = await api.omVideo(await readAsDataUrl(file)); setUploadedVideo({ name: file.name, url: r.url, size: file.size }); }
    catch (e: any) { setMediaErr(e?.message || (hi ? 'वीडियो अपलोड नहीं हुआ।' : 'The video did not upload.')); }
    finally { setMediaBusy(false); }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOwnerUser && route === 'FREE' && !freeBroker) { setError(hi ? 'मुफ़्त रूट के लिए अपने शहर के बोर्ड से एक ब्रोकर चुनें — या GENZ प्लान वाला रूट चुनें।' : 'For the free route, choose one broker from your city’s board — or switch to the GENZ plan.'); return; }
    setLoading(true);
    setError('');
    // v28 — owner approval: the normal form also ends at the owner's WhatsApp approval (or, when GENZ requires consent first, becomes a draft)
    const openDraft = (id: string) => { try { window.location.href = `/?tab=properties&drafts=1&draft=${encodeURIComponent(id)}`; } catch { /* */ } };
    let sent: any = null;
    try {
      const created: any = await api.createProperty(sent = {
        title,
        description,
        propertyType,
        transactionType,
        state: loc.state,
        city: loc.city,
        locality: loc.locality,
        district: loc.district || undefined,
        tags,
        listingBrokerId: isStaffUser && listingBrokerId ? listingBrokerId : isOwnerUser && route === 'FREE' && freeBroker ? freeBroker.id : undefined,
        village: village || undefined,
        street: street || undefined,
        pincode: loc.pincode || undefined,
        landmark: landmark || undefined,
        googleMapsUrl: googleMapsUrl || undefined,
        videoUrl: (videoSourceMode === 'GALLERY' && uploadedVideo?.url) ? uploadedVideo.url : (videoUrl || undefined),
        images: (() => {
          const imgs: string[] = [];
          if (galleryImages.length > 0) {
            galleryImages.forEach((img) => imgs.push(img.url));
          }
          if (imageUrl && !imgs.includes(imageUrl)) {
            imgs.push(imageUrl);
          }
          return imgs.length > 0 ? imgs : undefined;
        })(),
        addressHidden,
        askingPrice: Number(askingPrice),
        ownerApprovedNetPrice: Number(ownerApprovedNetPrice),
        builtUpAreaSqFt: builtUpAreaSqFt === '' ? undefined : Number(builtUpAreaSqFt),
        ownerName,
        ownerPhone,
      });
      const rn = created?.resaleNotice;
      const approval = created?.ownerApproval?.draftId as string | undefined;
      alert((isOwnerUser && created?.property?.ownerListing?.feeStatus === 'WAIVED_BROKER' ? (hi ? 'लिस्टिंग सेव हुई। अब "मेरी प्रॉपर्टी" में आपका ब्रोकर अपनी ब्रोकरेज बताएगा; आप दोनों के मानने पर आप मंडेट साइन करेंगे और लिस्टिंग लाइव होगी।' : 'Listing saved. In “My Property” your broker will tell his brokerage; when you both agree you sign the mandate and the listing goes live.') : isOwnerUser && created?.property?.ownerListing?.feeStatus === 'PENDING' ? (hi ? 'लिस्टिंग सेव हुई। अब "मेरी प्रॉपर्टी" में लिस्टिंग फ़ीस UPI से दें और UTR लिखें — GENZ पक्का करेगा, फिर लिस्टिंग लाइव होगी।' : 'Listing saved. Now pay the listing fee by UPI in “My Property” and write the UTR — GENZ confirms it and the listing goes live.') : (hi ? 'प्रॉपर्टी सफलतापूर्वक दर्ज हुई।' : 'Property listed successfully.')) + (rn ? `\n\n${typeof rn === 'string' ? rn : (hi ? rn.hi : rn.en) || rn.message || ''}` : '')
        + (approval ? (hi ? '\n\nअब मालिक को WhatsApp पर अप्रूवल भेजें — मालिक की हाँ से बायपास सुरक्षा शुरू होती है।' : '\n\nNow send the owner the approval on WhatsApp — his yes starts your bypass protection.') : ''));
      onSuccess();
      onClose();
      if (approval) openDraft(approval);
    } catch (err: any) {
      if (err?.code === 'CONSENT_REQUIRED' && sent) {
        try {
          const r = await api.draftFromForm(sent);
          alert(hi ? 'GENZ पर लिस्टिंग मालिक की सहमति के बाद ही लाइव होती है। आपकी डिटेल ड्राफ़्ट में सेव हो गई — अब मालिक को WhatsApp पर अप्रूवल भेजें।' : 'On GENZ a listing goes live only after the owner agrees. Your details are saved as a draft — now send the owner the approval on WhatsApp.');
          onClose(); openDraft(r.draft.id); return;
        } catch (e2: any) { setError(e2.message); return; }
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
        {/* Sticky Modal Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <h3 className="text-base font-bold text-slate-900">{hi ? 'प्रॉपर्टी लिस्ट करें' : 'List Verified Property Inventory'}</h3>
            <p className="text-xs text-slate-500">{hi ? 'पूरे भारत में कहीं भी' : 'Anywhere in India'}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200 shrink-0">
            {error}
          </div>
        )}
        {isOwnerUser && route === 'PAID' && quote && (
          <div className={`mx-5 mt-4 rounded-lg p-2.5 text-xs border shrink-0 ${quote.none ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`} data-testid="form-plan-quote">
            {quote.none
              ? tx('GENZ has no plan for this kind of property yet — ask a GENZ broker to list it for you.', 'GENZ का इस तरह की प्रॉपर्टी के लिए अभी कोई प्लान नहीं — किसी GENZ ब्रोकर से लिस्ट करवाएँ।')
              : <>{tx('Your plan', 'आपका प्लान')}: <b>{quote.name}</b> · <b>{quote.fee > 0 ? `₹${Number(quote.fee).toLocaleString('en-IN')}` : tx('free', 'मुफ़्त')}</b> · {quote.durationDays} {tx('days live', 'दिन लाइव')} · {quote.maxPhotos} {tx('photos max', 'फ़ोटो तक')}. {tx('You pay GENZ by UPI after you save this; brokers take their fee from the buyer only.', 'यह सेव करने के बाद GENZ को UPI से दें; ब्रोकर की फ़ीस सिर्फ़ ख़रीदार से।')}</>}
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'प्रॉपर्टी का शीर्षक' : 'Property Title'}:</label>
            <input
              type="text"
              required
              placeholder={hi ? 'जैसे 3 BHK फ़्लैट, पूर्वमुखी, पार्क के पास' : 'e.g. 3 BHK flat, east-facing, near the park'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{hi ? 'विवरण' : 'Description'}:</label>
            <textarea
              rows={2}
              required
              placeholder={hi ? 'बनावट, फ़िटिंग, हवा-रोशनी, पार्किंग आदि की खासियतें लिखें...' : 'Highlight architecture, fittings, ventilation, parking...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'प्रॉपर्टी का प्रकार' : 'Property Type'}:</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              >
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{label('propertyType', t)}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'लेन-देन' : 'Transaction'}:</label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              >
                <option value="Sale">{label('transactionType', 'Sale')}</option>
                <option value="Rent">{label('transactionType', 'Rent')}</option>
                <option value="Lease">{label('transactionType', 'Lease')}</option>
              </select>
            </div>

          </div>

          <LocationFields value={loc} onChange={setLoc} />

          {/* Village, Street, PIN, Landmark */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'गाँव / तहसील' : 'Village / Tehsil'}:</label>
              <input
                type="text"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder={hi ? 'वैकल्पिक (ग्रामीण / कस्बाई)' : 'Optional (rural/semi-urban)'}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'गली / सड़क' : 'Street / Road'}:</label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder={hi ? 'जैसे कैनाल रोड, सेक्टर 3' : 'e.g. Canal Road, Sector 3'}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'नज़दीकी पहचान (लैंडमार्क)' : 'Landmark'}:</label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={hi ? 'जैसे मंदिर के पास' : 'e.g. Near Ayyappa Temple'}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Google Maps URL & Autodetect */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">{hi ? 'गूगल मैप्स लिंक / निर्देशांक' : 'Google Maps URL / Coordinates'}:</label>
              <button
                type="button"
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const lat = pos.coords.latitude.toFixed(6);
                        const lng = pos.coords.longitude.toFixed(6);
                        setGoogleMapsUrl(`https://maps.google.com/?q=${lat},${lng}`);
                      },
                      () => {
                        alert(hi ? 'आपकी लोकेशन नहीं मिल सकी। गूगल मैप्स का लिंक चिपकाएँ।' : 'Could not read your location. Paste the Google Maps link instead.');
                      }
                    );
                  } else {
                    alert(hi ? 'इस डिवाइस पर लोकेशन उपलब्ध नहीं है। गूगल मैप्स का लिंक चिपकाएँ।' : 'Location is not available on this device. Paste the Google Maps link instead.');
                  }
                }}
                className="text-[10px] text-emerald-700 hover:underline font-semibold"
              >
                {hi ? 'मेरी मौजूदा लोकेशन लें (GPS)' : 'Auto-Detect Current GPS'}
              </button>
            </div>
            <input
              type="url"
              value={googleMapsUrl}
              onChange={(e) => setGoogleMapsUrl(e.target.value)}
              placeholder={hi ? 'https://maps.google.com/?q=... या https://maps.app.goo.gl/...' : 'https://maps.google.com/?q=... or https://maps.app.goo.gl/...'}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <TagPicker value={tags} onChange={setTags} />

          {isOwnerUser && (
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3" data-testid="form-route">
              <div className="text-xs font-bold text-slate-900">{tx('How do you want to list?', 'आप कैसे लिस्ट करना चाहते हैं?')}</div>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${route === 'PAID' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}><input type="radio" name="route" className="mt-0.5" checked={route === 'PAID'} onChange={() => setRoute('PAID')} data-testid="route-paid" /><span><b>{tx('GENZ plan — live for ALL brokers', 'GENZ प्लान — सभी ब्रोकरों के लिए लाइव')}</b><br /><span className="text-slate-600">{tx('You pay GENZ’s plan fee; any number of brokers show it. You owe them no brokerage — they earn from the buyer.', 'आप GENZ की प्लान फ़ीस देते हैं; कितने भी ब्रोकर दिखाएँ। आप ब्रोकरेज नहीं देते — वे ख़रीदार से कमाते हैं।')}</span></span></label>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${route === 'FREE' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}><input type="radio" name="route" className="mt-0.5" checked={route === 'FREE'} onChange={() => setRoute('FREE')} data-testid="route-free" /><span><b>{tx('Free — choose ONE broker from your city’s Top 10', 'मुफ़्त — अपने शहर के टॉप 10 से एक ब्रोकर चुनें')}</b><br /><span className="text-slate-600">{tx('No GENZ fee. You and the broker agree his brokerage and sign a mandate; it goes live with him after that.', 'GENZ की फ़ीस नहीं। आप और ब्रोकर उसकी ब्रोकरेज तय करके मंडेट साइन करते हैं; उसके बाद उसी के साथ लाइव।')}</span></span></label>
              {route === 'FREE' && (freeBroker
                ? <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2.5" data-testid="route-free-picked"><div className="flex items-center gap-2"><Face src={freeBroker.photoUrl} name={freeBroker.firstName} size={40} /><div className="text-xs"><div className="font-bold text-emerald-950">{freeBroker.firstName}</div><div className="text-emerald-800">{tx('your broker', 'आपका ब्रोकर')}</div></div></div><button type="button" className="text-xs font-semibold underline" onClick={() => setFreeBroker(null)}>{tx('Change', 'बदलें')}</button></div>
                : <BoardPicker city={loc.city} confirmLabel={['Choose', 'चुनें']} onPick={(id, firstName, photoUrl) => setFreeBroker({ id, firstName, photoUrl })} />)}
            </div>
          )}

          {isStaffUser && (
            <div>
              <label className="text-xs font-semibold text-slate-700">{isStaffUser ? (hi ? 'लिस्टिंग ब्रोकर (ज़रूरी — GENZ किसी ब्रोकर की ओर से लिस्ट करता है)' : 'Listing broker (required — GENZ lists on behalf of a broker)') : (hi ? 'लिस्टिंग ब्रोकर (वैकल्पिक — बाद में भी चुन सकते हैं)' : 'Listing broker (optional — can be appointed later)')}</label>
              <select value={listingBrokerId} required={isStaffUser} onChange={(e) => setListingBrokerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900">
                <option value="">{hi ? '— अभी नहीं —' : '— Not yet —'}</option>
                {brokers.filter((b) => b.verificationStatus === 'VERIFIED').map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.companyName ? ` — ${b.companyName}` : ''}{b.city ? ` (${b.city})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Media Section: Photos & Video with Gallery Upload & URL Support */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            {mediaBusy && <p className="text-[11px] font-semibold text-blue-700">{tx('Uploading…', 'अपलोड हो रहा है…')}</p>}
            {mediaErr && <p className="rounded-lg bg-red-50 p-2 text-[11px] text-red-700" role="alert">{mediaErr}</p>}
            {/* 1. Property Photos (Upload from Gallery / Camera / URL) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <ImageIcon className="h-4 w-4 text-emerald-600" />
                  <span>{hi ? 'प्रॉपर्टी की फ़ोटो' : 'Property Photos (Photos Gallery / Media)'}</span>
                  {galleryImages.length > 0 && (
                    <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.2">
                      {galleryImages.length} {hi ? 'जुड़ी' : 'attached'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPhotoSourceMode('GALLERY')}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${
                      photoSourceMode === 'GALLERY'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="h-3 w-3" />
                    <span>{hi ? 'गैलरी से अपलोड' : 'Upload from Gallery'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoSourceMode('URL')}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                      photoSourceMode === 'URL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tx('Image URL', 'इमेज URL')}
                  </button>
                </div>
              </div>

              {photoSourceMode === 'GALLERY' ? (
                <div className="space-y-2.5">
                  {/* Gallery File Drop / Selector */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsPhotoDragging(true);
                    }}
                    onDragLeave={() => setIsPhotoDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsPhotoDragging(false);
                      handlePhotoFiles(e.dataTransfer.files);
                    }}
                    onClick={() => photoFileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                      isPhotoDragging
                        ? 'border-emerald-500 bg-emerald-50/70'
                        : 'border-slate-300 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <input
                      type="file"
                      ref={photoFileInputRef}
                      onChange={(e) => handlePhotoFiles(e.target.files)}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 mb-1.5">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 text-center">
                      {hi ? 'फ़ोन/कंप्यूटर से फ़ोटो चुनने के लिए क्लिक करें या खींचकर छोड़ें' : 'Click to choose photos from device gallery or drag & drop'}
                    </p>
                    <p className="text-[11px] text-slate-500 text-center mt-0.5">
                      {hi ? 'JPG, PNG, WebP चलेंगी (बाहरी, अंदरूनी और नक्शे की कई फ़ोटो चुन सकते हैं)' : 'Supports JPG, PNG, WebP (select multiple images for elevation, interiors, floor plan)'}
                    </p>
                  </div>

                  {/* Gallery Thumbnails Grid */}
                  {galleryImages.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                      {galleryImages.map((img, idx) => (
                        <div
                          key={img.id}
                          className="group relative rounded-lg border border-slate-200 overflow-hidden bg-slate-900 shadow-2xs aspect-4/3"
                        >
                          <img
                            src={img.url}
                            alt={img.name}
                            className="h-full w-full object-cover group-hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-1.5 text-[10px] text-white flex items-center justify-between">
                            <span className="truncate max-w-[100px]">{img.name}</span>
                            {idx === 0 && (
                              <span className="bg-amber-400 text-slate-950 text-[9px] font-bold px-1 rounded">
                                Cover
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGalleryImages(galleryImages.filter((g) => g.id !== img.id));
                            }}
                            className="absolute top-1 right-1 rounded-md bg-slate-900/80 p-1 text-white hover:bg-red-600 transition-colors"
                            title={tx('Remove photo', 'फ़ोटो हटाएँ')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder={tx('https://... or hosted image link', 'https://… या इमेज का होस्टेड लिंक')}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 bg-white"
                  />
                  {imageUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      <img
                        src={imageUrl}
                        alt={tx('Preview', 'प्रीव्यू')}
                        className="h-14 w-20 object-cover rounded-md border border-slate-200"
                      />
                      <span className="text-xs text-slate-500 font-medium truncate">{imageUrl}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Video Walkthrough (Upload from Gallery / Device / Video URL) */}
            <div className="space-y-2 pt-3 border-t border-slate-200/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Film className="h-4 w-4 text-blue-600" />
                  <span>{hi ? 'वीडियो वॉकथ्रू / टूर' : 'Video Walkthrough / Tour'}</span>
                  {uploadedVideo && (
                    <span className="rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.2">
                      {hi ? 'वीडियो तैयार' : 'Video Ready'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setVideoSourceMode('GALLERY')}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${
                      videoSourceMode === 'GALLERY'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="h-3 w-3" />
                    <span>{hi ? 'गैलरी से वीडियो अपलोड' : 'Upload Video from Gallery'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoSourceMode('URL')}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                      videoSourceMode === 'URL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tx('Video URL', 'वीडियो URL')}
                  </button>
                </div>
              </div>

              {videoSourceMode === 'GALLERY' ? (
                <div className="space-y-2">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsVideoDragging(true);
                    }}
                    onDragLeave={() => setIsVideoDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsVideoDragging(false);
                      handleVideoFile(e.dataTransfer.files);
                    }}
                    onClick={() => videoFileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                      isVideoDragging
                        ? 'border-blue-500 bg-blue-50/70'
                        : 'border-slate-300 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <input
                      type="file"
                      ref={videoFileInputRef}
                      onChange={(e) => handleVideoFile(e.target.files)}
                      accept="video/mp4,video/webm,video/quicktime,video/mov"
                      className="hidden"
                    />
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 mb-1">
                      <VideoIcon className="h-4.5 w-4.5" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 text-center">
                      {hi ? 'गैलरी या फ़ोन से प्रॉपर्टी का वीडियो चुनें' : 'Select property walkthrough video from gallery or phone'}
                    </p>
                    <p className="text-[11px] text-slate-500 text-center">
                      {hi ? 'MP4, MOV, WebM वीडियो चलेंगे' : 'Supports MP4, MOV, WebM walkthrough clips'}
                    </p>
                  </div>

                  {uploadedVideo && (
                    <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-950">
                      <div className="flex items-center gap-2 truncate">
                        <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="font-semibold truncate">{uploadedVideo.name}</span>
                        {uploadedVideo.size && (
                          <span className="text-[11px] text-blue-700 font-mono">
                            ({(uploadedVideo.size / (1024 * 1024)).toFixed(1)} MB)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setUploadedVideo(null)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded"
                        title={tx('Remove video', 'वीडियो हटाएँ')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder={tx('YouTube, Vimeo, MP4, or Google Drive video tour link', 'YouTube, Vimeo, MP4 या Google Drive वीडियो टूर लिंक')}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {hi ? 'YouTube / Vimeo या क्लाउड स्टोरेज का सार्वजनिक वीडियो लिंक चिपकाएँ।' : 'Paste public YouTube / Vimeo link or cloud storage walkthrough.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'सार्वजनिक माँगी कीमत (₹)' : 'Public Asking Price (₹)'}:</label>
              <input
                type="number"
                required
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
              />
            </div>

            <div className="rounded-lg bg-purple-50 p-2 border border-purple-200">
              <label className="text-xs font-semibold text-purple-900 flex items-center gap-1">
                <Lock className="h-3 w-3" /> {isOwnerUser ? (hi ? 'सबसे कम कीमत जो आप लेंगे (गोपनीय ₹)' : 'Lowest price you will accept (private ₹)') : (hi ? 'मालिक की नेट कीमत (गोपनीय ₹)' : 'Owner Net Price (Confidential ₹)')}:
              </label>
              <input
                type="number"
                required
                value={ownerApprovedNetPrice}
                onChange={(e) => setOwnerApprovedNetPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-purple-300 p-1.5 text-xs font-bold text-purple-950 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{hi ? 'बिल्ट-अप क्षेत्रफल (वर्ग फ़ुट)' : 'Built-Up Space (sq.ft)'}:</label>
            <input
              type="number"
              value={builtUpAreaSqFt}
              onChange={(e) => setBuiltUpAreaSqFt(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              {hi ? 'गोपनीय पता (साइट विज़िट वेरिफ़ाई होने तक छुपा)' : 'Confidential Address (Hidden until site visit verification)'}:
            </label>
            <input
              type="text"
              required
              placeholder={hi ? 'जैसे प्लॉट 18, ब्लॉक B, ग्रीन पार्क कॉलोनी, नहर रोड के पास' : 'e.g. Plot 18, Block B, Green Park Colony, near the canal road'}
              value={addressHidden}
              onChange={(e) => setAddressHidden(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'मालिक का नाम' : 'Owner Name'}:</label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'मालिक का मोबाइल (+91)' : 'Owner Mobile (+91)'}:</label>
              <input
                type="text"
                required
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/90">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            🔒 {hi ? 'मालिक की WhatsApp अप्रूवल से बायपास सुरक्षा शुरू होती है · नेट कीमत गोपनीय रहती है' : 'Bypass protection starts when the owner approves on WhatsApp · net price stays confidential'}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {hi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {loading ? (hi ? 'जाँच हो रही है...' : 'Validating...') : (hi ? 'प्रॉपर्टी दर्ज करें' : 'Register Property')}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
);
};

// ==========================================
// 2. ADD REQUIREMENT MODAL
// ==========================================

export const AddRequirementModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: UserProfile | null;
}> = ({ isOpen, onClose, onSuccess, currentUser }) => {
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const label = useLabel();
  const isBuyerUser = currentUser?.role === 'BUYER_TENANT';
  const [customerName, setCustomerName] = useState(isBuyerUser ? currentUser?.name || '' : '');
  const [customerPhone, setCustomerPhone] = useState(isBuyerUser ? currentUser?.phone || '' : '');
  const [budgetMin, setBudgetMin] = useState<number | ''>('');
  const [budgetMax, setBudgetMax] = useState<number | ''>('');
  const [propertyType, setPropertyType] = useState<string>('Residential Flat');
  const [transactionType, setTransactionType] = useState('Sale');
  const [loc, setLoc] = useState<LocationValue>({ state: findState(currentUser?.state)?.name || stateOfCity(currentUser?.city) || '', city: currentUser?.city || '', locality: '', pincode: '' });
  const [customLocality, setCustomLocality] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedLocalities, setSelectedLocalities] = useState<string[]>([]);
  const [purpose, setPurpose] = useState('Self-use');
  const [urgency, setUrgency] = useState('Immediate (< 15 days)');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const toggleLocality = (loc: string) => {
    if (selectedLocalities.includes(loc)) {
      setSelectedLocalities(selectedLocalities.filter((l) => l !== loc));
    } else {
      setSelectedLocalities([...selectedLocalities, loc]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLocalities.length === 0) {
      setError(hi ? 'कम से कम एक पसंदीदा इलाका चुनें' : 'Please select at least one preferred locality');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (!loc.city) { setError(hi ? 'शहर चुनें' : 'Please choose the city'); setLoading(false); return; }
      const made: any = await api.createRequirement({
        customerName,
        customerPhone,
        budgetMin: Number(budgetMin),
        budgetMax: Number(budgetMax),
        state: loc.state || undefined,
        city: loc.city,
        preferredTags: tags,
        preferredLocalities: selectedLocalities,
        propertyType,
        transactionType,
        purpose,
        urgency,
      });
      const nn = made?.network?.count;
      alert(nn !== undefined
        ? (nn > 0 ? (hi ? `ज़रूरत दर्ज हो गई! नेटवर्क में ${nn} मैच होते घर मिले — ज़रूरत के कार्ड पर देखें।` : `Requirement saved! The network already has ${nn} matching home${nn > 1 ? 's' : ''} — see them on the need's card.`) : (hi ? 'ज़रूरत दर्ज हो गई! नेटवर्क में अभी कुछ मैच नहीं — मैच होते ही बताएँगे।' : 'Requirement saved! Nothing in the network matches yet — we will tell you the moment a listing fits.'))
        : (hi ? 'ज़रूरत दर्ज हो गई! मैचिंग शुरू है।' : 'Buyer requirement registered! Magic Match is looking for homes.'));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <h3 className="text-base font-bold text-slate-900">{isBuyerUser ? (hi ? 'मेरी ज़रूरत दर्ज करें' : 'Add my requirement') : (hi ? 'ग्राहक की ज़रूरत दर्ज करें' : 'Register Buyer Requirement')}</h3>
            <p className="text-xs text-slate-500">{hi ? 'ग्राहक की ज़रूरत · पूरे भारत में मैचिंग' : 'Persistent customer requirement · pan-India matching'}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={hi ? 'बंद करें' : 'Close'}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200 shrink-0">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{isBuyerUser ? (hi ? 'आपका नाम' : 'Your name') : (hi ? 'ग्राहक का नाम' : 'Customer Name')}:</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{isBuyerUser ? (hi ? 'आपका मोबाइल (+91)' : 'Your mobile (+91)') : (hi ? 'ग्राहक का मोबाइल (+91)' : 'Customer Mobile (+91)')}:</label>
              <input
                type="text"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'न्यूनतम बजट (₹)' : 'Min Budget (₹)'}:</label>
              <input
                type="number"
                required
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'अधिकतम बजट (₹)' : 'Max Budget (₹)'}:</label>
              <input
                type="number"
                required
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'श्रेणी' : 'Category'}:</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              >
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{label('propertyType', t)}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'लेन-देन' : 'Transaction'}:</label>
              <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900">
                <option value="Sale">{label('transactionType', 'Sale')}</option>
                <option value="Rent">{label('transactionType', 'Rent')}</option>
                <option value="Lease">{label('transactionType', 'Lease')}</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{hi ? 'कब तक चाहिए' : 'Timeline / Urgency'}:</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              >
                <option value="Immediate (< 15 days)">{label('urgency', 'Immediate (< 15 days)')}</option>
                <option value="Moderate (1-3 months)">{label('urgency', 'Moderate (1-3 months)')}</option>
                <option value="Exploratory (3-6 months)">{label('urgency', 'Exploratory (3-6 months)')}</option>
              </select>
            </div>
          </div>

          <LocationFields value={loc} onChange={(v) => { setLoc(v); }} showLocality={false} showPincode={false} />

          <div>
            <label className="text-xs font-semibold text-slate-700">{hi ? 'पसंदीदा इलाके' : 'Preferred localities'}{loc.city ? ` — ${loc.city}` : ''}:</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
              {loc.city && (
                <button type="button" data-testid="req-whole-city" onClick={() => toggleLocality(loc.city)}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${selectedLocalities.includes(loc.city) ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'}`}>
                  🏙️ {hi ? `पूरा ${loc.city} (कोई भी इलाका)` : `Whole ${loc.city} (any area)`}
                </button>
              )}
              {[...new Set([...areasOf(loc.city), ...selectedLocalities.filter(x => x !== loc.city)])].map((l) => {
                const isSelected = selectedLocalities.includes(l);
                return (
                  <button
                    type="button"
                    key={l}
                    onClick={() => toggleLocality(l)}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      isSelected ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
              {!loc.city && <span className="text-[11px] text-slate-400">{hi ? 'पहले शहर चुनें' : 'Choose the city first'}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={customLocality}
                onChange={(e) => setCustomLocality(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = canonPlace(loc.city, customLocality.trim()); if (v && !selectedLocalities.includes(v)) setSelectedLocalities([...selectedLocalities, v]); setCustomLocality(''); } }}
                placeholder={hi ? 'कोई और इलाका लिखकर Enter दबाएँ' : 'Type another locality and press Enter'}
                className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs"
              />
            </div>
          </div>

          <TagPicker value={tags} onChange={setTags} label={hi ? 'ज़रूरी विशेषताएँ (टैग)' : 'Must-have features (tags)'} />
        </div>

        {/* Sticky Action Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/90">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            🔒 {hi ? 'आपकी ज़रूरत सुरक्षित रहती है और तय नियमों से मैच होती है' : 'Protected buyer requirement matched deterministically'}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {hi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {loading ? (hi ? 'भेजा जा रहा है...' : 'Submitting...') : (hi ? 'ज़रूरत दर्ज करें' : 'Register Requirement')}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
);
};

// ==========================================
// 3. COLLABORATION OFFER MODAL
// ==========================================

export const CollaborationModal: React.FC<{
  isOpen: boolean;
  data: { propertyId: string; requirementId?: string; receivingBrokerId: string };
  onClose: () => void;
  onSuccess: () => void;
}> = ({ isOpen, data, onClose, onSuccess }) => {
  const [introducingShare, setIntroducingShare] = useState(50);
  const [closingShare, setClosingShare] = useState(50);
  const [terms, setTerms] = useState('');
  // v41: "apna-apna side" — each broker keeps the fee of his own client, nothing is shared
  const [feeMode, setFeeMode] = useState<'SPLIT' | 'OWN_SIDE'>('SPLIT');
  const [mySide, setMySide] = useState<'SELLER' | 'BUYER'>('BUYER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tx = useTx();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (feeMode === 'SPLIT' && introducingShare + closingShare !== 100) {
      setError(tx('Allocations must total exactly 100%', 'हिस्सेदारी का कुल ठीक 100% होना चाहिए'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.createOffer({
        propertyId: data.propertyId,
        requirementId: data.requirementId,
        receivingBrokerId: data.receivingBrokerId,
        ...(feeMode === 'OWN_SIDE'
          ? { feeMode: 'OWN_SIDE', proposerSide: mySide }
          : { proposedIntroducingShare: Number(introducingShare), proposedClosingShare: Number(closingShare) }),
        terms,
      });
      alert(tx('Collaboration offer sent! The partner broker can now accept it and open a Deal Room instantly.', 'सहयोग प्रस्ताव भेज दिया गया! पार्टनर ब्रोकर इसे स्वीकार करके तुरंत डील रूम खोल सकता है।'));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">{tx('Co-broking offer', 'को-ब्रोकिंग ऑफ़र')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1.5 border border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">{tx('Property Reference:', 'प्रॉपर्टी संदर्भ:')}</span>
              <span className="font-mono font-bold text-slate-900">{data.propertyId}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">{tx('Proposal Recipient:', 'प्रस्ताव प्राप्तकर्ता:')}</span>
              <span className="font-bold text-slate-800">
                {tx('Listing Broker', 'लिस्टिंग ब्रोकर')} ({data.receivingBrokerId || tx('Primary Listing Broker', 'प्राथमिक लिस्टिंग ब्रोकर')})
              </span>
            </div>
          </div>

          <div data-testid="fee-mode" className="grid grid-cols-2 gap-2">
            {([
              ['SPLIT', tx('Share one brokerage (%)', 'एक ब्रोकरेज का बँटवारा (%)')],
              ['OWN_SIDE', tx('Apna-apna side', 'अपना-अपना साइड')],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" data-testid={`fee-mode-${k}`} onClick={() => setFeeMode(k)}
                className={`py-2 px-2 text-[11px] font-bold rounded-lg border transition-colors ${feeMode === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {feeMode === 'OWN_SIDE' && (
            <div data-testid="own-side-box" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900 space-y-2">
              <p>{tx('No split. You take brokerage only from your own client and the other broker from his. Each fee stays private.', 'कोई बँटवारा नहीं। आप सिर्फ़ अपने क्लाइंट से ब्रोकरेज लेंगे और दूसरा ब्रोकर अपने क्लाइंट से। हर ब्रोकर की फ़ीस प्राइवेट रहती है।')}</p>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{tx('I act for the', 'मैं किस तरफ़ हूँ')}:</span>
                {([['BUYER', tx('Buyer', 'खरीदार')], ['SELLER', tx('Seller', 'विक्रेता')]] as const).map(([k, label]) => (
                  <button key={k} type="button" data-testid={`my-side-${k}`} onClick={() => setMySide(k)}
                    className={`px-2.5 py-1 rounded-md border font-bold ${mySide === k ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-emerald-300 text-emerald-800'}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Split Presets */}
          {feeMode === 'SPLIT' && (<>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              {tx('Select Commission Split Ratio:', 'कमीशन बँटवारे का अनुपात चुनें:')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '50 / 50 Split', intro: 50, close: 50 },
                { label: '60 / 40 Split', intro: 60, close: 40 },
                { label: '70 / 30 Split', intro: 70, close: 30 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setIntroducingShare(preset.intro);
                    setClosingShare(preset.close);
                  }}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border transition-colors ${
                    introducingShare === preset.intro && closingShare === preset.close
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {preset.intro} / {preset.close} {tx('Split', 'बँटवारा')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Introducer Share (%):', 'परिचयकर्ता का हिस्सा (%):')}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={introducingShare}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setIntroducingShare(val);
                  setClosingShare(100 - val);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Closer Share (%):', 'क्लोज़र का हिस्सा (%):')}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={closingShare}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setClosingShare(val);
                  setIntroducingShare(100 - val);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
              />
            </div>
          </div>
          </>)}

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Collaboration Terms & Notes:', 'सहयोग की शर्तें और नोट्स:')}</label>
            <textarea
              rows={3}
              required
              minLength={5}
              placeholder={tx('e.g. 50/50 split on 2% brokerage; client ready for a site visit this week', 'जैसे: 2% ब्रोकरेज पर 50/50 बँटवारा; क्लाइंट इस हफ़्ते साइट विज़िट के लिए तैयार')}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {tx('Cancel', 'रद्द करें')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? tx('Submitting...', 'भेजा जा रहा है...') : tx('Send Proposal', 'प्रस्ताव भेजें')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 4. SCHEDULE SITE VISIT MODAL (OTP)
// ==========================================

export const ScheduleVisitModal: React.FC<{
  isOpen: boolean;
  dealId?: string;
  propertyId: string;
  propertyTitle?: string;
  onClose: () => void;
  onSuccess: () => void;
  onOpenQrPass?: (visit: SiteVisit) => void;
  /** v40 — filled in from the deal room's buyer or the client room (the broker can still change name / time) */
  defaults?: { name?: string; phone?: string; when?: string; note?: string };
  /** v40 — booked from a Client Room: the mobile must be the client's (the room keeps only its last 4 digits) */
  clientRoom?: { id: string; itemId?: string; requestId?: string; phoneLast4: string; clientName: string };
}> = ({
  isOpen,
  dealId = '',
  propertyId,
  propertyTitle,
  onClose,
  onSuccess,
  onOpenQrPass,
  defaults,
  clientRoom,
}) => {
  const getInitialVisitTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const tx = useTx();
  const { lang } = useI18n();
  const loc = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const toLocal = (iso?: string) => {
    if (!iso || Number.isNaN(Date.parse(iso))) return '';
    const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [customerName, setCustomerName] = useState(clientRoom?.clientName || defaults?.name || '');
  const [customerPhone, setCustomerPhone] = useState(defaults?.phone || '');
  const [scheduledTime, setScheduledTime] = useState((defaults?.when && Date.parse(defaults.when) > Date.now() ? toLocal(defaults.when) : '') || getInitialVisitTime());
  const [notes, setNotes] = useState(defaults?.note || '');
  const [scanAt, setScanAt] = useState('PROPERTY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bondBlock, setBondBlock] = useState<any>(null);
  const [scheduledVisit, setScheduledVisit] = useState<SiteVisit | null>(null);
  const [watchNote, setWatchNote] = useState<{ en: string; hi: string } | null>(null); // v35 — Network Watch caution
  const [copiedOtp, setCopiedOtp] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError(tx('Please enter the client / buyer name.', 'कृपया क्लाइंट / खरीदार का नाम लिखें।'));
      return;
    }
    if (!scheduledTime) {
      setError(tx('Please select a visit date and time.', 'कृपया विज़िट की तारीख़ और समय चुनें।'));
      return;
    }
    if (clientRoom && !customerPhone.replace(/\D/g, '').endsWith(clientRoom.phoneLast4)) {
      setError(tx(`Enter your client's full mobile — it ends with ${clientRoom.phoneLast4}.`, `क्लाइंट का पूरा मोबाइल नंबर लिखें — आख़िरी अंक ${clientRoom.phoneLast4} हैं।`));
      return;
    }

    setLoading(true);
    setError('');

    try {
      let isoDate: string;
      try {
        isoDate = new Date(scheduledTime).toISOString();
      } catch {
        isoDate = new Date().toISOString();
      }

      const res = await api.scheduleSiteVisit({
        dealRoomId: dealId || undefined,
        propertyId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        scheduledTime: isoDate,
        notes: notes.trim() || undefined,
        scanAt,
        ...(clientRoom ? { clientRoomId: clientRoom.id, clientRoomItemId: clientRoom.itemId, clientRoomRequestId: clientRoom.requestId } : {}),
      });

      if (res.success && res.siteVisit) {
        setScheduledVisit(res.siteVisit);
        setWatchNote((res as any).watch || null);
        onSuccess();
        // v53 — a chat that started this ("+ Visit") answers with a card; it receives only the ids, never the OTP / QR secret
        try { window.dispatchEvent(new CustomEvent('genz:visit-scheduled', { detail: { dealId: res.siteVisit.dealRoomId, visitId: res.siteVisit.id } })); } catch { /* old browser */ }
      } else {
        throw new Error(tx('Failed to create site visit record', 'साइट विज़िट रिकॉर्ड नहीं बन सका'));
      }
    } catch (err: any) {
      if (err?.code === 'BUYER_BONDED') { setBondBlock(err.body); setError(''); return; } // v29 — another broker brought this buyer here first
      if (err?.code === 'PARTY_BLOCKED') { setError(tx(err.body?.error || err.message, err.body?.hi || err.message)); return; } // v35 — Network Watch
      setError(err?.message || tx('Failed to schedule site visit. Please try again.', 'साइट विज़िट तय नहीं हो सकी। कृपया दोबारा कोशिश करें।'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyOtp = () => {
    if (!scheduledVisit) return;
    if (scheduledVisit.otpCode) navigator.clipboard?.writeText(scheduledVisit.otpCode);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2000);
  };

  const handleCopyInvite = () => {
    if (!scheduledVisit) return;
    const formattedDate = new Date(scheduledVisit.scheduledTime).toLocaleString(loc, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const message = `*${tx('Site Visit Invitation (OTP-verified)', 'साइट विज़िट आमंत्रण (OTP से सत्यापित)')}*\n\n` +
      `${tx('Property', 'प्रॉपर्टी')}: ${propertyTitle || propertyId}\n` +
      `${tx('Client', 'क्लाइंट')}: ${scheduledVisit.customerName}\n` +
      `${tx('Scheduled Time', 'तय समय')}: ${formattedDate}\n` +
      (scheduledVisit.ackStatus === 'PENDING' ? `${tx('Your visit pass opens after you confirm — the link comes from your broker separately.', 'आपका विज़िट पास आपकी पुष्टि के बाद खुलेगा — लिंक आपका ब्रोकर अलग से भेजेगा।')}`
        : (scheduledVisit.otpCode ? `${tx('Verification OTP', 'सत्यापन OTP')}: *${scheduledVisit.otpCode}*\n\n` : `${tx('The verification OTP has been sent to the client by SMS.', 'सत्यापन OTP क्लाइंट को SMS से भेज दिया गया है।')}\n\n`) +
      `${tx('Please show this OTP on arrival at the site for check-in.', 'साइट पर पहुँचने पर चेक-इन के लिए यह OTP दिखाएँ।')}`);

    navigator.clipboard?.writeText(message);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleClose = () => {
    setScheduledVisit(null);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 font-semibold">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {scheduledVisit ? tx('Site Visit Scheduled!', 'साइट विज़िट तय हो गई!') : tx('Schedule Verified Site Visit', 'सत्यापित साइट विज़िट तय करें')}
              </h3>
              <p className="text-xs text-slate-500">
                {scheduledVisit
                  ? tx('Anti-bypass OTP generated and recorded', 'एंटी-बायपास OTP बन गया और दर्ज हुआ')
                  : tx('OTP-verified physical site inspection', 'OTP से सत्यापित साइट निरीक्षण')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
        {bondBlock && <div className="mt-3"><BondBlockedNotice info={bondBlock} onClose={() => setBondBlock(null)} /></div>}

        {/* SUCCESS CONFIRMATION VIEW */}
        {scheduledVisit ? (
          <div className="mt-4 space-y-4">
            {watchNote && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-950" role="alert" data-testid="watch-caution">{tx(watchNote.en, watchNote.hi)}</p>}
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-white border border-emerald-200 p-4 text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>{tx('Anti-Bypass Evidence Issued', 'एंटी-बायपास प्रमाण जारी')}</span>
              </div>

              {scheduledVisit.ackStatus && scheduledVisit.ackStatus !== 'ACKED' ? <div className="text-left"><VisitAckPanel kind="VISIT" refId={scheduledVisit.id} status={scheduledVisit.ackStatus} buyerName={scheduledVisit.customerName} subject={propertyTitle || propertyId} canManage /></div> : null}
              {scheduledVisit.ackStatus === 'PENDING' ? null : <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {tx('Client Verification OTP Challenge', 'क्लाइंट सत्यापन OTP')}
                </span>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <div className="font-mono text-3xl font-extrabold tracking-widest text-emerald-950 bg-white px-4 py-2 rounded-xl border border-emerald-300 shadow-xs">
                    {scheduledVisit.otpCode || '• • • • • •'}
                  </div>
                  <button
                    onClick={handleCopyOtp}
                    className="flex items-center gap-1 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                    title={tx('Copy OTP to clipboard', 'OTP कॉपी करें')}
                  >
                    {copiedOtp ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">{tx('Copied', 'कॉपी हुआ')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 text-slate-500" />
                        <span>{tx('Copy', 'कॉपी करें')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>}

              {scheduledVisit.ackStatus === 'PENDING' ? null : <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                {lang === 'hi'
                  ? <>यह OTP <strong>{scheduledVisit.customerName}</strong> को दें। साइट पर पहुँचकर यह कोड डालें या QR पास स्कैन करें — चेक-इन का प्रमाण ऑडिट ट्रेल में दर्ज हो जाएगा।</>
                  : <>Provide this OTP code to <strong>{scheduledVisit.customerName}</strong>. On arrival at the site, enter this code or scan the QR pass — the check-in proof is recorded in the audit trail.</>}
              </p>}
            </div>

            <ScanLineNote kind="VISIT" scanAt={scheduledVisit.scanAt} />
            {/* Visit Details Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{tx('Visit Reference:', 'विज़िट संदर्भ:')}</span>
                <span className="font-mono font-bold text-slate-900">{scheduledVisit.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{tx('Property Ref:', 'प्रॉपर्टी संदर्भ:')}</span>
                <span className="font-medium text-slate-800">{propertyTitle || propertyId}</span>
              </div>
              {scheduledVisit.dealRoomId && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{tx('Linked Deal Room:', 'जुड़ा डील रूम:')}</span>
                  <span className="font-mono font-semibold text-slate-800">{scheduledVisit.dealRoomId}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{tx('Scheduled Time:', 'तय समय:')}</span>
                <span className="font-semibold text-slate-900">
                  {new Date(scheduledVisit.scheduledTime).toLocaleString(loc, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              {scheduledVisit.customerPhone && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{tx('Client Mobile:', 'क्लाइंट मोबाइल:')}</span>
                  <span className="font-mono text-slate-800">{scheduledVisit.customerPhone}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
              >
                {copiedInvite ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">{tx('Invite Copied!', 'आमंत्रण कॉपी हुआ!')}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5 text-blue-600" />
                    <span>{tx('Copy WhatsApp Invite', 'WhatsApp आमंत्रण कॉपी करें')}</span>
                  </>
                )}
              </button>

              {onOpenQrPass && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenQrPass(scheduledVisit);
                    handleClose();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold text-white transition-colors shadow-2xs"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span>{tx('Open Visit QR Pass', 'विज़िट QR पास खोलें')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-semibold text-white transition-colors"
              >
                {tx('Done', 'हो गया')}
              </button>
            </div>
          </div>
        ) : (
          /* FORM VIEW */
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {dealId ? (
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Deal Room Ref:', 'डील रूम संदर्भ:')}</label>
                <input
                  type="text"
                  disabled
                  value={dealId}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-mono text-slate-700"
                />
              </div>
            ) : (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900">
                {tx('A dedicated Deal Room will be created automatically to record your anti-bypass protection (days as per the GENZ rule).', 'आपकी एंटी-बायपास सुरक्षा (GENZ नियम के दिनों तक) दर्ज करने के लिए एक डील रूम अपने-आप बन जाएगा।')}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Property Reference:', 'प्रॉपर्टी संदर्भ:')}</label>
              <input
                type="text"
                disabled
                value={propertyTitle ? `${propertyTitle} (${propertyId})` : propertyId}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Client / Buyer Full Name *', 'क्लाइंट / खरीदार का पूरा नाम *')}</label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    required
                    placeholder={tx('e.g. Dr. Alok Pandey', 'जैसे: डॉ. आलोक पांडे')}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    readOnly={!!clientRoom}
                    data-testid="visit-name"
                    className={`w-full rounded-lg border border-slate-300 p-2 pl-8 text-xs text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 ${clientRoom ? 'bg-slate-50' : ''}`}
                  />
                  <User className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{clientRoom ? tx(`Client's mobile * (ends with ${clientRoom.phoneLast4})`, `क्लाइंट का मोबाइल * (आख़िरी अंक ${clientRoom.phoneLast4})`) : tx('Client Phone (Optional)', 'क्लाइंट का फ़ोन (वैकल्पिक)')}</label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    inputMode="tel"
                    required={!!clientRoom}
                    data-testid="visit-phone"
                    placeholder={clientRoom ? `98XXXX${clientRoom.phoneLast4}` : tx('e.g. +91 98271 23456', 'जैसे: +91 98271 23456')}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 pl-8 text-xs text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                  <Phone className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{tx('The OTP SMS goes to this number — enter it only with the client’s permission.', 'OTP का SMS इसी नंबर पर जाएगा — केवल क्लाइंट की अनुमति से नंबर डालें।')}</p>
                <p className="mt-1 flex items-start gap-1 text-[10px] font-medium text-emerald-700" data-testid="visit-bond-hint"><ShieldCheck className="mt-px h-3 w-3 shrink-0" />{tx('Add the buyer’s mobile: once the visit is verified, this buyer is protected to you on this property — no other GENZ broker can bring the same buyer here.', 'खरीदार का मोबाइल डालें: विज़िट पक्की होते ही इस प्रॉपर्टी पर यह खरीदार आपसे सुरक्षित — कोई दूसरा GENZ ब्रोकर उसी खरीदार को यहाँ नहीं ला सकेगा।')}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Scheduled Visit Date & Time *', 'विज़िट की तारीख़ और समय *')}</label>
              <div className="relative mt-1">
                <input
                  type="datetime-local"
                  required
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 pl-8 text-xs text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
                <Calendar className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <ScanPointSelect kind="VISIT" value={scanAt} onChange={setScanAt} className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900" />

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Visit Notes / Purpose (Optional)', 'विज़िट के नोट्स / उद्देश्य (वैकल्पिक)')}</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tx('e.g. Family layout walkthrough, title document inspection on site', 'जैसे: परिवार के साथ लेआउट देखना, साइट पर टाइटल दस्तावेज़ जाँच')}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                {tx('A unique 6-digit OTP will be issued. Once the visit is verified on site, it is recorded as proof of your introduction (anti-bypass protection, days as per the GENZ rule).', 'एक यूनिक 6-अंकों का OTP जारी होगा। साइट पर विज़िट सत्यापित होने पर वह आपके परिचय के प्रमाण (एंटी-बायपास सुरक्षा, GENZ नियम के दिनों तक) के रूप में दर्ज होगा।')}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {tx('Cancel', 'रद्द करें')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
              >
                {loading ? tx('Scheduling...', 'तय हो रहा है...') : tx('Generate OTP & Schedule', 'OTP बनाएँ और तय करें')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 5. VERIFY SITE VISIT OTP MODAL
// ==========================================

export const VerifyVisitOtpModal: React.FC<{
  isOpen: boolean;
  visit: SiteVisit | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ isOpen, visit, onClose, onSuccess }) => {
  const [otpCode, setOtpCode] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const tx = useTx();

  if (!isOpen || !visit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError(tx('Please enter the 6-digit OTP code.', 'कृपया 6-अंकों का OTP डालें।'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.verifySiteVisitOtp(visit.id, otpCode.trim(), feedback);
      setIsSuccess(true);
      onSuccess();
      setTimeout(() => {
        setIsSuccess(false);
        setOtpCode('');
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err?.message || tx('Invalid OTP code. Please check and retry.', 'OTP सही नहीं है। जाँचकर दोबारा डालें।'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsSuccess(false);
    setError('');
    setOtpCode('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl transition-all">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 font-bold">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{tx('Verify Site Visit OTP', 'साइट विज़िट OTP सत्यापित करें')}</h3>
              <p className="text-xs text-slate-500">{tx('Confirm physical client presence', 'क्लाइंट की साइट पर मौजूदगी पक्की करें')}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {isSuccess ? (
          <div className="mt-4 p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
            <div className="h-10 w-10 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-emerald-950">{tx('Site Visit Verified Successfully!', 'साइट विज़िट सफलतापूर्वक सत्यापित!')}</h4>
            <p className="text-xs text-emerald-800">
              {tx('The timestamp and proof are recorded in the audit trail.', 'समय और प्रमाण ऑडिट ट्रेल में दर्ज हो गए हैं।')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1 border border-slate-200/70">
              <div className="text-slate-500">{tx('Visit Record:', 'विज़िट रिकॉर्ड:')}</div>
              <div className="font-mono font-bold text-slate-900">{visit.id} ({tx('Client', 'क्लाइंट')}: {visit.customerName})</div>
              {!visit.otpCode && (
                <p className="pt-1 text-[11px] text-slate-500">{tx('The 6-digit OTP was sent to the client’s mobile. Ask the client to read it out on site.', '6-अंकों का OTP क्लाइंट के मोबाइल पर भेजा गया है। साइट पर क्लाइंट से वह बोलकर बताने को कहें।')}</p>
              )}
              {visit.otpCode && (<div className="flex items-center justify-between pt-1">
                <span className="text-slate-400 text-[11px]">{tx('Demo challenge code:', 'डेमो OTP कोड:')}</span>
                <button
                  type="button"
                  onClick={() => setOtpCode(visit.otpCode || "")}
                  className="font-mono text-[11px] font-bold text-blue-700 hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                  title={tx('Click to auto-fill demo OTP code', 'डेमो OTP अपने-आप भरने के लिए क्लिक करें')}
                >
                  {tx('Use Code', 'कोड इस्तेमाल करें')} ({visit.otpCode})
                </button>
              </div>)}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Enter 6-Digit OTP:', '6-अंकों का OTP डालें:')}</label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder={tx('e.g. 482910', 'जैसे: 482910')}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-center text-xl font-mono font-bold tracking-widest text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Visit Inspection Notes:', 'विज़िट निरीक्षण नोट्स:')}</label>
              <textarea
                rows={2}
                placeholder={tx('e.g. Buyer checked layout, parking and title papers on site', 'जैसे: खरीदार ने साइट पर लेआउट, पार्किंग और टाइटल काग़ज़ देखे')}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {tx('Cancel', 'रद्द करें')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {loading ? tx('Verifying...', 'जाँच हो रही है...') : tx('Verify & Record Visit', 'सत्यापित करें और विज़िट दर्ज करें')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 6. FILE DISPUTE MODAL
// ==========================================

const DISPUTE_REASON_EN: Record<string, string> = {
  BYPASS_ATTEMPT: 'Anti-Bypass breach (direct owner / buyer contact)', COMMISSION_NON_PAYMENT: 'Commission split not paid',
  FALSE_REPRESENTATION: 'False listing representation', UNAUTHORIZED_CONTACT: 'Unauthorized client contact', OTHER: 'Other contractual dispute',
};

export const FileDisputeModal: React.FC<{
  isOpen: boolean;
  dealId?: string;
  /** who is filing — never offered as the counterparty */
  currentUserId?: string;
  /** used when the dispute is not tied to one deal room: any other network member can be named */
  directory?: { id: string; name: string; role: string }[];
  onClose: () => void;
  onSuccess: () => void;
}> = ({ isOpen, dealId, currentUserId, directory = [], onClose, onSuccess }) => {
  const tx = useTx();
  const label = useLabel();
  const [reason, setReason] = useState<string>('BYPASS_ATTEMPT');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [parties, setParties] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // With a deal room open, the counterparty can only be someone in that deal (the server enforces the same rule).
  useEffect(() => {
    if (!isOpen) return;
    setCounterpartyId(''); setError('');
    if (!dealId) { setParties(directory.filter(u => u.id !== currentUserId)); return; }
    let live = true;
    setLoadingParties(true);
    api.getDeal(dealId).then((r) => {
      if (!live) return;
      const p = r.participants || {};
      const list: { id: string; name: string; role: string }[] = [];
      if (p.introducingBroker) list.push({ id: p.introducingBroker.id, name: p.introducingBroker.name, role: 'BROKER' });
      if (p.closingBroker) list.push({ id: p.closingBroker.id, name: p.closingBroker.name, role: 'BROKER' });
      if (p.owner) list.push({ id: p.owner.id, name: p.owner.name, role: 'PROPERTY_OWNER' });
      setParties(list.filter(u => u.id !== currentUserId).filter((u, i, a) => a.findIndex(x => x.id === u.id) === i));
    }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setLoadingParties(false); });
    return () => { live = false; };
  }, [isOpen, dealId, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!counterpartyId) { setError(tx('Choose who the dispute is against.', 'चुनें कि विवाद किसके ख़िलाफ़ है।')); return; }
    if (description.trim().length < 15) { setError(tx('Please describe what happened in at least 15 characters.', 'कृपया क्या हुआ, कम से कम 15 अक्षरों में लिखें।')); return; }
    setLoading(true);
    try {
      await api.createDispute({
        dealRoomId: dealId,
        counterpartyId,
        reason,
        description: description.trim(),
        evidenceLinks: evidence.trim() ? [evidence.trim()] : [],
      });
      alert(dealId
        ? tx('Dispute logged. The commission settlement on this deal room is on hold until the GENZ admin team reviews it.', 'विवाद दर्ज हो गया। GENZ एडमिन टीम की समीक्षा तक इस डील रूम का कमीशन निपटान रोका गया है।')
        : tx('Dispute logged. The GENZ admin team will review it.', 'विवाद दर्ज हो गया। GENZ एडमिन टीम इसकी समीक्षा करेगी।'));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const field = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-red-900 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            {tx('File a dispute / bypass notice', 'विवाद / बायपास नोटिस दर्ज करें')}
          </h3>
          <button onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Dispute type:', 'विवाद का प्रकार:')}</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
              {['BYPASS_ATTEMPT', 'COMMISSION_NON_PAYMENT', 'FALSE_REPRESENTATION', 'UNAUTHORIZED_CONTACT', 'OTHER'].map(k => (
                <option key={k} value={k}>{tx(DISPUTE_REASON_EN[k], label('disputeReason', k))}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Against:', 'किसके ख़िलाफ़:')}</label>
            <select required value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} className={field} disabled={loadingParties}>
              <option value="">{loadingParties ? tx('Loading…', 'लोड हो रहा है…') : dealId ? tx('Choose a person in this deal room', 'इस डील रूम का कोई व्यक्ति चुनें') : tx('Choose a network member', 'नेटवर्क का कोई सदस्य चुनें')}</option>
              {parties.map(u => <option key={u.id} value={u.id}>{u.name} — {label('role', u.role)}</option>)}
            </select>
            {dealId && !loadingParties && parties.length === 0 && (
              <p className="mt-1 text-[11px] text-slate-500">{tx('No other participant found in this deal room.', 'इस डील रूम में कोई और भागीदार नहीं मिला।')}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('What happened (facts only):', 'क्या हुआ (सिर्फ़ तथ्य):')}</label>
            <textarea
              rows={4}
              required
              minLength={15}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tx('e.g. On 12 Oct the owner called the buyer I introduced and discussed the price directly, after the site visit I had registered.', 'जैसे: 12 अक्टूबर को मेरे दर्ज किए साइट विज़िट के बाद मालिक ने मेरे बताए खरीदार को फ़ोन करके सीधे कीमत पर बात की।')}
              className={field}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Evidence link (optional):', 'सबूत का लिंक (वैकल्पिक):')}</label>
            <input type="url" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" className={field} />
          </div>

          <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 border border-red-200">
            {dealId
              ? tx('Submitting this notice puts the commission settlement of this deal room on hold until the GENZ admin team has reviewed it. GENZ never holds the parties’ deal money — the parties settle between themselves afterwards.', 'यह नोटिस देने पर GENZ एडमिन टीम की समीक्षा पूरी होने तक इस डील रूम का कमीशन निपटान रोक दिया जाता है। GENZ पक्षों का डील का पैसा कभी अपने पास नहीं रखता — बाद में पक्ष आपस में निपटारा करते हैं।')
              : tx('The GENZ admin team will review this notice. GENZ never holds the parties’ deal money.', 'GENZ एडमिन टीम इस नोटिस की समीक्षा करेगी। GENZ पक्षों का डील का पैसा कभी अपने पास नहीं रखता।')}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {tx('Cancel', 'रद्द करें')}
            </button>
            <button type="submit" disabled={loading || loadingParties} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {loading ? tx('Filing…', 'दर्ज हो रहा है…') : dealId ? tx('File dispute & put on hold', 'विवाद दर्ज करें और होल्ड लगाएँ') : tx('File dispute', 'विवाद दर्ज करें')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 7. ADD CONSTRUCTION LEAD MODAL
// ==========================================

export const AddConstructionLeadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState('Turnkey Residential');
  const [approximateLocation, setApproximateLocation] = useState('');
  const [exactAddressHidden, setExactAddressHidden] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState(0);
  const [scopeDescription, setScopeDescription] = useState('');
  const [timeline, setTimeline] = useState('');
  const [referralCommissionPct, setReferralCommissionPct] = useState(1);
  const [customerNameMasked, setCustomerNameMasked] = useState('');
  const [customerPhoneHidden, setCustomerPhoneHidden] = useState('');
  const [customerConsent, setCustomerConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const tx = useTx();
  const label = useLabel();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerConsent) {
      alert(tx('Please confirm that the customer has agreed to share these details.', 'कृपया पुष्टि करें कि ग्राहक ने ये जानकारी साझा करने की सहमति दी है।'));
      return;
    }
    setLoading(true);
    try {
      await api.createConstructionLead({
        title,
        projectType,
        approximateLocation,
        exactAddressHidden,
        estimatedBudget: Number(estimatedBudget),
        scopeDescription,
        timeline,
        referralCommissionPct: Number(referralCommissionPct),
        customerNameMasked,
        customerPhoneHidden,
        customerConsent: true,
      });
      alert(tx(`Construction lead submitted with ${referralCommissionPct}% referral commission terms!`, `कंस्ट्रक्शन लीड ${referralCommissionPct}% रेफ़रल कमीशन की शर्तों के साथ जमा हो गई!`));
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
        {/* Sticky Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <h3 className="text-base font-bold text-slate-900">{tx('Submit Construction Lead', 'कंस्ट्रक्शन लीड जमा करें')}</h3>
            <p className="text-xs text-slate-500">{tx('Powered by GENZ BUILDCON Alliance', 'GENZ BUILDCON अलायंस द्वारा')} · {referralCommissionPct}% {tx('referral brokerage', 'रेफ़रल ब्रोकरेज')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form with scrollable body and sticky action footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Project Title:', 'प्रोजेक्ट का शीर्षक:')}</label>
            <input
              type="text"
              required
              value={title}
              placeholder={tx('e.g. Turnkey residential construction, 3 BHK villa', 'जैसे: टर्नकी रिहायशी निर्माण, 3 BHK विला')}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Category:', 'श्रेणी:')}</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              >
                {['Turnkey Residential', 'Commercial Interior Fitout', 'Renovation & Remodel', 'Structural Expansion', 'Architectural Sanction'].map((v) => (
                  <option key={v} value={v}>{label('constructionType', v)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Referral Brokerage (%):', 'रेफ़रल ब्रोकरेज (%):')}</label>
              <input
                type="number"
                step="0.1"
                required
                value={referralCommissionPct}
                onChange={(e) => setReferralCommissionPct(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Estimated Project Budget (₹):', 'अनुमानित प्रोजेक्ट बजट (₹):')}</label>
              <input
                type="number"
                required
                value={estimatedBudget}
                onChange={(e) => setEstimatedBudget(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Timeline:', 'समय-सीमा:')}</label>
              <input
                type="text"
                required
                placeholder={tx('e.g. 8 months', 'जैसे: 8 महीने')}
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Approximate Location (Public):', 'अनुमानित लोकेशन (सार्वजनिक):')}</label>
            <input
              type="text"
              required
              value={approximateLocation}
              placeholder={tx('Area / city (e.g. Whitefield, Bengaluru)', 'इलाका / शहर (जैसे: टाटीबंध, रायपुर)')}
              onChange={(e) => setApproximateLocation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Detailed Scope & Requirements:', 'विस्तृत स्कोप और ज़रूरतें:')}</label>
            <textarea
              rows={2}
              required
              placeholder={tx('What needs to be built — floors, area, finish level, special needs', 'क्या बनाना है — मंज़िलें, एरिया, फ़िनिश, ख़ास ज़रूरतें')}
              value={scopeDescription}
              onChange={(e) => setScopeDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Masked Customer Name:', 'ग्राहक का मास्क्ड नाम:')}</label>
              <input
                type="text"
                required
                value={customerNameMasked}
                placeholder={tx('e.g. Rahul S. (masked)', 'जैसे: राहुल एस. (मास्क्ड)')}
                onChange={(e) => setCustomerNameMasked(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Confidential Phone (+91):', 'गोपनीय फ़ोन (+91):')}</label>
              <input
                type="text"
                required
                placeholder="+91 98XXX XXXXX"
                value={customerPhoneHidden}
                onChange={(e) => setCustomerPhoneHidden(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{tx('Exact Address (Protected):', 'सटीक पता (सुरक्षित):')}</label>
            <input
              type="text"
              required
              placeholder={tx('Full site address — shared only after the contractor accepts the terms', 'पूरा साइट पता — ठेकेदार के शर्तें मानने के बाद ही दिखेगा')}
              value={exactAddressHidden}
              onChange={(e) => setExactAddressHidden(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
            <input type="checkbox" required checked={customerConsent} onChange={(e) => setCustomerConsent(e.target.checked)} className="mt-0.5" />
            <span>{tx('The customer has agreed to share their name, phone and address for this construction enquiry. The phone and address stay hidden from contractors until they accept the terms.', 'ग्राहक ने इस कंस्ट्रक्शन पूछताछ के लिए अपना नाम, फ़ोन और पता साझा करने की सहमति दी है। ठेकेदार के शर्तें मानने तक फ़ोन और पता छिपे रहते हैं।')}</span>
          </label>
        </div>

        {/* Sticky Action Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/90">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            🔒 {referralCommissionPct}% {tx('referral commission is recorded for the referring broker', 'रेफ़रल कमीशन रेफ़र करने वाले ब्रोकर के लिए दर्ज होगा')}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {tx('Cancel', 'रद्द करें')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {loading ? tx('Submitting...', 'जमा हो रहा है...') : tx('Post Opportunity', 'अवसर पोस्ट करें')}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
);
};
