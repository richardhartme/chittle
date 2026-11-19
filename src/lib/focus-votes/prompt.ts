import type { FocusVote } from "@/db/schema";
import type { CastFocusVote } from "./index";

/**
 * The speaker's focus votes as a prompt section, grouped by which way they voted, for judging and the
 * progress insight. Empty when there are none. Kept apart from the queries so prompts don't load the database.
 */
export function focusVotesSection(votes: CastFocusVote[]): string {
  const group = (heading: string, vote: FocusVote) => {
    const areas = votes.filter((v) => v.vote === vote).map((v) => `- ${v.area}`);
    return areas.length ? [heading, ...areas] : [];
  };
  const lines = [...group("Areas I want to work on:", "up"), ...group("Feedback I didn't find useful:", "down")];
  return lines.length ? `<focus_votes>\n${lines.join("\n")}\n</focus_votes>\n` : "";
}
