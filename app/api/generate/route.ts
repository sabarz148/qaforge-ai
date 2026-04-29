import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { type, input, images } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY missing in .env.local" },
        { status: 500 }
      );
    }

    const imageContent: any[] =
      images?.map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      })) || [];

    let prompt = "";

    if (type === "api") {
      prompt = `
You are a Senior API QA Engineer.

Generate API test cases for this feature/API:
${input}

Return ONLY a valid JSON array.
Do NOT include markdown.
Do NOT include explanation.
Do NOT include backticks.

Use exactly this structure:
[
  {
    "id": "API_TC001",
    "title": "Verify successful API request",
    "method": "POST",
    "endpoint": "/api/example",
    "requestData": "Valid request payload",
    "steps": "1. Prepare valid request data. 2. Send request. 3. Verify response.",
    "expected": "API should return successful response.",
    "statusCode": "200",
    "priority": "High"
  }
]

Rules:
- Generate 8 to 12 API test cases.
- Include success, invalid input, missing fields, auth, boundary, security, duplicate request, and error handling.
- If exact endpoint is not provided, write "To be updated".
`;
    } else if (type === "manual") {
      prompt = `
You are a Senior QA Engineer.

Generate manual test cases for:
${input || "Analyze uploaded screenshots and generate manual test cases."}

Return ONLY a valid JSON array.
Do NOT include markdown.
Do NOT include explanation.
Do NOT include backticks.

Use exactly this structure:
[
  {
    "id": "TC001",
    "title": "Verify valid user flow",
    "preconditions": "User is on the relevant screen.",
    "steps": "1. Open the screen. 2. Enter valid data. 3. Submit.",
    "expected": "System should complete the action successfully.",
    "priority": "High"
  }
]

Rules:
- Generate 8 to 12 useful test cases.
- Include positive, negative, edge, UI, validation, usability, and accessibility cases.
`;
    } else if (type === "playwright") {
      prompt = `
You are a Senior QA Automation Engineer.

Generate ONLY valid Playwright TypeScript UI automation code.

Input:
${input || "Analyze uploaded screenshots and generate Playwright UI tests."}

Rules:
- Return ONLY code.
- No markdown.
- No explanation.
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3 to 6 tests.
- Use getByRole, getByLabel, getByPlaceholder, getByText.
- Add comments where selectors may need adjustment.
`;
    } else if (type === "api-automation") {
      prompt = `
You are a Senior QA Automation Engineer.

Generate ONLY valid Playwright TypeScript API automation code.

Input:
${input}

Rules:
- Return ONLY code.
- No markdown.
- No explanation.
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3 to 6 API tests.
- Include positive and negative API scenarios.
- Add comments where endpoint, token, or payload must be updated.
`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageContent],
        },
      ],
      temperature: 0,
      response_format:
        type === "manual" || type === "api"
          ? { type: "json_object" }
          : undefined,
    });

    let result = response.choices[0].message.content || "";

    if (type === "manual" || type === "api") {
      const parsed = JSON.parse(result);

      if (Array.isArray(parsed)) {
        result = JSON.stringify(parsed);
      } else if (Array.isArray(parsed.testCases)) {
        result = JSON.stringify(parsed.testCases);
      } else if (Array.isArray(parsed.test_cases)) {
        result = JSON.stringify(parsed.test_cases);
      } else if (Array.isArray(parsed.cases)) {
        result = JSON.stringify(parsed.cases);
      } else {
        result = JSON.stringify([parsed]);
      }
    }

    return Response.json({ result });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "API error" },
      { status: 500 }
    );
  }
}