# ML Behavioral Anomaly Detection — 10x Feature Roadmap & Revenue Strategy

## Executive Summary

The ML Behavioral Anomaly Detection Native App is a **Trust Center Extension** that monitors 20 Snowflake usage metrics per user via `SNOWFLAKE.ML.ANOMALY_DETECTION`, correlates anomalies into attack chains, and provides a full investigation + case management UI powered by Cortex AI. It runs entirely inside the customer's Snowflake account — no data leaves.

**Current state**: Strong core — 20 ML models, attack chain classification, risk scoring, Cortex AI narratives, case management, peer comparison, drift analysis, tiered response actions. Solid for a hackathon demo.

**The gap**: The app monitors *one account* in isolation. Real security teams need cross-account visibility, automated response, integrations with their SIEM/SOAR stack, compliance evidence, and continuous tuning. The features below close that gap and turn this into a **production-grade UEBA platform** that drives Snowflake consumption.

---

## Part 1: What We Have Today

### 20 ML Models (Organized by Kill Chain Phase)

| # | Model | Metric | MITRE ATT&CK Phase | Snowflake Source |
|---|---|---|---|---|
| 1 | `ad_login_count` | Successful logins/day | Initial Access | LOGIN_HISTORY |
| 2 | `ad_failed_auth` | Failed logins/day | Credential Access | LOGIN_HISTORY |
| 3 | `ad_distinct_ips` | Unique source IPs/day | Initial Access | LOGIN_HISTORY |
| 4 | `ad_client_diversity` | Unique client types/day | Defense Evasion | LOGIN_HISTORY |
| 5 | `ad_query_volume` | Queries/day | Discovery | QUERY_HISTORY |
| 6 | `ad_bytes_scanned` | Bytes scanned/day | Collection | QUERY_HISTORY |
| 7 | `ad_bytes_to_result` | Bytes to result/day | Exfiltration | QUERY_HISTORY |
| 8 | `ad_rows_unloaded` | Rows unloaded (COPY INTO)/day | Exfiltration | QUERY_HISTORY |
| 9 | `ad_network_egress` | Network bytes sent/day | Exfiltration | QUERY_HISTORY |
| 10 | `ad_db_breadth` | Distinct databases/day | Discovery | QUERY_HISTORY |
| 11 | `ad_table_breadth` | Distinct tables accessed/day | Discovery | ACCESS_HISTORY |
| 12 | `ad_failed_queries` | Failed queries/day | Discovery | QUERY_HISTORY |
| 13 | `ad_role_usage` | Distinct roles used/day | Privilege Escalation | QUERY_HISTORY |
| 14 | `ad_ddl_operations` | DDL/DCL statements/day | Persistence | QUERY_HISTORY |
| 15 | `ad_grant_operations` | GRANT/REVOKE count/day | Privilege Escalation | QUERY_HISTORY |
| 16 | `ad_data_staging` | CTAS operations/day | Collection | QUERY_HISTORY |
| 17 | `ad_outbound_transfer` | Outbound transfer bytes/day | Exfiltration | QUERY_HISTORY |
| 18 | `ad_ext_function_calls` | External function calls/day | Command & Control | QUERY_HISTORY |
| 19 | `ad_warehouse_credits` | Credits used/day (per WH) | Impact | WAREHOUSE_METERING_HISTORY |
| 20 | `ad_warehouse_queries` | Queries/day (per WH) | Impact | QUERY_HISTORY |

### 9 Attack Chain Classifications

| Chain | Required Signal Categories | Real-World Mapping |
|---|---|---|
| `credential_theft_exfiltration` | Exfiltration + Authentication | Stolen creds → data theft |
| `insider_data_theft` | Exfiltration + Reconnaissance | Employee browsing then stealing |
| `privilege_escalation_attack` | Priv Escalation + Reconnaissance | Recon then escalate |
| `account_takeover` | Authentication + 3+ signals | Brute force / credential stuffing |
| `data_exfiltration` | Exfiltration alone | Pure data theft |
| `privilege_abuse` | Priv Escalation alone | Unauthorized role changes |
| `reconnaissance_activity` | Reconnaissance alone | Schema/data enumeration |
| `resource_hijacking` | Resource Abuse alone | Cryptomining / warehouse abuse |
| `behavioral_anomaly` | Fallback | Unclassified anomaly |

