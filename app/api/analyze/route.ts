import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const MAX_CHARS = 40_000; // keep within safe context window
const MAX_FILE_BYTES = 20 * 1024 * 1024; // ~20 MB to allow slightly larger PDFs

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

const SYSTEM_PROMPT = `
You are a buy-side equity research analyst assistant. Your job is to create a **strictly factual**,
structured summary of an earnings call transcript or management commentary.

Rules:
- **Never hallucinate or invent numbers, guidance, or initiatives.**
- Only use information explicitly present in the transcript text provided.
- If a field is missing, vague, or not clearly stated, mark it as **null** (for strings) or an **empty array** (for lists).
- When in doubt, be conservative and prefer "not discussed" / null over guessing.
- Capture short **supporting direct quotes** where possible, but never fabricate quotes.

Tone assessment:
- "optimistic": management is clearly positive on outlook/trajectory.
- "cautious": mixed but leaning careful/guarded.
- "neutral": largely descriptive, little explicit positive or negative tone.
- "pessimistic": clearly negative, focused on headwinds.

Confidence:
- "high": transcript has explicit guidance and multiple concrete data points.
- "medium": some guidance but with qualifiers or limited detail.
- "low": vague language, limited data, or very partial transcript.

Forward guidance:
- Summarize **only** what they explicitly guide on (revenue, margins, capex, and other specifics).
- Avoid adding your own projections.

Capacity utilization:
- Only summarize if there is explicit discussion of utilization, load factors, occupancy, or similar metrics.

Growth initiatives:
- Capture 2–3 **distinct** new or emphasized growth initiatives (products, geographies, channels, capex projects, etc.).
- If none are clearly articulated, return an empty array.

Output format:
Return **valid JSON** that matches this TypeScript type shape exactly:

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

If something is missing or ambiguous, use:
- "unknown" for tone or confidence, or
- null / [] as appropriate for other fields.

Respond with **JSON only**, with no surrounding explanation text.
`;

const EARNINGS_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tone: {
      type: "string",
      enum: ["optimistic", "cautious", "neutral", "pessimistic", "unknown"]
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low", "unknown"]
    },
    tone_rationale: {
      type: ["string", "null"]
    },
    key_positives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          supporting_quote: { type: ["string", "null"] }
        },
        required: ["summary"],
        nullable: false
      }
    },
    key_concerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          supporting_quote: { type: ["string", "null"] }
        },
        required: ["summary"],
        nullable: false
      }
    },
    forward_guidance: {
      type: "object",
      additionalProperties: false,
      properties: {
        revenue: { type: ["string", "null"] },
        margin: { type: ["string", "null"] },
        capex: { type: ["string", "null"] },
        other: { type: ["string", "null"] }
      }
    },
    capacity_utilization: {
      type: ["string", "null"]
    },
    growth_initiatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          supporting_quote: { type: ["string", "null"] }
        },
        required: ["summary"],
        nullable: false
      }
    },
    raw_notes: {
      type: ["string", "null"]
    }
  },
  required: [
    "tone",
    "confidence",
    "tone_rationale",
    "key_positives",
    "key_concerns",
    "forward_guidance",
    "capacity_utilization",
    "growth_initiatives"
  ]
} as const;

async function extractTextFromFile(file: File): Promise<{ text: string, buffer: Buffer }> {
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      "File is too large for this demo environment. Please keep files under ~20 MB."
    );
  }

  const buffer = Buffer.from(arrayBuffer);
  let text = "";

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      // @ts-ignore
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const pdfResult = await parser.getText();
      text = pdfResult.text;
    } catch (e) {
      console.error("PDF Parse Error, will try fallback methods if applicable", e);
    }
  } else {
    // Fallback: treat as UTF-8 text
    text = buffer.toString("utf-8");
  }

  return { text, buffer };
}

async function summarizeEarningsCall(
  promptContext: string,
  imgData?: { inlineData: { mimeType: string; data: string } }
): Promise<EarningsSummary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please set it in your environment."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const contents = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + promptContext }] }
  ];

  if (imgData) {
    // @ts-ignore
    contents.push({ role: "user", parts: [imgData] });
  }

  const response = await ai.models.generateContent({
    model: "models/gemini-2.5-flash", // gemini-2.5-flash supports multimodal
    // @ts-ignore
    contents: contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: EARNINGS_SUMMARY_SCHEMA
    }
  });

  const jsonText = response.text;
  if (!jsonText) {
    throw new Error("No text returned from Gemini model.");
  }

  const json = JSON.parse(jsonText) as EarningsSummary;
  return json;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const tool = formData.get("tool");
    const file = formData.get("file");

    if (tool !== "earnings_summary") {
      return NextResponse.json(
        { error: "Unsupported tool. Only 'earnings_summary' is implemented." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided. Please attach a document." },
        { status: 400 }
      );
    }

    const { text, buffer } = await extractTextFromFile(file);
    console.log(`[DEBUG] Extracted text length: ${text?.length}`);
    console.log(`[DEBUG] Text preview: ${text?.slice(0, 200)}`);

    // Check for "Scanned PDF" scenario (lots of pages but very little text)
    // Heuristic: < 500 chars total for PDF.
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isScanned = isPdf && (!text || text.trim().length < 500);

    if (isScanned) {
      console.log("[INFO] Detected scanned PDF or insufficient text. Switching to Vision/OCR mode.");

      const base64Data = buffer.toString("base64");
      const summary = await summarizeEarningsCall(
        "Please analyze the attached PDF document. It appears to be a scanned transcript.",
        { inlineData: { mimeType: "application/pdf", data: base64Data } }
      );
      return NextResponse.json(summary);
    }

    // Text-based processing (Original flow)
    // Limit the text length to avoid hitting token limits
    const trimmedText = text.slice(0, MAX_CHARS);
    const userPrompt = `
Transcript text (may be truncated for length):

"""${trimmedText}"""
`;
    const summary = await summarizeEarningsCall(userPrompt);
    return NextResponse.json(summary, { status: 200 });

  } catch (error: any) {
    console.error("Error in /api/analyze:", error);
    return NextResponse.json(
      {
        error:
          error?.message ??
          "Unexpected error while processing the document. Please try again."
      },
      { status: 500 }
    );
  }
}
