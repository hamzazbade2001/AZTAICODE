/**
 * AZT Partners — MCP Server
 * AI-powered procurement intelligence for MX · BR · GH across 4 sectors.
 *
 * Tools
 *   analyze_tender_gaps            – spec completeness + severity
 *   fill_specification_gaps        – AI-suggested values for missing fields
 *   score_suppliers                – weighted scoring across 6 dimensions
 *   calculate_market_concentration – HHI + market-type classification
 *   generate_pricing_variants      – aggressive / balanced / conservative bids
 *   calculate_risk_premium         – country-level risk surcharge
 *   detect_bid_rigging             – co-occurrence threshold by HHI tier
 *   get_country_profile            – full country data record
 *   get_sector_weights             – supplier-matching weight config
 *   list_gap_taxonomy              – required fields + severities per sector
 */

import { McpServer }            from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                    from "zod";
import {
  COUNTRIES, SECTOR_WEIGHTS, RISK_PROFILES, GAP_TAXONOMIES,
  SUPPLIER_COUNTS, INFLATION_INDEX, SUGGESTIONS, seededRandom,
} from "./data.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ok(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true as const };
}

/** HHI = equal-share baseline + FX-volatility concentration premium. */
function computeHHI(country: string, sector: string): number {
  const n     = SUPPLIER_COUNTS[country]?.[sector];
  const fxVol = COUNTRIES[country]?.fxVolatility;
  if (!n || fxVol == null) return 0;
  return Math.round(10_000 / n + fxVol * 3_000);
}

function hhiTier(hhi: number): { market_type: string; rigging_threshold: number } {
  if (hhi > 4_000) return { market_type: "oligopoly",               rigging_threshold: 0.90 };
  if (hhi > 2_500) return { market_type: "concentrated",            rigging_threshold: 0.85 };
  if (hhi > 1_500) return { market_type: "moderately_concentrated", rigging_threshold: 0.75 };
  return             { market_type: "competitive",                   rigging_threshold: 0.60 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "azt-mcp-server", version: "1.0.0" });

