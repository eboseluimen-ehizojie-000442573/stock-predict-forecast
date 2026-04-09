// PATH: C:\Users\prome\anaconda_projects\capstone_stockPredict\stock-predict-forecast\app\trading\stock\page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DatasetMode = "server_combined" | "server_seen_10" | "server_unseen_4" | "upload" | "default";

type SetupStatus = {
  ok: boolean;
  pythonExists: boolean;
  modelExists: boolean;
  dataExists: boolean;
  pythonPath: string | null;
  modelPath: string | null;
  dataPath: string | null;
  messages: string[];
  bundledData?: Record<string, string>;
};

type Summary = {
  ticker: string;
  startDate: string;
  endDate: string;
  directionAccuracy: number | null;
  predictionAccuracy: number | null;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  avgTrade: number;
  eventCount: number;
  rowsInWindow: number;
  scoredRows: number;
  historicalRows: number;
  forecastRows: number;
  forecastStart: string | null;
  sourceLabel: string;
  modelName: string;
  lastClose: number | null;
  latestForecastP10: number | null;
  latestForecastP50: number | null;
  latestForecastP90: number | null;
  latestFinalDecision: string | null;
};

type TableRow = {
  Date: string;
  Ticker: string;
  Section: "Historical" | "Forecast";
  Close: number | null;
  TargetPrice: number | null;
  PredPrice: number | null;
  TargetReturn: number | null;
  PredReturn: number | null;
  PredProbUp: number | null;
  Action: string;
  Position: number | null;
  StrategyReturn: number | null;
  PredictionAccuracyPct: number | null;
  PriceError: number | null;
  AbsPriceError: number | null;
  ForecastPredictedAccuracyPct: number | null;
  ForecastConfidencePct: number | null;
  ForecastVolatilityPct: number | null;
  ForecastMoveVsVol: number | null;
  P10Price: number | null;
  P50Price: number | null;
  P90Price: number | null;
  FinalDecision: string | null;
  DecisionGrade: string | null;
  FinalDecisionScore: number | null;
};

type GraphPoint = {
  Date: string;
  Section: "Historical" | "Forecast";
  ActualPrice: number | null;
  PredPriceHistorical: number | null;
  PredPriceForecast: number | null;
  P10Price: number | null;
  P50Price: number | null;
  P90Price: number | null;
  EntryPrice: number | null;
  ExitPrice: number | null;
};

type ApiSuccess = {
  ok: true;
  setup: SetupStatus;
  tickers: string[];
  summary: Summary;
  graph: GraphPoint[];
  table: TableRow[];
  availableDateRange: { min: string | null; max: string | null };
  defaults: {
    ticker: string | null;
    startDate: string | null;
    endDate: string | null;
    rowMode: "Top" | "Bottom";
    rowCount: number;
    sortBy: string;
  };
  info: string[];
};

type ApiError = {
  ok: false;
  setup?: SetupStatus;
  error: string;
  details?: string | string[];
};

type ApiResponse = ApiSuccess | ApiError;

type SortField =
  | "Date"
  | "PredictionAccuracyPct"
  | "AbsPriceError"
  | "PriceError"
  | "PredProbUp"
  | "PredReturn"
  | "TargetPrice"
  | "PredPrice"
  | "TradeStrategyReturn"
  | "ForecastConfidencePct"
  | "FinalDecisionScore"
  | "P50Price"
  | "Close";

type RawCsvRow = Record<string, string>;
type NumericField = keyof Pick<
  TableRow,
  | "Close"
  | "TargetPrice"
  | "PredPrice"
  | "TargetReturn"
  | "PredReturn"
  | "PredProbUp"
  | "Position"
  | "StrategyReturn"
  | "PredictionAccuracyPct"
  | "PriceError"
  | "AbsPriceError"
  | "ForecastPredictedAccuracyPct"
  | "ForecastConfidencePct"
  | "ForecastVolatilityPct"
  | "ForecastMoveVsVol"
  | "P10Price"
  | "P50Price"
  | "P90Price"
  | "FinalDecisionScore"
>;

const datasetOptions: Array<{ value: DatasetMode; label: string }> = [
  { value: "server_combined", label: "Bundled 14-ticker web CSV" },
  { value: "server_seen_10", label: "Bundled 10-ticker web CSV" },
  { value: "server_unseen_4", label: "Bundled 4-ticker web CSV" },
  { value: "upload", label: "Upload scored CSV" },
  { value: "default", label: "Legacy default server dataset" },
];

const datasetUrlMap: Record<Exclude<DatasetMode, "upload">, string> = {
  server_combined: "/data/stock_all_14_tickers_scored_for_web_365d_final.csv",
  server_seen_10: "/data/stock_seen_10_tickers_scored_for_web_365d_final.csv",
  server_unseen_4: "/data/stock_unseen_4_tickers_scored_for_web_365d_final.csv",
  default: "/data/stock_all_14_tickers_scored_for_web_365d_final.csv",
};

