import { createClient } from "@supabase/supabase-js";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: "Please sign in to submit feedback." },
        { status: 401 }
      );
    }

    const user = await currentUser();
    const { message } = await req.json();

    if (!message || message.trim().length < 3) {
      return Response.json(
        { error: "Feedback message is too short." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const email = user?.emailAddresses?.[0]?.emailAddress || "";

    const { error } = await supabase.from("feedback").insert([
      {
        user_id: userId,
        email,
        message: message.trim(),
        page: "qaforge",
      },
    ]);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Feedback submission failed." },
      { status: 500 }
    );
  }
}