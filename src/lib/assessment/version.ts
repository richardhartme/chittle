/**
 * Bump when the scoring rules or prompts change. Version 1 had the measured dimensions only; version 2
 * adds Claude's judged dimensions, the feedback and the total; version 3 adds the coach insights,
 * including the ideal version; version 4 adds the coach insights' summary. Kept apart from the
 * pipeline so the results page's client code can import it.
 */
export const SCORING_VERSION = 4;
