// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
// Stable across renders, like the real router: the countdown effect depends on it.
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { PracticeSession } from "./practice-session";

const categories = [
  { slug: "a", name: "Category A" },
  { slug: "b", name: "Category B" },
];
const topicOne = { id: "t1", text: "Describe your best day." };
const topicTwo = { id: "t2", text: "Why do people travel?" };

// ---- Fakes for the browser APIs the component depends on ------------------------------------

const track = { stop: vi.fn() };
const getUserMedia = vi.fn();

class FakeMediaRecorder {
  static supported = new Set(["video/webm;codecs=vp9,opus", "video/webm"]);
  static isTypeSupported = (type: string) => FakeMediaRecorder.supported.has(type);
  static instances: FakeMediaRecorder[] = [];

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn<(timeslice?: number) => void>(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["chunk"], { type: this.mimeType }) });
    this.onstop?.();
  });

  constructor(
    public stream: unknown,
    public options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "video/webm";
    FakeMediaRecorder.instances.push(this);
  }
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handlers: { topics: FetchHandler; next: FetchHandler; upload: FetchHandler };
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/topics/next")) return Promise.resolve(handlers.next(url, init));
  if (url.startsWith("/api/topics")) return Promise.resolve(handlers.topics(url, init));
  if (url.startsWith("/api/recordings")) return Promise.resolve(handlers.upload(url, init));
  throw new Error(`Unexpected fetch ${url}`);
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const nextCall = () => fetchMock.mock.calls.find(([url]) => String(url) === "/api/topics/next")!;
const uploadCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/recordings"));

beforeEach(() => {
  push.mockReset();
  track.stop.mockReset();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] });
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = new Set(["video/webm;codecs=vp9,opus", "video/webm"]);
  handlers = {
    topics: () => json({ topics: [topicOne, topicTwo] }),
    next: () => json({ topic: topicOne }),
    upload: () => json({ id: "rec-9" }, 201),
  };
  fetchMock.mockClear();

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

async function renderReady() {
  const user = userEvent.setup();
  render(<PracticeSession categories={categories} />);
  await waitFor(() => expect(screen.queryByText(/Waiting for camera/)).not.toBeInTheDocument());
  return user;
}

/** Gets a topic and, when `prep`/`speak` are given, sets the timers. Leaves the form ready to Start. */
async function prepare(user: ReturnType<typeof userEvent.setup>, { prep = 5, speak = 10 } = {}) {
  fireEvent.change(screen.getByLabelText("Prep time (seconds)"), { target: { value: String(prep) } });
  fireEvent.change(screen.getByLabelText("Speaking time (seconds)"), { target: { value: String(speak) } });
  await user.click(screen.getByRole("button", { name: "Get a topic" }));
  await screen.findByText(topicOne.text, { selector: "p" });
}

/** Switches to fake setInterval/Date so countdowns can be advanced; everything else stays real. */
function useCountdownClock() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  return (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
}

