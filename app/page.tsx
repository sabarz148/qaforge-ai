"use client";

import { useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

type PreviewImage = {
  name: string;
  dataUrl: string;
};

export default function Home() {
  const { isSignedIn, user } = useUser();

  const [type, setType] = useState("manual");
  const [input, setInput] = useState("");
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [output, setOutput] = useState("");
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const plan = (user?.publicMetadata?.plan as string) || "free";
  const isPro = plan === "pro" || plan === "premium";

  function todayKey() {
    const today = new Date().toISOString().slice(0, 10);
    return `qaforge_usage_${user?.id || "guest"}_${today}`;
  }

  function getUsage() {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(todayKey()) || "0");
  }

  function incrementUsage() {
    if (typeof window === "undefined") return;
    localStorage.setItem(todayKey(), String(getUsage() + 1));
  }
  function handleUpgrade() {
  alert("Pro upgrade is coming soon.");
  }
  function clearAll() {
    setInput("");
    setImages([]);
    setOutput("");
    setTableData([]);
  }
  function handleUpgrade() {
  alert("Payments are under review. Pro upgrade will be available soon.");
  // Later replace this with LemonSqueezy link:
  // window.open("https://your-lemonsqueezy-checkout-link", "_blank");
  }
  async function resizeImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const img = new Image();

      reader.onload = () => {
        img.src = reader.result as string;
      };

      img.onload = () => {
        const maxWidth = 800;
        const scale = Math.min(maxWidth / img.width, 1);

        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("Canvas error");

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isSignedIn) {
      setOutput("Please sign in to upload screenshots.");
      return;
    }

    if (!isPro) {
      setOutput("Screenshot analysis is available in Pro plan only.");
      return;
    }

    const files = Array.from(e.target.files || []);

    if (files.length + images.length > 5) {
      alert("Maximum 5 screenshots allowed.");
      return;
    }

    const validFiles = files.filter((file) =>
      ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)
    );

    const resized = await Promise.all(
      validFiles.map(async (file) => ({
        name: file.name,
        dataUrl: await resizeImage(file),
      }))
    );

    setImages((prev) => [...prev, ...resized]);
    e.target.value = "";
  }

  function cleanResponse(text: string) {
    return text
      .replace(/```json/g, "")
      .replace(/```typescript/g, "")
      .replace(/```ts/g, "")
      .replace(/```/g, "")
      .trim();
  }

  async function generate() {
    if (!isSignedIn) {
      setOutput("Please sign in to generate QA output.");
      return;
    }

    if (!isPro && getUsage() >= 3) {
      setOutput("Free limit reached: 3 generations per day. Upgrade to Pro for more usage.");
      return;
    }

    if (!isPro && images.length > 0) {
      setOutput("Screenshot analysis is Pro only.");
      return;
    }

    if (!isPro && (type === "playwright" || type === "api-automation")) {
      setOutput("Automation code generation is Pro only.");
      return;
    }

    if (!input.trim() && images.length === 0) {
      setOutput("Please enter details or upload screenshots.");
      return;
    }

    try {
      setLoading(true);
      setOutput("⚡ Generating high-quality QA output... this may take 10–25 seconds.");
      setTableData([]);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, input, images: images.map((img) => img.dataUrl) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOutput(data.error || "Something went wrong.");
        return;
      }

      const cleaned = cleanResponse(data.result);

      if (type === "playwright" || type === "api-automation") {
        setOutput(cleaned);
        incrementUsage();
        return;
      }

      const parsed = JSON.parse(cleaned);
      setTableData(parsed);
      setOutput(JSON.stringify(parsed, null, 2));
      incrementUsage();
    } catch {
      setOutput("Error: Could not process AI response. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  function copyOutput() {
    navigator.clipboard.writeText(output);
    alert("Copied");
  }

  function downloadExcel() {
    if (!tableData.length) return;

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    worksheet["!cols"] = Object.keys(tableData[0] || {}).map(() => ({ wch: 35 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QA Output");
    XLSX.writeFile(workbook, type === "api" ? "api-test-cases.xlsx" : "manual-test-cases.xlsx");
  }

  function downloadPdf() {
    if (!tableData.length) return;

    const doc = new jsPDF();
    let y = 15;

    doc.setFontSize(16);
    doc.text("QAForge AI - QA Output", 10, y);
    y += 10;

    tableData.forEach((row, index) => {
      const text = Object.entries(row)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

      const lines = doc.splitTextToSize(`Case ${index + 1}\n${text}`, 185);

      if (y + lines.length * 6 > 280) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(10);
      doc.text(lines, 10, y);
      y += lines.length * 6 + 8;
    });

    doc.save(type === "api" ? "api-test-cases.pdf" : "manual-test-cases.pdf");
  }

  function downloadTxt() {
    downloadFile(output, "qa-output.txt", "text/plain");
  }

  function downloadAutomationCode() {
    const filename = type === "api-automation" ? "api-automation.spec.ts" : "ui-automation.spec.ts";
    downloadFile(output, filename, "text/plain");
  }

  function downloadInstructions() {
    const readme = `# How to Run Generated Playwright Tests

## 1. Install Playwright
npm init playwright@latest

## 2. Add Generated Code
Create this file:
tests/ai-generated.spec.ts

Paste the downloaded code into it.

## 3. Set App URL

Windows PowerShell:
$env:BASE_URL="https://your-app-url.com"; npx playwright test tests/ai-generated.spec.ts

Mac/Linux:
BASE_URL=https://your-app-url.com npx playwright test tests/ai-generated.spec.ts

## 4. Run All Tests
npx playwright test

## 5. Run With Browser Visible
npx playwright test --headed

## 6. Debug
npx playwright test --debug

## Notes
- AI-generated selectors may need adjustment.
- For API tests, update endpoints, payloads, auth tokens, and expected responses.
`;

    downloadFile(readme, "playwright-run-instructions.md", "text/markdown");
  }

  const tabs = [
    ["manual", "Manual Test Cases"],
    ["api", "API Test Cases"],
    ["playwright", "UI Automation"],
    ["api-automation", "API Automation"],
  ];

  return (
    <main style={mainStyle}>
      <div style={{ maxWidth: "1250px", margin: "0 auto" }}>
        <header style={headerStyle}>
          <div style={brandWrap}>
            <div style={logoStyle}>Q</div>
            <div>
              <div style={brandName}>QAForge AI</div>
              <div style={tagline}>AI test case and automation generator</div>
            </div>
          </div>

          <div style={authArea}>
            <div style={badgeStyle}>
              {isSignedIn ? `${isPro ? "Pro" : "Free"} Plan • ${isPro ? "50" : "3"} daily generations` : "Sign in to start"}
            </div>

             <button onClick={handleUpgrade} style={signInButton}>
            🚀 Upgrade to Pro
             </button>

            {isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button style={signInButton}>Sign In</button>
              </SignInButton>
            )}
          </div>
        </header>

        <section style={heroStyle}>
          <h1 style={heroTitle}>Generate QA test cases and automation in minutes.</h1>
          <p style={heroText}>
          Generate high-quality manual test cases, API test cases, and Playwright automation in seconds — not hours.
          </p>

          <div style={heroBullets}>
            <span>✓ Excel / PDF export</span>
            <span>✓ Screenshot analysis</span>
            <span>✓ Playwright code</span>
            <span>✓ API test coverage</span>
          </div>
        </section>

        <section style={howItWorks}>
          <h2 style={{ marginTop: 0 }}>How it works</h2>
          <div style={stepsGrid}>
            <div style={stepCard}><b>1. Describe</b><br />Enter your feature, API, flow, or URL details.</div>
            <div style={stepCard}><b>2. Upload</b><br />Add screenshots for UI-based test cases. Pro only.</div>
            <div style={stepCard}><b>3. Generate</b><br />AI creates structured test cases or Playwright code.</div>
            <div style={stepCard}><b>4. Export</b><br />Download Excel, PDF, TXT, or runnable automation files.</div>
          </div>
        </section>

        <div style={gridStyle}>
          <section style={cardDark}>
            <h2 style={{ marginTop: 0 }}>Create QA Output</h2>
            <p style={{ color: "#94a3b8", marginTop: "-8px" }}>
            ⚡ Get practical QA coverage from feature text, API details, or screenshots.
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
              {tabs.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setType(value);
                    setOutput("");
                    setTableData([]);
                  }}
                  style={{
                    ...tabButton,
                    background: type === value ? "#22c55e" : "#1e293b",
                    color: "white",
                    opacity: !isPro && (value === "playwright" || value === "api-automation") ? 0.55 : 1,
                  }}
                >
                  {label}
                  {!isPro && (value === "playwright" || value === "api-automation") ? " 🔒" : ""}
                </button>
              ))}
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                type === "api"
                  ? "Example: POST /api/login with email, password, OTP, invalid token, locked account"
                  : type === "api-automation"
                  ? "Example: Base URL, login endpoint, payload, token rules, expected status codes"
                  : type === "playwright"
                  ? "Example: Login page with email field, password field, login button, OTP screen"
                  : "Example: Login page with email, password, remember me, forgot password, OTP"
              }
              style={textareaStyle}
            />

            <div style={uploadBox}>
              <h3 style={{ marginTop: 0 }}>Upload app screenshots {isPro ? "" : "🔒"}</h3>

              <p style={{ color: "#94a3b8", fontSize: "14px" }}>
                Pro feature. Upload up to 5 clear screenshots. Images are resized to 800px width and compressed to reduce cost.
              </p>

              <label style={{ ...uploadButton, opacity: isPro ? 1 : 0.5 }}>
                Select Screenshots
                <input
                  type="file"
                  multiple
                  disabled={!isPro}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
              </label>

              <p style={{ color: "#cbd5e1", fontSize: "13px" }}>{images.length} / 5 images selected</p>

              {images.length > 0 && (
                <div style={imageGrid}>
                  {images.map((img, index) => (
                    <div key={index} style={{ position: "relative" }}>
                      <img src={img.dataUrl} alt={img.name} style={previewImage} />
                      <button
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                        style={removeButton}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button onClick={generate} disabled={loading} style={generateButton}>
                {loading ? "Generating..." : "Generate QA Output"}
              </button>

              <button onClick={clearAll} style={clearButton}>
                Clear
              </button>
            </div>
          </section>

          <section style={cardLight}>
            <h2 style={{ marginTop: 0 }}>Output</h2>

            {output && output !== "Generating..." && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "15px" }}>
                <button onClick={copyOutput} style={smallButton}>Copy</button>

                {type === "playwright" || type === "api-automation" ? (
                  <>
                    {isPro && <button onClick={downloadAutomationCode} style={smallButton}>Download Code</button>}
                    {isPro && <button onClick={downloadInstructions} style={smallButton}>Instructions</button>}
                    <button onClick={downloadTxt} style={smallButton}>TXT</button>
                  </>
                ) : (
                  <>
                    {isPro && tableData.length > 0 && (
                      <>
                        <button onClick={downloadExcel} style={smallButton}>Excel</button>
                        <button onClick={downloadPdf} style={smallButton}>PDF</button>
                      </>
                    )}
                    <button onClick={downloadTxt} style={smallButton}>TXT</button>
                  </>
                )}
              </div>
            )}

            <div style={outputBox}>
              {tableData.length > 0 && type !== "playwright" && type !== "api-automation" ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "#f1f5f9" }}>
                    <tr>
                      {Object.keys(tableData[0]).map((key) => (
                        <th key={key} style={th}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((value: any, j) => (
                          <td key={j} style={td}>{String(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre style={preStyle}>{output || "Generated output will appear here..."}</pre>
              )}
            </div>
          </section>
        </div>

        <section style={pricingSection}>
          <h2 style={{ marginTop: 0 }}>Simple pricing</h2>
          <div style={pricingGrid}>
            <div style={priceCard}>
              <h3>Free</h3>
              <p style={price}>$0</p>
              <p>For quick testing.</p>
              <ul>
                  <li>3 generations/day</li>
                  <li>Manual + API test cases</li>
                  <li>TXT export</li>
                  <li>No screenshots or automation</li>
              </ul>
              
            </div>

            <div style={{ ...priceCard, border: "2px solid #22c55e" }}>
              <h3>Pro</h3>
              <p style={price}>$9/month</p>
              <p>For QA engineers and freelancers.</p>
              <ul>
                <li>50 generations/day</li>
                <li>Screenshot-based test cases</li>
                <li>Playwright UI automation</li>
                <li>API automation code</li>
                <li>Excel + PDF export</li>
              </ul>
            </div>
          </div>
        </section>

        <footer style={footerStyle}>
          <div>© 2026 QAForge AI. Built for faster software testing.</div>
          <div>Manual QA • API QA • Playwright Automation • Screenshot Analysis</div>
        </footer>
      </div>
    </main>
  );
}

const mainStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #020617, #0f172a)",
  color: "white",
  padding: "32px",
  fontFamily: "Arial, sans-serif",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "36px",
  flexWrap: "wrap",
  gap: "16px",
};

const brandWrap: CSSProperties = { display: "flex", alignItems: "center", gap: "12px" };

const logoStyle: CSSProperties = {
  width: "46px",
  height: "46px",
  borderRadius: "14px",
  background: "#22c55e",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: "24px",
};

const brandName: CSSProperties = { fontWeight: "bold", fontSize: "22px" };
const tagline: CSSProperties = { color: "#94a3b8", fontSize: "14px" };

const authArea: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const badgeStyle: CSSProperties = {
  background: "#1e293b",
  color: "#86efac",
  padding: "10px 14px",
  borderRadius: "999px",
  fontSize: "14px",
};

const signInButton: CSSProperties = {
  padding: "10px 16px",
  borderRadius: "10px",
  border: "none",
  background: "#22c55e",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const heroStyle: CSSProperties = {
  background: "linear-gradient(135deg, #111827, #1e293b)",
  border: "1px solid #334155",
  borderRadius: "24px",
  padding: "36px",
  marginBottom: "28px",
};

const heroTitle: CSSProperties = {
  fontSize: "44px",
  lineHeight: "1.1",
  maxWidth: "850px",
  margin: 0,
};

const heroText: CSSProperties = {
  color: "#cbd5e1",
  fontSize: "18px",
  maxWidth: "850px",
};

const heroBullets: CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  color: "#bbf7d0",
  fontWeight: "bold",
};

const howItWorks: CSSProperties = {
  background: "#0b1220",
  border: "1px solid #334155",
  borderRadius: "20px",
  padding: "24px",
  marginBottom: "28px",
};

const stepsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
};

const stepCard: CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "16px",
  color: "#cbd5e1",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: "24px",
};

const cardDark: CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: "20px",
  padding: "24px",
};

