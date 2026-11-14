import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
// @ts-expect-error plain browser module without type declarations
import { buildPixOrder, isValidCpf, isValidPhone, isValidCep, normalizeCoupon } from "../../../../public/cart/cart-core.js";

// Creates a Pix charge on Vega Checkout for the cart. Prices are always recomputed
// here from the kit list, never taken from the browser.
// Vega only accepts charges sent through the checkout subdomain of the store's
// approved domain (https://checkout.<VEGA_DOMAIN>/api/checkout).
const vegaUrl = (domain: string) => `https://checkout.${domain}/api/checkout`;

const digits = (s: string) => s.replace(/\D/g, "");
const text = (max: number) => z.string().trim().min(1).max(max);

const Body = z.object({
  items: z
    .array(z.object({ id: z.enum(["kit-1", "kit-2", "kit-3", "bump-1"]), qty: z.number().int().min(1).max(20) }))
    .min(1)
    .max(10)
    .refine((items) => items.some((i) => i.id !== "bump-1"), "Escolha um kit"),
  coupon: z.string().max(40).nullish(),
  customer: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.string().trim().email().max(160),
    document: z.string().refine((v) => isValidCpf(v), "CPF inválido"),
    phone: z.string().refine((v) => isValidPhone(v), "Telefone inválido"),
  }),
  address: z.object({
    zipcode: z.string().refine((v) => isValidCep(v), "CEP inválido"),
    street: text(160),
    number: text(20),
    complement: z.string().trim().max(80).optional().default(""),
    district: text(100),
    city: text(100),
    state: z.string().trim().length(2),
  }),
  tracking: z.record(z.string().max(200)).optional(),
});

const FIELD_LABELS: Record<string, string> = {
  name: "Nome", email: "E-mail", document: "CPF", phone: "Celular", zipcode: "CEP", street: "Rua",
  number: "Número", district: "Bairro", city: "Cidade", state: "Estado",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/vega-pix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["VEGA_API_KEY"];
        const domain = process.env["VEGA_DOMAIN"]?.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!apiKey || !domain) return json({ error: "Pagamento indisponível no momento. Tente novamente mais tarde." }, 503);

        let parsed;
        try {
          parsed = Body.safeParse(await request.json());
        } catch {
          return json({ error: "Pedido inválido." }, 400);
        }
        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[i.path.length - 1])))];
          const labels = fields.map((f) => FIELD_LABELS[f]).filter(Boolean);
          return json({ error: labels.length ? `Confira: ${labels.join(", ")}.` : "Confira os dados do pedido." }, 400);
        }
        const { items, coupon, customer, address, tracking = {} } = parsed.data;

        const origin = new URL(request.url).origin;
        const cep = digits(address.zipcode);
        const order = buildPixOrder(items, { coupon: normalizeCoupon(coupon), cep }, origin);
        if (!order.products.length || order.payment.payment_value <= 0) return json({ error: "Seu carrinho está vazio." }, 400);

        const externalCode = `PS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const pick = (k: string) => (typeof tracking[k] === "string" ? tracking[k] : undefined);
        const payload = {
          customer: {
            name: customer.name,
            email: customer.email,
            document: digits(customer.document),
            phone: `+55${digits(customer.phone)}`,
            address: {
              street: address.street,
              number: address.number,
              complement: address.complement,
              district: address.district,
              city: address.city,
              state: address.state.toUpperCase(),
              zipcode: cep,
            },
          },
          payment: { ...order.payment, external_code: externalCode },
          products: order.products,
          src: pick("src") ?? "patch-sleep-site",
          utm_source: pick("utm_source"),
          utm_medium: pick("utm_medium"),
          utm_campaign: pick("utm_campaign"),
          utm_content: pick("utm_content"),
          utm_term: pick("utm_term"),
        };

        const headers: Record<string, string> = {
          "api-key": apiKey,
          accept: "application/json",
          "content-type": "application/json",
          "x-domain": domain,
        };

        let res: Response;
        try {
          res = await fetch(vegaUrl(domain), { method: "POST", headers, body: JSON.stringify(payload) });
        } catch (err) {
          console.error("Vega request failed", err);
          return json({ error: "Não foi possível gerar o Pix agora. Tente novamente." }, 502);
        }
        const raw = await res.text();
        let body: any = null;
        try { body = JSON.parse(raw); } catch { /* not JSON */ }

        if (!res.ok || !body?.data?.pix_copy_paste) {
          console.error(`Vega error [${res.status}]: ${raw.slice(0, 2000)}`);
          const messages = body?.errors ? Object.values(body.errors).flat().map(String) : [];
          const msg = messages.length ? messages.slice(0, 3).join(" ") : body?.message || "Não foi possível gerar o Pix agora. Tente novamente.";
          return json({ error: msg }, res.status >= 400 && res.status < 500 ? 400 : 502);
        }

        const { default: qrcode } = await import("qrcode-generator");
        const qr = qrcode(0, "M");
        qr.addData(body.data.pix_copy_paste);
        qr.make();
        const qrSvg = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });

        return json({
          transaction: body.data.transaction_token ?? null,
          code: externalCode,
          amount: order.payment.payment_value / 100,
          status: body.data.payment_status ?? "pending",
          pix: body.data.pix_copy_paste,
          qrSvg,
        });
      },
    },
  },
});
