# PATH: C:\\Users\\prome\\anaconda_projects\\capstone_stockPredict\\web\\scripts\\trading\\save_stock_bundle.py
from pathlib import Path
from typing import Sequence

import joblib


def save_stock_bundle(
    *,
    xgb_reg,
    lgb_reg,
    xgb_clf,
    lgb_clf,
    feature_cols: Sequence[str],
    low_clip: float,
    high_clip: float,
    output_path: str,
    model_name: str = "Fortress Emma Ensemble",
) -> str:
    bundle = {
        "xgb_reg": xgb_reg,
        "lgb_reg": lgb_reg,
        "xgb_clf": xgb_clf,
        "lgb_clf": lgb_clf,
        "feature_cols": list(feature_cols),
        "low_clip": float(low_clip),
        "high_clip": float(high_clip),
        "model_name": model_name,
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out)
    return str(out)
