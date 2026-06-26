import { useState } from "react";
import { ArrowLeftRight, Settings2 } from "lucide-react";
import { useCurrency } from "@/lib/currency-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CurrencyToggle() {
  const { currency, toggle, brlPerEur, setBrlPerEur } = useCurrency();
  const [rateDraft, setRateDraft] = useState(String(brlPerEur));

  return (
    <div className="flex items-center rounded-md border border-border bg-secondary/40">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-2 rounded-l-md px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
        title="Alternar moeda"
      >
        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold">{currency}</span>
        <span className="text-xs text-muted-foreground">
          {currency === "BRL" ? "→ EUR" : "→ BRL"}
        </span>
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none rounded-r-md" title="Configurar taxa">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Taxa de câmbio</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Quantos reais vale 1 euro. Usada para converter valores em BRL para EUR.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">1 EUR =</span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={rateDraft}
                onChange={(e) => setRateDraft(e.target.value)}
                className="h-8"
              />
              <span className="text-xs text-muted-foreground">BRL</span>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                const n = Number(rateDraft);
                if (n > 0) setBrlPerEur(n);
              }}
            >
              Salvar taxa
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