### Risk Scoring Formula

```
risk_score = CLAMP(0, 100,
    (raw_score / 10)              -- sum of model base_severity_scores (20-50 each)
  + (min(max_distance, 10) * 3)   -- anomaly magnitude (up to 30 points)
  + (signal_count * 8)            -- breadth (up to 160 for all 20)
)
```

### Cortex AI Integration (4 endpoints)

1. **Streaming narrative** — Token-by-token SSE via Cortex REST API (mistral-large2)
2. **Explain anomaly** — SQL proc, structured security narrative
3. **Remediation steps** — Generates specific SQL commands to remediate
4. **Activity summary** — Summarizes user's top queries and flags suspicious patterns

### Case Management

- Full lifecycle: OPEN → INVESTIGATING → RESOLVED | DISMISSED
- Priority levels: LOW / MEDIUM / HIGH / URGENT
- Case notes (audit trail)
- Response actions:
  - **Tier A** (app executes): Exclude user, Resolve case
  - **Tier B** (generates SQL): Disable user, Force password reset, Revoke roles

---

## Part 2: 10x Features — What Makes This a Platform

### Category A: Immediate High-Impact (Demo-Ready in Days)

---

#### A1. Real-Time Alert Pipeline with Snowflake Alerts

**What**: Replace the 6-hour batch detection with near-real-time alerting using Snowflake ALERT objects that fire when new anomalies breach thresholds.

**Why it matters**: Security teams can't wait 6 hours. A 5-minute detection window changes this from "forensic review" to "active threat response."

**Implementation**:
```sql
CREATE ALERT anomaly_alert
  WAREHOUSE = ml_anomaly_wh
  SCHEDULE = '5 MINUTE'
  IF (EXISTS (
    SELECT 1 FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
    WHERE is_anomaly = TRUE AND distance > 5
  ))
  THEN
    CALL trust_center.handle_critical_alert();
```

**Revenue driver**: Increases warehouse compute usage (5-min alert cadence vs 6-hour), justifies dedicated always-on warehouse.

---

#### A2. Email & Slack Notifications via Notification Integrations

**What**: Push critical alerts to email, Slack, PagerDuty, or webhook endpoints using Snowflake notification integrations.

**Why it matters**: Security teams live in Slack/Teams/PagerDuty, not in a dashboard. Proactive push notifications are table stakes for any security product.

**Implementation**:
- `CREATE NOTIFICATION INTEGRATION` for email/webhook
- Alert handler proc formats finding as structured JSON
- Configurable thresholds per notification channel (e.g., only CRITICAL to PagerDuty)

**Revenue driver**: Drives adoption of Snowflake notification integrations (a newer feature with low current adoption).

---

#### A3. SIEM/SOAR Export — Structured Findings Feed

**What**: Expose a `trust_center.findings_feed` view in **OCSF (Open Cybersecurity Schema Framework)** format that customers can query from Splunk, Sentinel, CrowdStrike, or any SIEM via Snowflake connectors.

**Why it matters**: No SOC will adopt a tool that doesn't integrate with their existing stack. OCSF is the emerging standard (Amazon, Splunk, IBM, CrowdStrike all back it). Being OCSF-native is a massive differentiator.

**Schema mapping**:
| OCSF Field | Source |
|---|---|
| `activity_id` | `run_id` |
| `category_uid` | 2 (Findings) |
| `class_uid` | 2004 (Detection Finding) |
| `severity_id` | risk_score mapped to 1-6 |
| `finding.title` | attack_chain display name |
| `finding.types[]` | signal model names |
| `resources[].uid` | user_name |
| `evidences[]` | anomaly_details array |

