import type { MaterialIcons } from '@expo/vector-icons';
import type { ExtractedBill } from '@/modules/sms/extractor/billExtractor';
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

export interface TargetAppConfig {
  packageName: string;
  name: string;
  category: 'upi' | 'banking';
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
  | { type: 'BILL'; bill: ExtractedBill }
  | { type: 'IGNORED'; reason: string };

