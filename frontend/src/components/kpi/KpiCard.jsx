import { Card } from "@/components/ui/card";

export default function KpiCard({ label, value, unit, icon: Icon, testid, hint }) {
  return (
    <Card className="p-5 rounded-2xl" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1 truncate">
            {value}
            {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
          </div>
          {hint && <div className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</div>}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
    </Card>
  );
}