**Revenue driver**: Justifies Snowflake as the data lakehouse for security telemetry. Customers who send SIEM data TO Snowflake for this app will store petabytes.

---

#### A4. Automated Response Actions (Tier A+)

**What**: Extend Tier A actions to execute real security responses using `EXECUTE IMMEDIATE` and elevated privileges:
- **Auto-disable user** when risk_score >= 95 (configurable threshold)
- **Auto-revoke non-default roles** when privilege escalation detected
- **Auto-enforce MFA** via `ALTER USER ... SET MINS_TO_BYPASS_MFA = 0`
- **Network policy quarantine** — create and apply a restrictive network policy

**Why it matters**: Mean-time-to-respond (MTTR) is the #1 metric for SOC teams. Auto-response drops MTTR from hours to seconds.

**Revenue driver**: Customers will buy dedicated warehouses for the response pipeline. Auto-response is a premium feature that justifies higher pricing tiers.

---

#### A5. Executive Risk Dashboard with Trend Sparklines

**What**: Add a top-level summary view showing:
- Risk score trend (7/30/90 day sparklines per user)
- Attack chain frequency heatmap (chain type × week)
- Mean time to resolution (MTTR) across cases
- Signal coverage map (which models fire most often)
- Anomaly volume trend (is the org getting safer or riskier?)

**Why it matters**: CISOs don't investigate individual users — they need posture trends. This is the view that sells the product to executives.

**Revenue driver**: Executive visibility drives enterprise-wide rollout decisions. A CISO dashboard is the difference between a POC and an enterprise deal.

---

### Category B: Strategic Differentiators (1-2 Sprint Efforts)

---

#### B1. Multi-Account Organization-Wide Detection

**What**: Use Snowflake's organization data sharing to aggregate anomaly results across all accounts in an org. A central "Security Hub" account installs the app and correlates findings from every child account.

**Architecture**:
```
Account A (production)  ──┐
Account B (staging)     ──┤── Org listing ──▶ Security Hub Account
Account C (analytics)   ──┘                  (app installed here)
```

**Why it matters**: Enterprise customers have 10-100+ Snowflake accounts. Lateral movement across accounts is a real attack vector that single-account monitoring misses entirely.

**Revenue driver**: Forces adoption of Snowflake Organizations, org listings, and cross-account data sharing — all strategic Snowflake features. Multiplies the app's footprint by account count.

---

#### B2. Custom Model Builder — Bring Your Own Metric

**What**: Let customers define custom anomaly detection models by writing a SQL query that produces `(user_name, ts, metric_value)` tuples. The app trains an `ANOMALY_DETECTION` model on their custom metric and integrates it into the correlation engine.

**Examples**:
- "Queries accessing PII-tagged columns per user per day"
- "Cross-region data transfers per user per day"
- "Service account usage outside business hours"
- "Queries touching GDPR-tagged schemas"

**Why it matters**: Every organization has unique data access patterns. Generic models catch generic attacks. Custom models catch the attacks specific to *their* data.

**Revenue driver**: Custom models mean custom training runs = more ML compute. Also makes the app stickier — once customers define their models, switching cost is high.

---

#### B3. Compliance Evidence Pack — SOC2 / HIPAA / PCI-DSS

**What**: Generate compliance evidence documents that map detection findings to specific compliance controls:

| Framework | Control | Evidence from App |
|---|---|---|
| SOC2 CC6.1 | Logical access security | Login anomaly detection, failed auth monitoring |
| SOC2 CC7.2 | System monitoring | 20-model continuous monitoring, alert pipeline |
| HIPAA 164.312(b) | Audit controls | Full case management audit trail |
| PCI-DSS 10.6 | Log review | Automated anomaly detection on access logs |
| PCI-DSS 10.7 | Log retention | 90-day model training window + result history |

