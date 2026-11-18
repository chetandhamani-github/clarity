export type DevicePlatform = 'android' | 'ios' | 'web';

export type BackendDeviceStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED';

export interface DeviceRegistrationPayload {
  installationId: string;
  platform: string;
  appVersion: string;
  buildNumber?: string;
  deviceModel?: string;
  deviceName?: string;
}

export interface DeviceRegistrationResponse {
  success: boolean;
  deviceId?: string;
}

export interface DeviceStatusResponse {
  status: BackendDeviceStatus;
}

export interface DeviceStatusResult {
  allowed: boolean;
  blocked: boolean;
  maintenanceMode: boolean;
  forceUpdate: boolean;
  minimumVersion: string;
  status?: BackendDeviceStatus;
}

export interface RemoteConfig {
  minVersion: string;
  latestVersion: string;
  maintenanceMode: boolean;
}

export interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  description?: string;
}

export type FeatureFlagsMap = Record<string, boolean>;

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

export interface SplitSyncPayload {
  installationId: string;
  lastSyncedAt?: string | null;
  people: Array<{
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
    avatarUrl?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  debts: Array<{
    id: string;
    personId?: string;
    friendEmail?: string;
    amount?: number;
    type?: string;
    description?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  settlements: Array<{
    id: string;
    personId?: string;
    friendEmail?: string;
    amount?: number;
    settlementType?: string;
    description?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

export interface SplitSyncResponse {
  success: boolean;
  syncedAt: string;
  people: Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    avatarUrl?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  debts: Array<{
    id: string;
    personId: string;
    friendEmail?: string;
    amount: number;
    type: string;
    description: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  settlements: Array<{
    id: string;
    personId: string;
    friendEmail?: string;
    amount: number;
    settlementType?: string;
    description?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  confirmedIds: string[];
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface GoogleAuthPayload {
  idToken: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface AiCategorizePayload {
  merchant: string;
  amount?: number;
  note?: string;
}

export interface AiCategorizeResult {
  category: string;
  confidence: number;
  suggestedBudgetBucket: 'needs' | 'wants' | 'savings';
  isRecurringSubscription: boolean;
  cleanMerchant: string;
}

export interface ReceiptItemResult {
  name: string;
  amount: number;
  category: string;
  quantity?: number;
}

export interface ReceiptScanPayload {
  imageBase64?: string;
  mimeType?: string;
  rawText?: string;
}

export interface ReceiptScanResult {
  merchant: string;
  date: string;
  totalAmount: number;
  taxAmount: number;
  category: string;
  items: ReceiptItemResult[];
  confidence: number;
}

export interface AiChatPayload {
  message: string;
  financialContextSummary?: string;
}

export interface AiChatResult {
  reply: string;
  suggestedAction?: string;
}

export interface MonthlyDigestPayload {
  month: number;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  topCategories?: string[];
  needsPercent?: number;
  wantsPercent?: number;
  savingsPercent?: number;
}

export interface MonthlyDigestResult {
  headline: string;
  savingsAssessment: string;
  insights: string[];
  actionableTips: string[];
  financialHealthScore: number;
}

export interface VoiceParsePayload {
  transcript: string;
  availableAccounts?: string[];
}

export interface VoiceParseResult {
  merchant: string;
  amount: number;
  category: string;
  account?: string;
  type?: 'expense' | 'income' | 'transfer';
  note?: string;
  confidence: number;
}



