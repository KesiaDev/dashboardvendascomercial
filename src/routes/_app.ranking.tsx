import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAllDealsFn, fetchPipelineAreasFn } from "@/lib/data.functions";
import {
  rankSellers,
  filterDealsByArea,
  buildAreaMap,
  type Deal,
  type SellerStats,
} from "@/lib/bi";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrency } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSellerPhoto } from "@/lib/seller-photos";
import { Crown, Star, TrendingUp, CalendarDays, Trophy } from "lucide-react";

export const Route = createFileRoute("/_app/ranking")({ component: RankingPage });

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function medal(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `#${i + 1}`;
}

function SellerAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const photo = getSellerPhoto(name);
  const sizeClass = size === "lg" ? "h-16 w-16" : size === "md" ? "h-10 w-10" : "h-8 w-8";
  const textClass = size === "lg" ? "text-xl" : size === "md" ? "text-sm" : "text-xs";
  return (
    <Avatar className={`${sizeClass} ring-2 ring-primary/20`}>
      <AvatarImage src={photo} alt={name} />
      <AvatarFallback className={`bg-gradient-to-br from-primary/20 to-orange-400/20 font-bold ${textClass}`}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function DestaqueCard({
  label,
  icon: Icon,
  seller,
  accentClass,
  currency,
}: {
  label: string;
  icon: React.ElementType;
  seller: SellerStats | null;
  accentClass: string;
  currency: string;
}) {
  if (!seller) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`h-4 w-4 ${accentClass}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <p className="text-sm text-muted-foreground">Sem vendas nesse período.</p>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 p-5 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/8 blur-2xl transition-all group-hover:bg-primary/15" />
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`h-4 w-4 ${accentClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-4 relative">
        <SellerAvatar name={seller.name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-base font-bold truncate">{seller.name.split(" ")[0]}</p>
            <Crown className={`h-4 w-4 flex-shrink-0 ${accentClass}`} />
          </div>
          <p className="text-2xl font-black tabular-nums text-foreground">
            {formatCurrency(seller.revenue, currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {seller.won} {seller.won === 1 ? "venda fechada" : "vendas fechadas"}
          </p>
        </div>
      </div>
    </div>
  );
}

function RankRow({ rank, seller, currency }: { rank: number; seller: SellerStats; currency: string }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${
        rank === 0
          ? "border-primary/25 bg-gradient-to-r from-primary/10 to-transparent"
          : "border-border/50 bg-card/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 text-center text-xl">{medal(rank)}</div>
        <SellerAvatar name={seller.name} size="sm" />
        <div>
          <div className="text-sm font-semibold">{seller.name.split(" ")[0]}</div>
          <div className="text-xs text-muted-foreground">
            {seller.won} fechadas · {seller.leads} leads
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold tabular-nums">{formatCurrency(seller.revenue, currency)}</div>
        <div className="text-xs text-muted-foreground">{seller.won > 0 ? `${Math.round(seller.revenue / seller.won).toLocaleString("pt-BR")} ticket` : "—"}</div>
      </div>
    </div>
  );
}

function RankingPage() {
  const { currency, brlPerEur } = useCurrency();

  const { data: rawDeals = [], isLoading: loadingDeals } = useQuery({
    queryKey: ["deals"],
    queryFn: () => fetchAllDealsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: pipelineAreas = [] } = useQuery({
    queryKey: ["pipelineAreas"],
    queryFn: () => fetchPipelineAreasFn(),
    staleTime: 30 * 60 * 1000,
  });

  const allDeals = useMemo(() => {
    const areaMap = buildAreaMap(pipelineAreas as any[]);
    return filterDealsByArea(rawDeals as Deal[], areaMap, null);
  }, [rawDeals, pipelineAreas]);

  const { destaques, ranking } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const rank = (start: Date, end: Date | null) =>
      rankSellers(allDeals, start, end, currency, brlPerEur);

    return {
      destaques: {
        dia: rank(yesterdayStart, todayStart)[0] ?? null,
        semana: rank(weekStart, null)[0] ?? null,
        mes: rank(monthStart, null)[0] ?? null,
      },
      ranking: {
        mes: rank(monthStart, null),
        semana: rank(weekStart, null),
        dia: rank(todayStart, null),
      },
    };
  }, [allDeals, currency, brlPerEur]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ranking de Vendedores</h1>
          <p className="text-sm text-muted-foreground mt-1">Destaques e performance individual da equipe</p>
        </div>
        {loadingDeals && (
          <Badge variant="secondary" className="text-xs animate-pulse">Carregando…</Badge>
        )}
      </div>

      {/* ── Destaques ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Star className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Destaques</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <DestaqueCard
            label="Destaque do dia anterior"
            icon={CalendarDays}
            seller={destaques.dia}
            accentClass="text-blue-400"
            currency={currency}
          />
          <DestaqueCard
            label="Destaque da semana"
            icon={TrendingUp}
            seller={destaques.semana}
            accentClass="text-primary"
            currency={currency}
          />
          <DestaqueCard
            label="Destaque do mês"
            icon={Crown}
            seller={destaques.mes}
            accentClass="text-amber-400"
            currency={currency}
          />
        </div>
      </section>

      {/* ── Ranking completo ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Ranking completo</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="mes">
            <TabsList>
              <TabsTrigger value="dia">Hoje</TabsTrigger>
              <TabsTrigger value="semana">7 dias</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
            </TabsList>
            {(["dia", "semana", "mes"] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4 space-y-2">
                {ranking[tab].length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Sem vendas fechadas nesse período.
                  </p>
                ) : (
                  ranking[tab].map((s, i) => (
                    <RankRow key={s.user_id} rank={i} seller={s} currency={currency} />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
