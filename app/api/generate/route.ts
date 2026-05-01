import OpenAI from "openai";
import { auth, currentUser } from "@clerk/nextjs/server";

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

    const { type, input, images } = await req.json();

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

    const maxCases = isPro ? "8" : "5";

    const imageContent: any[] =
      images?.map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      })) || [];

    let prompt = "";

    if (type === "manual") {
      prompt = `
You are a senior QA engineer.

Create exactly ${maxCases} practical manual test cases.

Input:
${input || "Analyze uploaded screenshots and create QA test cases."}

Focus on:
- main happy path
- negative cases
- validation
- edge case
- usability/accessibility where relevant

Return ONLY valid JSON:
{
  "testCases": [
    {
      "id": "TC001",
      "title": "",
      "preconditions": "",
      "steps": "1. ... 2. ... 3. ...",
      "expected": "",
      "priority": "High"
    }
  ]
}

Rules:
- Be concise but useful.
- No markdown.
- No explanation.
- No duplicate cases.
`;
    } else if (type === "api") {
      prompt = `
You are a senior API QA engineer.

Create exactly ${maxCases} API test cases.

Input:
${input}

Focus on:
- success response
- validation errors
- auth/token issue
- missing/invalid fields
- edge/security case

Return ONLY valid JSON:
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
      "priority": "High"
    }
  ]
}

Rules:
- If method/endpoint is unknown, use "To be updated".
- No markdown.
- No explanation.
`;
    } else if (type === "playwright") {
      prompt = `
Generate concise Playwright TypeScript UI automation.

Input:
${input || "Analyze screenshots and create UI automation."}

Return ONLY code.

Rules:
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3 useful tests only.
- Prefer getByRole, getByLabel, getByPlaceholder, getByText.
- Add short comments where selectors need adjustment.
`;
    } else if (type === "api-automation") {
      prompt = `
Generate concise Playwright TypeScript API automation.

Input:
${input}

Return ONLY code.

Rules:
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3 useful API tests only.
- Include positive and negative cases.
- Add comments where auth token, endpoint, or payload must be updated.
`;
    } else {
      return Response.json({ error: "Invalid generation type." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

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
        max_tokens: type === "manual" || type === "api" ? 1200 : 1400,
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
        { error: "Request timed out. Please try again with shorter input." },
        { status: 408 }
      );
    }

    return Response.json(
      { error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}