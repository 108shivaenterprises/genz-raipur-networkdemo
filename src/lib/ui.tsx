import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';

/* ─────────────────────────────────────────────────────────── */
/*  v114 — Global Toast + Confirm + Prompt modals             */
/*  Replaces every window.alert / confirm / prompt in the app */
/* ─────────────────────────────────────────────────────────── */

// ── Toast types ──────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

// ── Confirm / Prompt state ───────────────────────────────
interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: ((ok: boolean) => void) | null;
}
interface PromptState {
  open: boolean;
  title: string;
  message: string;
  placeholder: string;
  defaultValue: string;
  confirmLabel: string;
  cancelLabel: string;
  required: boolean;
  resolve: ((val: string | null) => void) | null;
}

// ── Context ──────────────────────────────────────────────
interface UICtx {
  toast: (msg: string, type?: ToastType, duration?: number) => void;
  confirm: (title: string, message?: string, opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (title: string, opts?: { message?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string; cancelLabel?: string; required?: boolean }) => Promise<string | null>;
}

const UIContext = createContext<UICtx>({
  toast: () => {},
  confirm: () => Promise.resolve(false),
  prompt: () => Promise.resolve(null),
});

export const useUI = () => useContext(UIContext);

// ── Provider ─────────────────────────────────────────────
let nextId = 0;
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<ConfirmState>({ open: false, title: '', message: '', confirmLabel: 'OK', cancelLabel: 'Cancel', danger: false, resolve: null });
  const [promptState, setPrompt] = useState<PromptState>({ open: false, title: '', message: '', placeholder: '', defaultValue: '', confirmLabel: 'OK', cancelLabel: 'Cancel', required: false, resolve: null });

  const toast = useCallback((msg: string, type: ToastType = 'info', duration = 3500) => {
    const id = ++nextId;
    setToasts(prev => [...prev.slice(-4), { id, type, message: msg, duration }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const confirm = useCallback((title: string, message = '', opts: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirm({ open: true, title, message, confirmLabel: opts.confirmLabel || 'OK', cancelLabel: opts.cancelLabel || 'Cancel', danger: opts.danger || false, resolve });
    });
  }, []);

  const prompt = useCallback((title: string, opts: { message?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string; cancelLabel?: string; required?: boolean } = {}): Promise<string | null> => {
    return new Promise(resolve => {
      setPrompt({ open: true, title, message: opts.message || '', placeholder: opts.placeholder || '', defaultValue: opts.defaultValue || '', confirmLabel: opts.confirmLabel || 'OK', cancelLabel: opts.cancelLabel || 'Cancel', required: opts.required || false, resolve });
    });
  }, []);

  const resolveConfirm = useCallback((ok: boolean) => {
    confirmState.resolve?.(ok);
    setConfirm(prev => ({ ...prev, open: false, resolve: null }));
  }, [confirmState]);

  const resolvePrompt = useCallback((val: string | null) => {
    promptState.resolve?.(val);
    setPrompt(prev => ({ ...prev, open: false, resolve: null }));
  }, [promptState]);

  return (
    <UIContext.Provider value={{ toast, confirm, prompt }}>
      {children}
      {/* ── Toasts ── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex flex-col items-center gap-2 p-4" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-2 ${toastStyles[t.type]}`} role="alert">
            {toastIcons[t.type]}
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {/* ── Confirm modal ── */}
      {confirmState.open && (
        <ModalBackdrop onClose={() => resolveConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label={confirmState.title}>
            <h3 className="text-base font-bold text-slate-900">{confirmState.title}</h3>
            {confirmState.message && <p className="mt-2 text-sm text-slate-600">{confirmState.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => resolveConfirm(false)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{confirmState.cancelLabel}</button>
              <button onClick={() => resolveConfirm(true)} className={`min-h-11 rounded-lg px-4 text-sm font-bold text-white ${confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{confirmState.confirmLabel}</button>
            </div>
          </div>
        </ModalBackdrop>
      )}
      {/* ── Prompt modal ── */}
      {promptState.open && <PromptModal state={promptState} resolve={resolvePrompt} />}
    </UIContext.Provider>
  );
};

// ── Prompt modal (separate to manage its own input state) ─
const PromptModal: React.FC<{ state: PromptState; resolve: (v: string | null) => void }> = ({ state, resolve }) => {
  const [val, setVal] = useState(state.defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => { if (state.required && !val.trim()) return; resolve(val); };
  return (
    <ModalBackdrop onClose={() => resolve(null)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label={state.title}>
        <h3 className="text-base font-bold text-slate-900">{state.title}</h3>
        {state.message && <p className="mt-2 text-sm text-slate-600">{state.message}</p>}
        <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={state.placeholder} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500" />
        {state.required && !val.trim() && <p className="mt-1 text-xs text-red-500">This field is required</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => resolve(null)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{state.cancelLabel}</button>
          <button onClick={submit} disabled={state.required && !val.trim()} className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40">{state.confirmLabel}</button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// ── Shared modal backdrop ────────────────────────────────
const ModalBackdrop: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div ref={ref} className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={e => { if (e.target === ref.current) onClose(); }}>
      {children}
    </div>
  );
};

// ── Toast look-up tables ─────────────────────────────────
const toastStyles: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50/95 text-emerald-900',
  error: 'border-red-200 bg-red-50/95 text-red-900',
  warning: 'border-amber-200 bg-amber-50/95 text-amber-900',
  info: 'border-sky-200 bg-sky-50/95 text-sky-900',
};
const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />,
  error: <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />,
  warning: <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />,
  info: <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />,
};

// ── CSS animation (inject once) ──────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('genz-ui-anim')) {
  const style = document.createElement('style');
  style.id = 'genz-ui-anim';
  style.textContent = `
    @keyframes slide-in-from-top-2 { from { transform: translateY(-0.5rem); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .animate-in.slide-in-from-top-2 { animation: slide-in-from-top-2 0.2s ease-out; }
  `;
  document.head.appendChild(style);
}

