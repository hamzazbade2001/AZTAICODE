/**
 * AZT Partners — Shared Data & Utilities
 * Reference data for 3 countries × 4 sectors, scoring weights,
 * risk profiles, and gap taxonomies.
 */

// ── Country Profiles ──

export interface CountryProfile {
  name: string;
  currency: string;
  language: string;
  procurementLaw: string;
  dataProtection: string;
  avgPaymentDelayDays: number;
  fxVolatility: number;
  registries: string[];
  portals: string[];
  regulators: Record<string, string>;
}

export const COUNTRIES: Record<string, CountryProfile> = {
  MX: {
    name: "Mexico", currency: "MXN", language: "Spanish",
    procurementLaw: "LAASSP / LOPSRM", dataProtection: "LFPDPPP",
    avgPaymentDelayDays: 90, fxVolatility: 0.12,
    registries: ["RUPC", "RSPS", "SFP Sanctions", "SAT RFC", "IMSS"],
    portals: ["CompraNet", "ComprasMX", "CDMX Tianguis"],
    regulators: { pharma: "COFEPRIS", telecom: "IFT", construction: "CMIC", oil_gas: "PEMEX/ASEA/CNH" },
  },
  BR: {
    name: "Brazil", currency: "BRL", language: "Portuguese",
    procurementLaw: "Lei 14,133/2021", dataProtection: "LGPD",
    avgPaymentDelayDays: 120, fxVolatility: 0.18,
    registries: ["SICAF", "CEIS", "CNEP", "CEPIM", "TCU Inidôneos", "CND Federal", "FGTS"],
    portals: ["PNCP", "Compras.gov.br", "Contratos.gov.br"],
    regulators: { pharma: "ANVISA/CMED", telecom: "ANATEL", construction: "DNIT", oil_gas: "ANP" },
  },
  GH: {
    name: "Ghana", currency: "GHS", language: "English",
    procurementLaw: "Act 663 / Act 914", dataProtection: "Act 843",
    avgPaymentDelayDays: 150, fxVolatility: 0.25,
    registries: ["GHANEPS", "PPA Supplier DB", "GRA TIN", "SSNIT", "Act 919 Local Content"],
    portals: ["GHANEPS", "PPA Bulletins"],
    regulators: { pharma: "FDA Ghana", telecom: "NCA", construction: "PPA", oil_gas: "Petroleum Commission" },
  },
};

// ── Sector Weights (for supplier matching) ──

export const SECTOR_WEIGHTS: Record<string, Record<string, number>> = {
  pharma:       { performance: 0.30, price: 0.15, capacity: 0.20, proximity: 0.05, compliance: 0.25, cross_sector: 0.05 },
  telecom:      { performance: 0.25, price: 0.20, capacity: 0.25, proximity: 0.10, compliance: 0.10, cross_sector: 0.10 },
  construction: { performance: 0.25, price: 0.15, capacity: 0.20, proximity: 0.20, compliance: 0.10, cross_sector: 0.10 },
  oil_gas:      { performance: 0.25, price: 0.20, capacity: 0.20, proximity: 0.10, compliance: 0.15, cross_sector: 0.10 },
};

// ── Risk Profiles (% premium by country) ──

export const RISK_PROFILES: Record<string, Record<string, number>> = {
  MX: { payment_delay: 3.2, fx_exposure: 1.8, change_order: 2.5, inflation: 2.1 },
  BR: { payment_delay: 4.8, fx_exposure: 2.5, change_order: 3.0, inflation: 2.5 },
  GH: { payment_delay: 7.5, fx_exposure: 4.2, change_order: 2.0, inflation: 7.5 },
};

// ── Gap Taxonomies (required fields by sector) ──

export type GapField = [string, string]; // [field_name, severity]

