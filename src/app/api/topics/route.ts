import { getCurrentUser } from "@/lib/auth/session";
import { customTopicText } from "@/lib/practice";
import { categoryTopics, createCustomTopic } from "@/lib/topics/next-topic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const category = new URL(request.url).searchParams.get("category");
  if (!category) return Response.json({ error: "A category is required" }, { status: 400 });

  try {
    return Response.json(await categoryTopics(user.id, category));
  } catch (err) {
    console.error("Failed to list topics", err);
    return Response.json({ error: "Couldn't load topics. Try again." }, { status: 500 });
  }
}

/** Saves a custom topic: one the user wrote, private to them. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const category = body?.category;
  if (typeof category !== "string" || !category) {
    return Response.json({ error: "A category is required" }, { status: 400 });
  }
  const text = customTopicText.safeParse(body.text ?? "");
  if (!text.success) return Response.json({ error: text.error.issues[0].message }, { status: 400 });

  try {
    const topic = await createCustomTopic(user.id, category, text.data);
    if (!topic) return Response.json({ error: "That category doesn't exist." }, { status: 404 });
    return Response.json({ topic: { id: topic.id, text: topic.text } }, { status: 201 });
  } catch (err) {
    console.error("Failed to save a custom topic", err);
    return Response.json({ error: "Couldn't save your topic. Try again." }, { status: 500 });
  }
}
