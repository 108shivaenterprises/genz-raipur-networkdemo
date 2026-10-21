import React, { useState, useEffect } from 'react';
import { Property, UserProfile } from '../types/index.js';
import { formatINR } from '../lib/utils.js';
import { PROPERTY_TYPES, findState } from '../shared/india.js';
import { LocationFields } from './LocationFields.js';
import { TagPicker } from './TagPicker.js';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import {
  Building2,
  X,
  Upload,
  Image as ImageIcon,
  Video,
  CheckCircle2,
  Trash2,
  Star,
  MapPin,
  ExternalLink,
  Lock,
  Phone,
  AlertCircle,
  Save,
  Plus,
} from 'lucide-react';

interface EditPropertyModalProps {
  isOpen: boolean;
  property: Property | null;
  currentUser: UserProfile;
  onClose: () => void;
  onSuccess: (updatedProperty: Property) => void;
}

export const EditPropertyModal: React.FC<EditPropertyModalProps> = ({
  isOpen,
  property,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const tx = useTx();
  const label = useLabel();
  if (!isOpen || !property) return null;

  const [title, setTitle] = useState(property.title || '');
  const [description, setDescription] = useState(property.description || '');
  const [propertyType, setPropertyType] = useState<any>(property.propertyType || 'Residential Flat');
  const [transactionType, setTransactionType] = useState<'Sale' | 'Rent' | 'Lease'>(property.transactionType || 'Sale');
  const [listingStatus, setListingStatus] = useState(property.listingStatus || 'active');
  // v27 — "sold / rented" is not a plain edit: GENZ asks how it closed (inside the network or outside) and tells everyone it is closed
  const closedWord: 'sold' | 'rented' = property.transactionType === 'Sale' ? 'sold' : 'rented';
  const closing = listingStatus === 'sold' || listingStatus === 'rented';
  const [via, setVia] = useState<'NETWORK' | 'OUTSIDE'>('OUTSIDE');
  const [pick, setPick] = useState('');
  const [cands, setCands] = useState<{ key: string; label: string }[]>([]);
  const [soldPrice, setSoldPrice] = useState('');
  const [soldNote, setSoldNote] = useState('');
  useEffect(() => {
    if (!closing) return;
    Promise.all([api.ofList(), api.getDeals()]).then(([o, dl]) => {
      const offers = (o.incoming || []).filter((x: any) => x.propertyId === property.id && ['ACCEPTED', 'TOKEN_HELD'].includes(x.status)).map((x: any) => ({ key: `O:${x.id}`, label: `${tx('Offer', 'ऑफ़र')} ${x.id} — ${formatINR(x.amount)} (${x.buyerName})` }));
      const deals = (dl.deals || []).filter((x: any) => x.propertyId === property.id).map((x: any) => ({ key: `D:${x.id}`, label: `${tx('Deal room', 'डील रूम')} ${x.id}` }));
      setCands([...offers, ...deals]);
    }).catch(() => setCands([]));
  }, [closing, property.id]);

  const [loc, setLoc] = useState({
    state: findState(property.state)?.name || property.state || '',
    city: property.city || '',
    locality: property.locality || '',
    pincode: property.pincode || '',
    district: property.district || '',
  });
  const [tags, setTags] = useState<string[]>(property.tags || []);
  const [landmark, setLandmark] = useState(property.landmark || '');
  const [addressHidden, setAddressHidden] = useState(property.addressHidden || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(property.googleMapsUrl || '');

  const [askingPrice, setAskingPrice] = useState<string | number>(property.askingPrice || '');
  const [ownerApprovedNetPrice, setOwnerApprovedNetPrice] = useState<string | number>(property.ownerApprovedNetPrice || '');
  const [priceChangeReason, setPriceChangeReason] = useState('');
  const [builtUpAreaSqFt, setBuiltUpAreaSqFt] = useState<string | number>(property.builtUpAreaSqFt || '');
  const [plotAreaSqFt, setPlotAreaSqFt] = useState<string | number>(property.plotAreaSqFt || '');

  const [ownerName, setOwnerName] = useState(property.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(property.ownerPhone || '');

  // Media Management
  const [images, setImages] = useState<string[]>(property.images || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState(property.videoUrl || '');
  const [videoSourceMode, setVideoSourceMode] = useState<'URL' | 'GALLERY'>('URL');
  const [uploadedVideoName, setUploadedVideoName] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sync state if property prop changes
  useEffect(() => {
    if (property) {
      setTitle(property.title || '');
      setDescription(property.description || '');
      setPropertyType(property.propertyType || 'Residential Flat');
      setTransactionType(property.transactionType || 'Sale');
      setListingStatus(property.listingStatus || 'active');
      setLoc({
        state: findState(property.state)?.name || property.state || '',
        city: property.city || '',
        locality: property.locality || '',
        pincode: property.pincode || '',
        district: property.district || '',
      });
      setTags(property.tags || []);
      setLandmark(property.landmark || '');
      setAddressHidden(property.addressHidden || '');
      setGoogleMapsUrl(property.googleMapsUrl || '');
      setAskingPrice(property.askingPrice || '');
      setOwnerApprovedNetPrice(property.ownerApprovedNetPrice || '');
      setBuiltUpAreaSqFt(property.builtUpAreaSqFt || '');
      setPlotAreaSqFt(property.plotAreaSqFt || '');
      setOwnerName(property.ownerName || '');
      setOwnerPhone(property.ownerPhone || '');
      setImages(property.images || []);
      setVideoUrl(property.videoUrl || '');
      setError('');
      setSuccessMsg('');
    }
  }, [property]);

  // Gallery Photo Upload Handler
  const handlePhotoFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setImages((prev) => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Gallery Video Upload Handler
  const handleVideoFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) {
      alert(tx('Please select a valid video file (MP4, WebM, MOV).', 'कृपया सही वीडियो फ़ाइल चुनें (MP4, WebM, MOV)।'));
      return;
    }
    setUploadedVideoName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setVideoUrl(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return;
    setImages((prev) => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSetPrimaryImage = (indexToPrimary: number) => {
    setImages((prev) => {
      const target = prev[indexToPrimary];
      const rest = prev.filter((_, idx) => idx !== indexToPrimary);
      return [target, ...rest];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (closing) {
        if (via === 'NETWORK' && !pick) throw new Error(tx('Pick the offer or deal room through which it closed.', 'चुनें कि किस ऑफ़र या डील रूम से सौदा हुआ।'));
        await api.lsStatus(property.id, via === 'NETWORK'
          ? { status: closedWord, soldVia: 'NETWORK', ...(pick.startsWith('O:') ? { offerId: pick.slice(2) } : { dealRoomId: pick.slice(2) }), soldPrice: soldPrice ? Number(soldPrice) : undefined, soldNote: soldNote || undefined }
          : { status: closedWord, soldVia: 'OUTSIDE', soldPrice: soldPrice ? Number(soldPrice) : undefined, soldNote: soldNote || undefined });
        setSuccessMsg(closedWord === 'sold' ? tx('Marked SOLD — the whole network now sees it as sold.', 'बिक गई दर्ज — पूरे नेटवर्क को अब यह “बिक गई” दिखेगी।') : tx('Marked RENTED — the whole network now sees it as rented.', 'किराये पर गई दर्ज — पूरे नेटवर्क को अब यह “किराये पर गई” दिखेगी।'));
        setTimeout(() => { onSuccess({ ...property, listingStatus: closedWord } as Property); onClose(); }, 700);
        return;
      }
      const numAsking = Number(askingPrice);
      const numNet = Number(ownerApprovedNetPrice);

      if (!title.trim() || title.length < 3) {
        throw new Error(tx('Title must be at least 3 characters', 'शीर्षक कम से कम 3 अक्षर का होना चाहिए'));
      }
      if (!numAsking || numAsking <= 0) {
        throw new Error(tx('Please enter a valid asking price', 'कृपया सही माँगी गई क़ीमत डालें'));
      }

      const payload = {
        title: title.trim(),
        description: description.trim(),
        propertyType,
        transactionType,
        listingStatus,
        city: loc.city.trim(),
        state: loc.state,
        locality: loc.locality.trim(),
        pincode: loc.pincode || '',
        district: loc.district || '',
        tags,
        landmark: landmark.trim(),
        addressHidden: addressHidden.trim(),
        googleMapsUrl: googleMapsUrl.trim(),
        askingPrice: numAsking,
        ownerApprovedNetPrice: numNet && numNet !== property.ownerApprovedNetPrice ? numNet : undefined,
        priceChangeReason: numAsking !== property.askingPrice ? (priceChangeReason.trim() || 'Owner revision') : undefined,
        builtUpAreaSqFt: builtUpAreaSqFt ? Number(builtUpAreaSqFt) : undefined,
        plotAreaSqFt: plotAreaSqFt ? Number(plotAreaSqFt) : undefined,
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        images: images.length > 0 ? images : undefined,
        videoUrl: videoUrl.trim() || undefined,
      };

      const res = await api.updateProperty(property.id, payload);
      if (res.success && res.property) {
        setSuccessMsg(tx('Property listing updated successfully!', 'प्रॉपर्टी लिस्टिंग सफलतापूर्वक अपडेट हो गई!'));
        setTimeout(() => {
          onSuccess(res.property);
          onClose();
        }, 600);
      } else {
        throw new Error(tx('Failed to update property', 'प्रॉपर्टी अपडेट नहीं हो सकी'));
      }
    } catch (err: any) {
      setError(err?.message || tx('Failed to update property listing', 'प्रॉपर्टी लिस्टिंग अपडेट नहीं हो सकी'));
    } finally {
      setLoading(false);
    }
  };

  const isPriceChanged = Number(askingPrice) > 0 && Number(askingPrice) !== property.askingPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-white rounded-t-xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{tx('Edit Property Listing', 'प्रॉपर्टी लिस्टिंग एडिट करें')}</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                  {property.id}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {tx('Update details, pricing, photos gallery & location for this listing', 'इस लिस्टिंग का विवरण, क़ीमत, फ़ोटो गैलरी और लोकेशन अपडेट करें')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* SECTION 1: Status & Core Overview */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <span>{tx('Listing Status & Classification', 'लिस्टिंग की स्थिति और श्रेणी')}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Listing Status', 'लिस्टिंग की स्थिति')}</label>
                <select
                  value={listingStatus}
                  onChange={(e) => setListingStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="active">{tx('Active (Live in Market)', 'सक्रिय (बाज़ार में लाइव)')}</option>
                  <option value="under_negotiation">{label('listingStatus', 'under_negotiation')}</option>
                  <option value={closedWord}>{label('listingStatus', closedWord)}</option>
                  <option value="withdrawn">{tx('Withdrawn / Delisted', 'हटाई गई / डीलिस्ट')}</option>
                </select>
              </div>

              {closing && (
                <div className="sm:col-span-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs" data-testid="closing-panel">
                  <p className="font-bold text-red-900">{closedWord === 'sold' ? tx('Mark as SOLD — how did it close?', 'बिक गई — सौदा कैसे हुआ?') : tx('Mark as RENTED — how did it close?', 'किराये पर गई — सौदा कैसे हुआ?')}</p>
                  <p className="mt-0.5 text-red-800">{tx('Works from any status, even while under negotiation. Every broker on the network will see it as closed.', 'किसी भी स्टेटस से चलता है, नेगोशिएशन में हो तब भी। नेटवर्क के हर ब्रोकर को यह “बंद” दिखेगी।')}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <label className="flex items-center gap-1.5"><input type="radio" name="via" checked={via === 'OUTSIDE'} onChange={() => setVia('OUTSIDE')} /> {tx('Outside GENZ', 'GENZ के बाहर')}</label>
                    <label className="flex items-center gap-1.5"><input type="radio" name="via" checked={via === 'NETWORK'} onChange={() => setVia('NETWORK')} /> {tx('Through the GENZ network', 'GENZ नेटवर्क से')}</label>
                  </div>
                  {via === 'NETWORK' && (
                    <select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs" data-testid="closing-pick">
                      <option value="">{cands.length ? tx('— pick the offer / deal room —', '— ऑफ़र / डील रूम चुनें —') : tx('No accepted offer or deal room found', 'कोई स्वीकृत ऑफ़र या डील रूम नहीं मिला')}</option>
                      {cands.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  )}
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input value={soldPrice} onChange={(e) => setSoldPrice(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder={tx('Final price ₹ (private, optional)', 'अंतिम कीमत ₹ (निजी, वैकल्पिक)')} className="rounded-lg border border-slate-300 bg-white p-2 text-xs" />
                    <input value={soldNote} onChange={(e) => setSoldNote(e.target.value)} maxLength={200} placeholder={tx('Note (private, optional)', 'नोट (निजी, वैकल्पिक)')} className="rounded-lg border border-slate-300 bg-white p-2 text-xs" />
                  </div>
                  <p className="mt-2 text-[11px] text-red-800">{tx('Other changes on this screen are not saved while marking it closed. You can undo within 24 hours.', 'बंद दर्ज करते समय इस स्क्रीन के बाकी बदलाव सेव नहीं होंगे। 24 घंटे में इसे वापस कर सकते हैं।')}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Property Type', 'प्रॉपर्टी का प्रकार')}</label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                >
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{label('propertyType', t)}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Transaction Type', 'लेन-देन का प्रकार')}</label>
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="Sale">{label('transactionType', 'Sale')}</option>
                  <option value="Rent">{label('transactionType', 'Rent')}</option>
                  <option value="Lease">{label('transactionType', 'Lease')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Property Title *', 'प्रॉपर्टी का शीर्षक *')}</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tx('e.g. 3 BHK flat, east-facing, near the park', 'जैसे: 3 BHK फ़्लैट, पूर्वमुखी, पार्क के पास')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">{tx('Description', 'विवरण')}</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tx('Highlight key amenities, frontage, road width, vastu orientation...', 'मुख्य सुविधाएँ, फ़्रंटेज, सड़क की चौड़ाई, वास्तु दिशा आदि बताएँ...')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* SECTION 2: Financials & Pricing */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {tx('Financials & Price Revision', 'वित्तीय विवरण और क़ीमत में बदलाव')}
              </h4>
              <span className="text-[11px] text-slate-500">{tx('Live Indian Currency formatting', 'भारतीय मुद्रा फ़ॉर्मेट में')}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Asking Price (₹ INR) *', 'माँगी गई क़ीमत (₹) *')}</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  placeholder="e.g. 15000000"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                />
                <p className="mt-1 text-[11px] font-semibold text-blue-700">
                  {tx('Formatted', 'फ़ॉर्मेट')}: {askingPrice ? formatINR(Number(askingPrice)) : '₹ 0'}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Lock className="h-3 w-3 text-slate-400" />
                  {tx('Owner Net Price (₹ INR - Confidential)', 'मालिक की नेट क़ीमत (₹ - गोपनीय)')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={ownerApprovedNetPrice}
                  onChange={(e) => setOwnerApprovedNetPrice(e.target.value)}
                  placeholder="e.g. 14000000"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-mono text-purple-900 focus:border-blue-500 focus:outline-hidden"
                />
                <p className="mt-1 text-[11px] text-purple-700">
                  {ownerApprovedNetPrice ? formatINR(Number(ownerApprovedNetPrice)) : tx('Optional confidential floor price', 'वैकल्पिक गोपनीय न्यूनतम क़ीमत')}
                </p>
              </div>
            </div>

            {/* Price change reason if asking price modified */}
            {isPriceChanged && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                <label className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                  {tx('Reason for Price Revision (recorded in the audit trail):', 'क़ीमत बदलने का कारण (ऑडिट ट्रेल में दर्ज होगा):')}
                </label>
                <input
                  type="text"
                  value={priceChangeReason}
                  onChange={(e) => setPriceChangeReason(e.target.value)}
                  placeholder={tx('e.g. Owner reduced price for quick closing / Added premium modular kitchen', 'जैसे: जल्दी सौदे के लिए मालिक ने क़ीमत घटाई / प्रीमियम मॉड्यूलर किचन जोड़ा')}
                  className="w-full rounded border border-amber-300 bg-white p-2 text-xs text-slate-900 focus:outline-hidden"
                />
              </div>
            )}
          </div>

          {/* SECTION 3: Location & Dimensions */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {tx('Location, Dimensions & Protected Address', 'लोकेशन, माप और सुरक्षित पता')}
            </h4>

            <LocationFields value={loc} onChange={(v) => setLoc({ ...loc, ...v })} />
            <TagPicker value={tags} onChange={setTags} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Built-Up Area (Sq. Ft.)', 'बिल्ट-अप एरिया (वर्ग फ़ीट)')}</label>
                <input
                  type="number"
                  min={0}
                  value={builtUpAreaSqFt}
                  onChange={(e) => setBuiltUpAreaSqFt(e.target.value)}
                  placeholder="e.g. 2400"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Plot Area (Sq. Ft.)', 'प्लॉट एरिया (वर्ग फ़ीट)')}</label>
                <input
                  type="number"
                  min={0}
                  value={plotAreaSqFt}
                  onChange={(e) => setPlotAreaSqFt(e.target.value)}
                  placeholder="e.g. 1800"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>{tx('Exact Physical Address (Confidential / Protected)', 'सटीक पता (गोपनीय / सुरक्षित)')}</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {tx('Anti-Bypass Protected', 'एंटी-बायपास सुरक्षित')}
                </span>
              </label>
              <input
                type="text"
                required
                value={addressHidden}
                onChange={(e) => setAddressHidden(e.target.value)}
                placeholder={tx('Exact Plot / Survey / Flat number, Wing, Society Name...', 'सटीक प्लॉट / सर्वे / फ़्लैट नंबर, विंग, सोसाइटी का नाम...')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Nearby Landmark', 'नज़दीकी लैंडमार्क')}</label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder={tx('e.g. Opposite Magneto Mall', 'जैसे: मैग्नेटो मॉल के सामने')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>{tx('Google Maps URL', 'गूगल मैप्स लिंक')}</span>
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                    >
                      <span>{tx('Preview', 'प्रीव्यू')}</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </label>
                <input
                  type="url"
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Media Gallery & Upload from Device/Gallery */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-blue-600" />
                <span>{tx('Photos & Media Gallery', 'फ़ोटो और मीडिया गैलरी')} ({images.length} {tx('photos', 'फ़ोटो')})</span>
              </h4>
              <span className="text-[11px] text-slate-500">{tx('First photo is used as Primary Cover', 'पहली फ़ोटो कवर के रूप में इस्तेमाल होती है')}</span>
            </div>

            {/* Current Images Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video shadow-2xs"
                  >
                    <img src={img} alt={`${tx('Photo', 'फ़ोटो')} ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-current" /> {tx('Cover', 'कवर')}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      {idx !== 0 && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryImage(idx)}
                          title={tx('Make Primary Cover', 'मुख्य कवर बनाएँ')}
                          className="p-1 rounded bg-white text-slate-700 hover:text-blue-600 text-[10px] font-semibold"
                        >
                          {tx('Make Cover', 'कवर बनाएँ')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        title={tx('Remove Photo', 'फ़ोटो हटाएँ')}
                        className="p-1 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Photo Upload from Device/Gallery + Add URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Option A: Gallery File Picker */}
              <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-3.5 text-center hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  id="edit-gallery-photos"
                  multiple
                  accept="image/*"
                  onChange={(e) => handlePhotoFiles(e.target.files)}
                  className="hidden"
                />
                <label htmlFor="edit-gallery-photos" className="cursor-pointer block space-y-1">
                  <div className="mx-auto w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Upload className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold text-slate-800">{tx('Upload Photos from Gallery', 'गैलरी से फ़ोटो अपलोड करें')}</p>
                  <p className="text-[11px] text-slate-500">{tx('Pick multiple images from your device', 'अपने डिवाइस से कई फ़ोटो चुनें')}</p>
                </label>
              </div>

              {/* Option B: Add via Direct Image URL */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <label className="text-xs font-semibold text-slate-700">{tx('Add Image by URL', 'URL से फ़ोटो जोड़ें')}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded border border-slate-300 p-1.5 text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800"
                  >
                    {tx('Add', 'जोड़ें')}
                  </button>
                </div>
              </div>
            </div>

            {/* Video Walkthrough Section */}
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Video className="h-4 w-4 text-purple-600" />
                  {tx('Walkthrough Video Tour', 'वॉकथ्रू वीडियो टूर')}
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setVideoSourceMode('URL')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      videoSourceMode === 'URL' ? 'bg-purple-100 text-purple-900' : 'text-slate-500'
                    }`}
                  >
                    {tx('Web Link', 'वेब लिंक')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoSourceMode('GALLERY')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      videoSourceMode === 'GALLERY' ? 'bg-purple-100 text-purple-900' : 'text-slate-500'
                    }`}
                  >
                    {tx('Upload Video', 'वीडियो अपलोड करें')}
                  </button>
                </div>
              </div>

              {videoSourceMode === 'URL' ? (
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or MP4 URL"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 font-mono"
                />
              ) : (
                <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5">
                  <input
                    type="file"
                    id="edit-gallery-video"
                    accept="video/*"
                    onChange={(e) => handleVideoFile(e.target.files)}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="edit-gallery-video"
                      className="cursor-pointer text-xs font-semibold text-purple-900 hover:underline flex items-center gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadedVideoName ? tx(`Replace Video (${uploadedVideoName})`, `वीडियो बदलें (${uploadedVideoName})`) : tx('Select video from device / gallery', 'फ़ोन / गैलरी से वीडियो चुनें')}
                    </label>
                    {videoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoUrl('');
                          setUploadedVideoName('');
                        }}
                        className="text-[11px] text-red-600 hover:underline"
                      >
                        {tx('Remove', 'हटाएँ')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 5: Owner Contact */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {tx('Owner Contact (Protected)', 'मालिक का संपर्क (सुरक्षित)')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Owner Full Name', 'मालिक का पूरा नाम')}</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={tx('e.g. Ramesh Agrawal', 'जैसे: रमेश अग्रवाल')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Owner Mobile Number (10 Digits)', 'मालिक का मोबाइल नंबर (10 अंक)')}</label>
                <input
                  type="tel"
                  required
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="+91 98271 23456"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3.5 bg-slate-50 rounded-b-xl shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {tx('Cancel', 'रद्द करें')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{loading ? tx('Saving Changes...', 'सेव हो रहा है...') : (closing ? (closedWord === 'sold' ? tx('Mark SOLD', 'बिक गई दर्ज करें') : tx('Mark RENTED', 'किराये पर गई दर्ज करें')) : tx('Save & Update Listing', 'सेव करें और लिस्टिंग अपडेट करें'))}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
