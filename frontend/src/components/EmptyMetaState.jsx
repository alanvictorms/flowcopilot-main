import { AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function EmptyMetaState({ title, description }) {
  return (
    <Card className="border-dashed" data-testid="meta-empty-state">
      <CardContent className="p-8 flex items-start gap-4">
        <div className="w-10 h-10 rounded-md bg-warning/10 border border-warning/30 flex items-center justify-center text-warning" style={{ color: "hsl(var(--warning))" }}>
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{title || "Conecte sua conta Meta Ads"}</div>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            {description ||
              "Para começar, adicione seu App ID, App Secret, Access Token e Ad Account ID em Configurações. A plataforma opera 100% em dados reais do Meta Marketing API."}
          </p>
          <Button asChild size="sm" className="mt-4" data-testid="meta-empty-cta">
            <Link to="/onboarding">
              Conectar conta Meta Ads
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
