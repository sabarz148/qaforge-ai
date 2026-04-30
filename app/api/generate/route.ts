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
        { error: "OPENAI_API_KEY missing." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const { type, input, images, plan } = await req.json();

    const isPro = plan === "pro" || plan === "premium";

    const imageContent =
      images?.map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      })) || [];

    // 🔥 Faster + smarter prompt
    let prompt = "";

    if (type === "manual") {
      prompt = `
You are a senior QA engineer.

Generate ${isPro ? "8-12" : "5-6"} HIGH-QUALITY manual test cases.

Input:
${input || "Analyze screenshots"}

Rules:
- Include positive, negative, edge cases
- Clear steps
- Real-world scenarios
- No repetition

Format JSON:
{
 "testCases": [
  { "id": "TC001", "title": "", "steps": "", "expected": "", "priority": "High" }
 ]
}
`;
    }

    else if (type === "api") {
      prompt = `
Generate ${isPro ? "8-12" : "5-6"} API test cases.

Input:
${input}

Include:
- status codes
- validation
- auth
- edge cases

Return JSON only.
`;
    }

    else if (type === "playwright") {
      prompt = `
Generate Playwright UI tests.

Input:
${input}

Rules:
- 3-5 tests
- Use best selectors
- Return code only
`;
    }

    else if (type === "api-automation") {
      prompt = `
Generate Playwright API tests.

Input:
${input}

Rules:
- 3-5 tests
- Include assertions
- Return code only
`;
    }

    // ⏱ Timeout protection
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25 sec

    const response = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...imageContent],
          },
        ],
        temperature: 0.2,
        max_tokens: 1200, // 🔥 important for speed
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    let result = response.choices[0].message.content || "";

    // Clean markdown
    result = result
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Parse JSON safely
    if (type === "manual" || type === "api") {
      try {
        const parsed = JSON.parse(result);
        result = JSON.stringify(parsed.testCases || []);
      } catch {
        return Response.json(
          { error: "AI response format issue. Try again." },
          { status: 500 }
        );
      }
    }

    return Response.json({ result });

  } catch (error: any) {

    if (error.name === "AbortError") {
      return Response.json(
        { error: "Request timed out. Please try again." },
        { status: 408 }
      );
    }

    return Response.json(
      { error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}