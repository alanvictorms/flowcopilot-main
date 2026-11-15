import { Sparkles, Factory, Paintbrush, Flame, MessageSquareWarning, Shield } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import Creatives from "@/pages/Creatives";
import CreativeFactory from "@/pages/CreativeFactory";
import Autopilot from "@/pages/Autopilot";
import Fatigue from "@/pages/Fatigue";
import ObjectionLoop from "@/pages/Objections";
import BrandGuard from "@/pages/BrandGuard";

// Central de Criativos: um único fluxo (gerar → avaliar → checar marca → monitorar
// fadiga) no lugar de 6 menus soltos. Cada aba monta o módulo já existente.
const TABS = [
  { value: "generate", label: "Gerar", icon: Factory, Comp: CreativeFactory },
  { value: "score", label: "Avaliar", icon: Sparkles, Comp: Creatives },
  { value: "autopilot", label: "Piloto", icon: Paintbrush, Comp: Autopilot },
  { value: "fatigue", label: "Fadiga", icon: Flame, Comp: Fatigue },
  { value: "objections", label: "Objeções", icon: MessageSquareWarning, Comp: ObjectionLoop },
  { value: "brand", label: "Marca", icon: Shield, Comp: BrandGuard },
];

export default function CreativesHub() {
  return (
    <div className="space-y-4" data-testid="creatives-hub">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Criativos</div>
        <h2 className="text-2xl font-semibold tracking-tight">Central de Criativos</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Do briefing à publicação — gerar, avaliar, checar marca e monitorar fadiga, tudo em um só lugar.
        </p>
      </div>

      <Tabs defaultValue="generate">
        <TabsList className="flex flex-wrap h-auto gap-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} data-testid={`creatives-tab-${value}`}>
              <Icon className="w-3.5 h-3.5 mr-1" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, Comp }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <Comp />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
