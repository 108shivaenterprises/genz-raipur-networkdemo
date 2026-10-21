import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { reportClientError } from '../lib/clientErrors.js';

/** v20 — one broken screen no longer blanks the whole app: the rest (tabs, header) keeps working and the error is reported. */
export class TabErrorBoundary extends React.Component<{ children: React.ReactNode; area: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError({ kind: 'render', area: this.props.area, message: error?.message || String(error), stack: `${error?.stack || ''}\n${info?.componentStack || ''}` });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <TabErrorCard message={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
  }
}

const TabErrorCard: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const tx = useTx();
  const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(message);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 text-amber-600" />{chunk ? tx('This screen could not be downloaded', 'यह स्क्रीन डाउनलोड नहीं हो पाई') : tx('This screen hit a problem', 'इस स्क्रीन में दिक़्क़त आई')}</div>
      <p className="mt-1 text-xs text-amber-900">{chunk
        ? tx('Your internet may be slow or a new version was just released. Try again — your data is safe.', 'इंटरनेट धीमा हो सकता है या नया वर्ज़न अभी आया है। फिर से कोशिश करें — आपका डेटा सुरक्षित है।')
        : tx('The GENZ team has been told automatically. Other tabs keep working; your data is safe.', 'GENZ टीम को अपने-आप ख़बर चली गई है। बाकी टैब चलते रहेंगे; आपका डेटा सुरक्षित है।')}</p>
      {!chunk && message && <p className="mt-2 break-words rounded bg-white/70 p-2 font-mono text-[10px] text-amber-900" data-testid="tab-error-detail">{message.slice(0, 160)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onRetry} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"><RotateCcw className="h-4 w-4" />{tx('Try again', 'फिर से कोशिश करें')}</button>
        <button onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"><RefreshCw className="h-4 w-4" />{tx('Reload app', 'ऐप दोबारा खोलें')}</button>
      </div>
    </div>
  );
};

export const TabLoading: React.FC = () => {
  const tx = useTx();
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />{tx('Opening…', 'खुल रहा है…')}</div>
    </div>
  );
};
