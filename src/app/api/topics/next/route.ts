import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { nextTopic } from "@/lib/topics/next-topic";

const bodySchema = z.object({ category: z.string().min(1) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A category is required" }, { status: 400 });

  try {
    const topic = await nextTopic(user.id, parsed.data.category);
    if (!topic) {
      return Response.json(
        { error: "No new topics are available in this category right now." },
        { status: 404 },
      );
    }
    return Response.json({ topic: { id: topic.id, text: topic.text } });
  } catch (err) {
    console.error("Failed to pick a topic", err);
    return Response.json({ error: "Couldn't get a topic. Please try again." }, { status: 500 });
  }
}
