/** v189 — plain words for a commission-agreement status (never the raw enum, e.g. SENT_TO_PARTICIPANTS) */
const EN: Record<string, string> = {
  DRAFT: 'Draft', SENT_TO_PARTICIPANTS: 'Sent — waiting for everyone to approve', ACCEPTED: 'Approved by all', ACTIVE: 'Active', AMENDED: 'Changed', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'In dispute',
};
const HI: Record<string, string> = {
  DRAFT: 'ड्राफ़्ट', SENT_TO_PARTICIPANTS: 'भेजा — सबकी मंज़ूरी का इंतज़ार', ACCEPTED: 'सबने मंज़ूर किया', ACTIVE: 'चालू', AMENDED: 'बदला गया', COMPLETED: 'पूरा', CANCELLED: 'रद्द', DISPUTED: 'विवाद में',
};
export const agreementStatusWord = (status: string | undefined, hi: boolean): string => {
  const s = status || ''; return (hi ? HI : EN)[s] ?? s.replace(/_/g, ' ').toLowerCase();
};
