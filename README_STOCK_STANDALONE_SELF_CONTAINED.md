# PATH: C:\Users\prome\anaconda_projects\capstone_stockPredict\web\README_STOCK_STANDALONE_SELF_CONTAINED.md

# Stock Prediction Dashboard — self-contained standalone version

This package is the clean standalone rebuild of your stock interface.
It removes the missing UI framework dependencies and keeps only:
- Next.js
- React
- Recharts
- a Python backend scorer

## What this version does
- Uses the saved model bundle only
- Does not retrain in the web app
- Reproduces the Step 18B style display
- Shows the ENTRY / EXIT graph
- Shows the profitability summary
- Shows the matching review table
- Accepts a default server dataset
- Accepts a newly uploaded CSV for unseen data
- Calculates direction accuracy and price-based prediction accuracy

## What is still required before prediction can work
You already pointed this out correctly. These two things are still not set up yet:
1. The environment variables are not configured yet
2. The trained notebook model bundle has not been saved yet

The web interface is now ready for those final setup steps.

---

## 1. Put this package inside your web folder
Expected target:

C:\Users\prome\anaconda_projects\capstone_stockPredict\web

If that folder already contains older files, replace them with this standalone set.

---

## 2. Install the web dependencies
Open Command Prompt in:

C:\Users\prome\anaconda_projects\capstone_stockPredict\web

Run:

```bash
npm install
```

---

## 3. Create `.env.local`
Copy:

`.env.local.example`

To:

`.env.local`

Then update the values.

Example:

```env
STOCK_PYTHON_BIN=C:\Users\prome\anaconda\python.exe
STOCK_MODEL_PATH=C:\Users\prome\anaconda_projects\capstone_stockPredict\artifacts\models\stock_bundle.joblib
STOCK_DATA_PATH=C:\Users\prome\anaconda_projects\capstone_stockPredict\data\processed\stock_scoring_dataset.csv
STOCK_DATE_COLUMN=Date
STOCK_TICKER_COLUMN=Ticker
STOCK_CLOSE_COLUMN=Close
STOCK_TARGET_SHIFT=1
STOCK_MODEL_NAME=Fortress Emma Ensemble
```

Restart the Next server after changing `.env.local`.

---

## 4. Save the trained ensemble model bundle from your notebook
Use the helper in:

`scripts/trading/save_stock_bundle.py`

In your notebook, after the models are trained, run this:

```python
from scripts.trading.save_stock_bundle import save_stock_bundle

saved_path = save_stock_bundle(
    xgb_reg=xgb_reg,
    lgb_reg=lgb_reg,
    xgb_clf=xgb_clf,
    lgb_clf=lgb_clf,
    feature_cols=feature_cols,
    low_clip=float(low_clip),
    high_clip=float(high_clip),
    output_path=r"C:\Users\prome\anaconda_projects\capstone_stockPredict\artifacts\models\stock_bundle.joblib",
    model_name="Fortress Emma Ensemble",
)

print(saved_path)
```

Your saved bundle must include:
- `xgb_reg`
- `lgb_reg`
- `xgb_clf`
- `lgb_clf`
- `feature_cols`
- `low_clip`
- `high_clip`

---

## 5. Prepare the scoring dataset
For the default dataset path or uploaded CSV, the data must contain:
- `Date`
- `Ticker`
- `Close`
- every feature column used by `feature_cols`

If `TargetPrice` and `TargetReturn` are missing, the backend will derive them using next-day shift from `Close`.

That means the uploaded file is intended to be a processed scoring file, not raw unprepared market data.

---

## 6. Start the app
Run:

```bash
npm run dev
```

Because the dev script uses `next dev`, it can move to another available port automatically.

Open:

```text
http://localhost:3000/trading/stock
```

or whatever port Next shows.

---

## 7. How to use the page
### Default server dataset mode
Use this after you have set `STOCK_DATA_PATH`.

### Upload new CSV mode
Use this for a new processed dataset that was not used during training or test.
Upload the CSV and run the prediction from the interface.

---

## Important honesty note
This package is now a self-contained standalone web app structure.
However, prediction will still not run until:
- the model bundle is actually saved from the notebook
- `.env.local` is configured correctly
- the scoring dataset exists and matches the saved model feature columns

So the code structure is now fixed.
The remaining work is setup and model export.
