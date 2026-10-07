import { getCurrentUser } from "@/lib/auth/session";
import { categoryTopics } from "@/lib/topics/next-topic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const category = new URL(request.url).searchParams.get("category");
  if (!category) return Response.json({ error: "A category is required" }, { status: 400 });

  try {
    return Response.json({ topics: await categoryTopics(category) });
  } catch (err) {
    console.error("Failed to list topics", err);
    return Response.json({ error: "Couldn't load topics. Please try again." }, { status: 500 });
  }
}
