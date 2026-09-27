export default function Skeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="sf-card px-5 py-4">
      <div className="sf-skeleton mb-3 h-4 w-40" />
      <div className="sf-skeleton w-full" style={{ height }} />
    </div>
  );
}