export const GAP_TAXONOMIES: Record<string, GapField[]> = {
  pharma: [
    ["active_ingredient", "CRITICAL"], ["dosage_form", "CRITICAL"], ["quantity", "CRITICAL"],
    ["delivery_schedule", "HIGH"], ["gmp_certification", "CRITICAL"],
    ["health_authority_registration", "CRITICAL"], ["shelf_life", "HIGH"],
    ["cold_chain", "HIGH"], ["bioequivalence", "MEDIUM"], ["packaging", "MEDIUM"],
    ["warranty", "LOW"], ["payment_terms", "HIGH"], ["penalty_clause", "MEDIUM"],
    ["quality_testing", "HIGH"],
  ],
  telecom: [
    ["equipment_specs", "CRITICAL"], ["sla_uptime", "CRITICAL"], ["coverage_area", "CRITICAL"],
    ["bandwidth", "HIGH"], ["regulatory_compliance", "CRITICAL"],
    ["installation_timeline", "HIGH"], ["maintenance_sla", "MEDIUM"],
    ["interoperability", "HIGH"], ["security_standards", "HIGH"],
    ["training", "LOW"], ["payment_terms", "HIGH"], ["penalty_clause", "MEDIUM"],
  ],
  construction: [
    ["scope_of_work", "CRITICAL"], ["technical_specs", "CRITICAL"],
    ["bill_of_quantities", "CRITICAL"], ["project_timeline", "CRITICAL"],
    ["site_conditions", "HIGH"], ["permits", "HIGH"],
    ["safety_standards", "HIGH"], ["environmental", "HIGH"],
    ["variation_clause", "MEDIUM"], ["retention_terms", "MEDIUM"],
    ["defects_liability", "MEDIUM"], ["insurance", "HIGH"], ["payment_terms", "HIGH"],
  ],
  oil_gas: [
    ["equipment_standards", "CRITICAL"], ["safety_compliance", "CRITICAL"],
    ["environmental_compliance", "CRITICAL"], ["quantity", "CRITICAL"],
    ["delivery_location", "HIGH"], ["hazmat_classification", "HIGH"],
    ["inspection_protocol", "HIGH"], ["local_content", "MEDIUM"],
    ["insurance", "HIGH"], ["payment_terms", "HIGH"],
    ["penalty_clause", "MEDIUM"], ["force_majeure", "MEDIUM"],
  ],
};

// ── Gap Fill Suggestions ──

export const SUGGESTIONS: Record<string, [string, number]> = {
  delivery_schedule: ["Monthly batches", 0.72],
  cold_chain: ["2-8°C storage and transport required", 0.85],
  shelf_life: ["24 months minimum remaining at delivery", 0.78],
  quality_testing: ["USP/BP standards, certificate of analysis required", 0.74],
  sla_uptime: ["99.95% uptime guarantee", 0.88],
  bandwidth: ["10 Gbps metro / 100 Gbps backbone", 0.72],
  defects_liability: ["12 months from practical completion", 0.82],
  insurance: ["All-risk construction + professional liability", 0.70],
  local_content: ["20-70% depending on sector and country", 0.72],
};

// ── Supplier Counts (for market concentration) ──

export const SUPPLIER_COUNTS: Record<string, Record<string, number>> = {
  MX: { pharma: 22, telecom: 12, construction: 18, oil_gas: 10 },
  BR: { pharma: 15, telecom: 10, construction: 14, oil_gas: 8 },
  GH: { pharma: 8, telecom: 5, construction: 10, oil_gas: 4 },
};

// ── Inflation Index Names ──

export const INFLATION_INDEX: Record<string, string> = {
  MX: "INPC", BR: "IPCA", GH: "CPI",
};

// ── Seeded PRNG (deterministic outputs for testing/evals) ──

export function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  // MurmurHash3 finalizer used as PRNG state — zero is a fixed point that
  // makes every subsequent call return 0. Seed to a non-zero value.
  if ((h >>> 0) === 0) h = 0x6D2B79F5 | 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    // Guard: if the sequence ever hits 0, escape the fixed point.
    if ((h >>> 0) === 0) h = 1;
    return (h >>> 0) / 4294967296;
  };
}

// ── Shared types ──

export type Country = "MX" | "BR" | "GH";
export type Sector = "pharma" | "telecom" | "construction" | "oil_gas";
