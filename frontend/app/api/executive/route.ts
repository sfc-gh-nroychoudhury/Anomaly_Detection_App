import { NextResponse } from 'next/server';
import { runQueryAsObjects } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [kpiRows, dailyTrend, chainDist, modelSignals, topUsers] = await Promise.all([
      // KPIs: users monitored, flagged, critical, avg score, open cases, MTTR
      runQueryAsObjects<{
        USERS_MONITORED: number;
        FLAGGED_USERS: number;
        CRITICAL_ALERTS: number;
        AVG_RISK_SCORE: number;
        OPEN_CASES: number;
        MTTR_HOURS: number | null;
      }>(`
        SELECT
          (SELECT COUNT(DISTINCT USER_NAME) FROM trust_center.anomaly_results) AS USERS_MONITORED,
          (SELECT COUNT(*) FROM trust_center.attack_chains
           WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM trust_center.attack_chains)) AS FLAGGED_USERS,
          (SELECT COUNT(*) FROM trust_center.attack_chains
           WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM trust_center.attack_chains)
             AND SEVERITY = 'CRITICAL') AS CRITICAL_ALERTS,
          (SELECT ROUND(AVG(RISK_SCORE), 1) FROM trust_center.attack_chains
           WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM trust_center.attack_chains)) AS AVG_RISK_SCORE,
          (SELECT COUNT(*) FROM trust_center.cases
           WHERE STATUS IN ('OPEN', 'INVESTIGATING')) AS OPEN_CASES,
          (SELECT ROUND(AVG(TIMESTAMPDIFF('HOUR', CREATED_AT, CLOSED_AT)), 0)
           FROM trust_center.cases WHERE CLOSED_AT IS NOT NULL) AS MTTR_HOURS
      `),

      // 30-day anomaly trend
      runQueryAsObjects<{
        DAY: string;
        ANOMALIES: number;
        USERS_AFFECTED: number;
      }>(`
        SELECT TO_CHAR(TS::DATE, 'YYYY-MM-DD') AS DAY,
               SUM(CASE WHEN IS_ANOMALY AND DISTANCE > 0 THEN 1 ELSE 0 END) AS ANOMALIES,
               COUNT(DISTINCT CASE WHEN IS_ANOMALY AND DISTANCE > 0 THEN USER_NAME END) AS USERS_AFFECTED
        FROM trust_center.anomaly_results
        GROUP BY TS::DATE
        ORDER BY TS::DATE
      `),

      // Attack chain distribution
      runQueryAsObjects<{ CHAIN: string; COUNT: number }>(`
        SELECT ATTACK_CHAIN AS CHAIN, COUNT(*) AS COUNT
        FROM trust_center.attack_chains
        WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM trust_center.attack_chains)
        GROUP BY ATTACK_CHAIN
        ORDER BY COUNT DESC
      `),

      // Model signal heatmap (last 7 days)
      runQueryAsObjects<{ MODEL: string; ANOMALIES: number; AVG_DISTANCE: number }>(`
        SELECT MODEL_NAME AS MODEL,
               COUNT(*) AS ANOMALIES,
               ROUND(AVG(DISTANCE), 1) AS AVG_DISTANCE
        FROM trust_center.anomaly_results
        WHERE IS_ANOMALY = TRUE AND DISTANCE > 0
          AND TS >= DATEADD('DAY', -7, CURRENT_TIMESTAMP())
        GROUP BY MODEL_NAME
        ORDER BY ANOMALIES DESC
      `),

      // Top 5 risky users
      runQueryAsObjects<{
        USER_NAME: string;
        RISK_SCORE: number;
        SEVERITY: string;
        ATTACK_CHAIN: string;
        SIGNAL_COUNT: number;
      }>(`
        SELECT USER_NAME, RISK_SCORE, SEVERITY, ATTACK_CHAIN, SIGNAL_COUNT
        FROM trust_center.attack_chains
        WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM trust_center.attack_chains)
        ORDER BY RISK_SCORE DESC
        LIMIT 5
      `),
    ]);

    const kpi = kpiRows[0] ?? {
      USERS_MONITORED: 0, FLAGGED_USERS: 0, CRITICAL_ALERTS: 0,
      AVG_RISK_SCORE: 0, OPEN_CASES: 0, MTTR_HOURS: null,
    };

    return NextResponse.json({
      kpis: {
        totalUsersMonitored: Number(kpi.USERS_MONITORED) || 0,
        flaggedUsers: Number(kpi.FLAGGED_USERS) || 0,
        criticalAlerts: Number(kpi.CRITICAL_ALERTS) || 0,
        avgRiskScore: Number(kpi.AVG_RISK_SCORE) || 0,
        openCases: Number(kpi.OPEN_CASES) || 0,
        mttrHours: kpi.MTTR_HOURS != null ? Number(kpi.MTTR_HOURS) : null,
      },
      dailyTrend: dailyTrend.map((r) => ({
        day: r.DAY,
        anomalies: Number(r.ANOMALIES) || 0,
        usersAffected: Number(r.USERS_AFFECTED) || 0,
      })),
      chainDistribution: chainDist.map((r) => ({
        chain: r.CHAIN,
        count: Number(r.COUNT) || 0,
      })),
      modelSignals: modelSignals.map((r) => ({
        model: r.MODEL,
        anomalies: Number(r.ANOMALIES) || 0,
        avgDistance: Number(r.AVG_DISTANCE) || 0,
      })),
      topUsers: topUsers.map((r) => ({
        userName: r.USER_NAME,
        riskScore: Number(r.RISK_SCORE) || 0,
        severity: r.SEVERITY,
        attackChain: r.ATTACK_CHAIN,
        signalCount: Number(r.SIGNAL_COUNT) || 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 200 });
  }
}
