import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DisplayCurrency = "BRL" | "EUR";

const RATE_KEY = "brl_per_eur_rate";
const CUR_KEY = "display_currency";
const DEFAULT_RATE = 6.0; // 1 EUR = X BRL

type Ctx = {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  toggle: () => void;
  brlPerEur: number;
  setBrlPerEur: (r: number) => void;
  /** Convert a BRL value to the current display currency. */
  convert: (brl: number | null | undefined) => number;
  /** Format a BRL value in the current display currency. */
  format: (brl: number | null | undefined) => string;
};

const CurrencyContext = createContext<Ctx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>("BRL");
  const [brlPerEur, setBrlPerEurState] = useState<number>(DEFAULT_RATE);

  useEffect(() => {
    const c = localStorage.getItem(CUR_KEY);
    if (c === "EUR" || c === "BRL") setCurrencyState(c);
    const r = Number(localStorage.getItem(RATE_KEY));
    if (r && r > 0) setBrlPerEurState(r);
  }, []);

  const setCurrency = (c: DisplayCurrency) => {
    setCurrencyState(c);
    localStorage.setItem(CUR_KEY, c);
  };
  const setBrlPerEur = (r: number) => {
    setBrlPerEurState(r);
    localStorage.setItem(RATE_KEY, String(r));
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
    <CurrencyContext.Provider value={{ currency, setCurrency, toggle, brlPerEur, setBrlPerEur, convert, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
