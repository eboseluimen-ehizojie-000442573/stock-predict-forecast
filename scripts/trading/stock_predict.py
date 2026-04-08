# PATH: C:\Users\prome\anaconda_projects\capstone_stockPredict\web\scripts\trading\stock_predict.py
from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd

PROJECT_ROOT = Path.cwd()
DATE_COLUMN = os.getenv("STOCK_DATE_COLUMN", "Date")
TICKER_COLUMN = os.getenv("STOCK_TICKER_COLUMN", "Ticker")
CLOSE_COLUMN = os.getenv("STOCK_CLOSE_COLUMN", "Close")
TARGET_SHIFT = int(os.getenv("STOCK_TARGET_SHIFT", "1"))
MODEL_NAME = os.getenv("STOCK_MODEL_NAME", "Fortress Emma Ensemble")

ENTRY_PROB_THRESHOLD = 0.58
ENTRY_RETURN_THRESHOLD = 0.001
EXIT_PROB_THRESHOLD = 0.48
EXIT_RETURN_THRESHOLD = 0.0
TAKE_PROFIT = 0.020
STOP_LOSS = -0.012
TRAILING_GIVEBACK = 0.010

DEFAULT_FEATURE_COLS = [
    "lag_1", "lag_2", "lag_3", "lag_5", "lag_10", "lag_20",
    "ret_1", "ret_3", "ret_5", "log_ret_1",
    "ma_5", "ma_10", "ma_20", "ma_50",
    "ema_5", "ema_10", "ema_20", "ema_50",
    "px_vs_ma_5", "px_vs_ma_10", "px_vs_ma_20", "px_vs_ma_50",
    "volatility_5", "volatility_10", "volatility_20",
    "rsi_14",
    "macd", "macd_signal", "macd_hist",
    "bb_width",
    "volume_chg_1", "volume_ma_5", "volume_ma_20", "volume_spike",
    "day_of_week", "month", "quarter",
    "rel_strength_1",
]


# ------------------------------------------------------------
# Setup and IO helpers
# ------------------------------------------------------------
def setup_status() -> Dict[str, Any]:
    python_path = os.getenv("STOCK_PYTHON_BIN")
    model_path = os.getenv("STOCK_MODEL_PATH")
    data_path = os.getenv("STOCK_DATA_PATH")

    python_exists = bool(python_path) and Path(python_path).exists()
    model_exists = bool(model_path) and Path(model_path).exists()
    data_exists = bool(data_path) and Path(data_path).exists()

    bundled_candidates = {
        "combined": PROJECT_ROOT / "data" / "stock_all_14_tickers_scored_for_web_365d_final.csv",
        "seen10": PROJECT_ROOT / "data" / "stock_seen_10_tickers_scored_for_web_365d_final.csv",
        "unseen4": PROJECT_ROOT / "data" / "stock_unseen_4_tickers_scored_for_web_365d_final.csv",
    }
    bundled_data = {key: str(path) for key, path in bundled_candidates.items() if path.exists()}

    messages = []
    if not python_exists or not model_exists:
        messages.append("Python/model setup is only required when you upload an unscored dataset that still needs prediction generation.")
    if not data_exists and not bundled_data:
        messages.append("No default server dataset is configured yet. Upload mode will still work.")

    return {
        "ok": python_exists and model_exists,
        "pythonExists": python_exists,
        "modelExists": model_exists,
        "dataExists": data_exists or bool(bundled_data),
        "pythonPath": python_path,
        "modelPath": model_path,
        "dataPath": data_path,
        "bundledData": bundled_data,
        "messages": messages,
    }


def respond(payload: Dict[str, Any], status: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, default=str))
    sys.exit(status)


def fail(message: str, *, details: Any | None = None, status: int = 1) -> None:
    payload = {"ok": False, "error": message, "setup": setup_status()}
    if details is not None:
        payload["details"] = details
    respond(payload, status)


def read_request() -> Dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        fail("Invalid JSON request received by stock_predict.py.", details=str(exc))
        return {}


def resolve_path(value: str | None, label: str) -> Path:
    if not value:
        fail(f"{label} is not set.")
    p = Path(value)
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    if not p.exists():
        fail(f"{label} does not exist.", details=str(p))
    return p


