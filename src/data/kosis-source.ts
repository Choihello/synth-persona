import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

const ENDPOINT = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

export interface KosisRow {
  period: string;
  c1nm: string;
  c2nm: string | null;
  value: number | null;
}

export function buildKosisUrl(p: {
  apiKey: string;
  tblId: string;
  orgId?: string;
  objL1?: string;
  objL2?: string;
  prdSe?: string;
  startPrdDe?: string;
  endPrdDe?: string;
  itmId?: string;
}): string {
  const q = new URLSearchParams({
    method: "getList",
    apiKey: p.apiKey,
    orgId: p.orgId ?? "101",
    tblId: p.tblId,
    itmId: p.itmId ?? "T1",
    objL1: p.objL1 ?? "ALL",
    ...(p.objL2 ? { objL2: p.objL2 } : {}),
    prdSe: p.prdSe ?? "Y",
    ...(p.startPrdDe ? { startPrdDe: p.startPrdDe } : {}),
    ...(p.endPrdDe ? { endPrdDe: p.endPrdDe } : {}),
    format: "json",
    jsonVD: "Y",
  });
  return `${ENDPOINT}?${q.toString()}`;
}

export function parseKosisRows(json: unknown): KosisRow[] {
  if (!Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const code = o?.err ?? o?.errCd ?? "?";
    const msg = o?.errMsg ?? JSON.stringify(json);
    throw new Error(`KOSIS API error [${code}]: ${msg}`);
  }
  return json.map((r: Record<string, unknown>) => ({
    period: String(r.PRD_DE ?? ""),
    c1nm: String(r.C1_NM ?? ""),
    c2nm: r.C2_NM != null ? String(r.C2_NM) : null,
    value: r.DT === "" || r.DT == null ? null : Number(r.DT),
  }));
}

export function rowsToCrossTable(
  rows: KosisRow[],
  rowKeys: string[],
  colKeys: string[],
): number[][] {
  const ri = Object.fromEntries(rowKeys.map((k, i) => [k, i]));
  const ci = Object.fromEntries(colKeys.map((k, i) => [k, i]));
  const M = rowKeys.map(() => colKeys.map(() => 0));
  for (const r of rows) {
    if (r.value == null || r.c2nm == null) continue;
    const i = ri[r.c1nm];
    const j = ci[r.c2nm];
    if (i == null || j == null) continue;
    M[i][j] += r.value;
  }
  const tot = M.flat().reduce((a, b) => a + b, 0);
  if (tot > 0)
    for (let i = 0; i < M.length; i++)
      for (let j = 0; j < M[i].length; j++) M[i][j] /= tot;
  return M;
}

export interface KosisOpts {
  apiKey: string;
  tblId: string;
  rowDim: { name: string; keys: string[] };
  colDim: { name: string; keys: string[] };
  objL1?: string;
  objL2?: string;
  itmId?: string;
  prdSe?: string;
  startPrdDe?: string;
  endPrdDe?: string;
  fetchImpl?: typeof fetch;
}

export class KosisSource implements DataSource {
  constructor(private opts: KosisOpts) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    const f = this.opts.fetchImpl ?? fetch;
    const url = buildKosisUrl({
      apiKey: this.opts.apiKey,
      tblId: this.opts.tblId,
      objL1: this.opts.objL1,
      objL2: this.opts.objL2,
      itmId: this.opts.itmId,
      prdSe: this.opts.prdSe,
      startPrdDe: this.opts.startPrdDe,
      endPrdDe: this.opts.endPrdDe,
    });
    const res = await f(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from KOSIS`);
    const rows = parseKosisRows(await res.json());
    const matrix = rowsToCrossTable(
      rows,
      this.opts.rowDim.keys,
      this.opts.colDim.keys,
    );
    return {
      dimensions: [
        { name: this.opts.rowDim.name, categories: this.opts.rowDim.keys },
        { name: this.opts.colDim.name, categories: this.opts.colDim.keys },
      ],
      marginals: {},
      crossTables: [
        { dims: [this.opts.rowDim.name, this.opts.colDim.name], matrix },
      ],
    };
  }
}
