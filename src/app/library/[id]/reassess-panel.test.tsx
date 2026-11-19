// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ assessRecording: vi.fn() }));

import { assessRecording } from "@/app/actions";
import { SCORING_VERSION } from "@/lib/assessment/version";
import { ReassessPanel } from "./reassess-panel";

beforeEach(() => vi.mocked(assessRecording).mockReset());

const COST = "This re-runs the assessment on your Anthropic key and replaces the current results.";

describe("ReassessPanel", () => {
  it("explains the cost and re-assesses once confirmed", async () => {
    const user = userEvent.setup();
    render(<ReassessPanel recordingId="rec-1" scoringVersion={SCORING_VERSION} canReassess />);
    expect(screen.queryByText(COST)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Re-assess" }));
    expect(screen.getByText(COST)).toBeInTheDocument();
    expect(assessRecording).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Re-assess" }));
    expect(assessRecording).toHaveBeenCalledTimes(1);
    expect(vi.mocked(assessRecording).mock.calls[0][0].get("recordingId")).toBe("rec-1");
  });

  it("goes back without re-assessing when cancelled", async () => {
    const user = userEvent.setup();
    render(<ReassessPanel recordingId="rec-1" scoringVersion={SCORING_VERSION} canReassess />);

    await user.click(screen.getByRole("button", { name: "Re-assess" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(COST)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-assess" })).toBeInTheDocument();
    expect(assessRecording).not.toHaveBeenCalled();
  });

  it("labels an assessment made with an older scoring version", () => {
    render(<ReassessPanel recordingId="rec-1" scoringVersion={SCORING_VERSION - 1} canReassess />);

    expect(screen.getByText("Assessed with an older version")).toBeInTheDocument();
  });

  it("labels an assessment with no scoring version recorded as older", () => {
    render(<ReassessPanel recordingId="rec-1" scoringVersion={null} canReassess />);

    expect(screen.getByText("Assessed with an older version")).toBeInTheDocument();
  });

  it("doesn't label an assessment made with the current scoring version", () => {
    render(<ReassessPanel recordingId="rec-1" scoringVersion={SCORING_VERSION} canReassess />);

    expect(screen.queryByText("Assessed with an older version")).not.toBeInTheDocument();
  });

  it("still labels an older assessment, without the button, when the speaker has no provider keys", () => {
    render(<ReassessPanel recordingId="rec-1" scoringVersion={1} canReassess={false} />);

    expect(screen.getByText("Assessed with an older version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-assess" })).not.toBeInTheDocument();
  });
});
