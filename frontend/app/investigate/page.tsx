import PageHeader from '@/components/PageHeader';
import { Search } from 'lucide-react';

export default function InvestigateIndexPage() {
  return (
    <div>
      <PageHeader
        title="Investigate"
        description="Select a flagged user from the Dashboard to see their forecast bands and Cortex AI narrative."
      />
      <div className="sf-card flex flex-col items-center justify-center gap-3 px-6 py-20 text-center text-sf-slate">
        <Search size={28} className="text-sf-line" />
        <p>Pick a user from the risk leaderboard on the Dashboard to start investigating.</p>
      </div>
    </div>
  );
}
