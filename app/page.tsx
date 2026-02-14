"use client";

import { FormEvent, useState } from "react";

type Tone = "optimistic" | "cautious" | "neutral" | "pessimistic" | "unknown";
type Confidence = "high" | "medium" | "low" | "unknown";

type BulletPoint = {
  summary: string;
  supporting_quote?: string | null;
};

type ForwardGuidance = {
  revenue?: string | null;
  margin?: string | null;
  capex?: string | null;
  other?: string | null;
};

type EarningsSummary = {
  tone: Tone;
  confidence: Confidence;
  tone_rationale: string | null;
  key_positives: BulletPoint[];
  key_concerns: BulletPoint[];
  forward_guidance: ForwardGuidance;
  capacity_utilization: string | null;
  growth_initiatives: BulletPoint[];
  raw_notes?: string | null;
};

type ApiState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; data: EarningsSummary }
  | { status: "error"; message: string };

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [apiState, setApiState] = useState<ApiState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setApiState({
        status: "error",
        message: "Please attach an earnings call transcript or commentary file."
      });
      return;
    }

    // Vercel Serverless Function Limit is 4.5 MB.
    // We limit to 4MB to be safe with headers/encoding.
    const MAX_MB = 4;
    if (file.size > MAX_MB * 1024 * 1024) {
      setApiState({
        status: "error",
        message: `File is too large (${Math.round(file.size / 1024 / 1024 * 10) / 10} MB). Please upload a file smaller than ${MAX_MB} MB for this demo.`
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tool", "earnings_summary");

    setApiState({ status: "submitting" });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Request failed");
      }

      const data = (await response.json()) as EarningsSummary;
      setApiState({ status: "success", data });
    } catch (error: any) {
      setApiState({
        status: "error",
        message:
          error?.message ??
          "Something went wrong while analyzing the document. Please try again."
      });
    }
  }

  const currentFileLabel = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "No file selected";

  return (
    <main>
      <div className="app-shell">
        <header>
          <h1 className="card-title">Internal Research Portal</h1>
          <p className="card-subtitle">
            Earnings call / management commentary summarizer with structured,
            analyst-ready output.
          </p>
        </header>

        <section className="grid-two">
          <form className="card" onSubmit={handleSubmit}>
            <div className="card-header">
              <div>
                <div className="card-title">1. Upload document</div>
                <div className="card-subtitle">
                  PDF or text transcript of an earnings call or MD&amp;A.
                </div>
              </div>
              <span className="pill">
                Tool
                <span className="mono">Option B</span>
              </span>
            </div>

            <div className="field-group">
              <div className="label-row">
                <label className="label" htmlFor="file-input">
                  Document
                </label>
                <span className="hint">{currentFileLabel}</span>
              </div>

              <label className="dropzone" htmlFor="file-input">
                <span>
                  <strong>Click to choose</strong> an earnings call transcript or
                  commentary PDF / TXT.
                </span>
                <small>
                  Designed for 1–2 calls per run. For this demo, please keep
                  files under ~10 MB.
                </small>
                <input
                  id="file-input"
                  type="file"
                  accept=".pdf,.txt,.md,.rtf"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    setFile(nextFile);
                    setApiState((prev) =>
                      prev.status === "success" || prev.status === "error"
                        ? { status: "idle" }
                        : prev
                    );
                  }}
                />
              </label>
            </div>

            <div className="field-group">
              <div className="label-row">
                <span className="label">Research tool</span>
                <span className="hint">Earnings call / commentary summary</span>
              </div>
              <select
                disabled
                value="earnings_summary"
                className="dropzone"
                style={{
                  borderStyle: "solid",
                  cursor: "not-allowed",
                  background: "#f9fafb"
                }}
              >
                <option value="earnings_summary">
                  Earnings call / management commentary summary
                </option>
              </select>
            </div>

            <div className="button-row">
              <button
                type="submit"
                className="button-primary"
                disabled={apiState.status === "submitting"}
              >
                {apiState.status === "submitting" ? "Analyzing…" : "Run tool"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setFile(null);
                  setApiState({ status: "idle" });
                }}
              >
                Reset
              </button>
              <span
                className={`status-text${apiState.status === "error" ? " error" : ""
                  }`}
              >
                {apiState.status === "idle" && (
                  <>Attach a file and click &ldquo;Run tool&rdquo; to begin.</>
                )}
                {apiState.status === "submitting" && (
                  <>Processing document. This can take a few seconds…</>
                )}
                {apiState.status === "success" && (
                  <>
                    <strong>Done.</strong> Review the structured summary on the
                    right.
                  </>
                )}
                {apiState.status === "error" && (
                  <>{apiState.message}</>
                )}
              </span>
            </div>
          </form>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">2. Structured output</div>
                <div className="card-subtitle">
                  Designed for analysts: tone, positives, concerns, guidance,
                  capacity and growth initiatives.
                </div>
              </div>
            </div>

            {apiState.status !== "success" ? (
              <p className="hint">
                Once a document is processed, a structured, non-hallucinated
                summary will appear here. Fields that are missing or ambiguous
                will be clearly marked so you can quickly spot gaps in the
                transcript.
              </p>
            ) : (
              <SummaryView summary={apiState.data} />
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function SummaryView({ summary }: { summary: EarningsSummary }) {
  const {
    tone,
    confidence,
    tone_rationale,
    key_positives,
    key_concerns,
    forward_guidance,
    capacity_utilization,
    growth_initiatives
  } = summary;

  const toneLabel = tone === "unknown" ? "Not clearly specified" : tone;
  const confidenceLabel =
    confidence === "unknown" ? "Not specified" : `${confidence} confidence`;

  const listOrFallback = (items: BulletPoint[], emptyLabel: string) => {
    if (!items || items.length === 0) {
      return <p className="hint">{emptyLabel}</p>;
    }
    return (
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {items.map((item, index) => (
          <li key={index}>
            {item.summary}
            {item.supporting_quote && (
              <div className="quote">“{item.supporting_quote}”</div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const guidanceOrFallback = () => {
    if (
      !forward_guidance ||
      (!forward_guidance.revenue &&
        !forward_guidance.margin &&
        !forward_guidance.capex &&
        !forward_guidance.other)
    ) {
      return (
        <p className="hint">
          No explicit forward guidance was extracted from this document.
        </p>
      );
    }

    return (
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {forward_guidance.revenue && (
          <li>
            <strong>Revenue:</strong> {forward_guidance.revenue}
          </li>
        )}
        {forward_guidance.margin && (
          <li>
            <strong>Margin:</strong> {forward_guidance.margin}
          </li>
        )}
        {forward_guidance.capex && (
          <li>
            <strong>Capex:</strong> {forward_guidance.capex}
          </li>
        )}
        {forward_guidance.other && (
          <li>
            <strong>Other:</strong> {forward_guidance.other}
          </li>
        )}
      </ul>
    );
  };

  return (
    <div className="summary-grid">
      <div className="summary-section">
        <h3>Management tone</h3>
        <p>
          <strong>{toneLabel}</strong>
        </p>
        <div className="summary-meta">
          <span className="badge badge-soft">{confidenceLabel}</span>
        </div>
        {tone_rationale && (
          <p className="quote" style={{ marginTop: 8 }}>
            {tone_rationale}
          </p>
        )}
      </div>

      <div className="summary-section">
        <h3>Key positives (3–5)</h3>
        {listOrFallback(
          key_positives,
          "No clear positives were explicitly discussed in this transcript."
        )}
      </div>

      <div className="summary-section">
        <h3>Key concerns / challenges (3–5)</h3>
        {listOrFallback(
          key_concerns,
          "No specific concerns or challenges were identified."
        )}
      </div>

      <div className="summary-section">
        <h3>Forward guidance</h3>
        {guidanceOrFallback()}
      </div>

      <div className="summary-section">
        <h3>Capacity utilization trends</h3>
        <p>
          {capacity_utilization ?? (
            <span className="hint">
              Capacity utilization was not clearly discussed in this document.
            </span>
          )}
        </p>
      </div>

      <div className="summary-section">
        <h3>New growth initiatives (2–3)</h3>
        {listOrFallback(
          growth_initiatives,
          "No new growth initiatives were explicitly described."
        )}
      </div>
    </div>
  );
}