**Export**: PDF report with finding summaries, remediation evidence (case notes + response actions), model coverage matrix, and attestation-ready language.

**Why it matters**: Auditors love structured evidence. If the app produces audit-ready reports, it becomes *required* infrastructure — not optional tooling.

**Revenue driver**: Compliance is non-negotiable. Customers will pay premium pricing for audit evidence generation. Also drives Snowflake adoption in regulated industries (healthcare, finance).

---

#### B4. Cortex Fine-Tuned Security Analyst

**What**: Fine-tune a Cortex model on security investigation patterns:
- Train on (anomaly signals → analyst narrative) pairs
- Train on (attack chain + signals → remediation steps) pairs
- Train on (user activity → threat classification) pairs

Use `SNOWFLAKE.CORTEX.FINETUNE()` with the cases + notes + response actions as training data — this is a self-improving system where every investigation makes the AI smarter.

**Why it matters**: Generic LLMs produce generic security narratives. A model fine-tuned on *actual SOC analyst decisions* produces expert-level analysis.

**Revenue driver**: Cortex compute (fine-tuning + inference). Positions Snowflake Cortex as a platform for domain-specific AI, not just general-purpose LLM wrappers.

---

#### B5. Behavioral Risk Score for Data Governance Integration

**What**: Publish a `RISK_SCORE_FEED` view that other Snowflake features can consume:

- **Row Access Policies**: Dynamically restrict access to sensitive data when a user's risk score exceeds a threshold
- **Masking Policies**: Auto-mask PII columns for high-risk users
- **Data Quality DMFs**: Monitor risk score trends as a data metric function

```sql
-- Example: Dynamic row access based on risk score
CREATE ROW ACCESS POLICY risk_aware_access AS (user VARCHAR)
  RETURNS BOOLEAN ->
  CURRENT_ROLE() IN ('SECURITYADMIN', 'ACCOUNTADMIN')
  OR (SELECT risk_score FROM ml_anomaly_app.trust_center.attack_chains
      WHERE user_name = user
      AND run_timestamp = (SELECT MAX(run_timestamp) FROM ...)) < 80;
```

**Why it matters**: This transforms the app from a "detection dashboard" into an **active data governance control**. Risk-aware access policies are the holy grail of zero-trust data security.

**Revenue driver**: Deep integration with Snowflake governance features makes the app essential infrastructure. Drives adoption of masking policies, row access policies, and tags.

---

#### B6. Threat Intelligence Enrichment

**What**: Integrate external threat intelligence feeds (available on Snowflake Marketplace) to enrich anomaly findings:

- **IP reputation**: Cross-reference `ad_distinct_ips` anomalies with known-malicious IP lists
- **Geo-location**: Flag impossible travel (login from NYC at 9am, Tokyo at 9:05am)
- **Tor exit nodes**: Flag logins from Tor/VPN exit nodes
- **Compromised credentials**: Cross-reference with Have I Been Pwned datasets

**Data sources** (all available on Snowflake Marketplace):
- SecurityScorecard IP Reputation
- IPinfo Geolocation
- Cybersixgill Threat Intelligence
- GreyNoise Internet Noise

**Why it matters**: Behavioral anomalies + threat intelligence = high-confidence detections. A spike in failed logins from a known-malicious IP is much higher priority than the same spike from a corporate VPN.

**Revenue driver**: Drives Snowflake Marketplace consumption (listing revenue for providers, consumption credits for customers). Creates an ecosystem play.

---

### Category C: Platform Plays (Longer-Term, Strategic)

---

#### C1. Snowflake-Native SOAR Playbooks

**What**: Build an automated playbook engine using Snowflake Tasks + Streams:

```
Detection → Stream → Playbook Task → Conditional Actions → Notification
```

Example playbook: "When credential_theft_exfiltration detected with score >= 90":
1. Auto-create case (priority: URGENT)
2. Auto-disable user
3. Generate forensic evidence pack (last 24h of query history)
4. Send Slack alert to #security-incidents
5. Create Jira ticket via external function

