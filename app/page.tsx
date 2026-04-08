// PATH: C:\\Users\\prome\\anaconda_projects\\capstone_stockPredict\\web\\app\\page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="panel card">
        <h1 className="page-title">Stock Prediction Dashboard</h1>
        <p className="page-subtitle">
          Open the standalone stock prediction interface that reproduces the Step 18B graph,
          summary metrics, and matching table using a saved model bundle.
        </p>
        <div className="actions" style={{ marginTop: 18 }}>
          <Link className="btn" href="/trading/stock">
            Open stock dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
