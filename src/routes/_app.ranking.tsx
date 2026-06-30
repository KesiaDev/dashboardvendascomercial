import { useRef, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchClintRankingFn } from "@/lib/clint.functions";
import type { SellerStats } from "@/lib/bi";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrency } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSellerPhoto } from "@/lib/seller-photos";
import { Crown, Star, TrendingUp, CalendarDays, Trophy, Sparkles } from "lucide-react";

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function buildMonthOptions() {
  const now = new Date();
  // Inclui o PRÓXIMO mês no topo para a equipe acompanhar o fechamento manual
  // a partir de Julho/2026 antes mesmo da virada.
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const future = {
    value: `${next.getFullYear()}-${next.getMonth() + 1}`,
    label: `${MONTHS_PT[next.getMonth()]} ${next.getFullYear()} (próximo)`,
    year: next.getFullYear(),
    month: next.getMonth() + 1,
  };
  const past = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: i === 0 ? `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()} (atual)` : `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    };
  });
  return [future, ...past];
}


export const Route = createFileRoute("/_app/ranking")({ component: RankingPage });

// ── Confetti canvas ─────────────────────────────────────────────────────────
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const COLORS = ["#FFD700","#FF6B6B","#4ECDC4","#45B7D1","#C084FC","#F472B6","#34D399","#FBBF24"];
    const particles = Array.from({ length: 160 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * -400 - 20,
      w: Math.random() * 11 + 5,
      h: Math.random() * 7 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 3.5,
      vy: Math.random() * 4 + 2.5,
      angle: Math.random() * 360,
      spin: (Math.random() - 0.5) * 9,
      circle: Math.random() > 0.5,
    }));

    let frame = 0;
    let rafId: number;
    const MAX = 420;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alpha = Math.max(0, 1 - frame / MAX);
      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.angle * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy + frame * 0.002;
        p.angle += p.spin;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      }
      frame++;
      if (frame < MAX) rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="rk-confetti-canvas" />;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

const SPARK_POSITIONS = ["left-[5%]", "left-[20%]", "left-[50%]", "left-[75%]", "left-[90%]"];
const SPARK_CLASSES   = ["rk-spark-0","rk-spark-1","rk-spark-2","rk-spark-3","rk-spark-4"] as const;

function SellerAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const photo = getSellerPhoto(name);
  const sz = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-16 w-16", xl: "h-20 w-20" }[size];
  const tx = { sm: "text-xs", md: "text-sm", lg: "text-lg", xl: "text-xl" }[size];
  return (
    <Avatar className={`${sz} ring-2 ring-white/20`}>
      <AvatarImage src={photo} alt={name} />
      <AvatarFallback className={`bg-gradient-to-br from-amber-400/30 to-purple-500/30 font-bold ${tx}`}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

// ── Pódio (top 3 do mês) ────────────────────────────────────────────────────
type PodiumPos = { pos: 1 | 2 | 3; delayClass: "rk-d1" | "rk-d2" | "rk-d3"; badgeClass: "rk-badge-1" | "rk-badge-2" | "rk-badge-3"; emoji: string };
const PODIUM: PodiumPos[] = [
  { pos: 1, delayClass: "rk-d1", badgeClass: "rk-badge-1", emoji: "🥇" },
  { pos: 2, delayClass: "rk-d2", badgeClass: "rk-badge-2", emoji: "🥈" },
  { pos: 3, delayClass: "rk-d3", badgeClass: "rk-badge-3", emoji: "🥉" },
];

function Podium({ top3, currency, hideRevenue }: { top3: SellerStats[]; currency: string; hideRevenue?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 150); return () => clearTimeout(t); }, []);

  if (top3.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-purple-950/40 to-slate-900 p-8 pb-0">
      {SPARK_POSITIONS.map((leftClass, i) => (
        <span
          key={i}
          className={`pointer-events-none absolute top-4 select-none text-amber-300/30 ${leftClass} ${SPARK_CLASSES[i]}`}
        >
          ✨
        </span>
      ))}

      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2">
          <Trophy className="rk-crown-pulse rk-d0 h-5 w-5 text-amber-400" />
          <span className="text-sm font-bold tracking-wide text-amber-300 uppercase">Pódio do Mês</span>
          <Trophy className="rk-crown-pulse rk-d1 h-5 w-5 text-amber-400" />
        </div>
      </div>

      <div className="flex items-end justify-center gap-3">
        {PODIUM.map(({ pos, delayClass, badgeClass, emoji }) => {
          const seller = top3[pos - 1];
          if (!seller) return null;
          return (
            <div
              key={pos}
              className={`rk-podium-item rk-podium-order-${pos} ${delayClass} ${show ? "rk-show" : ""} flex flex-col items-center gap-3`}
            >
              <div className="relative flex flex-col items-center gap-1">
                {pos === 1 && <span className="rk-crown-pulse text-3xl">👑</span>}
                <div className={pos === 1 ? "rk-avatar-glow" : ""}>
                  <SellerAvatar name={seller.name} size={pos === 1 ? "xl" : "lg"} />
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm font-bold text-white">{seller.name.split(" ")[0]}</p>
                {!hideRevenue && (
                  <p className={`text-xs font-semibold tabular-nums ${pos === 1 ? "text-amber-300" : pos === 2 ? "text-slate-300" : "text-orange-400"}`}>
                    {formatCurrency(seller.revenue, currency)}
                  </p>
                )}
                <p className="text-xs text-white/40">{seller.won} vendas</p>
              </div>

              <div className={`rk-pedestal-${pos} w-24 rounded-t-2xl flex items-center justify-center text-3xl font-black`}>
                <span className={badgeClass}>{emoji}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Destaque card ───────────────────────────────────────────────────────────
const DESTAQUE_SPARKS = ["left-[15%]", "left-[55%]", "left-[80%]"];

function DestaqueCard({
  label, icon: Icon, seller, accentClass, isTop, currency, fadeClass, hideRevenue,
}: {
  label: string; icon: React.ElementType; seller: SellerStats | null;
  accentClass: string; isTop?: boolean; currency: string; fadeClass: string; hideRevenue?: boolean;
}) {
  if (!seller) {
    return (
      <div className={`rounded-2xl border border-border/50 bg-card/60 p-5 ${fadeClass}`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`h-4 w-4 ${accentClass}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <p className="text-sm text-muted-foreground">Sem vendas nesse período.</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 transition-all ${isTop ? "rk-destaque-top" : "rk-destaque-base"} ${fadeClass}`}>
      {isTop && (
        <>
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber-400/15 blur-2xl" />
          {DESTAQUE_SPARKS.map((leftClass, i) => (
            <span
              key={i}
              className={`pointer-events-none absolute top-3 select-none text-sm text-amber-300/50 ${leftClass} ${SPARK_CLASSES[i]}`}
            >
              ✨
            </span>
          ))}
        </>
      )}
      <div className="relative mb-4 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accentClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="relative flex items-center gap-4">
        <SellerAvatar name={seller.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <p className="truncate text-base font-bold">{seller.name.split(" ")[0]}</p>
            {isTop && <Crown className="rk-crown-pulse h-4 w-4 flex-shrink-0 text-amber-400" />}
          </div>
          {!hideRevenue && (
            <p className="tabular-nums text-2xl font-black text-foreground">
              {formatCurrency(seller.revenue, currency)}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {seller.won} {seller.won === 1 ? "venda fechada" : "vendas fechadas"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Rank row ────────────────────────────────────────────────────────────────
const MEDALS = ["🥇", "🥈", "🥉"];
const ROW_CLASSES = ["rk-row-0","rk-row-1","rk-row-2","rk-row-3","rk-row-4","rk-row-5"] as const;

function RankRow({ rank, seller, currency }: { rank: number; seller: SellerStats; currency: string }) {
  const rowAnim = ROW_CLASSES[Math.min(rank, ROW_CLASSES.length - 1)];
  return (
    <div
      className={`${rowAnim} flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${
        rank === 0 ? "border-amber-400/25 bg-gradient-to-r from-amber-400/10 to-transparent"
        : rank === 1 ? "border-slate-400/20 bg-gradient-to-r from-slate-400/5 to-transparent"
        : "border-border/50 bg-card/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 text-center text-xl">{MEDALS[rank] ?? `#${rank + 1}`}</div>
        <SellerAvatar name={seller.name} size="sm" />
        <div>
          <div className="text-sm font-semibold">{seller.name.split(" ")[0]}</div>
          <div className="text-xs text-muted-foreground">
            {seller.won} {seller.won === 1 ? "fechada" : "fechadas"}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="tabular-nums text-sm font-bold">{formatCurrency(seller.revenue, currency)}</div>
        <div className="text-xs text-muted-foreground">
          {seller.won > 0
            ? `${formatCurrency(Math.round(seller.revenue / seller.won), currency)} ticket`
            : "—"}
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
function RankingPage() {
  useCurrency();
  const currency = "EUR";

  const now = new Date();
  const monthOptions = buildMonthOptions();
  const [selectedValue, setSelectedValue] = useState(monthOptions[0].value);
  const selected = monthOptions.find((o) => o.value === selectedValue) ?? monthOptions[0];
  const isCurrentMonth = selected.year === now.getFullYear() && selected.month === now.getMonth() + 1;

  const { data, isLoading } = useQuery({
    queryKey: ["clint-ranking", selected.year, selected.month],
    queryFn: () => fetchClintRankingFn({ data: { year: selected.year, month: selected.month } }),
    staleTime: 5 * 60 * 1000,
  });

  const destaques = data?.destaques ?? { dia: null, semana: null, mes: null };
  const ranking = {
    mes:    (data?.mes    ?? []) as SellerStats[],
    semana: (data?.semana ?? []) as SellerStats[],
    dia:    (data?.dia    ?? []) as SellerStats[],
  };

  return (
    <>
      {!isLoading && <Confetti />}

      <div className="space-y-8">
        <div className="rk-fadein flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ranking de Campeões</h1>
              <p className="text-sm text-muted-foreground">Performance da equipe em tempo real 🚀</p>
            </div>
          </div>
          <Select value={selectedValue} onValueChange={setSelectedValue}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Podium top3={ranking.mes.slice(0, 3)} currency={currency} />

        <section>
          <div className="rk-fadein-2 mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold">Destaques do período</h2>
          </div>
          {isCurrentMonth ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <DestaqueCard label="Vendas de hoje (parcial)" icon={CalendarDays} seller={destaques.dia}    accentClass="text-blue-400"   currency={currency} fadeClass="rk-fadein-2" />
              <DestaqueCard label="Destaque da semana"       icon={TrendingUp}   seller={destaques.semana} accentClass="text-violet-400" currency={currency} fadeClass="rk-fadein-3" />
              <DestaqueCard label="Campeão do mês"           icon={Crown}        seller={destaques.mes}    accentClass="text-amber-400"  currency={currency} fadeClass="rk-fadein-4" isTop />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-1 max-w-sm">
              <DestaqueCard label={`Campeão — ${selected.label}`} icon={Crown} seller={destaques.mes} accentClass="text-amber-400" currency={currency} fadeClass="rk-fadein-2" isTop />
            </div>
          )}
        </section>

        <Card className="rk-fadein-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-400" />
              <CardTitle className="text-base">Ranking completo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isCurrentMonth ? (
              <Tabs defaultValue="mes">
                <TabsList>
              <TabsTrigger value="dia">Hoje</TabsTrigger>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
                </TabsList>
                {(["dia", "semana", "mes"] as const).map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-4 space-y-2">
                    {ranking[tab].length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">Sem vendas fechadas nesse período.</p>
                    ) : (
                      ranking[tab].map((s, i) => <RankRow key={s.user_id} rank={i} seller={s} currency={currency} />)
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <div className="mt-2 space-y-2">
                {ranking.mes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Sem vendas nesse mês.</p>
                ) : (
                  ranking.mes.map((s, i) => <RankRow key={s.user_id} rank={i} seller={s} currency={currency} />)
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </>
  );
}
