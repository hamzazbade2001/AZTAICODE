/**
 * AZT Partners — Shared Data & Utilities
 * Reference data for 3 countries × 4 sectors, scoring weights,
 * risk profiles, and gap taxonomies.
 */
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
export declare const COUNTRIES: Record<string, CountryProfile>;
export declare const SECTOR_WEIGHTS: Record<string, Record<string, number>>;
export declare const RISK_PROFILES: Record<string, Record<string, number>>;
export type GapField = [string, string];
export declare const GAP_TAXONOMIES: Record<string, GapField[]>;
export declare const SUGGESTIONS: Record<string, [string, number]>;
export declare const SUPPLIER_COUNTS: Record<string, Record<string, number>>;
export declare const INFLATION_INDEX: Record<string, string>;
export declare function seededRandom(seed: string): () => number;
export type Country = "MX" | "BR" | "GH";
export type Sector = "pharma" | "telecom" | "construction" | "oil_gas";
