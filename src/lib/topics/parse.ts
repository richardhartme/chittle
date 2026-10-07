import { z } from "zod";

const responseSchema = z.array(z.string().trim().min(5).max(300)).min(1);

/** Pulls the first JSON array out of a model reply, tolerating code fences and chatter. */
export function parseTopicList(raw: string): string[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("No JSON array in model response");
  return responseSchema.parse(JSON.parse(raw.slice(start, end + 1)));
}
