import { describe, expect, it } from "vitest";

import { emptyForm, maskCep, maskCpf, maskPhone, validateAddress, validateIdentity } from "@/lib/checkout-form";

const identity = { ...emptyForm, name: "Maria Silva", email: "maria@gmail.com", document: "746.000.270-43", phone: "(11) 98765-4321" };
const address = { ...identity, zipcode: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };

describe("checkout form rules", () => {
  it("accepts complete identification data", () => {
    expect(validateIdentity(identity)).toEqual({});
  });

  it("requires first and last name", () => {
    expect(validateIdentity({ ...identity, name: "Maria" }).name).toBeDefined();
  });

  it("rejects an invalid CPF", () => {
    expect(validateIdentity({ ...identity, document: "111.111.111-11" }).document).toBeDefined();
    expect(validateIdentity({ ...identity, document: "746.000.270-44" }).document).toBeDefined();
  });

  it("requires a phone with area code", () => {
    expect(validateIdentity({ ...identity, phone: "98765-4321" }).phone).toBeDefined();
  });

  it("accepts a complete address and requires the 8-digit CEP and 2-letter state", () => {
    expect(validateAddress(address)).toEqual({});
    expect(validateAddress({ ...address, zipcode: "0131" }).zipcode).toBeDefined();
    expect(validateAddress({ ...address, state: "São Paulo" }).state).toBeDefined();
  });

  it("complement is optional, number is required", () => {
    expect(validateAddress({ ...address, complement: "" }).complement).toBeUndefined();
    expect(validateAddress({ ...address, number: "" }).number).toBeDefined();
  });

  it("formats CPF, phone and CEP as the customer types", () => {
    expect(maskCpf("74600027043")).toBe("746.000.270-43");
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
    expect(maskCep("01310100")).toBe("01310-100");
  });
});
