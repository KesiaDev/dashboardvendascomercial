import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type DisplayCurrency = "BRL" | "EUR";

const RATE_KEY = "brl_per_eur_rate";
const RATE_TS_KEY = "brl_per_eur_rate_at";
const CUR_KEY = "display_currency";
const DEFAULT_RATE = 6.0; // fallback: 1 EUR = X BRL
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

type Ctx = {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  toggle: () => void;
  brlPerEur: number;
  setBrlPerEur: (r: number) => void;
  /** When the live rate was last fetched (ISO string) or null. */
  rateUpdatedAt: string | null;
  rateLoading: boolean;
  refreshRate: () => Promise<void>;
  /** Convert a BRL value to the current display currency. */
  convert: (brl: number | null | undefined) => number;
  /** Format a BRL value in the current display currency. */
  format: (brl: number | null | undefined) => string;
};

const CurrencyContext = createContext<Ctx | null>(null);

async function fetchLiveRate(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=BRL");
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { BRL?: number } };
    const rate = json.rates?.BRL;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Padrão da plataforma: tudo em EUR com cotação atualizada automaticamente.
  const [currency, setCurrencyState] = useState<DisplayCurrency>("EUR");
  const [brlPerEur, setBrlPerEurState] = useState<number>(DEFAULT_RATE);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  const refreshRate = useCallback(async () => {
    setRateLoading(true);
    const rate = await fetchLiveRate();
    setRateLoading(false);
    if (rate) {
      const now = new Date().toISOString();
      setBrlPerEurState(rate);
      setRateUpdatedAt(now);
      localStorage.setItem(RATE_KEY, String(rate));
      localStorage.setItem(RATE_TS_KEY, now);
    }
  }, []);

  useEffect(() => {
    const c = localStorage.getItem(CUR_KEY);
    if (c === "EUR" || c === "BRL") setCurrencyState(c);
    const r = Number(localStorage.getItem(RATE_KEY));
    if (r && r > 0) setBrlPerEurState(r);
    const ts = localStorage.getItem(RATE_TS_KEY);
    if (ts) setRateUpdatedAt(ts);

    const age = ts ? Date.now() - new Date(ts).getTime() : Infinity;
    if (!(r > 0) || age > MAX_AGE_MS) void refreshRate();

    const id = setInterval(() => void refreshRate(), MAX_AGE_MS);
    return () => clearInterval(id);
  }, [refreshRate]);

  const setCurrency = (c: DisplayCurrency) => {
    setCurrencyState(c);
    localStorage.setItem(CUR_KEY, c);
  };
  const setBrlPerEur = (r: number) => {
    setBrlPerEurState(r);
    localStorage.setItem(RATE_KEY, String(r));
    const now = new Date().toISOString();
    setRateUpdatedAt(now);
    localStorage.setItem(RATE_TS_KEY, now);
  };
  const toggle = () => setCurrency(currency === "BRL" ? "EUR" : "BRL");

  const convert = (brl: number | null | undefined) => {
    const v = brl ?? 0;
    return currency === "EUR" ? v / brlPerEur : v;
  };

  const format = (brl: number | null | undefined) => {
    const v = convert(brl);
    return new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "pt-BR", {
      style: "currency",
      currency,
    }).format(v);
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        toggle,
        brlPerEur,
        setBrlPerEur,
        rateUpdatedAt,
        rateLoading,
        refreshRate,
        convert,
        format,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
