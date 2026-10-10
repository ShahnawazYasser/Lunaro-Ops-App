import Card from "./Card";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

export default function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <Card size="sm" tone={accent ? "gold" : "default"} className="rounded-2xl">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${accent ? "text-gold" : "text-text"}`}>{value}</p>
      {sub && <p className="text-xs mt-0.5 text-gold">{sub}</p>}
    </Card>
  );
}
