// Checkout form fields, input masks and validation rules (per step).
import { isValidCep, isValidCpf, isValidPhone } from "@/lib/cart";

export type CheckoutForm = {
  name: string;
  email: string;
  document: string;
  phone: string;
  zipcode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};
export type FieldErrors = Partial<Record<keyof CheckoutForm, string>>;

export const emptyForm: CheckoutForm = {
  name: "", email: "", document: "", phone: "", zipcode: "", street: "",
  number: "", complement: "", district: "", city: "", state: "",
};

const digits = (v: string) => v.replace(/\D/g, "");

export function maskCpf(v: string) {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function maskPhone(v: string) {
  const d = digits(v).slice(0, 11);
  if (d.length > 10) return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  if (d.length > 6) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  if (d.length > 2) return d.replace(/^(\d{2})(\d+)/, "($1) $2");
  return d;
}

export function maskCep(v: string) {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskUf(v: string) {
  return v.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
}

export const MASKS: Partial<Record<keyof CheckoutForm, (v: string) => string>> = {
  document: maskCpf,
  phone: maskPhone,
  zipcode: maskCep,
  state: maskUf,
};

export function validateIdentity(f: CheckoutForm): FieldErrors {
  const e: FieldErrors = {};
  if (f.name.trim().split(/\s+/).filter(Boolean).length < 2) e.name = "Informe seu nome completo.";
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Digite um e-mail válido.";
  if (!isValidCpf(f.document)) e.document = "Digite um CPF válido.";
  if (!isValidPhone(f.phone)) e.phone = "Digite um celular válido com DDD.";
  return e;
}

export function validateAddress(f: CheckoutForm): FieldErrors {
  const e: FieldErrors = {};
  if (!isValidCep(f.zipcode)) e.zipcode = "Digite um CEP válido com 8 números.";
  if (!f.street.trim()) e.street = "Informe a rua.";
  if (!f.number.trim()) e.number = "Informe o número.";
  if (!f.district.trim()) e.district = "Informe o bairro.";
  if (!f.city.trim()) e.city = "Informe a cidade.";
  if (f.state.trim().length !== 2) e.state = "Use a sigla (ex.: SP).";
  return e;
}