def load_bundle(bundle_path: Path) -> Dict[str, Any]:
    try:
        bundle = joblib.load(bundle_path)
    except Exception as exc:
        fail("Unable to load the stock model bundle.", details=str(exc))

    if not isinstance(bundle, dict):
        fail("STOCK_MODEL_PATH must point to a joblib dictionary bundle.")

    required = ["xgb_reg", "lgb_reg", "xgb_clf", "lgb_clf"]
    missing = [key for key in required if key not in bundle]
    if missing:
        fail("Model bundle is missing required models.", details=missing)

    return bundle


def get_feature_cols(bundle: Dict[str, Any]) -> List[str]:
    cols = bundle.get("feature_cols") or DEFAULT_FEATURE_COLS
    if not isinstance(cols, list) or not cols:
        fail("feature_cols is missing or invalid in the saved model bundle.")
    return [str(c) for c in cols]


def read_dataset_from_request(request: Dict[str, Any], setup: Dict[str, Any]) -> tuple[pd.DataFrame, str]:
    mode = str(request.get("datasetMode") or "default").strip().lower()
    uploaded_csv_text = request.get("uploadedCsvText")

    bundled_paths = {
        "server_combined": PROJECT_ROOT / "data" / "stock_all_14_tickers_scored_for_web_365d_final.csv",
        "server_seen_10": PROJECT_ROOT / "data" / "stock_seen_10_tickers_scored_for_web_365d_final.csv",
        "server_unseen_4": PROJECT_ROOT / "data" / "stock_unseen_4_tickers_scored_for_web_365d_final.csv",
    }

    if mode == "upload":
        if not uploaded_csv_text:
            fail("Upload mode was selected, but no CSV content was provided.")
        try:
            df = pd.read_csv(io.StringIO(str(uploaded_csv_text)))
        except Exception as exc:
            fail("Unable to read the uploaded CSV file.", details=str(exc))
        return df, "Uploaded CSV"

    if mode in bundled_paths and bundled_paths[mode].exists():
        try:
            return pd.read_csv(bundled_paths[mode]), f"Bundled server dataset ({bundled_paths[mode].name})"
        except Exception as exc:
            fail("Unable to load the bundled server dataset.", details=str(exc))

    data_path_raw = os.getenv("STOCK_DATA_PATH")
    if not data_path_raw:
        fallback = bundled_paths.get("server_seen_10")
        if fallback and fallback.exists():
            return pd.read_csv(fallback), f"Bundled server dataset ({fallback.name})"
        fail("STOCK_DATA_PATH is not set. Configure it in .env.local, place bundled web CSV files in /data, or switch to upload mode.")

    data_path = resolve_path(data_path_raw, "STOCK_DATA_PATH")
    suffix = data_path.suffix.lower()
    try:
        if suffix == ".csv":
            df = pd.read_csv(data_path)
        elif suffix in {".parquet", ".pq"}:
            df = pd.read_parquet(data_path)
        else:
            fail("Unsupported STOCK_DATA_PATH format. Use CSV or Parquet.", details=str(data_path))
    except Exception as exc:
        fail("Unable to load the default dataset.", details=str(exc))

    return df, f"Default dataset ({data_path.name})"



