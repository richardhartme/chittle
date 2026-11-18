// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AssessmentPoller } from "./assessment-poller";

const fetch = vi.fn();

const replyWith = (status: string, error: string | null = null) =>
  fetch.mockResolvedValueOnce(Response.json({ status, error }));

/** Moves the clock past one 3-second poll and lets its request resolve. */
const tick = () => act(() => vi.advanceTimersByTimeAsync(3000));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  fetch.mockReset();
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => vi.useRealTimers());

describe("AssessmentPoller", () => {
  it("polls the status endpoint every 3 seconds without refreshing while nothing changes", async () => {
    replyWith("pending");
    replyWith("pending");
    render(<AssessmentPoller recordingId="rec-1" status="pending" />);

    expect(fetch).not.toHaveBeenCalled();
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/recordings/rec-1/assessment", expect.anything());
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes the page once the status changes, and stops polling", async () => {
    replyWith("pending");
    replyWith("done");
    render(<AssessmentPoller recordingId="rec-1" status="pending" />);

    await tick();
    expect(refresh).not.toHaveBeenCalled();
    await tick();
    expect(refresh).toHaveBeenCalledTimes(1);

    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a failed request", async () => {
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    replyWith("failed", "Deepgram rejected the key.");
    render(<AssessmentPoller recordingId="rec-1" status="pending" />);

    await tick();
    expect(refresh).not.toHaveBeenCalled();
    await tick();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops polling when it's removed from the page", async () => {
    const { unmount } = render(<AssessmentPoller recordingId="rec-1" status="pending" />);
    unmount();

    await tick();
    expect(fetch).not.toHaveBeenCalled();
  });
});