const cardLight: CSSProperties = {
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: "20px",
  padding: "24px",
};

const tabButton: CSSProperties = {
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid #334155",
  cursor: "pointer",
  fontWeight: "bold",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  height: "170px",
  padding: "16px",
  borderRadius: "14px",
  background: "#020617",
  color: "white",
  border: "1px solid #334155",
  fontSize: "16px",
  boxSizing: "border-box",
};

const uploadBox: CSSProperties = {
  marginTop: "18px",
  border: "1px dashed #475569",
  borderRadius: "14px",
  padding: "16px",
  background: "#020617",
};

const uploadButton: CSSProperties = {
  display: "inline-block",
  marginTop: "10px",
  padding: "12px 18px",
  background: "#2563eb",
  color: "white",
  borderRadius: "10px",
  cursor: "pointer",
  fontWeight: "bold",
};

const imageGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: "10px",
  marginTop: "12px",
};

const previewImage: CSSProperties = {
  width: "100%",
  height: "85px",
  objectFit: "cover",
  borderRadius: "10px",
  border: "1px solid #334155",
};

const removeButton: CSSProperties = {
  position: "absolute",
  top: "-8px",
  right: "-8px",
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  border: "none",
  background: "#ef4444",
  color: "white",
  cursor: "pointer",
};