# ------------------------------------------------------------
# Dataset normalization
# ------------------------------------------------------------
def ensure_numeric_column(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series([np.nan] * len(df), index=df.index, dtype=float)
    return pd.to_numeric(df[column], errors="coerce")


def ensure_text_column(df: pd.DataFrame, column: str, default: str = "") -> pd.Series:
    if column not in df.columns:
        return pd.Series([default] * len(df), index=df.index, dtype=object)
    return df[column].fillna(default).astype(str)


def normalize_existing_display_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    # Allow either the 10-ticker full schema or the 4-ticker web schema.
    if "TradeAction" not in out.columns and "Action" in out.columns:
        out["TradeAction"] = out["Action"]
    if "TradePosition" not in out.columns and "Position" in out.columns:
        out["TradePosition"] = out["Position"]
    if "TradeStrategyReturn" not in out.columns and "StrategyReturn" in out.columns:
        out["TradeStrategyReturn"] = out["StrategyReturn"]

    for col in [
        "TargetPrice", "TargetReturn", "PredPrice", "PredReturn", "PredProbUp",
        "PredictionAccuracyPct", "ForecastPredictedAccuracyPct", "PriceError", "AbsPriceError",
        "pred_return_xgb", "pred_return_lgb", "pred_prob_xgb", "pred_prob_lgb",
        "TradePosition", "TradeStrategyReturn"
    ]:
        out[col] = ensure_numeric_column(out, col)

    out["TradeAction"] = ensure_text_column(out, "TradeAction", "HOLD")
    return out


def prepare_base_frame(df: pd.DataFrame) -> pd.DataFrame:
    required = [DATE_COLUMN, TICKER_COLUMN, CLOSE_COLUMN]
    missing = [col for col in required if col not in df.columns]
    if missing:
        fail("Dataset is missing required columns.", details=missing)

    work = df.copy()
    work[DATE_COLUMN] = pd.to_datetime(work[DATE_COLUMN], errors="coerce")
    work[TICKER_COLUMN] = work[TICKER_COLUMN].astype(str).str.strip()
    work[CLOSE_COLUMN] = pd.to_numeric(work[CLOSE_COLUMN], errors="coerce")
    work = work.dropna(subset=[DATE_COLUMN, TICKER_COLUMN, CLOSE_COLUMN]).copy()
    work = work.sort_values([TICKER_COLUMN, DATE_COLUMN]).reset_index(drop=True)
    work = normalize_existing_display_columns(work)

    # Compute targets only when the dataset does not already include them.
    if "TargetPrice" not in df.columns:
        work["TargetPrice"] = work.groupby(TICKER_COLUMN)[CLOSE_COLUMN].shift(-TARGET_SHIFT)
    if "TargetReturn" not in df.columns:
        work["TargetReturn"] = (work["TargetPrice"] - work[CLOSE_COLUMN]) / work[CLOSE_COLUMN]

    work["TargetPrice"] = pd.to_numeric(work["TargetPrice"], errors="coerce")
    work["TargetReturn"] = pd.to_numeric(work["TargetReturn"], errors="coerce")
    work["TargetDirection"] = np.where(work["TargetReturn"].notna(), (work["TargetReturn"] > 0).astype(int), np.nan)
    work["DataSection"] = np.where(work["TargetReturn"].notna(), "Historical", "Forecast")
    work = work.replace([np.inf, -np.inf], np.nan)
    return work


def is_pre_scored_dataset(df: pd.DataFrame) -> bool:
    required = {"PredPrice", "PredReturn", "PredProbUp"}
    return required.issubset(set(df.columns))


def has_existing_trade_columns(df: pd.DataFrame) -> bool:
    possible_sets = [
        {"TradeAction", "TradePosition", "TradeStrategyReturn"},
        {"Action", "Position", "StrategyReturn"},
    ]
    columns = set(df.columns)
    return any(option.issubset(columns) for option in possible_sets)


# ------------------------------------------------------------
# Prediction, trade logic, metrics
# ------------------------------------------------------------
def should_recompute_predictions(df: pd.DataFrame, feature_cols: List[str]) -> bool:
    if any(col not in df.columns for col in feature_cols):
        return False

    hist = df[df["TargetPrice"].notna()].copy()
    if hist.empty:
        return True

    pred_price = pd.to_numeric(hist.get("PredPrice"), errors="coerce")
    close_price = pd.to_numeric(hist.get(CLOSE_COLUMN), errors="coerce")
    pred_return = pd.to_numeric(hist.get("PredReturn"), errors="coerce")
    pred_acc = pd.to_numeric(hist.get("PredictionAccuracyPct"), errors="coerce")

    valid_ratio = (pred_price.abs() / close_price.abs().replace(0, np.nan)).replace([np.inf, -np.inf], np.nan)
    median_ratio = float(valid_ratio.dropna().median()) if valid_ratio.dropna().any() else np.nan
    extreme_return_rate = float((pred_return.abs() > 0.50).mean()) if pred_return.notna().any() else 1.0
    mean_accuracy = float(pred_acc.dropna().mean()) if pred_acc.notna().any() else np.nan

    if np.isnan(median_ratio) or median_ratio < 0.20 or median_ratio > 5.0:
        return True
    if extreme_return_rate > 0.10:
        return True
    if not np.isnan(mean_accuracy) and mean_accuracy < 5.0:
        return True
    return False


def score_predictions(df: pd.DataFrame, bundle: Dict[str, Any], feature_cols: List[str]) -> pd.DataFrame:
    missing = [col for col in feature_cols if col not in df.columns]
    if missing:
        fail(
            "Dataset is missing model feature columns required by the saved model bundle.",
            details=missing,
        )

    out = df.copy()
    pred_cols = ["PredReturn", "PredPrice", "PredProbUp", "pred_return_xgb", "pred_return_lgb", "pred_prob_xgb", "pred_prob_lgb"]
    for col in pred_cols:
        if col not in out.columns:
            out[col] = np.nan

    recompute_all = should_recompute_predictions(out, feature_cols)
    if recompute_all:
        mask_to_score = pd.Series(True, index=out.index)
    else:
        mask_to_score = out[["PredReturn", "PredPrice", "PredProbUp"]].isna().any(axis=1)
        if not mask_to_score.any():
            out["PredDirection"] = (pd.to_numeric(out["PredProbUp"], errors="coerce") >= 0.50).astype(int)
            return out

    X = out.loc[mask_to_score, feature_cols].copy()
    X = X.replace([np.inf, -np.inf], np.nan)
    X = X.apply(pd.to_numeric, errors="coerce")
    X = X.fillna(X.median(numeric_only=True))
    X = X.fillna(0)

    xgb_reg = bundle["xgb_reg"]
    lgb_reg = bundle["lgb_reg"]
    xgb_clf = bundle["xgb_clf"]
    lgb_clf = bundle["lgb_clf"]

    pred_return_xgb = xgb_reg.predict(X)
    pred_return_lgb = lgb_reg.predict(X)
    pred_return = 0.5 * pred_return_xgb + 0.5 * pred_return_lgb

    historical_pred = pd.to_numeric(out["PredReturn"], errors="coerce")
    valid_historical_pred = historical_pred[(historical_pred.abs() < 0.5) & historical_pred.notna()]
    if valid_historical_pred.any():
        low_default = float(np.nanquantile(valid_historical_pred, 0.01))
        high_default = float(np.nanquantile(valid_historical_pred, 0.99))
    else:
        low_default = float(np.nanquantile(pred_return, 0.01))
        high_default = float(np.nanquantile(pred_return, 0.99))

    low_clip = float(bundle.get("low_clip", bundle.get("return_clip_low", low_default)))
    high_clip = float(bundle.get("high_clip", bundle.get("return_clip_high", high_default)))
    pred_return = np.clip(pred_return, low_clip, high_clip)

    pred_prob_xgb = xgb_clf.predict_proba(X)[:, 1]
    pred_prob_lgb = lgb_clf.predict_proba(X)[:, 1]
    pred_prob_up = 0.5 * pred_prob_xgb + 0.5 * pred_prob_lgb

    out.loc[mask_to_score, "pred_return_xgb"] = pred_return_xgb
    out.loc[mask_to_score, "pred_return_lgb"] = pred_return_lgb
    out.loc[mask_to_score, "PredReturn"] = pred_return
    out.loc[mask_to_score, "PredPrice"] = out.loc[mask_to_score, CLOSE_COLUMN] * (1 + out.loc[mask_to_score, "PredReturn"])
    out.loc[mask_to_score, "pred_prob_xgb"] = pred_prob_xgb
    out.loc[mask_to_score, "pred_prob_lgb"] = pred_prob_lgb
    out.loc[mask_to_score, "PredProbUp"] = pred_prob_up

    out["PredDirection"] = (pd.to_numeric(out["PredProbUp"], errors="coerce") >= 0.50).astype(int)
    return out

def build_trade_actions(group: pd.DataFrame) -> pd.DataFrame:
    group = group.sort_values(DATE_COLUMN).copy()

    actions = []
    positions = []
    strategy_returns = []

    position_state = 0
    entry_price = np.nan
    peak_price = np.nan

    for _, row in group.iterrows():
        close_price = float(row[CLOSE_COLUMN])
        pred_prob = float(row["PredProbUp"]) if pd.notna(row["PredProbUp"]) else 0.0
        pred_ret = float(row["PredReturn"]) if pd.notna(row["PredReturn"]) else 0.0

        action = "HOLD"

        if position_state == 0:
            if pred_prob >= ENTRY_PROB_THRESHOLD and pred_ret > ENTRY_RETURN_THRESHOLD:
                action = "ENTRY"
                position_state = 1
                entry_price = close_price
                peak_price = close_price
        else:
            peak_price = max(peak_price, close_price)
            return_since_entry = (close_price / entry_price) - 1 if entry_price and pd.notna(entry_price) else 0.0
            drawdown_from_peak = (close_price / peak_price) - 1 if peak_price and pd.notna(peak_price) else 0.0

            if return_since_entry <= STOP_LOSS:
                action = "EXIT"
                position_state = 0
                entry_price = np.nan
                peak_price = np.nan
            elif return_since_entry >= TAKE_PROFIT:
                action = "EXIT"
                position_state = 0
                entry_price = np.nan
                peak_price = np.nan
            elif pd.notna(peak_price) and pd.notna(entry_price) and peak_price > entry_price and drawdown_from_peak <= -TRAILING_GIVEBACK:
                action = "EXIT"
                position_state = 0
                entry_price = np.nan
                peak_price = np.nan
            elif pred_prob < EXIT_PROB_THRESHOLD or pred_ret <= EXIT_RETURN_THRESHOLD:
                action = "EXIT"
                position_state = 0
                entry_price = np.nan
                peak_price = np.nan

        actions.append(action)
        positions.append(position_state)
        strategy_returns.append(float(row["TargetReturn"]) if position_state == 1 and pd.notna(row["TargetReturn"]) else 0.0)

    group["TradeAction"] = actions
    group["TradePosition"] = positions
    group["TradeStrategyReturn"] = strategy_returns
    return group


def apply_step18_logic(df: pd.DataFrame) -> pd.DataFrame:
    out = (
        df.groupby(TICKER_COLUMN, group_keys=False)
        .apply(build_trade_actions)
        .reset_index(drop=True)
    )
    return out


def compute_display_metrics(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["ActualDirection"] = np.where(out["TargetReturn"].notna(), (out["TargetReturn"] > 0).astype(int), np.nan)
    out["DirectionCorrect"] = np.where(
        out["TargetReturn"].notna(),
        (out["ActualDirection"] == out["PredDirection"]).astype(int),
        np.nan,
    )
    out["PriceError"] = np.where(out["TargetPrice"].notna(), out["PredPrice"] - out["TargetPrice"], np.nan)
    out["AbsPriceError"] = np.where(out["PriceError"].notna(), pd.Series(out["PriceError"]).abs(), np.nan)
    out["PredictionAccuracyPct"] = np.where(
        out["TargetPrice"].notna(),
        (1 - (out["AbsPriceError"] / out["TargetPrice"].abs().replace(0, np.nan))) * 100,
        np.nan,
    )
    out["PredictionAccuracyPct"] = out["PredictionAccuracyPct"].clip(lower=0, upper=100)

    # Forecast-only metrics. These are honest forward-looking diagnostics, not fake accuracy.
    vol20 = pd.to_numeric(out.get("volatility_20"), errors="coerce") if "volatility_20" in out.columns else pd.Series(np.nan, index=out.index)
    pred_prob = pd.to_numeric(out.get("PredProbUp"), errors="coerce")
    pred_ret = pd.to_numeric(out.get("PredReturn"), errors="coerce")
    is_forecast = out["TargetPrice"].isna()

    out["ForecastConfidencePct"] = np.where(
        is_forecast & pred_prob.notna(),
        (pred_prob.sub(0.5).abs() * 200).clip(lower=0, upper=100),
        np.nan,
    )
    out["ForecastVolatilityPct"] = np.where(
        is_forecast & vol20.notna(),
        vol20.abs() * 100,
        np.nan,
    )
    out["ForecastMoveVsVol"] = np.where(
        is_forecast & pred_ret.notna() & vol20.notna() & (vol20.abs() > 1e-9),
        pred_ret.abs() / vol20.abs(),
        np.nan,
    )
    return out


def filter_window(df: pd.DataFrame, request: Dict[str, Any]) -> tuple[pd.DataFrame, str, pd.Timestamp, pd.Timestamp]:
    ticker = str(request.get("ticker") or "").strip()
    start_raw = request.get("startDate")
    end_raw = request.get("endDate")

    if not ticker:
        tickers = sorted(df[TICKER_COLUMN].dropna().unique().tolist())
        ticker = tickers[0] if tickers else ""

    if not ticker:
        fail("No ticker values were found in the scored dataset.")

    ticker_df = df[df[TICKER_COLUMN] == ticker].copy()
    if ticker_df.empty:
        fail("No records were found for the selected ticker.", details=ticker)

    ticker_min = pd.to_datetime(ticker_df[DATE_COLUMN].min())
    ticker_max = pd.to_datetime(ticker_df[DATE_COLUMN].max())

    requested_start = pd.to_datetime(start_raw) if start_raw else ticker_min
    requested_end = pd.to_datetime(end_raw) if end_raw else ticker_max

    if requested_start > requested_end:
        fail("Start date cannot be after end date.")

    # Clamp the requested range to the data that actually exists for the selected ticker.
    # This keeps the graph and table usable even when the user asks for a future range beyond
    # the available dataset horizon. The UI will then display all data it has.
    start_date = max(requested_start, ticker_min)
    end_date = min(requested_end, ticker_max)

    if start_date > end_date:
        start_date = ticker_min
        end_date = ticker_max

    window = ticker_df[(ticker_df[DATE_COLUMN] >= start_date) & (ticker_df[DATE_COLUMN] <= end_date)].copy()
    if window.empty:
        fail("No records found for the selected ticker and date range.")

    return window, ticker, start_date, end_date


def build_summary(window: pd.DataFrame, ticker: str, start_date: pd.Timestamp, end_date: pd.Timestamp, source_label: str, model_name: str) -> Dict[str, Any]:
    historical = window[window["TargetReturn"].notna()].copy()
    forecast = window[window["TargetReturn"].isna()].copy()

    direction_accuracy = float(historical["DirectionCorrect"].dropna().mean() * 100) if not historical.empty else None
    prediction_accuracy = float(historical["PredictionAccuracyPct"].dropna().mean()) if not historical.empty else None

    executed = historical[historical["TradeAction"].isin(["ENTRY", "EXIT"])].copy()
    active_returns = historical[historical["TradePosition"] == 1]["TradeStrategyReturn"]

    total_profit = float(historical.loc[historical["TradeStrategyReturn"] > 0, "TradeStrategyReturn"].sum())
    total_loss = float(historical.loc[historical["TradeStrategyReturn"] < 0, "TradeStrategyReturn"].sum())
    net_profit = float(historical["TradeStrategyReturn"].sum())
    win_rate = float((active_returns > 0).mean() * 100) if not active_returns.empty else 0.0
    best_trade = float(historical["TradeStrategyReturn"].max()) if not historical.empty else 0.0
    worst_trade = float(historical["TradeStrategyReturn"].min()) if not historical.empty else 0.0
    avg_trade = float(active_returns.mean()) if not active_returns.empty else 0.0
    forecast_start = forecast[DATE_COLUMN].min() if not forecast.empty else None

    latest_close = pd.to_numeric(window[CLOSE_COLUMN], errors="coerce").dropna()
    latest_forecast = forecast.tail(1) if not forecast.empty else pd.DataFrame()
    latest_row = latest_forecast.iloc[0] if not latest_forecast.empty else None

    return {
        "ticker": ticker,
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate": end_date.strftime("%Y-%m-%d"),
        "directionAccuracy": direction_accuracy,
        "predictionAccuracy": prediction_accuracy,
        "totalProfit": total_profit,
        "totalLoss": total_loss,
        "netProfit": net_profit,
        "winRate": win_rate,
        "bestTrade": best_trade,
        "worstTrade": worst_trade,
        "avgTrade": avg_trade,
        "eventCount": int(len(executed)),
        "rowsInWindow": int(len(window)),
        "scoredRows": int(len(historical)),
        "historicalRows": int(len(historical)),
        "forecastRows": int(len(forecast)),
        "forecastStart": forecast_start.strftime("%Y-%m-%d") if pd.notna(forecast_start) else None,
        "sourceLabel": source_label,
        "modelName": model_name,
        "lastClose": float(latest_close.iloc[-1]) if not latest_close.empty else None,
        "latestForecastP10": float(latest_row.get("P10Price")) if latest_row is not None and pd.notna(latest_row.get("P10Price")) else None,
        "latestForecastP50": float(latest_row.get("P50Price")) if latest_row is not None and pd.notna(latest_row.get("P50Price")) else None,
        "latestForecastP90": float(latest_row.get("P90Price")) if latest_row is not None and pd.notna(latest_row.get("P90Price")) else None,
        "latestFinalDecision": str(latest_row.get("FinalDecision")) if latest_row is not None and pd.notna(latest_row.get("FinalDecision")) else None,
    }


def build_graph(window: pd.DataFrame) -> List[Dict[str, Any]]:
    out = []
    for _, row in window.iterrows():
        is_forecast = pd.isna(row["TargetPrice"])
        actual_price = round(float(row[CLOSE_COLUMN]), 4) if pd.notna(row[CLOSE_COLUMN]) else None
        pred_price = round(float(row["PredPrice"]), 4) if pd.notna(row["PredPrice"]) else None

        historical_pred_price = pred_price if not is_forecast else None
        forecast_curve_price = round(float(row.get("P50Price")), 4) if is_forecast and pd.notna(row.get("P50Price")) else pred_price if is_forecast else None
        p10_price = round(float(row.get("P10Price")), 4) if is_forecast and pd.notna(row.get("P10Price")) else None
        p50_price = round(float(row.get("P50Price")), 4) if is_forecast and pd.notna(row.get("P50Price")) else forecast_curve_price
        p90_price = round(float(row.get("P90Price")), 4) if is_forecast and pd.notna(row.get("P90Price")) else None

        out.append(
            {
                "Date": row[DATE_COLUMN].strftime("%Y-%m-%d"),
                "Section": "Forecast" if is_forecast else "Historical",
                "TargetPrice": round(float(row["TargetPrice"]), 4) if pd.notna(row["TargetPrice"]) else None,
                "ActualPrice": actual_price if not is_forecast else None,
                "PredPrice": pred_price,
                "PredPriceHistorical": historical_pred_price,
                "PredPriceForecast": forecast_curve_price,
                "P10Price": p10_price,
                "P50Price": p50_price,
                "P90Price": p90_price,
                "EntryPrice": actual_price if row["TradeAction"] == "ENTRY" and pd.notna(row[CLOSE_COLUMN]) else None,
                "ExitPrice": actual_price if row["TradeAction"] == "EXIT" and pd.notna(row[CLOSE_COLUMN]) else None,
            }
        )
    return out


def build_table(window: pd.DataFrame, request: Dict[str, Any]) -> List[Dict[str, Any]]:
    sort_by = str(request.get("sortBy") or "Date")
    row_mode = str(request.get("rowMode") or "Top")
    row_count = max(1, min(200, int(request.get("rowCount") or 10)))

    table_df = window.copy()

    if sort_by == "Date":
        table_df = table_df.sort_values(DATE_COLUMN, ascending=True)
        view_df = table_df.head(row_count) if row_mode == "Top" else table_df.tail(row_count)
    else:
        actual_sort_col = "TradeStrategyReturn" if sort_by == "TradeStrategyReturn" else sort_by
        ascending = True if row_mode == "Top" else False
        table_df = table_df.sort_values(actual_sort_col, ascending=ascending, na_position="last")
        view_df = table_df.head(row_count)

    rows = []
    for _, row in view_df.iterrows():
        is_forecast = pd.isna(row["TargetPrice"])
        rows.append(
            {
                "Date": row[DATE_COLUMN].strftime("%Y-%m-%d"),
                "Ticker": row[TICKER_COLUMN],
                "Section": row["DataSection"],
                "Close": round(float(row[CLOSE_COLUMN]), 4) if pd.notna(row[CLOSE_COLUMN]) else None,
                "TargetPrice": round(float(row["TargetPrice"]), 4) if pd.notna(row["TargetPrice"]) else None,
                "PredPrice": round(float(row["PredPrice"]), 4) if pd.notna(row["PredPrice"]) else None,
                "TargetReturn": round(float(row["TargetReturn"]), 4) if pd.notna(row["TargetReturn"]) else None,
                "PredReturn": round(float(row["PredReturn"]), 4) if pd.notna(row["PredReturn"]) else None,
                "PredProbUp": round(float(row["PredProbUp"]), 4) if pd.notna(row["PredProbUp"]) else None,
                "Action": row["TradeAction"],
                "Position": int(row["TradePosition"]) if pd.notna(row["TradePosition"]) else None,
                "StrategyReturn": round(float(row["TradeStrategyReturn"]), 4) if pd.notna(row["TradeStrategyReturn"]) else None,
                "PredictionAccuracyPct": round(float(row["PredictionAccuracyPct"]), 2) if pd.notna(row["PredictionAccuracyPct"]) else None,
                "ForecastPredictedAccuracyPct": round(float(row["ForecastPredictedAccuracyPct"]), 2) if pd.notna(row.get("ForecastPredictedAccuracyPct")) else None,
                "PriceError": round(float(row["PriceError"]), 4) if pd.notna(row["PriceError"]) else None,
                "AbsPriceError": round(float(row["AbsPriceError"]), 4) if pd.notna(row["AbsPriceError"]) else None,
                "ForecastConfidencePct": round(float(row["ForecastConfidencePct"]), 2) if pd.notna(row.get("ForecastConfidencePct")) else None,
                "ForecastVolatilityPct": round(float(row["ForecastVolatilityPct"]), 2) if pd.notna(row.get("ForecastVolatilityPct")) else None,
                "ForecastMoveVsVol": round(float(row["ForecastMoveVsVol"]), 2) if pd.notna(row.get("ForecastMoveVsVol")) else None,
                "P10Price": round(float(row.get("P10Price")), 4) if pd.notna(row.get("P10Price")) else None,
                "P50Price": round(float(row.get("P50Price")), 4) if pd.notna(row.get("P50Price")) else None,
                "P90Price": round(float(row.get("P90Price")), 4) if pd.notna(row.get("P90Price")) else None,
                "FinalDecision": str(row.get("FinalDecision")) if pd.notna(row.get("FinalDecision")) else (row["TradeAction"] if not is_forecast else None),
                "DecisionGrade": str(row.get("DecisionGrade")) if pd.notna(row.get("DecisionGrade")) else None,
                "FinalDecisionScore": round(float(row.get("FinalDecisionScore")), 4) if pd.notna(row.get("FinalDecisionScore")) else None,
            }
        )
    return rows


def main() -> None:
    request = read_request()
    setup = setup_status()

    raw_df, source_label = read_dataset_from_request(request, setup)
    base_df = prepare_base_frame(raw_df)

    if is_pre_scored_dataset(raw_df):
        display_df = base_df.copy()
        display_df["PredDirection"] = (pd.to_numeric(display_df.get("PredProbUp"), errors="coerce") >= 0.50).astype(int)
        if not has_existing_trade_columns(raw_df):
            display_df = apply_step18_logic(display_df)
        display_df = compute_display_metrics(display_df)
        model_name = str(request.get("modelName") or raw_df.get("ModelName", pd.Series(dtype=str)).iloc[0] if "ModelName" in raw_df.columns and not raw_df.empty else MODEL_NAME)
    else:
        if not setup["pythonExists"] or not setup["modelExists"]:
            respond(
                {
                    "ok": False,
                    "setup": setup,
                    "error": "Backend setup incomplete for unscored data.",
                    "details": setup["messages"],
                },
                1,
            )

        bundle_path = resolve_path(os.getenv("STOCK_MODEL_PATH"), "STOCK_MODEL_PATH")
        bundle = load_bundle(bundle_path)
        feature_cols = get_feature_cols(bundle)
        scored_df = score_predictions(base_df, bundle, feature_cols)
        trade_df = apply_step18_logic(scored_df)
        display_df = compute_display_metrics(trade_df)
        model_name = str(bundle.get("model_name") or MODEL_NAME)

    window, ticker, start_date, end_date = filter_window(display_df, request)
    summary = build_summary(window, ticker, start_date, end_date, source_label, model_name)

    all_tickers = sorted(display_df[TICKER_COLUMN].dropna().unique().tolist())
    min_date = display_df[DATE_COLUMN].min()
    max_date = display_df[DATE_COLUMN].max()

    defaults = {
        "ticker": ticker,
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate": end_date.strftime("%Y-%m-%d"),
        "rowMode": str(request.get("rowMode") or "Top"),
        "rowCount": max(1, min(200, int(request.get("rowCount") or 10))),
        "sortBy": str(request.get("sortBy") or "Date"),
    }

    respond(
        {
            "ok": True,
            "setup": setup,
            "tickers": all_tickers,
            "summary": summary,
            "graph": build_graph(window),
            "table": build_table(window, request),
            "availableDateRange": {
                "min": min_date.strftime("%Y-%m-%d") if pd.notna(min_date) else None,
                "max": max_date.strftime("%Y-%m-%d") if pd.notna(max_date) else None,
            },
            "defaults": defaults,
            "info": [
                "Historical close is shown in blue, the historical model path is shown in orange, and the forecast median path is shown on top of the band.",
                "The forecast zone now exposes P10, P50, and P90 so the upper and lower uncertainty band can be plotted directly in the web chart.",
                "All ticker, date, and table controls drive both the graph and the review table, and selection changes can refresh automatically.",
                "Bundled mode supports the 10-ticker web CSV, the 4-ticker web CSV, and a combined dataset when present.",
            ],
        }
    )



if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        fail("Unhandled error inside stock_predict.py.", details=str(exc))
