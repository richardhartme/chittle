import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { chooseTopic, nextTopic } from "@/lib/topics/next-topic";

const bodySchema = z.object({ category: z.string().min(1), topicId: z.uuid().optional() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A category is required" }, { status: 400 });

  const { category, topicId } = parsed.data;
  try {
    if (topicId) {
      const chosen = await chooseTopic(user.id, category, topicId);
      if (!chosen) return Response.json({ error: "That topic doesn't exist." }, { status: 404 });
      return Response.json({ topic: { id: chosen.id, text: chosen.text } });
    }

    const topic = await nextTopic(user.id, category);
    if (!topic) {
      return Response.json(
        { error: "You've seen every topic in this category. Choose one from the list to practise it again." },
        { status: 404 },
      );
    }
    return Response.json({ topic: { id: topic.id, text: topic.text } });
  } catch (err) {
    console.error("Failed to pick a topic", err);
    return Response.json({ error: "Couldn't get a topic. Please try again." }, { status: 500 });
  }
}
