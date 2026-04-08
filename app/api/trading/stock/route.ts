// PATH: C:\\Users\\prome\\anaconda_projects\\capstone_stockPredict\\web\\app\\api\\trading\\stock\\route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SetupStatus = {
  ok: boolean;
  pythonExists: boolean;
  modelExists: boolean;
  dataExists: boolean;
  pythonPath: string | null;
  modelPath: string | null;
  dataPath: string | null;
  messages: string[];
};

function resolveFromCwd(value: string | undefined): string | null {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function getSetupStatus(): SetupStatus {
  const pythonPath = resolveFromCwd(process.env.STOCK_PYTHON_BIN);
  const modelPath = resolveFromCwd(process.env.STOCK_MODEL_PATH);
  const dataPath = resolveFromCwd(process.env.STOCK_DATA_PATH);

  const pythonExists = !!pythonPath && existsSync(pythonPath);
  const modelExists = !!modelPath && existsSync(modelPath);
  const dataExists = !!dataPath && existsSync(dataPath);

  const messages: string[] = [];

  if (!pythonExists) {
    messages.push("Set STOCK_PYTHON_BIN in .env.local to the exact Python executable that has pandas, numpy, joblib, xgboost, lightgbm, and scikit-learn installed.");
  }
  if (!modelExists) {
    messages.push("Create the saved model bundle first using scripts/trading/save_stock_bundle.py, then set STOCK_MODEL_PATH in .env.local.");
  }
  if (!dataExists) {
    messages.push("Optional: set STOCK_DATA_PATH in .env.local for a default server dataset. You can still upload a new CSV from the page.");
  }

  return {
    ok: pythonExists && modelExists,
    pythonExists,
    modelExists,
    dataExists,
    pythonPath,
    modelPath,
    dataPath,
    messages
  };
}

async function runPythonPredictor(input: unknown) {
  const setup = getSetupStatus();
  if (!setup.pythonExists || !setup.modelExists) {
    return {
      ok: false,
      setup,
      error: "Backend setup incomplete.",
      details: setup.messages
    };
  }

  const pythonBin = setup.pythonPath as string;
  const scriptPath = path.join(process.cwd(), "scripts", "trading", "stock_predict.py");

  return await new Promise<Record<string, unknown>>((resolve) => {
    const child = spawn(pythonBin, [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        setup,
        error: "Failed to launch the Python prediction script.",
        details: error.message
      });
    });

    child.on("close", (code) => {
      const raw = stdout.trim();
      if (!raw) {
        resolve({
          ok: false,
          setup,
          error: "The Python prediction script returned no JSON output.",
          details: stderr || `Exit code ${code}`
        });
        return;
      }

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed.setup = parsed.setup ?? setup;
        if (stderr && !parsed.stderr) parsed.stderr = stderr;
        resolve(parsed);
      } catch (error) {
        resolve({
          ok: false,
          setup,
          error: "The Python prediction script returned invalid JSON.",
          details: stderr || (error instanceof Error ? error.message : String(error))
        });
      }
    });

    child.stdin.write(JSON.stringify(input ?? {}));
    child.stdin.end();
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const result = await runPythonPredictor(payload);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
