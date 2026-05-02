import OpenAI from "openai";
import { auth, currentUser } from "@clerk/nextjs/server";

function isWeakInput(input: string, images?: string[]) {
  const cleaned = (input || "").trim();

  if (images && images.length > 0) return false;

  if (!cleaned) return true;
  if (cleaned.length < 20) return true;

  const weakWords = ["test", "login", "app", "website", "api", "screen"];
  if (weakWords.includes(cleaned.toLowerCase())) return true;

  return false;
}

function domainGuidance(domain: string) {
  const map: Record<string, string> = {
    general: "Use general software QA best practices.",
    healthcare:
      "Include healthcare QA risks: patient data privacy, PHI handling, HIPAA-style privacy checks, audit trail, role-based access, data integrity, consent, and secure access.",
    fintech:
      "Include fintech QA risks: transaction accuracy, duplicate payments, fraud scenarios, authorization, audit logs, concurrency, limits, rounding, chargebacks, and security.",
    ecommerce:
      "Include e-commerce QA risks: cart, checkout, discounts, inventory, payment failure, order confirmation, refunds, taxes, shipping, and abandoned cart.",
    saas:
      "Include SaaS QA risks: multi-tenant access, roles/permissions, subscription limits, onboarding, dashboards, notifications, integrations, and data isolation.",
    education:
      "Include education QA risks: student/teacher roles, enrollment, assignments, grading, progress tracking, content access, and parent/student privacy.",
  };

  return map[domain] || map.general;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: "Please sign in to generate QA output." },
        { status: 401 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY is missing." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const user = await currentUser();

    const plan = (user?.publicMetadata?.plan as string) || "free";
    const isPro = plan === "pro" || plan === "premium";

    const { type, input, images, domain = "general" } = await req.json();

    if (!isPro && images?.length > 0) {
      return Response.json(
        { error: "Screenshot analysis is a Pro feature." },
        { status: 403 }
      );
    }

    if (!isPro && (type === "playwright" || type === "api-automation")) {
      return Response.json(
        { error: "Automation generation is a Pro feature." },
        { status: 403 }
      );
    }

    if ((type === "manual" || type === "api") && isWeakInput(input, images)) {
      return Response.json({
        result: JSON.stringify([
          {
            id: "INPUT_CHECK",
            title: "Input needs more detail",
            preconditions: "User provided unclear or incomplete input.",
            steps:
              "1. Describe one feature or flow clearly. 2. Include user actions, fields, validations, and expected behavior. 3. Try again.",
            expected:
              "Example: Login page with email, password, forgot password, OTP verification, invalid password error, and locked account handling.",
            priority: "High",
            coverageArea: "Input Quality",
            testType: "Clarification",
            riskLevel: "High",
          },
        ]),
      });
    }

    const imageContent: any[] =
      images?.map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      })) || [];

    const domainRules = domainGuidance(domain);

    let prompt = "";

    if (type === "manual") {
      prompt = `
You are a Senior QA Architect with 15+ years of experience.

Your task is to generate adaptive, domain-aware, QA-ready manual test cases.

Domain selected: ${domain}
Domain guidance: ${domainRules}

Input:
${input || "Analyze uploaded screenshots and generate QA test cases."}

First silently analyze:
- Is the input a real feature/flow?
- Complexity: small, medium, or complex
- Number of flows
- Main risks
- Required coverage areas

Generate test cases according to complexity:
- Small feature: 5–8 test cases
- Medium feature: 8–15 test cases
- Complex/multi-flow: 15–25 test cases
But avoid repetition.

Coverage required:
- Functional happy path
- Negative scenarios
- Validation
- Edge cases
- Security/privacy where relevant
- Usability
- Accessibility basics
- Domain-specific risks

Return ONLY valid JSON object:
{
  "testCases": [
    {
      "id": "TC001",
      "title": "",
      "preconditions": "",
      "steps": "1. ... 2. ... 3. ...",
      "expected": "",
      "priority": "High",
      "coverageArea": "Functional / Validation / Security / Usability / Accessibility / Edge Case",
      "testType": "Positive / Negative / Edge / Security / UI / Accessibility",
      "riskLevel": "High / Medium / Low"
    }
  ]
}

Rules:
- Be specific to the user's input.
- Do not generate generic checklist items.
- Each test case must be unique.
- Steps must be actionable.
- Expected result must be clear.
- No markdown.
- No explanation outside JSON.
`;
    } else if (type === "api") {
      prompt = `
You are a Senior API QA Architect.

Generate adaptive, domain-aware API test cases.

Domain selected: ${domain}
Domain guidance: ${domainRules}

Input:
${input}

First silently analyze:
- Endpoint/method/payload if provided
- Auth requirements
- Validation rules
- Business risks
- Complexity

Generate test cases according to complexity:
- Small API: 5–8 test cases
- Medium API: 8–15 test cases
- Complex API: 15–25 test cases

Coverage required:
- Successful request
- Missing fields
- Invalid data types
- Invalid/expired token
- Unauthorized access
- Boundary values
- Duplicate request/idempotency
- Rate limit/security
- Domain-specific risks

Return ONLY valid JSON object:
{
  "testCases": [
    {
      "id": "API_TC001",
      "title": "",
      "method": "",
      "endpoint": "",
      "requestData": "",
      "steps": "1. ... 2. ... 3. ...",
      "expected": "",
      "statusCode": "",
      "priority": "High",
      "coverageArea": "Functional / Validation / Auth / Security / Edge Case",
      "testType": "Positive / Negative / Security / Boundary",
      "riskLevel": "High / Medium / Low"
    }
  ]
}

Rules:
- If method/endpoint is missing, use "To be updated".
- Do not create vague test cases.
- No markdown.
- No explanation outside JSON.
`;
    } else if (type === "playwright") {
      prompt = `
You are a Senior Playwright Automation Engineer.

Generate concise, realistic Playwright TypeScript UI automation.

Domain selected: ${domain}
Domain guidance: ${domainRules}

Input:
${input || "Analyze screenshots and create UI automation."}

Return ONLY code.

Rules:
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3–6 useful tests depending on complexity.
- Prefer getByRole, getByLabel, getByPlaceholder, getByText.
- Add comments where selectors may need adjustment.
- Include meaningful assertions.
- Avoid fake data-testid unless user provided it.
`;
    } else if (type === "api-automation") {
      prompt = `
You are a Senior Playwright API Automation Engineer.

Generate concise, realistic Playwright TypeScript API automation.

Domain selected: ${domain}
Domain guidance: ${domainRules}

Input:
${input}

Return ONLY code.

Rules:
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3–6 API tests depending on complexity.
- Include positive and negative cases.
- Add comments where auth token, endpoint, payload, or expected response must be updated.
- Include assertions for status code and key response fields.
`;
    } else {
      return Response.json({ error: "Invalid generation type." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...imageContent],
          },
        ],
        temperature: 0,
        max_tokens: type === "manual" || type === "api" ? 2200 : 1600,
        response_format:
          type === "manual" || type === "api"
            ? { type: "json_object" }
            : undefined,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    let result = response.choices[0].message.content || "";

    result = result
      .replace(/```json/g, "")
      .replace(/```typescript/g, "")
      .replace(/```ts/g, "")
      .replace(/```/g, "")
      .trim();

    if (type === "manual" || type === "api") {
      const parsed = JSON.parse(result);
      result = JSON.stringify(parsed.testCases || []);
    }

    return Response.json({ result });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return Response.json(
        { error: "Request timed out. Try shorter input or one feature at a time." },
        { status: 408 }
      );
    }

    return Response.json(
      { error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}