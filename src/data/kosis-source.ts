import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

const ENDPOINT = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

export interface KosisRow {
  period: string;
  c1nm: string;
  c2nm: string | null;
  c3nm: string | null;
  item: string;
  value: number | null;
}

// 교차표의 행/열을 어느 필드에서 읽을지. 일부 KOSIS 표는 한 축을
// 분류(C1/C2)가 아니라 항목(ITM_NM)으로 인코딩한다(예: DT_1JC1511의 가구원수).
export type KosisAxis = "c1nm" | "c2nm" | "c3nm" | "item";

export function buildKosisUrl(p: {
  apiKey: string;
  tblId: string;
  orgId?: string;
  objL1?: string;
  objL2?: string;
  objL3?: string;
  prdSe?: string;
  startPrdDe?: string;
  endPrdDe?: string;
  newEstPrdCnt?: number;
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
    ...(p.objL3 ? { objL3: p.objL3 } : {}),
    prdSe: p.prdSe ?? "Y",
    ...(p.startPrdDe ? { startPrdDe: p.startPrdDe } : {}),
    ...(p.endPrdDe ? { endPrdDe: p.endPrdDe } : {}),
    ...(p.newEstPrdCnt ? { newEstPrdCnt: String(p.newEstPrdCnt) } : {}),
    format: "json",
    jsonVD: "Y",
  });
  return `${ENDPOINT}?${q.toString()}`;
}

function toNumOrNull(dt: unknown): number | null {
  if (dt === "" || dt == null) return null;
  const n = Number(dt);
  return Number.isFinite(n) ? n : null;
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
    c3nm: r.C3_NM != null ? String(r.C3_NM) : null,
    item: String(r.ITM_NM ?? ""),
    // KOSIS는 비공표를 "X", 결측/해당없음을 "-" 등 비숫자로 표기 → null 처리.
    value: toNumOrNull(r.DT),
  }));
}

export function rowsToCrossTable(
  rows: KosisRow[],
  rowKeys: string[],
  colKeys: string[],
  opts?: { rowField?: KosisAxis; colField?: KosisAxis },
): number[][] {
  const rowField = opts?.rowField ?? "c1nm";
  const colField = opts?.colField ?? "c2nm";
  const ri = Object.fromEntries(rowKeys.map((k, i) => [k, i]));
  const ci = Object.fromEntries(colKeys.map((k, i) => [k, i]));
  const M = rowKeys.map(() => colKeys.map(() => 0));
  for (const r of rows) {
    if (r.value == null) continue;
    const rv = r[rowField];
    const cv = r[colField];
    if (rv == null || cv == null) continue;
    const i = ri[rv];
    const j = ci[cv];
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
  // 행/열을 읽을 축(기본 c1nm × c2nm). 항목축 표는 colAxis: "item" 등으로 지정.
  rowAxis?: KosisAxis;
  colAxis?: KosisAxis;
  objL1?: string;
  objL2?: string;
  itmId?: string;
  prdSe?: string;
  startPrdDe?: string;
  endPrdDe?: string;
  newEstPrdCnt?: number;
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
      newEstPrdCnt: this.opts.newEstPrdCnt,
    });
    const res = await f(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from KOSIS`);
    const rows = parseKosisRows(await res.json());
    const matrix = rowsToCrossTable(
      rows,
      this.opts.rowDim.keys,
      this.opts.colDim.keys,
      { rowField: this.opts.rowAxis, colField: this.opts.colAxis },
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
