// lib/types.ts -- shared types across pages and API routes.

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AttackChainRow {
  RUN_ID: string;
  RUN_TIMESTAMP: string;
  USER_NAME: string;
  RISK_SCORE: number;
  SEVERITY: Severity;
  SIGNAL_COUNT: number;
  SIGNALS: string[];
  ATTACK_CHAIN: string;
  TIMELINE: string;
  ANOMALY_DETAILS: Array<{
    model: string;
    timestamp: string;
    actual: number;
    forecast: number;
    distance: number;
  }>;
}

export interface AnomalyResultRow {
  RUN_ID: string;
  MODEL_NAME: string;
  USER_NAME: string;
  TS: string;
  METRIC_VALUE: number;
  FORECAST: number;
  LOWER_BOUND: number;
  UPPER_BOUND: number;
  IS_ANOMALY: boolean;
  PERCENTILE: number;
  DISTANCE: number;
}

export interface SetupCheck {
  id: string;
  label: string;
  status: 'ok' | 'pending' | 'error';
  detail?: string;
  sql?: string;
  downloadUrl?: string;
  missingPlaceholders?: string[];
}

export interface ScanExclusion {
  ENTITY_NAME: string;
  ENTITY_TYPE: string;
  REASON: string | null;
  APPROVED_BY: string | null;
  APPROVED_ON: string;
  EXPIRES_ON: string | null;
}

export type CaseStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface CaseRow {
  CASE_ID: string;
  USER_NAME: string;
  ATTACK_CHAIN: string | null;
  SEVERITY: Severity | null;
  STATUS: CaseStatus;
  PRIORITY: CasePriority;
  ASSIGNED_TO: string | null;
  SUMMARY: string | null;
  CREATED_AT: string;
  UPDATED_AT: string;
  CLOSED_AT: string | null;
}

export interface CaseNoteRow {
  NOTE_ID: string;
  CASE_ID: string;
  AUTHOR: string | null;
  NOTE: string;
  CREATED_AT: string;
}

export interface ResponseActionRow {
  ACTION_ID: string;
  CASE_ID: string | null;
  USER_NAME: string;
  ACTION_TYPE: string;
  TIER: 'A' | 'B';
  STATUS: string;
  SCRIPT_TEXT: string | null;
  CREATED_BY: string | null;
  CREATED_AT: string;
}

export interface PeerComparisonRow {
  MODEL_NAME: string;
  USER_VALUE: number;
  PEER_AVG: number;
  PEER_P95: number;
  PEER_MAX: number;
}

export interface DriftSeriesRow {
  MODEL_NAME: string;
  TS: string;
  METRIC_VALUE: number;
  FORECAST: number;
  LOWER_BOUND: number;
  UPPER_BOUND: number;
  IS_ANOMALY: boolean;
}