const datasetLabelMap: Record<Exclude<DatasetMode, "upload">, string> = {
  server_combined: "Bundled 14-ticker web CSV",
  server_seen_10: "Bundled 10-ticker web CSV",
  server_unseen_4: "Bundled 4-ticker web CSV",
  default: "Legacy default server dataset",
};

const seenTickers = ["AAPL", "AMZN", "BA", "GOOG", "IBM", "MGM", "MSFT", "T", "TSLA", "sp500"];
const unseenTickers = ["JPM", "NFLX", "NVDA", "WMT"];

const legendOrder = [
  "Actual Price",
  "Historical Predicted Price",
  "Forecast Band (P10-P90)",
  "Forecast P10",
  "Forecast P50",
  "Forecast P90",
];

const sortOptions: Array<{ value: SortField; label: string }> = [
  { value: "Date", label: "Date" },
  { value: "PredictionAccuracyPct", label: "Prediction Accuracy %" },
  { value: "ForecastConfidencePct", label: "Forecast Confidence %" },
  { value: "FinalDecisionScore", label: "Decision Score" },
  { value: "AbsPriceError", label: "Absolute Price Error" },
  { value: "PriceError", label: "Price Error" },
  { value: "PredProbUp", label: "Predicted Probability Up" },
  { value: "PredReturn", label: "Predicted Return" },
  { value: "TargetPrice", label: "Actual Next-Day Price" },
  { value: "PredPrice", label: "Predicted Next-Day Price" },
  { value: "P50Price", label: "Forecast P50" },
  { value: "TradeStrategyReturn", label: "Trade Strategy Return" },
  { value: "Close", label: "Close" },
];

const numericFields: NumericField[] = [
  "Close",
  "TargetPrice",
  "PredPrice",
  "TargetReturn",
  "PredReturn",
  "PredProbUp",
  "Position",
  "StrategyReturn",
  "PredictionAccuracyPct",
  "PriceError",
  "AbsPriceError",
  "ForecastPredictedAccuracyPct",
  "ForecastConfidencePct",
  "ForecastVolatilityPct",
  "ForecastMoveVsVol",
  "P10Price",
  "P50Price",
  "P90Price",
  "FinalDecisionScore",
];

function fmtNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(2)}%`;
}

function fmtSigned(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function parseCsv(text: string): RawCsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      value = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((item) => item.trim());
  return rows.slice(1).map((cells) => {
    const record: RawCsvRow = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned === "—" || cleaned.toLowerCase() === "nan" || cleaned.toLowerCase() === "null") {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSection(value: string | undefined): "Historical" | "Forecast" {
  return value?.toLowerCase() === "forecast" ? "Forecast" : "Historical";
}

function normalizeTableRow(row: RawCsvRow): TableRow {
  const section = normalizeSection(row.Section);
  const base: TableRow = {
    Date: row.Date || "",
    Ticker: row.Ticker || "",
    Section: section,
    Close: null,
    TargetPrice: null,
    PredPrice: null,
    TargetReturn: null,
    PredReturn: null,
    PredProbUp: null,
    Action: row.Action || "",
    Position: null,
    StrategyReturn: null,
    PredictionAccuracyPct: null,
    PriceError: null,
    AbsPriceError: null,
    ForecastPredictedAccuracyPct: null,
    ForecastConfidencePct: null,
    ForecastVolatilityPct: null,
    ForecastMoveVsVol: null,
    P10Price: null,
    P50Price: null,
    P90Price: null,
    FinalDecision: row.FinalDecision || null,
    DecisionGrade: row.DecisionGrade || null,
    FinalDecisionScore: null,
  };

  numericFields.forEach((field) => {
    base[field] = parseNumber(row[field]);
  });

  if (base.P50Price === null) {
    base.P50Price = base.PredPrice;
  }

  return base;
}

function sortRows(rows: TableRow[], sortBy: SortField, rowMode: "Top" | "Bottom", rowCount: number): TableRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (sortBy === "Date") {
      return a.Date.localeCompare(b.Date);
    }

    const getNumericValue = (item: TableRow): number => {
      if (sortBy === "TradeStrategyReturn") return item.StrategyReturn ?? Number.NEGATIVE_INFINITY;
      const value = (item as unknown as Record<string, number | null | undefined>)[sortBy];
      return value ?? Number.NEGATIVE_INFINITY;
    };

    const av = getNumericValue(a);
    const bv = getNumericValue(b);

    if (av === bv) return a.Date.localeCompare(b.Date);
    return rowMode === "Top" ? bv - av : av - bv;
  });

  if (sortBy === "Date") {
    return rowMode === "Top" ? sorted.slice(0, rowCount) : sorted.slice(Math.max(0, sorted.length - rowCount));
  }

  return sorted.slice(0, rowCount);
}

function buildApiSuccess(
  rawRows: RawCsvRow[],
  state: {
    datasetMode: DatasetMode;
    ticker: string;
    startDate: string;
    endDate: string;
    rowMode: "Top" | "Bottom";
    rowCount: number;
    sortBy: SortField;
    uploadedCsvText: string | null;
  }
): ApiSuccess {
  const allRows = rawRows.map(normalizeTableRow).filter((row) => row.Date && row.Ticker);
  const tickers = Array.from(new Set(allRows.map((row) => row.Ticker))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const resolvedTicker = state.ticker || tickers[0] || "";
  const tickerRows = allRows.filter((row) => row.Ticker === resolvedTicker);
  const dates = tickerRows.map((row) => row.Date).sort();

  const availableMin = dates[0] ?? null;
  const availableMax = dates[dates.length - 1] ?? null;

  const resolvedStart = state.startDate || availableMin || "";
  const resolvedEnd = state.endDate || availableMax || "";

  const windowRows = tickerRows.filter((row) => {
    const afterStart = !resolvedStart || row.Date >= resolvedStart;
    const beforeEnd = !resolvedEnd || row.Date <= resolvedEnd;
    return afterStart && beforeEnd;
  });

  const historicalRows = windowRows.filter((row) => row.Section === "Historical");
  const forecastRows = windowRows.filter((row) => row.Section === "Forecast");

  const directionRows = historicalRows.filter((row) => row.PredReturn !== null && row.TargetReturn !== null);
  const directionCorrect = directionRows.filter((row) => {
    if (row.PredReturn === null || row.TargetReturn === null) return false;
    const predSign = row.PredReturn >= 0 ? 1 : -1;
    const targetSign = row.TargetReturn >= 0 ? 1 : -1;
    return predSign === targetSign;
  }).length;

  const directionAccuracy = directionRows.length ? (directionCorrect / directionRows.length) * 100 : null;

  const predictionRows = historicalRows.filter((row) => row.PredictionAccuracyPct !== null);
  const predictionAccuracy = predictionRows.length
    ? predictionRows.reduce((sum, row) => sum + (row.PredictionAccuracyPct ?? 0), 0) / predictionRows.length
    : null;

  const strategyRows = historicalRows.filter((row) => row.StrategyReturn !== null);
  const totalProfit = strategyRows.reduce((sum, row) => sum + Math.max(row.StrategyReturn ?? 0, 0), 0);
  const totalLoss = strategyRows.reduce((sum, row) => sum + Math.min(row.StrategyReturn ?? 0, 0), 0);
  const netProfit = strategyRows.reduce((sum, row) => sum + (row.StrategyReturn ?? 0), 0);

  const winRows = strategyRows.filter((row) => (row.StrategyReturn ?? 0) > 0).length;
  const winRate = strategyRows.length ? (winRows / strategyRows.length) * 100 : 0;
  const bestTrade = strategyRows.length ? Math.max(...strategyRows.map((row) => row.StrategyReturn ?? 0)) : 0;
  const worstTrade = strategyRows.length ? Math.min(...strategyRows.map((row) => row.StrategyReturn ?? 0)) : 0;
  const avgTrade = strategyRows.length ? netProfit / strategyRows.length : 0;

  const eventCount = strategyRows.filter((row) => (row.StrategyReturn ?? 0) !== 0).length;
  const forecastStart = forecastRows[0]?.Date ?? null;
  const latestRow = windowRows[windowRows.length - 1] ?? null;
  const latestForecastRow = forecastRows[forecastRows.length - 1] ?? null;
  const modelName = "Direct CSV Web Load";

  const graph: GraphPoint[] = windowRows.map((row) => ({
    Date: row.Date,
    Section: row.Section,
    ActualPrice: row.Close,
    PredPriceHistorical: row.Section === "Historical" ? row.PredPrice : null,
    PredPriceForecast: row.Section === "Forecast" ? (row.P50Price ?? row.PredPrice) : null,
    P10Price: row.P10Price,
    P50Price: row.P50Price ?? row.PredPrice,
    P90Price: row.P90Price,
    EntryPrice: row.Action?.toLowerCase().includes("buy") ? row.Close : null,
    ExitPrice: row.Action?.toLowerCase().includes("sell") ? row.Close : null,
  }));

  const sourceLabel =
    state.datasetMode === "upload"
      ? `Uploaded CSV${state.uploadedCsvText ? "" : " (no file text found)"}`
      : datasetLabelMap[state.datasetMode];

  const table = sortRows(windowRows, state.sortBy, state.rowMode, state.rowCount);

  return {
    ok: true,
    setup: {
      ok: true,
      pythonExists: false,
      modelExists: false,
      dataExists: true,
      pythonPath: null,
      modelPath: null,
      dataPath: state.datasetMode === "upload" ? "Uploaded in browser" : datasetUrlMap[state.datasetMode],
      messages: [
        "Dashboard is loading the scored CSV directly from public/data or uploaded browser content.",
        "No backend Python environment is required for the deployed web app.",
        "Ticker changes and CSV uploads refresh automatically. Other control changes wait for Refresh now.",
      ],
      bundledData: {
        combined: datasetUrlMap.server_combined,
        seen10: datasetUrlMap.server_seen_10,
        unseen4: datasetUrlMap.server_unseen_4,
      },
    },
    tickers,
    summary: {
      ticker: resolvedTicker,
      startDate: resolvedStart || availableMin || "",
      endDate: resolvedEnd || availableMax || "",
      directionAccuracy,
      predictionAccuracy,
      totalProfit,
      totalLoss,
      netProfit,
      winRate,
      bestTrade,
      worstTrade,
      avgTrade,
      eventCount,
      rowsInWindow: windowRows.length,
      scoredRows: tickerRows.length,
      historicalRows: historicalRows.length,
      forecastRows: forecastRows.length,
      forecastStart,
      sourceLabel,
      modelName,
      lastClose: latestRow?.Close ?? null,
      latestForecastP10: latestForecastRow?.P10Price ?? null,
      latestForecastP50: latestForecastRow?.P50Price ?? latestForecastRow?.PredPrice ?? null,
      latestForecastP90: latestForecastRow?.P90Price ?? null,
      latestFinalDecision: latestForecastRow?.FinalDecision ?? latestForecastRow?.Action ?? null,
    },
    graph,
    table,
    availableDateRange: { min: availableMin, max: availableMax },
    defaults: {
      ticker: resolvedTicker || null,
      startDate: availableMin,
      endDate: availableMax,
      rowMode: "Bottom",
      rowCount: 10,
      sortBy: "Date",
    },
    info: [
      `${sourceLabel} loaded successfully.`,
      `Ticker count detected: ${tickers.length}.`,
      `Current window rows: ${windowRows.length}. Historical: ${historicalRows.length}. Forecast: ${forecastRows.length}.`,
    ],
  };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string | null; color?: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const hiddenNames = new Set([
    "ForecastBandBase",
    "ForecastBandSize",
    "EntryPrice",
    "ExitPrice",
    "Date",
  ]);

  const filtered = payload.filter((item) => {
    const name = String(item?.name ?? "").trim();
    const dataKey = String(item?.dataKey ?? "").trim();
    const value = item?.value;

    if (value === null || value === undefined || value === "") return false;
    if (hiddenNames.has(name) || hiddenNames.has(dataKey)) return false;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === label) return false;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
    }

    return true;
  });

  if (filtered.length === 0) return null;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Date: {label}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {filtered.map((item, index) => (
          <div key={`${String(item.name ?? "series")}-${index}`} style={{ color: item.color ?? "#111827" }}>
            {item.name}: {typeof item.value === "number" ? item.value.toFixed(4) : item.value}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLegend(props: any) {
  const payload = Array.isArray(props?.payload) ? props.payload : [];

  const filtered = payload
    .filter((item: any) => legendOrder.includes(String(item?.value ?? "")))
    .sort(
      (a: any, b: any) =>
        legendOrder.indexOf(String(a?.value ?? "")) -
        legendOrder.indexOf(String(b?.value ?? ""))
    );

  if (filtered.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "10px 18px",
        paddingTop: 12,
        paddingBottom: 2,
        fontSize: 14,
        lineHeight: 1.2,
      }}
    >
      {filtered.map((item: any) => (
        <div
          key={String(item.value)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            color: "#1f2937",
          }}
        >
          <span
            style={{
              width: 16,
              height: 0,
              borderTop: `3px solid ${item.color || "#2563eb"}`,
              display: "inline-block",
            }}
          />
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function EntryMarker(props: any) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return <path d={`M${cx} ${cy - 10} L${cx - 8} ${cy + 6} L${cx + 8} ${cy + 6} Z`} fill="#16a34a" stroke="#166534" strokeWidth={1.5} />;
}

function ExitMarker(props: any) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g>
      <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7} stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx + 7} y1={cy - 7} x2={cx - 7} y2={cy + 7} stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

export default function StockPage() {
  const [datasetMode, setDatasetMode] = useState<DatasetMode>("server_combined");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [uploadedCsvText, setUploadedCsvText] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [rowMode, setRowMode] = useState<"Top" | "Bottom">("Bottom");
  const [rowCount, setRowCount] = useState<number>(10);
  const [sortBy, setSortBy] = useState<SortField>("Date");
  const [loading, setLoading] = useState<boolean>(false);
  const [apiData, setApiData] = useState<ApiSuccess | null>(null);
  const [apiError, setApiError] = useState<string>("");
  const [apiDetails, setApiDetails] = useState<string>("");
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);
  const initializedRef = useRef(false);
  const lastRequestKeyRef = useRef<string>("");

  const fetchData = async (overrides?: Partial<{
    datasetMode: DatasetMode;
    uploadedCsvText: string | null;
    ticker: string;
    startDate: string;
    endDate: string;
    rowMode: "Top" | "Bottom";
    rowCount: number;
    sortBy: SortField;
  }>) => {
    const effectiveState = {
      datasetMode: overrides?.datasetMode ?? datasetMode,
      uploadedCsvText: overrides?.uploadedCsvText ?? uploadedCsvText,
      ticker: overrides?.ticker ?? ticker,
      startDate: overrides?.startDate ?? startDate,
      endDate: overrides?.endDate ?? endDate,
      rowMode: overrides?.rowMode ?? rowMode,
      rowCount: overrides?.rowCount ?? rowCount,
      sortBy: overrides?.sortBy ?? sortBy,
    };

    const requestKey = JSON.stringify(effectiveState);
    if (requestKey === lastRequestKeyRef.current && initializedRef.current) return;
    lastRequestKeyRef.current = requestKey;

    setLoading(true);
    setApiError("");
    setApiDetails("");

    try {
      let csvText = effectiveState.uploadedCsvText;
      if (effectiveState.datasetMode !== "upload") {
        const res = await fetch(datasetUrlMap[effectiveState.datasetMode]);
        if (!res.ok) {
          throw new Error(`Failed to load CSV (${res.status}) from ${datasetUrlMap[effectiveState.datasetMode]}`);
        }
        csvText = await res.text();
      }

      if (!csvText) {
        throw new Error("No CSV text available to parse.");
      }

      const parsedRows = parseCsv(csvText);
      const data = buildApiSuccess(parsedRows, effectiveState);

      initializedRef.current = true;
      setApiData(data);
      setHasPendingChanges(false);
      setTicker((overrides?.ticker ?? data.defaults.ticker ?? "") as string);
      setStartDate((overrides?.startDate ?? data.defaults.startDate ?? "") as string);
      setEndDate((overrides?.endDate ?? data.defaults.endDate ?? "") as string);
    } catch (error) {
      setApiData(null);
      setApiError("Unable to load stock CSV data.");
      setApiDetails(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setUploadedFileName(file.name);
      setUploadedCsvText(text);
      setDatasetMode("upload");
      setTicker("");
      setStartDate("");
      setEndDate("");
      lastRequestKeyRef.current = "";
      setHasPendingChanges(false);
      await fetchData({
        datasetMode: "upload",
        uploadedCsvText: text,
        ticker: "",
        startDate: "",
        endDate: "",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleDatasetModeChange = (value: DatasetMode) => {
    setDatasetMode(value);
    if (value !== "upload") {
      setUploadedFileName("");
      setUploadedCsvText(null);
    }
    setTicker("");
    setStartDate("");
    setEndDate("");
    setHasPendingChanges(true);
    lastRequestKeyRef.current = "";
  };

  const handleTickerChange = async (value: string) => {
    setTicker(value);
    setHasPendingChanges(false);
    lastRequestKeyRef.current = "";
    await fetchData({ ticker: value });
  };

  const handleDateChange = (kind: "start" | "end", value: string) => {
    if (kind === "start") setStartDate(value);
    else setEndDate(value);
    setHasPendingChanges(true);
  };

  const handleRowModeChange = (value: "Top" | "Bottom") => {
    setRowMode(value);
    setHasPendingChanges(true);
  };

  const handleRowCountChange = (value: number) => {
    setRowCount(value);
    setHasPendingChanges(true);
  };

  const handleSortByChange = (value: SortField) => {
    setSortBy(value);
    setHasPendingChanges(true);
  };

  const setup = apiData?.setup;
  const chartData = useMemo(
    () =>
      (apiData?.graph ?? []).map((row) => ({
        ...row,
        ForecastBandBase: row.P10Price,
        ForecastBandSize:
          row.P10Price !== null && row.P10Price !== undefined && row.P90Price !== null && row.P90Price !== undefined
            ? Number((row.P90Price - row.P10Price).toFixed(4))
            : null,
      })),
    [apiData]
  );
  const tableRows = apiData?.table ?? [];

  const entryPoints = useMemo(
    () => chartData.filter((row) => row.EntryPrice !== null && row.EntryPrice !== undefined),
    [chartData]
  );

  const exitPoints = useMemo(
    () => chartData.filter((row) => row.ExitPrice !== null && row.ExitPrice !== undefined),
    [chartData]
  );

  const forecastStart = useMemo(
    () => apiData?.summary.forecastStart ?? chartData.find((row) => row.Section === "Forecast")?.Date ?? null,
    [apiData, chartData]
  );

  const groupedTickers = useMemo(() => {
    const allTickers = apiData?.tickers ?? [];
    const seen = allTickers.filter((item) => seenTickers.includes(item));
    const unseen = allTickers.filter((item) => unseenTickers.includes(item));
    const other = allTickers.filter((item) => !seenTickers.includes(item) && !unseenTickers.includes(item));
    return { seen, unseen, other };
  }, [apiData]);

  const titleSummary = useMemo(() => {
    if (!apiData) return "Awaiting dataset selection.";
    const s = apiData.summary;
    const bandText = s.latestForecastP10 !== null && s.latestForecastP90 !== null
      ? ` | Latest forecast band ${fmtNumber(s.latestForecastP10, 2)} to ${fmtNumber(s.latestForecastP90, 2)}`
      : "";
    return `${s.ticker} — Direction Accuracy=${fmtPct(s.directionAccuracy)} | Prediction Accuracy=${fmtPct(s.predictionAccuracy)} | Win Rate=${fmtPct(s.winRate)}${bandText}`;
  }, [apiData]);

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Prediction Dashboard</h1>
          <p className="page-subtitle">
            The dashboard reads the web-ready 10-ticker file, the web-ready 4-ticker file, or the bundled combined file directly from public/data. Only ticker selection and file upload refresh automatically. All other control changes wait for a manual refresh so the page stays stable and fast.
          </p>
        </div>
        <div className="badge-row">
          <span className="badge warn">Python not required</span>
          <span className="badge warn">Model not required</span>
          <span className={`badge ${setup?.dataExists ? "good" : "warn"}`}>Web data {setup?.dataExists ? "found" : "missing"}</span>
        </div>
      </div>

      {apiError && (
        <div className="notice danger">
          <strong>{apiError}</strong>
          {apiDetails ? <div style={{ marginTop: 8 }}>{apiDetails}</div> : null}
        </div>
      )}

      <section className="panel card legend-panel" style={{ marginBottom: 16 }}>
        <h2>Color guide</h2>
        <div className="legend-pills">
          <span className="legend-pill historical">Historical actual close</span>
          <span className="legend-pill forecast">Forecast median path</span>
          <span className="legend-pill transition">Forecast zone and uncertainty band</span>
        </div>
        <p>
          Blue shows the actual price. Orange shows the historical model path and forecast median path. The highlighted forecast zone marks the future window. Inside that zone, the shaded band shows the lower and upper forecast range using P10 and P90.
        </p>
      </section>

      <section className="panel card" style={{ marginBottom: 16 }}>
        <h2>Controls</h2>
        <p>
          Choose a bundled web dataset or upload a scored CSV. Only ticker selection and file upload refresh automatically. Date range, rows, sorting, and dataset source changes wait for the Refresh button.
        </p>

        <div className="grid controls">
          <div className="field col-span-3">
            <label>Dataset source</label>
            <select value={datasetMode} onChange={(e) => handleDatasetModeChange(e.target.value as DatasetMode)}>
              {datasetOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field col-span-3">
            <label>CSV upload</label>
            <div className="file-picker-row">
              <label className="file-picker-button">
                <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />
                Choose CSV file
              </label>
              <div className="small">{uploadedFileName || "No uploaded file yet."}</div>
            </div>
          </div>

          <div className="field col-span-2">
            <label>Ticker</label>
            <select value={ticker} onChange={(e) => { void handleTickerChange(e.target.value); }}>
              <option value="">Auto-select</option>
              {groupedTickers.seen.length > 0 ? (
                <optgroup label="Seen">
                  {groupedTickers.seen.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </optgroup>
              ) : null}
              {groupedTickers.unseen.length > 0 ? (
                <optgroup label="Unseen">
                  {groupedTickers.unseen.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </optgroup>
              ) : null}
              {groupedTickers.other.length > 0 ? (
                <optgroup label="Other">
                  {groupedTickers.other.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>

          <div className="field col-span-2">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => handleDateChange("start", e.target.value)} />
          </div>

          <div className="field col-span-2">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => handleDateChange("end", e.target.value)} />
          </div>

          <div className="field col-span-2">
            <label>Rows</label>
            <select value={rowMode} onChange={(e) => handleRowModeChange(e.target.value as "Top" | "Bottom") }>
              <option value="Top">Top</option>
              <option value="Bottom">Bottom</option>
            </select>
          </div>

          <div className="field col-span-2">
            <label>Row count</label>
            <input type="number" min={1} max={200} value={rowCount} onChange={(e) => handleRowCountChange(Number(e.target.value || 10))} />
          </div>

          <div className="field col-span-4">
            <label>Sort by</label>
            <select value={sortBy} onChange={(e) => handleSortByChange(e.target.value as SortField)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field col-span-12">
            <label>Available date range</label>
            <div className="small">
              {apiData?.availableDateRange.min && apiData?.availableDateRange.max
                ? `${apiData.availableDateRange.min} to ${apiData.availableDateRange.max}`
                : "Will appear after a successful load."}
            </div>
          </div>
        </div>

        {hasPendingChanges ? (
          <div className="notice" style={{ marginTop: 10, marginBottom: 10 }}>
            You changed one or more manual controls. Click Refresh now to update the graph and table.
          </div>
        ) : null}

        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn" type="button" disabled={loading} onClick={() => { lastRequestKeyRef.current = ""; void fetchData(); }}>
            {loading ? "Refreshing..." : "Refresh now"}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setDatasetMode("server_combined");
              setUploadedCsvText(null);
              setUploadedFileName("");
              setTicker("");
              setStartDate("");
              setEndDate("");
              setRowMode("Bottom");
              setRowCount(10);
              setSortBy("Date");
              setHasPendingChanges(true);
              lastRequestKeyRef.current = "";
            }}
          >
            Reset view
          </button>
        </div>
      </section>

      <section className="grid metrics">
        <div className="panel metric-card metric-historical">
          <div className="metric-label">Direction Accuracy</div>
          <div className="metric-value">{fmtPct(apiData?.summary.directionAccuracy)}</div>
          <div className="metric-helper">Historical rows only.</div>
        </div>
        <div className="panel metric-card metric-historical">
          <div className="metric-label">Prediction Accuracy</div>
          <div className="metric-value">{fmtPct(apiData?.summary.predictionAccuracy)}</div>
          <div className="metric-helper">Historical price accuracy where actual targets exist.</div>
        </div>
        <div className="panel metric-card metric-historical">
          <div className="metric-label">Net Profit</div>
          <div className="metric-value">{fmtNumber(apiData?.summary.netProfit)}</div>
          <div className="metric-helper">Trade lifecycle result from the scored dataset.</div>
        </div>
        <div className="panel metric-card metric-forecast">
          <div className="metric-label">Latest Forecast P50</div>
          <div className="metric-value">{fmtNumber(apiData?.summary.latestForecastP50, 2)}</div>
          <div className="metric-helper">Median future path for the selected window.</div>
        </div>
        <div className="panel metric-card metric-forecast">
          <div className="metric-label">Latest Band</div>
          <div className="metric-value">
            {apiData?.summary.latestForecastP10 !== null && apiData?.summary.latestForecastP90 !== null
              ? `${fmtNumber(apiData?.summary.latestForecastP10, 2)}–${fmtNumber(apiData?.summary.latestForecastP90, 2)}`
              : "—"}
          </div>
          <div className="metric-helper">Lower and upper forecast range.</div>
        </div>
      </section>

      <section className="grid two-col" style={{ marginBottom: 16 }}>
        <div className="panel card">
          <h2>Historical vs forecast graph</h2>
          <p>{titleSummary}</p>
          <div style={{ width: "100%", minHeight: 500, height: 500 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 24, left: 8, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="Date" minTickGap={28} />
                <YAxis />
                <Tooltip content={<ChartTooltip />} />
                <Legend verticalAlign="bottom" align="center" content={<ChartLegend />} />
                {apiData?.summary?.lastClose !== null && apiData?.summary?.lastClose !== undefined ? (
                  <ReferenceLine y={apiData.summary.lastClose} stroke="#1f77b4" strokeDasharray="6 3" ifOverflow="extendDomain" label={{ value: `Last Close: ${fmtNumber(apiData.summary.lastClose, 2)}`, position: "insideTopLeft", fill: "#1f77b4", fontSize: 12 }} />
                ) : null}
                {apiData?.summary?.latestForecastP50 !== null && apiData?.summary?.latestForecastP50 !== undefined ? (
                  <ReferenceLine y={apiData.summary.latestForecastP50} stroke="#0f766e" strokeDasharray="6 3" ifOverflow="extendDomain" label={{ value: `Latest P50: ${fmtNumber(apiData.summary.latestForecastP50, 2)}`, position: "insideTopRight", fill: "#0f766e", fontSize: 12 }} />
                ) : null}
                {apiData?.summary?.latestForecastP10 !== null && apiData?.summary?.latestForecastP10 !== undefined ? (
                  <ReferenceLine y={apiData.summary.latestForecastP10} stroke="#2563eb" strokeDasharray="2 3" ifOverflow="extendDomain" />
                ) : null}
                {apiData?.summary?.latestForecastP90 !== null && apiData?.summary?.latestForecastP90 !== undefined ? (
                  <ReferenceLine y={apiData.summary.latestForecastP90} stroke="#2563eb" strokeDasharray="2 3" ifOverflow="extendDomain" />
                ) : null}
                {forecastStart ? (
                  <ReferenceArea x1={forecastStart} x2={chartData[chartData.length - 1]?.Date} fill="#f1df4e" fillOpacity={0.7} ifOverflow="extendDomain" />
                ) : null}
                <Area type="monotone" dataKey="ForecastBandBase" stackId="forecast-band" stroke="none" fill="rgba(0,0,0,0)" connectNulls isAnimationActive={false} />
                <Area type="monotone" dataKey="ForecastBandSize" stackId="forecast-band" name="Forecast Band (P10-P90)" stroke="none" fill="#8bcf9b" fillOpacity={0.45} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="ActualPrice" name="Actual Price" stroke="#1f77b4" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="PredPriceHistorical" name="Historical Predicted Price" stroke="#ff7a00" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="P10Price" name="Forecast P10" stroke="#1f77b4" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="PredPriceForecast" name="Forecast P50" stroke="#ff7a00" strokeWidth={2.8} dot={false} activeDot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="P90Price" name="Forecast P90" stroke="#1f77b4" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                <Scatter name="ENTRY" data={entryPoints} dataKey="EntryPrice" shape={<EntryMarker />} legendType="none" />
                <Scatter name="EXIT" data={exitPoints} dataKey="ExitPrice" shape={<ExitMarker />} legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel card">
          <h2>Window summary</h2>
          <p>Historical metrics come from rows with known outcomes. Forecast metrics come from the selected future segment.</p>
          <div className="small">Ticker: <strong>{apiData?.summary.ticker ?? "—"}</strong></div>
          <div className="small">Date Range: <strong>{apiData?.summary.startDate ?? "—"}</strong> to <strong>{apiData?.summary.endDate ?? "—"}</strong></div>
          <div className="small">Model: <strong>{apiData?.summary.modelName ?? "—"}</strong></div>
          <div className="small">Source: <strong>{apiData?.summary.sourceLabel ?? "—"}</strong></div>
          <div className="small">Rows in window: <strong>{apiData?.summary.rowsInWindow ?? "—"}</strong></div>
          <div className="small">Forecast starts: <strong>{apiData?.summary.forecastStart ?? "No forecast rows in current window"}</strong></div>
          <hr style={{ margin: "14px 0", borderColor: "var(--border)" }} />
          <div className="small">Last Close: <strong>{fmtNumber(apiData?.summary.lastClose, 2)}</strong></div>
          <div className="small">Latest P10: <strong>{fmtNumber(apiData?.summary.latestForecastP10, 2)}</strong></div>
          <div className="small">Latest P50: <strong>{fmtNumber(apiData?.summary.latestForecastP50, 2)}</strong></div>
          <div className="small">Latest P90: <strong>{fmtNumber(apiData?.summary.latestForecastP90, 2)}</strong></div>
          <div className="small">Latest decision: <strong>{apiData?.summary.latestFinalDecision ?? "—"}</strong></div>
          <hr style={{ margin: "14px 0", borderColor: "var(--border)" }} />
          <div className="small">Total Profit: <strong>{fmtNumber(apiData?.summary.totalProfit)}</strong></div>
          <div className="small">Total Loss: <strong>{fmtNumber(apiData?.summary.totalLoss)}</strong></div>
          <div className="small">Best Trade: <strong>{fmtNumber(apiData?.summary.bestTrade)}</strong></div>
          <div className="small">Worst Trade: <strong>{fmtNumber(apiData?.summary.worstTrade)}</strong></div>
          <div className="small">Average Active Return: <strong>{fmtNumber(apiData?.summary.avgTrade)}</strong></div>
          <div className="small">Events: <strong>{apiData?.summary.eventCount ?? "—"}</strong></div>
          <hr style={{ margin: "14px 0", borderColor: "var(--border)" }} />
          <h3>Notes</h3>
          <ul className="small" style={{ lineHeight: 1.65, paddingLeft: 18 }}>
            {(apiData?.info ?? setup?.messages ?? ["Load a bundled dataset or upload a scored CSV."]).map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel card" style={{ marginBottom: 16 }}>
        <h2>Matching review table</h2>
        <p>
          The table is filtered by the same selections as the chart and keeps the strongest fields for historical accuracy, forecast projected accuracy, trading logic, and forecast range.
        </p>
        <div className="legend-pills" style={{ marginBottom: 10 }}>
          <span className="legend-pill transition">Ticker: {apiData?.summary.ticker ?? "—"}</span>
          <span className="legend-pill transition">Date range: {apiData?.summary.startDate ?? "—"} to {apiData?.summary.endDate ?? "—"}</span>
          <span className="legend-pill transition">Rows: {rowMode} {rowCount}</span>
          <span className="legend-pill transition">Sort: {sortOptions.find((o) => o.value === sortBy)?.label ?? sortBy}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Date</th>
                <th>Ticker</th>
                <th>Close</th>
                <th>Actual Next-Day</th>
                <th>Pred Next-Day</th>
                <th>Pred Accuracy %</th>
                <th>Forecast Pred Accuracy %</th>
                <th>Price Error</th>
                <th>Pred Return</th>
                <th>Prob Up</th>
                <th>P10</th>
                <th>P50</th>
                <th>P90</th>
                <th>Forecast Confidence %</th>
                <th>Decision</th>
                <th>Grade</th>
                <th>Strategy Return</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={18}>No rows to display yet.</td>
                </tr>
              ) : (
                tableRows.map((row, index) => (
                  <tr key={`${row.Date}-${row.Ticker}-${index}`} className={row.Section === "Forecast" ? "row-forecast" : "row-historical"}>
                    <td><span className={`section-chip ${row.Section === "Forecast" ? "forecast" : "historical"}`}>{row.Section}</span></td>
                    <td>{row.Date}</td>
                    <td>{row.Ticker}</td>
                    <td>{fmtNumber(row.Close, 2)}</td>
                    <td>{fmtNumber(row.TargetPrice, 2)}</td>
                    <td>{fmtNumber(row.PredPrice, 2)}</td>
                    <td>{fmtPct(row.PredictionAccuracyPct)}</td>
                    <td>{fmtPct(row.ForecastPredictedAccuracyPct)}</td>
                    <td>{fmtSigned(row.PriceError, 2)}</td>
                    <td>{fmtSigned(row.PredReturn, 4)}</td>
                    <td>{fmtPct(row.PredProbUp !== null ? row.PredProbUp * 100 : null)}</td>
                    <td>{fmtNumber(row.P10Price, 2)}</td>
                    <td>{fmtNumber(row.P50Price, 2)}</td>
                    <td>{fmtNumber(row.P90Price, 2)}</td>
                    <td>{fmtPct(row.ForecastConfidencePct)}</td>
                    <td>{row.FinalDecision || row.Action || "—"}</td>
                    <td>{row.DecisionGrade || "—"}</td>
                    <td>{fmtSigned(row.StrategyReturn, 4)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
