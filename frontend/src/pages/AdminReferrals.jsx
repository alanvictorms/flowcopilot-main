import { Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";

// Backend de indicações/saques foi perdido na exclusão da pasta e não constava
// nos transcripts. Página informativa até o módulo ser refeito com specs.
export default function AdminReferrals() {
  return (
    <div className="max-w-xl">
      <Card className="p-8 rounded-2xl text-center space-y-2">
        <Link2 className="w-8 h-8 text-muted-foreground mx-auto" />
        <div className="text-base font-semibold">Indicações & Saques</div>
        <p className="text-sm text-muted-foreground">
          Módulo de indicações (comissões e aprovação de saques PIX) indisponível nesta recuperação.
          O código original foi perdido; pode ser refeito quando necessário.
        </p>
      </Card>
    </div>
  );
}
