// ============================================================
// AdPulse - Global TypeScript Types
// ============================================================

import type { Campaign, Client, Alert, Platform, CampaignStatus, AlertType, Severity, SyncStatus } from "@prisma/client";

// Re-export Prisma enums for convenience
export type { Platform, CampaignStatus, AlertType, Severity, SyncStatus };

// ============================================================
// Extended Prisma Types
// ============================================================

export type ClientWithStats = Client & {
  campaigns: Campaign[];
  alerts: Alert[];
  _count: {
    campaigns: number;
    alerts: number;
  };
};

export type CampaignWithClient = Campaign & {
  client: Pick<Client, "id" | "name" | "platform">;
};

export type AlertWithClient = Alert & {
  client: Pick<Client, "id" | "name" | "platform">;
};

// ============================================================
// Dashboard Types
// ============================================================

export interface DashboardStats {
  totalSpend: number;
  totalConversions: number;
  activeCampaigns: number;
  totalClients: number;
  totalImpressions: number;
  totalClicks: number;
  unreadAlerts: number;
  lowBudgetCampaigns: number;
  availableFunds: number;
}

export interface DashboardMetrics {
  stats: DashboardStats;
  spendByPlatform: { platform: Platform; spend: number }[];
  recentAlerts: AlertWithClient[];
  topCampaigns: CampaignWithClient[];
}

// ============================================================
// Chart / Analytics Types
// ============================================================

export interface DailyStatEntry {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface ChartDataPoint {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface SpendByPlatform {
  platform: string;
  spend: number;
  fill: string;
}

// ============================================================
// API Request / Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Client API ----

export interface CreateClientInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  platform: Platform;
  accountId: string;
  accessToken?: string;
  refreshToken?: string;
  notes?: string;
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  isActive?: boolean;
}

// ---- Campaign API ----

export interface CampaignFilters {
  clientId?: string;
  platform?: Platform;
  status?: CampaignStatus;
  search?: string;
}

// ============================================================
// Ads Platform API Integration Types
// ============================================================

// Raw campaign data from any platform (normalized)
export interface RawCampaignData {
  externalId: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ENDED" | "DELETED";
  dailyBudget: number;
  totalBudget: number;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  startDate?: string;
  endDate?: string;
}

// ---- Google Ads types ----

export interface GoogleAdsCampaign {
  campaign: {
    resourceName: string;
    id: string;
    name: string;
    status: string;
    campaignBudget: string;
    startDate: string;
    endDate?: string;
  };
  campaignBudget: {
    amountMicros: string;
    totalAmountMicros?: string;
  };
  metrics: {
    costMicros: string;
    clicks: string;
    impressions: string;
    conversions: string;
    ctr: string;
    averageCpc: string;
    costPerConversion: string;
    conversionsValue: string;
  };
}

// ---- Meta Ads types ----

export interface MetaAdsCampaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time: string;
  stop_time?: string;
  insights?: {
    data: MetaCampaignInsight[];
  };
}

export interface MetaCampaignInsight {
  spend: string;
  clicks: string;
  impressions: string;
  actions?: { action_type: string; value: string }[];
  ctr: string;
  cpc: string;
  cost_per_action_type?: { action_type: string; value: string }[];
}

// ============================================================
// Alert Engine Types
// ============================================================

export interface AlertTriggerContext {
  campaign: Campaign;
  client: Client;
  budgetUsagePct: number;
}

export interface AlertEngineResult {
  alertsCreated: number;
  alerts: { type: AlertType; severity: Severity; message: string }[];
}

// ============================================================
// Navigation Types
// ============================================================

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  badge?: number;
}

// ============================================================
// Form Types
// ============================================================

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface ClientFormValues {
  name: string;
  company: string;
  email: string;
  phone: string;
  whatsappPhone: string;
  platform: Platform;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  notes: string;
}
