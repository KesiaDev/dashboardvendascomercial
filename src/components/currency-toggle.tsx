import { useEffect, useState } from "react";
import { ArrowLeftRight, RefreshCw, Settings2 } from "lucide-react";
import { useCurrency } from "@/lib/currency-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CurrencyToggle() {
  const { currency, toggle, brlPerEur, setBrlPerEur, rateUpdatedAt, rateLoading, refreshRate } =
    useCurrency();
  const [rateDraft, setRateDraft] = useState(String(brlPerEur));

  useEffect(() => {
    setRateDraft(String(brlPerEur));
  }, [brlPerEur]);

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
        <PopoverContent align="end" className="w-80">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cotação automática</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                A plataforma exibe tudo em euro usando a cotação atual do mercado (atualizada
                automaticamente a cada 6 horas).
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
              <div className="text-sm">
                <span className="font-semibold">1 EUR = {brlPerEur.toFixed(4)} BRL</span>
                <p className="text-xs text-muted-foreground">
                  {rateUpdatedAt
                    ? `Atualizado em ${new Date(rateUpdatedAt).toLocaleString("pt-BR")}`
                    : "Ainda não atualizado"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Atualizar cotação agora"
                onClick={() => void refreshRate()}
                disabled={rateLoading}
              >
                <RefreshCw className={`h-4 w-4 ${rateLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div>
              <Label className="text-xs">Taxa manual (opcional)</Label>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">1 EUR =</span>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.01"
                  value={rateDraft}
                  onChange={(e) => setRateDraft(e.target.value)}
                  className="h-8"
                />
                <span className="text-xs text-muted-foreground">BRL</span>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                const n = Number(rateDraft);
                if (n > 0) setBrlPerEur(n);
              }}
            >
              Salvar taxa manual
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
