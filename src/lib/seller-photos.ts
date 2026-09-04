/**
 * Fotos dos vendedores em WebP 96px (1x) e 192px (2x).
 *
 * Antes eram os JPEG originais de câmera: 2,55 MB no total, servidos em elementos
 * de 32 a 80 px. joao.jpg sozinho eram 556 KB para renderizar 44 px, e kesia.jpg
 * era uma foto 1440x1920 nunca redimensionada. /ranking baixava os 2,55 MB em
 * paralelo com as queries de dados, disputando banda. Agora são ~54 KB no total.
 */
const SELLER_PHOTOS: Record<string, string> = {
  nadal: "nadal",
  fabio: "nadal",
  gisele: "gisele",
  rita: "rita",
  luana: "luana",
  joao: "joao",
  kesia: "kesia",
  pamela: "pamela",
};

function norm(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function slugFor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const key = norm(name);
  for (const [k, slug] of Object.entries(SELLER_PHOTOS)) {
    if (key.includes(norm(k))) return slug;
  }
  return undefined;
}

/** URL da foto (96px). Use junto com getSellerPhotoSrcSet para telas retina. */
export function getSellerPhoto(name: string | null | undefined): string | undefined {
  const slug = slugFor(name);
  return slug ? `/avatars/${slug}.webp` : undefined;
}

/** srcSet 1x/2x correspondente. */
export function getSellerPhotoSrcSet(name: string | null | undefined): string | undefined {
  const slug = slugFor(name);
  return slug ? `/avatars/${slug}.webp 1x, /avatars/${slug}@2x.webp 2x` : undefined;
}
