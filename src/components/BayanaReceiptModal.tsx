import React from 'react';
import { X, Printer, ShieldCheck, CheckCircle2, FileText, Building2 } from 'lucide-react';
import { formatINR } from '../lib/utils';
import { numberToIndianWords, numberToHindiWords } from '../lib/indianLegalWords';

export interface BayanaReceiptData {
  receiptNumber: string;
  date: string;
  sellerName: string;
  sellerPhone?: string;
  sellerPan?: string;
  buyerName: string;
  buyerPhone?: string;
  buyerPan?: string;
  propertyTitle: string;
  propertyAddress: string;
  propertyCity: string;
  totalAgreedPrice: number;
  bayanaAmount: number;
  paymentMode: 'CHEQUE' | 'RTGS_NEFT' | 'UPI' | 'DEMAND_DRAFT' | 'CASH';
  paymentReference: string; // Cheque No / UTR / Transaction ID
  bankName?: string;
  balanceDueDate: string;
  brokerName?: string;
  brokerFirm?: string;
  brokerRera?: string;
}

export const BayanaReceiptModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  data: BayanaReceiptData;
}> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const balanceAmount = Math.max(0, data.totalAgreedPrice - data.bayanaAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8">
        {/* Modal Controls - Hidden when printing */}
        <div className="print:hidden flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-base">
              बयाना रसीद / Bayana (Token Money) Agreement & Receipt
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Content */}
        <div id="bayana-document" className="p-8 text-slate-800 text-xs leading-relaxed space-y-6">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Building2 className="w-6 h-6 text-slate-900" />
              <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                GENZ BROKER NETWORK — बयाना रसीद
              </h1>
            </div>
            <p className="text-sm font-bold text-slate-700 uppercase">
              EARNEST MONEY DEPOSIT (BAYANA) RECEIPT & ACKNOWLEDGEMENT
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Executed under Section 10 of the Indian Contract Act, 1872 & RERA Real Estate Guidelines
            </p>
            <div className="mt-3 flex justify-between text-[11px] font-semibold text-slate-600 px-2">
              <span>Receipt Ref: <strong className="text-slate-900">{data.receiptNumber}</strong></span>
              <span>Execution Date: <strong className="text-slate-900">{data.date}</strong></span>
            </div>
          </div>

          {/* Parties Grid */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Seller (विक्रेता / मालिक)</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{data.sellerName}</p>
              {data.sellerPhone && <p className="text-[11px] text-slate-600">Mob: {data.sellerPhone}</p>}
              {data.sellerPan && <p className="text-[11px] text-slate-600">PAN: {data.sellerPan}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Buyer (क्रेता / खरीदार)</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{data.buyerName}</p>
              {data.buyerPhone && <p className="text-[11px] text-slate-600">Mob: {data.buyerPhone}</p>}
              {data.buyerPan && <p className="text-[11px] text-slate-600">PAN: {data.buyerPan}</p>}
            </div>
          </div>

          {/* Property Details */}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
              Property Under Transaction (संपत्ति का विवरण)
            </p>
            <p className="font-bold text-slate-900 text-sm">{data.propertyTitle}</p>
            <p className="text-slate-600 text-xs mt-0.5">{data.propertyAddress}, {data.propertyCity}</p>
          </div>

          {/* Financial Breakdown */}
          <div className="rounded-xl border-2 border-slate-900 p-4 space-y-3 bg-slate-50/50">
            <div className="grid grid-cols-3 gap-2 border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Total Agreed Consideration</span>
                <p className="text-base font-black text-slate-900">{formatINR(data.totalAgreedPrice)}</p>
              </div>
              <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-800 uppercase">Bayana / Token Received</span>
                <p className="text-base font-black text-emerald-900">{formatINR(data.bayanaAmount)}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Balance Payable at ATS/Registry</span>
                <p className="text-base font-black text-slate-900">{formatINR(balanceAmount)}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] text-slate-700">
                <strong>Token Amount in Words:</strong> {numberToIndianWords(data.bayanaAmount)}
              </p>
              <p className="text-[11px] text-slate-600 font-hindi">
                <strong>शब्दों में:</strong> {numberToHindiWords(data.bayanaAmount)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-slate-500">Payment Mode:</span>{' '}
                <strong className="text-slate-900">{data.paymentMode.replace('_', ' / ')}</strong>
              </div>
              <div>
                <span className="text-slate-500">Ref / UTR / Cheque No:</span>{' '}
                <strong className="text-slate-900">{data.paymentReference || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Bank:</span>{' '}
                <strong className="text-slate-900">{data.bankName || 'Direct'}</strong>
              </div>
            </div>
          </div>

          {/* Standard Terms */}
          <div className="space-y-1.5 text-[10px] text-slate-600 border border-slate-200 rounded-xl p-3 bg-white">
            <p className="font-bold text-slate-800 uppercase text-[11px]">Key Terms & Conditions (नियम व शर्तें):</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                <strong>Agreement to Sell (ATS) Deadline:</strong> The balance consideration of {formatINR(balanceAmount)} shall be payable and Agreement to Sell shall be executed on or before <strong>{data.balanceDueDate || 'Within 45 Days'}</strong>.
              </li>
              <li>
                <strong>Clear Title Guarantee:</strong> The Seller warrants and confirms that the said property is free from all encumbrances, bank liens, mortgages, and litigation.
              </li>
              <li>
                <strong>TDS Compliance:</strong> If the total consideration is ₹50 Lakhs or above, 1% TDS under Section 194-IA shall be deducted by the Buyer and remitted via Form 26QB before registry.
              </li>
              <li>
                <strong>Default & Forfeiture Clause:</strong> If the Buyer defaults without legal cause, the token amount shall be liable to forfeiture. If the Seller defaults, the Buyer is entitled to refund with compensation or legal specific performance.
              </li>
            </ol>
          </div>

          {/* Signatures */}
          <div className="pt-6 grid grid-cols-3 gap-4 text-center">
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold text-slate-900 text-xs">{data.sellerName}</p>
              <p className="text-[10px] text-slate-500">Seller's Signature (विक्रेता)</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold text-slate-900 text-xs">{data.buyerName}</p>
              <p className="text-[10px] text-slate-500">Buyer's Signature (क्रेता)</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold text-slate-900 text-xs">{data.brokerName || 'Authorized Broker'}</p>
              <p className="text-[10px] text-slate-500">
                Facilitating Broker {data.brokerRera ? `(RERA: ${data.brokerRera})` : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
