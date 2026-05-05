import { createClient } from "@supabase/supabase-js";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    const { event_name, metadata } = await req.json();

    if (!event_name) {
      return Response.json(
        { error: "event_name is required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const email = user?.emailAddresses?.[0]?.emailAddress || "";

    const { error } = await supabase.from("events").insert([
      {
        event_name,
        user_id: userId || "anonymous",
        email,
        metadata: metadata || {},
      },
    ]);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Tracking failed" },
      { status: 500 }
    );
  }
}