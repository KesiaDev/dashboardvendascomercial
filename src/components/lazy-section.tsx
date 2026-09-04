import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Só monta o conteúdo quando ele chega perto da tela.
 *
 * Os painéis analíticos (origem dos leads, metas por funil, conversão por
 * vendedor) ficam abaixo da dobra e cada um dispara uma agregação no banco que
 * leva segundos. Montá-los junto com a página fazia o Fechamento Semanal
 * esperar por dados que ninguém estava olhando ainda. Agora o ranking da semana
 * pinta na hora e cada painel busca os dados quando o usuário rola até ele.
 */
export function LazySection({
  children,
  minHeight = 180,
  label = "Carregando…",
}: {
  children: ReactNode;
  minHeight?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? (
        <Suspense fallback={<SectionFallback minHeight={minHeight} label={label} />}>
          {children}
        </Suspense>
      ) : (
        <SectionFallback minHeight={minHeight} label={label} />
      )}
    </div>
  );
}

function SectionFallback({ minHeight, label }: { minHeight: number; label: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-border bg-card/40 text-xs text-muted-foreground"
      style={{ minHeight }}
    >
      {label}
    </div>
  );
}