// Shared enum schemas
const CountryEnum = z.enum(["MX", "BR", "GH"]);
const SectorEnum  = z.enum(["pharma", "telecom", "construction", "oil_gas"]);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: analyze_tender_gaps
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "analyze_tender_gaps",
  "Identify missing specification fields in a procurement tender and classify " +
  "each gap by severity (CRITICAL / HIGH / MEDIUM / LOW). Returns gap count, " +
  "severity breakdown, and AI-suggested fill values where available.",
  {
    country:        CountryEnum.describe("ISO country code"),
    sector:         SectorEnum.describe("Procurement sector"),
    present_fields: z.array(z.string()).default([])
                     .describe("Field names already present in the tender"),
  },
  async ({ country, sector, present_fields }) => {
    const taxonomy = GAP_TAXONOMIES[sector];
    if (!taxonomy) return err(`Unknown sector: ${sector}`);

    const presentSet = new Set(present_fields.map((f: string) => f.toLowerCase().trim()));
    const gaps = taxonomy.filter(([field]) => !presentSet.has(field));

    const bySeverity: Record<string, string[]> = {};
    for (const [field, sev] of gaps) {
      (bySeverity[sev] ??= []).push(field);
    }

    return ok({
      country,
      sector,
      total_fields:   taxonomy.length,
      present_count:  taxonomy.length - gaps.length,
      gap_count:      gaps.length,
      critical_count: (bySeverity["CRITICAL"] ?? []).length,
      severity_breakdown: bySeverity,
      gaps: gaps.map(([field, severity]) => ({
        field,
        severity,
        suggestion:  SUGGESTIONS[field]?.[0] ?? null,
        confidence:  SUGGESTIONS[field]?.[1] ?? null,
      })),
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: fill_specification_gaps
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "fill_specification_gaps",
  "Return AI-generated fill suggestions for a list of missing tender fields. " +
  "Each suggestion includes a confidence score (0–1).",
  {
    sector:         SectorEnum.describe("Procurement sector"),
    country:        CountryEnum.describe("ISO country code"),
    missing_fields: z.array(z.string())
                     .describe("Field names that need suggested values"),
  },
  async ({ sector, country, missing_fields }) => {
    const taxonomy   = GAP_TAXONOMIES[sector] ?? [];
    const missingSet = new Set(missing_fields.map((f: string) => f.toLowerCase().trim()));

    const filled = taxonomy
      .filter(([f]) => missingSet.has(f))
      .map(([field, severity]) => {
        const sug = SUGGESTIONS[field];
        return {
          field,
          severity,
          suggested_value: sug
            ? sug[0]
            : `Standard ${field.replace(/_/g, " ")} per ${COUNTRIES[country]?.procurementLaw ?? "applicable law"}`,
          confidence:  sug ? sug[1] : null,
          source_note: `Consult ${COUNTRIES[country]?.regulators?.[sector] ?? "sector regulator"}`,
        };
      });

    return ok({
      sector,
      country,
      filled_count:   filled.length,
      coverage_pct:   taxonomy.length ? Math.round((filled.length / taxonomy.length) * 100) : 0,
      suggestions:    filled,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: score_suppliers
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "score_suppliers",
  "Generate weighted supplier scores for a tender using the sector-specific " +
  "weighting matrix (performance, price, capacity, proximity, compliance, " +
  "cross_sector). Returns a ranked shortlist with per-dimension scores.",
  {
    country:  CountryEnum.describe("ISO country code"),
    sector:   SectorEnum.describe("Procurement sector"),
    num_bids: z.number().int().min(1).max(50).default(5)
               .describe("Number of bids to simulate and rank"),
  },
  async ({ country, sector, num_bids }) => {
    const weights = SECTOR_WEIGHTS[sector];
    if (!weights) return err(`Unknown sector: ${sector}`);

    const rng  = seededRandom(`${country}${sector}${num_bids}`);
    const dims = Object.keys(weights);

    const bids = Array.from({ length: num_bids }, (_, i) => {
      const scores: Record<string, number> = {};
      for (const d of dims) scores[d] = Math.round(rng() * 100) / 100;

      const weighted = Object.entries(scores).reduce(
        (acc, [d, v]) => acc + (weights[d] ?? 0) * v, 0,
      );

      return {
        rank:             i + 1,
        bid_id:           `${country}-${sector.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
        total_score:      Math.round(weighted * 100) / 100,
        dimension_scores: scores,
      };
    });

    bids.sort((a, b) => b.total_score - a.total_score);
    bids.forEach((b, i) => { b.rank = i + 1; });

    return ok({
      country,
      sector,
      weights_used:             weights,
      top_proximity_weight_pct: (weights["proximity"] ?? 0) * 100,
      bids,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: calculate_market_concentration
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "calculate_market_concentration",
  "Calculate the Herfindahl-Hirschman Index (HHI) for a country-sector market " +
  "and classify it (competitive / moderately_concentrated / concentrated / " +
  "oligopoly). Also returns the applicable bid-rigging co-occurrence threshold.",
  {
    country: CountryEnum.describe("ISO country code"),
    sector:  SectorEnum.describe("Procurement sector"),
  },
  async ({ country, sector }) => {
    const n = SUPPLIER_COUNTS[country]?.[sector];
    if (!n) return err(`No supplier data for ${country}/${sector}`);

    const hhi  = computeHHI(country, sector);
    const tier = hhiTier(hhi);

    return ok({
      country,
      sector,
      supplier_count:  n,
      hhi,
      ...tier,
      interpretation:
        `HHI ${hhi} — ${tier.market_type}. ` +
        `Bid-rigging detection threshold: ${tier.rigging_threshold}.`,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: generate_pricing_variants
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "generate_pricing_variants",
  "Generate three bid-price variants (aggressive / balanced / conservative) " +
  "for a tender, calibrated to the country-sector risk profile. " +
  "Balanced variant uses the geometric mean of all risk premiums, rounded to 1 decimal.",
  {
    country:         CountryEnum.describe("ISO country code"),
    sector:          SectorEnum.describe("Procurement sector"),
    estimated_value: z.number().positive().describe("Tender estimated value in local currency"),
    contract_months: z.number().int().min(1).max(120).default(12)
                      .describe("Contract duration in months"),
  },
  async ({ country, sector, estimated_value, contract_months }) => {
    const profile = RISK_PROFILES[country];
    if (!profile) return err(`Unknown country: ${country}`);

    const risks      = Object.values(profile);
    const totalRisk  = risks.reduce((a, b) => a + b, 0);
    const monthScale = Math.min(contract_months / 12, 1);

    // Balanced: geometric mean of risk values, rounded to 1 decimal place
    const geomMean        = Math.pow(risks.reduce((a, b) => a * b, 1), 1 / risks.length);
    const balancedPct     = Math.round(geomMean * 10) / 10;
    const aggressivePct   = Math.round(totalRisk * monthScale * 10) / 10;
    const conservativePct = Math.round((balancedPct / 2) * 10) / 10;

    const currency  = COUNTRIES[country]?.currency ?? "USD";
    const inflation = profile.inflation ?? 0;
    const indexName = INFLATION_INDEX[country] ?? "CPI";
    const hhi       = computeHHI(country, sector);
    const tier      = hhiTier(hhi);

    return ok({
      country,
      sector,
      currency,
      estimated_value,
      contract_months,
      total_risk_percent: totalRisk,
      inflation_index:    indexName,
      market_type:        tier.market_type,
      variants: [
        {
          type:             "aggressive",
          price:            Math.round(estimated_value * (1 - aggressivePct   / 100)),
          discount_percent: aggressivePct,
          note:             "Absorbs full annual risk; maximises win probability.",
        },
        {
          type:             "balanced",
          price:            Math.round(estimated_value * (1 - balancedPct     / 100)),
          discount_percent: balancedPct,
          note:             `Geometric-mean risk discount (${indexName} inflation: ${inflation}%). Recommended.`,
        },
        {
          type:             "conservative",
          price:            Math.round(estimated_value * (1 - conservativePct / 100)),
          discount_percent: conservativePct,
          note:             "Half the balanced discount; preserves margin in concentrated markets.",
        },
      ],
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: calculate_risk_premium
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "calculate_risk_premium",
  "Return the total risk premium (%) for a country contract, broken down by " +
  "payment-delay, FX-exposure, change-order, and inflation components.",
  {
    country:         CountryEnum.describe("ISO country code"),
    contract_months: z.number().int().min(1).max(120).default(12)
                      .describe("Contract duration in months"),
  },
  async ({ country, contract_months }) => {
    const profile = RISK_PROFILES[country];
    if (!profile) return err(`Unknown country: ${country}`);

    const total = Object.values(profile).reduce((a, b) => a + b, 0);

    return ok({
      country,
      contract_months,
      breakdown:              profile,
      total_percent:          total,
      currency:               COUNTRIES[country]?.currency,
      avg_payment_delay_days: COUNTRIES[country]?.avgPaymentDelayDays,
      note: "Sum of all four risk components over the base 12-month period.",
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: detect_bid_rigging
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "detect_bid_rigging",
  "Assess bid-rigging risk using HHI-based co-occurrence thresholds. " +
  "Oligopoly markets (HHI > 4 000) use the 0.90 threshold. " +
  "Optionally provide bid amounts for price-spread statistical analysis.",
  {
    country:     CountryEnum.describe("ISO country code"),
    sector:      SectorEnum.describe("Procurement sector"),
    bid_amounts: z.array(z.number()).optional()
                  .describe("Submitted bid amounts for spread analysis"),
  },
  async ({ country, sector, bid_amounts = [] }) => {
    const hhi  = computeHHI(country, sector);
    const tier = hhiTier(hhi);
    const flags: string[] = [];
    let spread_cv: number | null = null;

    if (bid_amounts.length >= 2) {
      const mean     = bid_amounts.reduce((a: number, b: number) => a + b, 0) / bid_amounts.length;
      const variance = bid_amounts.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / bid_amounts.length;
      spread_cv = Math.round((Math.sqrt(variance) / mean) * 1_000) / 1_000;
      if (spread_cv < 0.05) flags.push("Abnormally low price spread — possible bid rotation.");
      if (bid_amounts.length < 3) flags.push("Fewer than 3 bidders — limited competition.");
    }

    if (tier.market_type === "oligopoly" || tier.market_type === "concentrated") {
      flags.push(`${tier.market_type} market (HHI ${hhi}) — elevated collusion risk.`);
    }

    return ok({
      country,
      sector,
      hhi,
      market_type:       tier.market_type,
      rigging_threshold: tier.rigging_threshold,
      supplier_count:    SUPPLIER_COUNTS[country]?.[sector],
      spread_cv,
      flags,
      risk_level: flags.length === 0 ? "LOW" : flags.length === 1 ? "MEDIUM" : "HIGH",
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: get_country_profile
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "get_country_profile",
  "Return the full AZT country profile including procurement law, data-protection " +
  "regime, compliance registries, procurement portals, sector regulators, FX " +
  "volatility, and average payment delay.",
  { country: CountryEnum.describe("ISO country code") },
  async ({ country }) => {
    const profile = COUNTRIES[country];
    if (!profile) return err(`Unknown country: ${country}`);
    return ok({ country, ...profile });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: get_sector_weights
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "get_sector_weights",
  "Return the supplier-matching weight configuration for a sector. " +
  "Weights sum to 1.0 across: performance, price, capacity, proximity, compliance, cross_sector.",
  { sector: SectorEnum.describe("Procurement sector") },
  async ({ sector }) => {
    const weights = SECTOR_WEIGHTS[sector];
    if (!weights) return err(`Unknown sector: ${sector}`);
    const top = Object.entries(weights).sort(([, a], [, b]) => b - a)[0];
    return ok({
      sector,
      weights,
      highest_weight_dimension: top[0],
      highest_weight_value:     top[1],
      highest_weight_percent:   top[1] * 100,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: list_gap_taxonomy
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "list_gap_taxonomy",
  "Return the complete list of required specification fields for a sector, " +
  "each tagged with a severity level (CRITICAL / HIGH / MEDIUM / LOW).",
  { sector: SectorEnum.describe("Procurement sector") },
  async ({ sector }) => {
    const taxonomy = GAP_TAXONOMIES[sector];
    if (!taxonomy) return err(`Unknown sector: ${sector}`);
    const counts: Record<string, number> = {};
    for (const [, sev] of taxonomy) counts[sev] = (counts[sev] ?? 0) + 1;
    return ok({
      sector,
      total_fields:    taxonomy.length,
      severity_counts: counts,
      fields:          taxonomy.map(([field, severity]) => ({ field, severity })),
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Resources
// ─────────────────────────────────────────────────────────────────────────────

server.resource("countries", "azt://countries", async () => ({
  contents: [{
    uri:      "azt://countries",
    mimeType: "application/json",
    text:     JSON.stringify(
      Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, {
        name: v.name, currency: v.currency, registries: v.registries.length,
        portals: v.portals, avgPaymentDelayDays: v.avgPaymentDelayDays,
      }])),
      null, 2,
    ),
  }],
}));

server.resource("sector_weights", "azt://sector_weights", async () => ({
  contents: [{
    uri:      "azt://sector_weights",
    mimeType: "application/json",
    text:     JSON.stringify(SECTOR_WEIGHTS, null, 2),
  }],
}));

server.resource("gap_taxonomies", "azt://gap_taxonomies", async () => ({
  contents: [{
    uri:      "azt://gap_taxonomies",
    mimeType: "application/json",
    text:     JSON.stringify(
      Object.fromEntries(Object.entries(GAP_TAXONOMIES).map(([s, f]) => [s, f.length])),
      null, 2,
    ),
  }],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("AZT MCP server running on stdio\n");
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