**Why it matters**: Turns the app from a detection tool into a full **SOAR platform** (Security Orchestration, Automation and Response). Competes with Splunk SOAR, Palo Alto XSOAR, Tines.

**Revenue driver**: Playbooks run on Snowflake compute. Complex playbooks with external function calls and multi-step tasks generate significant warehouse usage.

---

#### C2. Snowflake Marketplace Listing — Monetization

**What**: Publish as a paid Snowflake Marketplace listing with tiered pricing:

| Tier | Price | Features |
|---|---|---|
| **Community** | Free | 5 ML models, dashboard, basic alerts |
| **Professional** | $2,000/mo | All 20 models, Cortex AI narratives, case management |
| **Enterprise** | $5,000/mo | Multi-account, custom models, SOAR playbooks, compliance packs |

**Revenue model**:
- **Listing revenue**: Direct monetization via Marketplace
- **Compute revenue**: Customer's warehouse runs the models (training + detection + alerting)
- **Cortex revenue**: Every AI narrative, remediation, and summary is a Cortex inference call
- **Storage revenue**: Historical anomaly results, case data, audit trails

**Conservative estimate** per customer:
| Component | Monthly Credits |
|---|---|
| ML model training (20 models, weekly) | ~200 credits |
| Detection runs (every 6 hours) | ~100 credits |
| Alert pipeline (5-min cadence) | ~300 credits |
| Cortex AI inference (investigations) | ~50 credits |
| Storage (results + cases + audit) | ~20 credits |
| **Total per customer** | **~670 credits/mo** |

At $3/credit, that's **~$2,000/month in Snowflake consumption per customer**, on top of the listing price.

---

#### C3. Federated Learning Across Customers (Privacy-Preserving)

**What**: Use differential privacy techniques to share anonymized anomaly patterns across customers without exposing individual data:

- Customer A detects a new attack pattern → anonymized pattern shared to central model
- All customers benefit from the collective intelligence
- No raw data leaves any customer's account

**Why it matters**: The #1 advantage large security vendors have is telemetry volume. Federated learning gives Snowflake's platform the same advantage without compromising privacy.

**Revenue driver**: Network effects — each new customer makes the product better for all customers, creating a defensible moat.

---

#### C4. Trust Center Deep Integration

**What**: The app already implements the Trust Center scanner callback interface. Deeper integration means:

- **Trust Center dashboard tiles**: Risk score and attack chain summary visible directly in Trust Center UI
- **Trust Center findings → Snowflake alerts**: Automatic notification when new findings are created
- **Trust Center scanner scheduling**: Let Trust Center manage the scan cadence (already partially implemented)
- **Cross-scanner correlation**: Combine ML anomaly findings with other Trust Center scanners (CIS Benchmark, Threat Intelligence, Security Essentials)

**Why it matters**: Trust Center is Snowflake's strategic security play. Deep integration makes this app a first-class citizen of the security ecosystem.

**Revenue driver**: Increases Trust Center adoption (strategic metric for Snowflake). Customers who use Trust Center deeply are more likely to adopt other security features.

---

## Part 3: Revenue Impact Analysis

### Direct Revenue Streams

| Stream | Revenue per Customer/Month | At 100 Customers | At 1,000 Customers |
|---|---|---|---|
| Marketplace listing fee | $2,000 - $5,000 | $200K - $500K | $2M - $5M |
| Compute (ML + alerts) | ~$2,000 (670 credits) | $200K | $2M |
| Cortex AI inference | ~$150 (50 credits) | $15K | $150K |
| Storage | ~$60 (20 credits) | $6K | $60K |
| **Total ARR** | | **$420K - $720K** | **$4.2M - $7.2M** |

### Strategic Revenue Multipliers

