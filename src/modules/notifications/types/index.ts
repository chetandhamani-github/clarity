import type { MaterialIcons } from '@expo/vector-icons';
import type { ExtractedBill } from '../services/notificationBillExtractor';
import type { ParsedTransaction } from '@/modules/sms/types';

export interface RawNotificationPayload {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText?: string;
  subText?: string;
  postTime: number;
}

export type NotificationPermissionStatus = 'granted' | 'denied' | 'unavailable';

export interface NotificationListenerHealth {
  isPermissionGranted: boolean;
  isServiceConnected: boolean;
  isBatteryOptimizationIgnored: boolean;
  pendingCount: number;
  lastEventAt?: number;
  lastEventApp?: string;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
}

export type TargetAppRole = 'bank' | 'upi' | 'hybrid';

export interface TargetAppConfig {
  packageName: string;
  name: string;
  category: 'upi' | 'banking';
  appRole?: TargetAppRole;
  institution?: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  enabled: boolean;
}

export interface NotificationSettingsState {
  isEnabled: boolean;
  parseTransactions: boolean;
  parseBills: boolean;
  enabledPackages: string[];
}

export type NotificationParseResult =
  | { type: 'TRANSACTION'; transaction: ParsedTransaction; isDuplicate: boolean }
  | { type: 'BILL'; bill: ExtractedBill; isNew?: boolean; billId?: string }
  | { type: 'IGNORED'; reason: string };

