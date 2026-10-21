import { TabType } from '../components/NavigationTabs.js';

export type NotificationType =
  | 'OFFER_RECEIVED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_COUNTERED'
  | 'OFFER_REJECTED'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_VERIFIED'
  | 'DEAL_STAGE_CHANGED'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO string
  isRead: boolean;
  targetTab?: TabType;
  dealId?: string;
  propertyId?: string;
  offerId?: string;
  metadata?: {
    brokerName?: string;
    propertyTitle?: string;
    customerName?: string;
    splitPct?: string;
    otpCode?: string;
    verificationMethod?: string;
  };
}

export interface ToastItem {
  id: string;
  type: 'offer' | 'visit' | 'deal' | 'info';
  title: string;
  message: string;
  timestamp: number;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}