const generateButton: CSSProperties = {
  flex: 1,
  padding: "16px",
  borderRadius: "14px",
  border: "none",
  background: "#22c55e",
  color: "white",
  fontWeight: "bold",
  fontSize: "16px",
  cursor: "pointer",
};

const clearButton: CSSProperties = {
  padding: "16px 22px",
  borderRadius: "14px",
  border: "none",
  background: "#475569",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const smallButton: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "none",
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const outputBox: CSSProperties = {
  maxHeight: "600px",
  overflow: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
};

const preStyle: CSSProperties = {
  padding: "18px",
  whiteSpace: "pre-wrap",
  minHeight: "420px",
  margin: 0,
  color: "#334155",
  fontSize: "13px",
  lineHeight: "1.6",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "13px",
};

const td: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
  fontSize: "13px",
};

const pricingSection: CSSProperties = {
  marginTop: "30px",
  background: "#0b1220",
  border: "1px solid #334155",
  borderRadius: "20px",
  padding: "24px",
};

const pricingGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "18px",
};

const priceCard: CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: "18px",
  padding: "22px",
  color: "#cbd5e1",
};

const price: CSSProperties = {
  fontSize: "30px",
  color: "white",
  fontWeight: "bold",
};

const footerStyle: CSSProperties = {
  marginTop: "28px",
  padding: "20px 0",
  color: "#94a3b8",
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const upgradeButton: CSSProperties = {
  padding: "10px 16px",
  borderRadius: "10px",
  border: "none",
  background: "#f59e0b",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};