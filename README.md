## Research Portal – Earnings Call / Management Commentary Tool

This is a minimal internal research portal slice that implements **Option B: Earnings Call / Management Commentary Summary** from your L2 assignment.

It is designed to:

- **Upload** a single document (earnings call transcript or management discussion – PDF or text)
- **Ingest and parse** the document to plain text
- **Run a structured research tool** on top of the text using an LLM
- **Return analyst-usable output** with clear handling of missing / ambiguous information

---

### Stack

- **Framework**: Next.js `16.1.6` (App Router)
- **Language**: TypeScript
- **UI**: Minimal custom CSS, responsive layout
- **LLM client**: `@google/genai@1.41.0` calling a Gemini model (e.g. `gemini-2.5-flash`)
- **Document parsing**: `pdf-parse@2.4.5` for PDFs, UTF‑8 text fallback for `.txt`/`.md`/`.rtf`

---

### Tool Implemented – Option B

**Input**:  
Earnings call transcript or management commentary (PDF / text).

**Output (structured JSON rendered in UI)**:

- **Management tone / sentiment**: `optimistic`, `cautious`, `neutral`, `pessimistic`, or `unknown`
- **Confidence level**: `high`, `medium`, `low`, or `unknown`
- **3–5 key positives** with optional **supporting direct quotes**
- **3–5 key concerns / challenges** with optional quotes
- **Forward guidance**, broken into:
  - `revenue`
  - `margin`
  - `capex`
  - `other`
- **Capacity utilization trends** (or explicit indication that it wasn’t discussed)
- **2–3 new growth initiatives** with optional quotes

The backend enforces this shape with a **JSON schema** passed to the model, so the output is stable and machine-usable.

---

### Judgment Calls & How They’re Implemented

- **How is management tone assessed?**  
  - The system prompt defines clear categories (`optimistic`, `cautious`, `neutral`, `pessimistic`, `unknown`).  
  - The model must also return a short **`tone_rationale`** so it “shows its work” rather than picking labels blindly.

- **How to avoid hallucinations?**  
  - System prompt explicitly says: **“Never hallucinate or invent numbers, guidance, or initiatives.”**  
  - If something is missing or vague, the model must return **`null`** or an **empty array**, not fill it.  
  - We use `response_format: json_schema` so the model can’t add extra fields or free‑form text.

- **What if sections are missing in the transcript?**  
  - `tone` / `confidence`: fall back to `"unknown"` if unclear.  
  - Lists like `key_positives`, `key_concerns`, `growth_initiatives`: may be empty arrays.  
  - String fields like `capacity_utilization`: can be `null` and are rendered in the UI with explicit “not discussed” helper text.

- **How specific is guidance when vague?**  
  - Prompt tells the model to be **conservative**: summarize only what’s clearly guided (revenue, margins, capex) and avoid adding its own projections.

- **How do we prevent quoting things that weren’t said?**  
  - Supporting quotes are **optional**; the model is reminded never to fabricate them and to only extract explicit snippets.

---

### Running the Project Locally

1. **Install dependencies**

   In the project root:

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Create `.env.local` at the project root:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set:

   ```bash
   GEMINI_API_KEY=your_real_gemini_key_here
   ```

3. **Start the dev server**

   ```bash
   npm run dev
   ```

   Then open `http://localhost:3000` in your browser.

---

### Using the Tool

1. **Upload document**
   - Supported: `PDF`, `.txt`, `.md`, `.rtf` (single file per run).
   - Recommended size: **≤ 10 MB** and **1–2 earnings calls** per run to stay within context limits.

2. **Run the research tool**
   - Tool selector is pre‑set to **“Earnings call / management commentary summary”** (Option B).
   - Click **“Run tool”**.

3. **Review structured output**
   - Left side: upload controls and status.
   - Right side: structured, analyst‑readable summary:
     - Tone + confidence badges
     - Positives and concerns (bullets + optional quotes)
     - Forward guidance broken by category
     - Capacity utilization and growth initiatives
   - Missing or ambiguous sections are clearly labeled (e.g., “not clearly discussed”).

You can copy text blocks directly into notes or export the JSON from the API for downstream tooling.

---

### Deployment Instructions (Vercel)

1. **Create a new Vercel project**
   - From the Vercel dashboard, create a new project.
   - Connect it to the repository containing this code.
   - Vercel should auto-detect **Next.js**.

2. **Set environment variables**
   - In the project’s **Settings → Environment Variables**, add:
     - `GEMINI_API_KEY` – your Gemini API key (from Google AI Studio).

3. **Deploy**
   - Trigger a production deployment (Vercel will run `npm install` and `npm run build`).
   - Once finished, you will get a **public URL** you can share for evaluation.

---

### Hosting / Demo Limitations

- **LLM usage**: This demo is designed so **1–2 runs** during evaluation are enough to validate the flow (upload → analyze → structured output).
- **File size**: Requests larger than ~10 MB will be rejected with a clear error.
- **Truncation**: Very long transcripts are truncated to the first ~40,000 characters for reliability. This is documented in code and comments.
- **Throughput**: This is optimized for reliability and clarity over raw performance. It is not tuned for high concurrency.

---

### Extensibility Notes

- Adding **Option A (Financial Statement Extraction)** would involve:
  - Another API route or tool flag.
  - More sophisticated table and numeric extraction logic (likely combining `pdf-parse`, regex / heuristics, and LLM validation).
  - Output into CSV/Excel (e.g., using `papaparse` or `exceljs`) with explicit treatment of:
    - Alternate line item names
    - Missing line items
    - Currency / units detection
    - Multi‑year columns and missing cells.

This project is intentionally kept small but clean so that new tools can be added on top of the same upload + analysis flow.

