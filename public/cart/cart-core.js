// Pure cart rules (no DOM). Shared by the cart drawer and its tests.
export const FREE_SHIPPING_MIN = 97;
export const FLAT_SHIPPING = 19.9;
export const MAX_INSTALLMENTS = 5;
export const COUPONS = { PRIMEIRA15: 0.15 };
export const PRODUCT_NAME = "Patch Sleep";

export const KITS = [
  { id: "kit-1", option: "1 Mês", title: "1 Pacote", packs: 1, dose: "48 Adesivos", price: 59, oldPrice: 125, image: "/images/adesivo-patch-sleep-principal.webp" },
  { id: "kit-2", option: "4 meses", title: "2 Pacotes", packs: 2, dose: "96 Adesivos", price: 97, oldPrice: 235, image: "/images/adesivo-patch-sleep-kit2.webp" },
  { id: "kit-3", option: "6 Meses", title: "3 Pacotes", packs: 3, dose: "144 Adesivos", price: 127, oldPrice: 360, image: "/images/adesivo-patch-sleep-kit3.webp" },
];

export function findKit(idOrOption) {
  return KITS.find((k) => k.id === idOrOption || k.option.toLowerCase() === String(idOrOption || "").toLowerCase()) || null;
}

export function addItem(items, kitId, qty = 1) {
  const kit = findKit(kitId);
  if (!kit) return items;
  const existing = items.find((i) => i.id === kit.id);
  if (existing) return items.map((i) => (i.id === kit.id ? { ...i, qty: i.qty + qty } : i));
  return [...items, { id: kit.id, qty }];
}

export function setQty(items, kitId, qty) {
  if (qty <= 0) return items.filter((i) => i.id !== kitId);
  return items.map((i) => (i.id === kitId ? { ...i, qty } : i));
}

export function normalizeCoupon(code) {
  const c = String(code || "").trim().toUpperCase();
  return COUPONS[c] ? c : null;
}

export function isValidCep(cep) {
  return /^\d{8}$/.test(String(cep || "").replace(/\D/g, ""));
}

const round2 = (n) => Math.round(n * 100) / 100;

export function summarize(items, { coupon = null, cep = null } = {}) {
  const lines = items
    .map((i) => ({ ...i, kit: findKit(i.id) }))
    .filter((l) => l.kit && l.qty > 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = round2(lines.reduce((s, l) => s + l.kit.price * l.qty, 0));
  const oldSubtotal = round2(lines.reduce((s, l) => s + l.kit.oldPrice * l.qty, 0));
  const rate = coupon && COUPONS[coupon] ? COUPONS[coupon] : 0;
  const discount = round2(subtotal * rate);
  const hasFreeKit = lines.some((l) => l.kit.packs >= 2);
  const freeShipping = count > 0 && (hasFreeKit || subtotal >= FREE_SHIPPING_MIN);
  const remainingForFree = freeShipping ? 0 : round2(Math.max(0, FREE_SHIPPING_MIN - subtotal));
  const progress = freeShipping ? 1 : Math.min(1, subtotal / FREE_SHIPPING_MIN);
  let shipping = null; // null = not calculated yet
  if (count > 0 && freeShipping) shipping = 0;
  else if (count > 0 && isValidCep(cep)) shipping = FLAT_SHIPPING;
  const total = round2(Math.max(0, subtotal - discount + (shipping || 0)));
  const installment = round2(total / MAX_INSTALLMENTS);
  return { lines, count, subtotal, oldSubtotal, discount, freeShipping, remainingForFree, progress, shipping, total, installment };
}

export function formatBRL(n) {
  return "R$ " + Number(n || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ---- Pix checkout (Vega Checkout) ----
export const toCents = (n) => Math.round(Number(n || 0) * 100);

export function isValidCpf(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function isValidPhone(value) {
  return /^\d{10,11}$/.test(String(value || "").replace(/\D/g, ""));
}

// Builds the products/payment part of a Vega Pix order. Values are in cents and
// payment_value always equals products + freight - discount.
export function buildPixOrder(items, { coupon = null, cep = null } = {}, origin = "") {
  const summary = summarize(items, { coupon, cep });
  const products = summary.lines.map(({ kit, qty }) => ({
    code: kit.id,
    name: `${PRODUCT_NAME} (${kit.title} · ${kit.dose})`,
    price: toCents(kit.price),
    quantity: qty,
    is_digital: false,
    description: `${PRODUCT_NAME} — ${kit.title}, ${kit.dose}`,
    image_url: origin + kit.image,
  }));
  const productsCents = products.reduce((s, p) => s + p.price * p.quantity, 0);
  const freight = toCents(summary.shipping || 0);
  const discount = toCents(summary.discount);
  return {
    summary,
    products,
    payment: {
      method: "pix",
      payment_value: productsCents + freight - discount,
      freight_value: freight,
      discount_value: discount,
      currency: "BRL",
    },
  };
}
