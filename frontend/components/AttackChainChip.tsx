const LABELS: Record<string, string> = {
  credential_theft_exfiltration: 'Credential Theft + Exfiltration',
  insider_data_theft: 'Insider Data Theft',
  privilege_escalation_attack: 'Privilege Escalation Attack',
  account_takeover: 'Account Takeover',
  data_exfiltration: 'Data Exfiltration',
  privilege_abuse: 'Privilege Abuse',
  reconnaissance_activity: 'Reconnaissance Activity',
  resource_hijacking: 'Resource Hijacking',
  behavioral_anomaly: 'Behavioral Anomaly',
};

export default function AttackChainChip({ chain }: { chain: string }) {
  return (
    <span className="sf-pill border border-sf-line bg-sf-mist text-sf-ink">
      {LABELS[chain] ?? chain}
    </span>
  );
}
