import { useEffect, useState } from "react";
import api from "@/lib/api";

// Marca resolvida pelo domínio acessado (white label). Carregada uma vez.
let brand = { name: "FlowPilot", logo: "/flowpilot-icon.png", color: null, tenant_id: null };
const listeners = new Set();

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function applyBrand(next) {
  brand = { ...brand, ...next };
  const root = document.documentElement;
  if (/^#[0-9a-f]{6}$/i.test(brand.color || "")) {
    const { h, s, l } = hexToHsl(brand.color);
    root.style.setProperty("--primary", `${h} ${s}% ${l}%`);
    root.style.setProperty("--primary-foreground", l > 60 ? "240 10% 3.9%" : "0 0% 100%");
    root.style.setProperty("--ring", `${h} ${s}% ${l}%`);
  } else {
    ["--primary", "--primary-foreground", "--ring"].forEach((v) => root.style.removeProperty(v));
  }
  if (brand.tenant_id) document.title = brand.name;
  const icon = document.querySelector("link[rel~='icon']");
  if (icon && brand.logo) icon.href = brand.logo;
  listeners.forEach((fn) => fn(brand));
}

export function loadBrand() {
  return api.get("/branding", { params: { host: window.location.hostname } })
    .then(({ data }) => applyBrand(data)).catch(() => {});
}

export function loadTenantBrand(tenantId) {
  if (!tenantId || brand.tenant_id === tenantId) return;
  api.get("/branding", { params: { tenant_id: tenantId } }).then(({ data }) => applyBrand(data)).catch(() => {});
}

export function useBrand() {
  const [b, setB] = useState(brand);
  useEffect(() => { listeners.add(setB); return () => listeners.delete(setB); }, []);
  return b;
}