describe("camera access", () => {
  it("shows a waiting message until the camera is ready", async () => {
    let grant!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    render(<PracticeSession categories={categories} />);

    expect(screen.getByText(/Waiting for camera and microphone access/)).toBeInTheDocument();
    grant({ getTracks: () => [track] });
    await waitFor(() => expect(screen.queryByText(/Waiting for camera/)).not.toBeInTheDocument());
  });

  it("asks for video and audio", async () => {
    await renderReady();
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
  });

  it("explains when access is denied and lets the user try again", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    const user = userEvent.setup();
    render(<PracticeSession categories={categories} />);

    expect(await screen.findByText(/needs camera and microphone access/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.queryByText(/needs camera and microphone access/)).not.toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("attaches a fresh stream when the page is hidden and shown again", async () => {
    const streams = [
      { id: "first", getTracks: () => [track] },
      { id: "second", getTracks: () => [track] },
    ];
    getUserMedia.mockImplementation(() => Promise.resolve(streams.shift()));

    const page = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <PracticeSession categories={categories} />
      </Activity>
    );
    const { container, rerender } = render(page("visible"));
    await waitFor(() => expect(screen.queryByText(/Waiting for camera/)).not.toBeInTheDocument());
    const video = container.querySelector("video")!;
    expect((video.srcObject as unknown as { id: string }).id).toBe("first");

    // Next.js hides the page when navigating away, then shows it again on return.
    rerender(page("hidden"));
    rerender(page("visible"));

    await waitFor(() => expect((video.srcObject as unknown as { id: string } | null)?.id).toBe("second"));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable when the browser has no media API", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    render(<PracticeSession categories={categories} />);
    expect(await screen.findByText(/needs camera and microphone access/)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports unavailable when MediaRecorder is missing", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    render(<PracticeSession categories={categories} />);
    expect(await screen.findByText(/needs camera and microphone access/)).toBeInTheDocument();
  });
});

describe("choosing a topic", () => {
  it("starts with Start disabled and a prompt to pick a category", async () => {
    await renderReady();
    expect(screen.getByText(/Choose a category and get a topic/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("fetches a topic for the selected category and enables Start", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    expect(await screen.findByText(topicOne.text, { selector: "p" })).toBeInTheDocument();
    const [, init] = nextCall();
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ category: "a" });
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Re-roll topic" })).toBeInTheDocument();
  });

  it("re-rolls to a different topic", async () => {
    const user = await renderReady();
    await user.click(screen.getByRole("button", { name: "Get a topic" }));
    await screen.findByText(topicOne.text, { selector: "p" });
    handlers.next = () => json({ topic: topicTwo });

    await user.click(screen.getByRole("button", { name: "Re-roll topic" }));

    expect(await screen.findByText(topicTwo.text, { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText(topicOne.text, { selector: "p" })).not.toBeInTheDocument();
  });

  it("lists the category's existing topics and lets the user pick one", async () => {
    const user = await renderReady();
    const picker = await screen.findByLabelText("Or choose an existing topic");
    expect(Array.from((picker as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      "Choose a topic…",
      topicOne.text,
      topicTwo.text,
    ]);
    handlers.next = () => json({ topic: topicTwo });

    await user.selectOptions(picker, topicTwo.id);

    expect(await screen.findByText(topicTwo.text, { selector: "p" })).toBeInTheDocument();
    expect(JSON.parse(String(nextCall()[1]?.body))).toEqual({ category: "a", topicId: topicTwo.id });
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("hides the picker when the category has no topics, or the list fails to load", async () => {
    handlers.topics = () => json({ topics: [] });
    const { unmount } = render(<PracticeSession categories={categories} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Or choose an existing topic")).not.toBeInTheDocument();
    unmount();

    handlers.topics = () => json({ error: "boom" }, 500);
    render(<PracticeSession categories={categories} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText("Or choose an existing topic")).not.toBeInTheDocument();
  });

  it("reloads the topic list after a roll, since new topics may have been generated", async () => {
    const user = await renderReady();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === "/api/topics?category=a")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === "/api/topics?category=a")).toHaveLength(2));
  });

  it("shows the server's message when no topic is available", async () => {
    handlers.next = () => json({ error: "You've seen every topic in this category." }, 404);
    const user = await renderReady();

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    expect(await screen.findByText("You've seen every topic in this category.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("shows a connection message when the request fails", async () => {
    handlers.next = () => {
      throw new TypeError("Failed to fetch");
    };
    const user = await renderReady();

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    expect(await screen.findByText(/Check your connection and try again/)).toBeInTheDocument();
  });

  it("clears the topic and error and loads that category's topics when the category changes", async () => {
    const user = await renderReady();
    await user.click(screen.getByRole("button", { name: "Get a topic" }));
    await screen.findByText(topicOne.text, { selector: "p" });

    await user.selectOptions(screen.getByLabelText("Category"), "b");

    expect(screen.queryByText(topicOne.text, { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/topics?category=b"));
  });

  it("clamps the timer inputs to their limits", async () => {
    await renderReady();
    const prep = screen.getByLabelText("Prep time (seconds)");
    const speak = screen.getByLabelText("Speaking time (seconds)");

    fireEvent.change(prep, { target: { value: "9999" } });
    fireEvent.change(speak, { target: { value: "1" } });
    expect(prep).toHaveValue(600);
    expect(speak).toHaveValue(10);

    fireEvent.change(prep, { target: { value: "-5" } });
    fireEvent.change(speak, { target: { value: "99999" } });
    expect(prep).toHaveValue(0);
    expect(speak).toHaveValue(3600);
  });
});

describe("a practice session", () => {
  it("counts down the prep time, records, then uploads and opens the recording", async () => {
    const user = await renderReady();
    await prepare(user, { prep: 5, speak: 10 });
    const advance = useCountdownClock();

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Get ready. Recording starts when the timer ends.")).toBeInTheDocument();
    expect(screen.getByText(topicOne.text, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("0:05")).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(0);

    await advance(2000);
    expect(screen.getByText("0:03")).toBeInTheDocument();

    await advance(3000);
    expect(screen.getByRole("button", { name: "Stop and save" })).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);

    await advance(4000);
    expect(screen.getByText("0:06")).toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);

    await advance(6000);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
    expect(FakeMediaRecorder.instances[0].stop).toHaveBeenCalledTimes(1);
    expect(uploadCalls()).toHaveLength(1);
    const [url, init] = uploadCalls()[0];
    const params = new URL(String(url), "http://x").searchParams;
    expect(Object.fromEntries(params)).toEqual({ topicId: "t1", durationSeconds: "10", prepSeconds: "5" });
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("video/webm;codecs=vp9,opus");
    expect(init?.body).toBeInstanceOf(Blob);
  });

  it("lets the user skip the prep countdown", async () => {
    const user = await renderReady();
    await prepare(user);
    await user.click(screen.getByRole("button", { name: "Start" }));

    await user.click(await screen.findByRole("button", { name: "Start now" }));

    expect(await screen.findByRole("button", { name: "Stop and save" })).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("goes straight to recording with no prep time", async () => {
    const user = await renderReady();
    await prepare(user, { prep: 0 });

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("button", { name: "Stop and save" })).toBeInTheDocument();
    expect(screen.queryByText(/Get ready/)).not.toBeInTheDocument();
  });

  it("lets the user stop early, and records the elapsed time", async () => {
    const user = await renderReady();
    await prepare(user, { prep: 0, speak: 60 });
    const advance = useCountdownClock();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Stop and save" });

    await advance(7000);
    await user.click(screen.getByRole("button", { name: "Stop and save" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
    expect(new URL(String(uploadCalls()[0][0]), "http://x").searchParams.get("durationSeconds")).toBe("7");
  });

  it("records the topic and prep time the session started with, even if the form changes", async () => {
    const user = await renderReady();
    await prepare(user, { prep: 0, speak: 60 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Stop and save" });

    await user.click(screen.getByRole("button", { name: "Stop and save" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const params = new URL(String(uploadCalls()[0][0]), "http://x").searchParams;
    expect(params.get("topicId")).toBe("t1");
    expect(params.get("prepSeconds")).toBe("0");
  });

  it("uses a supported MIME type", async () => {
    FakeMediaRecorder.supported = new Set(["video/mp4"]);
    const user = await renderReady();
    await prepare(user, { prep: 0 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Stop and save" });
    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBe("video/mp4");
  });

  it("falls back to the browser default MIME type when none are supported", async () => {
    FakeMediaRecorder.supported = new Set();
    const user = await renderReady();
    await prepare(user, { prep: 0 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Stop and save" });
    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBeUndefined();
  });

  it("shows a saving message while uploading", async () => {
    let finish!: (res: Response) => void;
    handlers.upload = () => new Promise<Response>((resolve) => (finish = resolve)) as never;
    const user = await renderReady();
    await prepare(user, { prep: 0 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(await screen.findByRole("button", { name: "Stop and save" }));

    expect(await screen.findByText("Saving your recording…")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    finish(json({ id: "rec-9" }, 201));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
  });

  it("reports an upload failure and retries the same recording", async () => {
    handlers.upload = () => json({ error: "Empty upload" }, 400);
    const user = await renderReady();
    await prepare(user, { prep: 0 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(await screen.findByRole("button", { name: "Stop and save" }));

    expect(await screen.findByText("Couldn't save your recording: Empty upload")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    const firstBody = uploadCalls()[0][1]?.body;

    handlers.upload = () => json({ id: "rec-10" }, 201);
    await user.click(screen.getByRole("button", { name: "Try saving again" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-10"));
    expect(uploadCalls()).toHaveLength(2);
    expect(uploadCalls()[1][1]?.body).toBe(firstBody);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("reports a network failure while uploading", async () => {
    handlers.upload = () => {
      throw new Error("Network down");
    };
    const user = await renderReady();
    await prepare(user, { prep: 0 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(await screen.findByRole("button", { name: "Stop and save" }));

    expect(await screen.findByText("Couldn't save your recording: Network down")).toBeInTheDocument();
  });

  it("falls back to a generic message when the error response isn't JSON", async () => {
    handlers.upload = () => new Response("Bad gateway", { status: 502 });
    const user = await renderReady();
    await prepare(user, { prep: 0 });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(await screen.findByRole("button", { name: "Stop and save" }));

    expect(await screen.findByText("Couldn't save your recording: Upload failed")).toBeInTheDocument();
  });
});

describe("cleanup", () => {
  it("stops the camera tracks on unmount", async () => {
    const { unmount } = render(<PracticeSession categories={categories} />);
    await waitFor(() => expect(screen.queryByText(/Waiting for camera/)).not.toBeInTheDocument());

    unmount();

    expect(track.stop).toHaveBeenCalled();
  });

  it("stops a stream that arrives after unmount", async () => {
    let grant!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const { unmount } = render(<PracticeSession categories={categories} />);

    unmount();
    grant({ getTracks: () => [track] });

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });
});
