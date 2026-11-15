// ponytail: stub de recuperação do HelpTooltip.
export default function HelpTooltip({ text }) {
  if (!text) return null;
  return (
    <span title={text} className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground cursor-help">?</span>
  );
}
