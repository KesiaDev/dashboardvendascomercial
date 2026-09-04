/**
 * Planos de pagamento reconhecidos pela plataforma.
 *
 * Quando o vendedor lança uma venda com o valor de UMA parcela de um plano
 * conhecido, o sistema já sabe quantas parcelas são e agenda as futuras
 * automaticamente (mesmo dia, meses seguintes).
 *
 * Fonte: tabela de preços Mentoria (499 € em 3x de 166 €) e Accelerator
 * (LDP: 2900 à vista, 3x 1160, 6x 677 · Aluno LDP: 2400 à vista, 3x 993,
 * 6x 593).
 */
export type PaymentPlan = {
  /** Valor de cada parcela em euros. */
  installmentEur: number;
  /** Número total de parcelas. */
  installments: number;
  /** Descrição para exibir na tela. */
  label: string;
};

export const PAYMENT_PLANS: PaymentPlan[] = [
  { installmentEur: 166, installments: 3, label: "Mentoria 499 € em 3x de 166 €" },
  { installmentEur: 1160, installments: 3, label: "Accelerator LDP — 3x de 1.160 €" },
  { installmentEur: 677, installments: 6, label: "Accelerator LDP — 6x de 677 €" },
  { installmentEur: 993, installments: 3, label: "Accelerator Aluno LDP — 3x de 993 €" },
  { installmentEur: 593, installments: 6, label: "Accelerator Aluno LDP — 6x de 593 €" },
];

/** Tolerância de arredondamento/centavos ao reconhecer o valor da parcela. */
const TOL = 1.5;

/** Reconhece o plano pelo valor da parcela; devolve null se não for um plano fixo. */
export function detectPaymentPlan(valueEur: number): PaymentPlan | null {
  if (!Number.isFinite(valueEur)) return null;
  return (
    PAYMENT_PLANS.find((p) => Math.abs(valueEur - p.installmentEur) <= TOL) ?? null
  );
}

/** Máximo de parcelas aceito no lançamento manual. */
export const MAX_INSTALLMENTS = 6;
