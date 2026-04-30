import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";

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

    const { type, input, images } = await req.json();

    const imageContent: any[] =
      images?.map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      })) || [];

    let prompt = "";

    if (type === "manual") {
      prompt = `
You are a Senior QA Architect with 15+ years of QA experience.

Generate HIGH-QUALITY manual test cases for:
${input || "Analyze uploaded screenshots and generate test cases."}

If screenshots are provided:
- Analyze visible fields, buttons, labels, flows, validations, navigation, errors, and UI behavior.

Return ONLY valid JSON object:
{
  "testCases": [
    {
      "id": "TC001",
      "title": "",
      "preconditions": "",
      "steps": "",
      "expected": "",
      "priority": "High"
    }
  ]
}

Rules:
- Generate 8 to 15 strong test cases.
- Cover positive, negative, edge, validation, UI, usability, accessibility, and security scenarios.
- Steps must be clear and numbered inside one string.
- Avoid duplicate or generic cases.
`;
    } else if (type === "api") {
      prompt = `
You are a Senior API QA Engineer.

Generate HIGH-QUALITY API test cases for:
${input}

Return ONLY valid JSON object:
{
  "testCases": [
    {
      "id": "API_TC001",
      "title": "",
      "method": "",
      "endpoint": "",
      "requestData": "",
      "steps": "",
      "expected": "",
      "statusCode": "",
      "priority": "High"
    }
  ]
}

Rules:
- Generate 8 to 15 API test cases.
- Cover success, validation, missing fields, invalid payload, auth, token expiry, security, boundary, duplicate request, and error handling.
- If endpoint/method is missing, write "To be updated".
`;
    } else if (type === "playwright") {
      prompt = `
You are a Senior Playwright Automation Engineer.

Generate ONLY valid Playwright TypeScript UI automation code.

Input:
${input || "Analyze uploaded screenshots and generate UI automation."}

Rules:
- Return ONLY code. No markdown. No explanation.
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3 to 6 useful UI tests.
- Use getByRole, getByLabel, getByPlaceholder, getByText where possible.
- Add comments where selectors may need adjustment.
- Include meaningful assertions.
`;
    } else if (type === "api-automation") {
      prompt = `
You are a Senior API Automation Engineer.

Generate ONLY valid Playwright TypeScript API automation code.

Input:
${input}

Rules:
- Return ONLY code. No markdown. No explanation.
- Use: import { test, expect } from '@playwright/test';
- Use: const BASE_URL = process.env.BASE_URL || 'https://example.com';
- Generate 3 to 6 API automation tests.
- Include positive and negative cases.
- Add comments where endpoint, auth token, payload, or expected response should be updated.
`;
    } else {
      return Response.json({ error: "Invalid generation type." }, { status: 400 });
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
      result = JSON.stringify(parsed.testCases || []);
    }

    return Response.json({ result });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}