| Multiplier | Mechanism | Estimated Impact |
|---|---|---|
| Multi-account rollout | Customers deploy across all accounts | 5-20x per customer |
| Marketplace data purchases | Threat intel feeds from Marketplace | +$500-2,000/mo per customer |
| Org listing adoption | Security Hub drives org-level features | Justifies premium org pricing |
| Snowflake security positioning | "Snowflake is your security data lake" | New customer acquisition |
| Trust Center adoption | Deep integration drives TC usage | Strategic metric acceleration |

### Competitive Positioning

| Competitor | Price | Deployment | Data Residency | Snowflake-Native |
|---|---|---|---|---|
| **This App** | $2-5K/mo | In-account | Zero data movement | Yes |
| Splunk UBA | $50-200K/yr | SaaS/On-prem | Data exported to Splunk | No |
| Microsoft Sentinel UEBA | $2.46/GB ingested | Azure | Data in Azure | No |
| Exabeam | $50-150K/yr | SaaS | Data exported | No |
| Securonix | Custom | SaaS/On-prem | Varies | No |

**Key differentiator**: Zero data movement. The data never leaves Snowflake. For customers in regulated industries (healthcare, finance, government), this is a dealbreaker advantage.

---

## Part 4: Implementation Priority Matrix

| Priority | Feature | Effort | Impact | Revenue |
|---|---|---|---|---|
| **P0** | A5. Executive Dashboard | 2-3 days | High (sells to CISOs) | Indirect |
| **P0** | A2. Email/Slack Notifications | 2-3 days | Critical (table stakes) | Low direct |
| **P0** | A3. SIEM/SOAR Export (OCSF) | 3-5 days | Very High (integration) | High |
| **P1** | A1. Real-Time Alert Pipeline | 3-5 days | High (detection speed) | Medium |
| **P1** | A4. Automated Response Actions | 3-5 days | High (MTTR reduction) | Medium |
| **P1** | C2. Marketplace Listing | 5-7 days | Critical (monetization) | Very High |
| **P2** | B1. Multi-Account Detection | 2-3 weeks | Very High (enterprise) | Very High |
| **P2** | B2. Custom Model Builder | 1-2 weeks | High (stickiness) | High |
| **P2** | B3. Compliance Evidence Pack | 1-2 weeks | High (regulated industries) | High |
| **P2** | B5. Risk-Aware Governance | 1-2 weeks | Very High (platform play) | Very High |
| **P3** | B4. Fine-Tuned Security Analyst | 2-3 weeks | Medium (AI quality) | Medium |
| **P3** | B6. Threat Intel Enrichment | 1-2 weeks | High (detection quality) | High |
| **P3** | C1. SOAR Playbooks | 3-4 weeks | Very High (platform) | Very High |
| **P3** | C3. Federated Learning | 8-12 weeks | Transformative | Very High |
| **P3** | C4. Trust Center Deep Integration | 2-3 weeks | Strategic | Strategic |

---

## Part 5: What Makes This a 10x Product

The current app is a **1x product** — it detects anomalies and shows a dashboard.

The **10x version** is:

1. **Detection** → **Response** → **Prevention** (full kill chain coverage)
2. **Single account** → **Organization-wide** (multi-account correlation)
3. **Batch** → **Real-time** (5-minute detection vs 6-hour)
4. **Dashboard** → **Platform** (SIEM export, SOAR playbooks, governance integration)
5. **Generic models** → **Custom models** (customer-specific behavioral baselines)
6. **Compliance checkbox** → **Compliance evidence** (audit-ready reports)
7. **Manual investigation** → **AI-assisted investigation** (fine-tuned security analyst)
8. **Isolated** → **Enriched** (threat intelligence from Marketplace)
9. **Snowflake tool** → **Security data lakehouse anchor** (the reason to consolidate security data in Snowflake)

The moat is simple: **nobody else can run ML anomaly detection on Snowflake's own audit logs without moving data**. Every competitor requires data export. This app runs where the data lives.

---

*Document generated for ML Behavioral Anomaly Detection hackathon — VJ Lambe, September 2026*
