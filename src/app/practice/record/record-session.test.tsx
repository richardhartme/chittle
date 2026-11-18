// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mode } from "@/lib/practice";

const push = vi.fn();
// Stable across renders, like the real router: effects may depend on it.
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RecordSession } from "./record-session";

const topic = { id: "6f1c2a4e-8b1d-4c3a-9e2f-1a2b3c4d5e6f", text: "Describe your best day." };

// ---- Fakes for the browser APIs the component depends on ------------------------------------

const track = { stop: vi.fn() };
const fakeStream = (id = "stream") => ({ id, getTracks: () => [track] });
const getUserMedia = vi.fn();

class FakeMediaRecorder {
  static supported = new Set<string>();
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
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }
}

/** The byte every analyser sample reads as: 128 is silence, 0 and 255 are full scale. */
let micSample = 128;

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  close = vi.fn(() => Promise.resolve());
  sources: unknown[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamSource(stream: unknown) {
    this.sources.push(stream);
    return { connect: vi.fn(), disconnect: vi.fn() };
  }

  createAnalyser() {
    return {
      fftSize: 2048,
      getByteTimeDomainData: (data: Uint8Array) => data.fill(micSample),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let uploadHandler: FetchHandler;
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/recordings")) return Promise.resolve(uploadHandler(url, init));
  throw new Error(`Unexpected fetch ${url}`);
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const uploadCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/recordings"));
const uploadQuery = (index = 0) =>
  Object.fromEntries(new URL(String(uploadCalls()[index][0]), "http://x").searchParams);

beforeEach(() => {
  push.mockReset();
  track.stop.mockReset();
  getUserMedia.mockReset().mockImplementation(() => Promise.resolve(fakeStream()));
  FakeMediaRecorder.instances = [];
  FakeAudioContext.instances = [];
  micSample = 128;
  FakeMediaRecorder.supported = new Set(["video/webm;codecs=vp9,opus", "video/webm", "audio/webm;codecs=opus"]);
  uploadHandler = () => json({ id: "rec-9" }, 201);
  fetchMock.mockClear();

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

/** Switches to fake setInterval/Date so timers can be advanced; everything else stays real. */
function useFakeClock() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  return (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
}

const startButton = () => screen.getByRole("button", { name: "Start recording" });
const stopButton = () => screen.getByRole("button", { name: "Stop and save" });

async function renderReady({ mode = "video", speakSeconds = 60 }: { mode?: Mode; speakSeconds?: number } = {}) {
  const user = userEvent.setup();
  render(<RecordSession topic={topic} speakSeconds={speakSeconds} mode={mode} />);
  await waitFor(() => expect(startButton()).toBeEnabled());
  return user;
}

describe("a video recording", () => {
  it("asks for the camera and microphone, records straight away, then uploads and opens it", async () => {
    const user = await renderReady({ mode: "video" });
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(screen.getByText(topic.text, { selector: "p" })).toBeInTheDocument();

    await user.click(startButton());

    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);
    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBe("video/webm;codecs=vp9,opus");

    await user.click(stopButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
    expect(uploadQuery()).toEqual({ topicId: topic.id, durationSeconds: "0" });
    const [, init] = uploadCalls()[0];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("video/webm;codecs=vp9,opus");
    expect(init?.body).toBeInstanceOf(Blob);
  });
});

describe("an audio-only recording", () => {
  it("asks only for the microphone, shows no video, and records audio", async () => {
    const user = await renderReady({ mode: "audio" });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(document.querySelector("video")).toBeNull();

    await user.click(startButton());
    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBe("audio/webm;codecs=opus");
    await user.click(stopButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
    const [, init] = uploadCalls()[0];
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm;codecs=opus");
  });

  it("falls back to MP4 audio where WebM isn't supported, as in Safari", async () => {
    FakeMediaRecorder.supported = new Set(["video/mp4", "audio/mp4"]);
    const user = await renderReady({ mode: "audio" });
    await user.click(startButton());
    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBe("audio/mp4");
  });
});

describe("the microphone level meter", () => {
  const meter = () => screen.getByRole("meter", { name: "Microphone level" });

  it("moves with the microphone input in audio-only mode", async () => {
    const advance = useFakeClock();
    await renderReady({ mode: "audio" });
    // The meter opens its audio context in an effect, which can run after the Start button is enabled.
    // vi.waitFor polls on real timers, which the fake clock leaves alone.
    await vi.waitFor(() => expect(FakeAudioContext.instances[0]?.sources).toHaveLength(1));

    await advance(200);
    expect(Number(meter().getAttribute("aria-valuenow"))).toBe(0);

    micSample = 255;
    await advance(200);
    expect(Number(meter().getAttribute("aria-valuenow"))).toBeGreaterThan(50);
  });

  it("isn't shown for video, which has the camera preview instead", async () => {
    await renderReady({ mode: "video" });
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});

describe("the speaking timer", () => {
  const timer = () => screen.getByRole("timer");

  it("shows the speaking time before recording starts", async () => {
    await renderReady({ speakSeconds: 90 });
    expect(screen.getByText("Speaking time: 1:30")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("counts down while recording", async () => {
    const advance = useFakeClock();
    const user = await renderReady({ speakSeconds: 10 });
    await user.click(startButton());
    expect(timer()).toHaveTextContent("0:10");

    await advance(4000);

    expect(timer()).toHaveTextContent("0:06");
  });

  it("flashes at zero and keeps recording instead of cutting the speaker off", async () => {
    const advance = useFakeClock();
    const user = await renderReady({ speakSeconds: 10 });
    await user.click(startButton());

    await advance(10_000);

    expect(timer()).toHaveTextContent("0:00");
    expect(timer()).toHaveClass("flash");
    expect(screen.getByText(/Time's up/)).toBeInTheDocument();
    expect(FakeMediaRecorder.instances[0].stop).not.toHaveBeenCalled();
    expect(stopButton()).toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it("then shows how far over time the speaker is, without flashing", async () => {
    const advance = useFakeClock();
    const user = await renderReady({ speakSeconds: 10 });
    await user.click(startButton());

    await advance(33_000);

    expect(timer()).toHaveTextContent("+0:23");
    expect(timer()).not.toHaveClass("flash");
    expect(timer()).toHaveClass("overtime");
    expect(FakeMediaRecorder.instances[0].stop).not.toHaveBeenCalled();
  });

  it("saves the full duration, overtime included, when the speaker stops", async () => {
    const advance = useFakeClock();
    const user = await renderReady({ speakSeconds: 10 });
    await user.click(startButton());
    await advance(33_000);

    await user.click(stopButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
    expect(uploadQuery().durationSeconds).toBe("33");
  });

  it("lets the speaker stop early, and saves the elapsed time", async () => {
    const advance = useFakeClock();
    const user = await renderReady({ speakSeconds: 60 });
    await user.click(startButton());
    await advance(7000);

    await user.click(stopButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
    expect(uploadQuery().durationSeconds).toBe("7");
  });
});

describe("device access", () => {
  it("waits for access before recording can start", async () => {
    let grant!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    render(<RecordSession topic={topic} speakSeconds={60} mode="video" />);

    expect(screen.getByText(/Waiting for camera and microphone access/)).toBeInTheDocument();
    expect(startButton()).toBeDisabled();

    grant(fakeStream());
    await waitFor(() => expect(startButton()).toBeEnabled());
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  });

  it("only mentions the microphone in audio-only mode", async () => {
    getUserMedia.mockReturnValue(new Promise(() => {}));
    render(<RecordSession topic={topic} speakSeconds={60} mode="audio" />);
    expect(screen.getByText("Waiting for microphone access…")).toBeInTheDocument();
  });

  it.each([
    ["video", /needs camera and microphone access/],
    ["audio", /needs microphone access/],
  ] as const)("explains when %s access is denied and lets the user try again", async (mode, message) => {
    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    const user = userEvent.setup();
    render(<RecordSession topic={topic} speakSeconds={60} mode={mode} />);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(startButton()).toBeEnabled());
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable when the browser has no media API", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    render(<RecordSession topic={topic} speakSeconds={60} mode="video" />);
    expect(await screen.findByText(/needs camera and microphone access/)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports unavailable when MediaRecorder is missing", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    render(<RecordSession topic={topic} speakSeconds={60} mode="audio" />);
    expect(await screen.findByText(/needs microphone access/)).toBeInTheDocument();
  });
});

describe("changing the setup", () => {
  it("links back to the setup page with the topic, speaking time and mode filled in", async () => {
    await renderReady({ mode: "audio", speakSeconds: 75 });
    expect(screen.getByRole("link", { name: "Change setup" })).toHaveAttribute(
      "href",
      `/practice?topic=${topic.id}&speak=75&mode=audio`,
    );
  });

  it("is offered even when access is denied", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<RecordSession topic={topic} speakSeconds={60} mode="video" />);
    await screen.findByText(/needs camera and microphone access/);
    expect(screen.getByRole("link", { name: "Change setup" })).toBeInTheDocument();
  });

  it("isn't offered while recording, so a take can't be abandoned by accident", async () => {
    const user = await renderReady();
    await user.click(startButton());
    expect(screen.queryByRole("link", { name: "Change setup" })).not.toBeInTheDocument();
  });
});

describe("saving", () => {
  async function recordAndStop() {
    const user = await renderReady();
    await user.click(startButton());
    await user.click(stopButton());
    return user;
  }

  it("shows a saving message while uploading", async () => {
    let finish!: (res: Response) => void;
    uploadHandler = () => new Promise<Response>((resolve) => (finish = resolve)) as never;
    await recordAndStop();

    expect(await screen.findByText("Saving your recording…")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    finish(json({ id: "rec-9" }, 201));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-9"));
  });

  it("reports an upload failure and retries the same recording", async () => {
    uploadHandler = () => json({ error: "Empty upload" }, 400);
    const user = await recordAndStop();

    expect(await screen.findByText("Couldn't save your recording: Empty upload")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    const firstBody = uploadCalls()[0][1]?.body;

    uploadHandler = () => json({ id: "rec-10" }, 201);
    await user.click(screen.getByRole("button", { name: "Try saving again" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/library/rec-10"));
    expect(uploadCalls()).toHaveLength(2);
    expect(uploadCalls()[1][1]?.body).toBe(firstBody);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("reports a network failure while uploading", async () => {
    uploadHandler = () => {
      throw new Error("Network down");
    };
    await recordAndStop();
    expect(await screen.findByText("Couldn't save your recording: Network down")).toBeInTheDocument();
  });

  it("falls back to a generic message when the error response isn't JSON", async () => {
    uploadHandler = () => new Response("Bad gateway", { status: 502 });
    await recordAndStop();
    expect(await screen.findByText("Couldn't save your recording: Upload failed")).toBeInTheDocument();
  });

  it("falls back to the browser default MIME type when none are supported", async () => {
    FakeMediaRecorder.supported = new Set();
    const user = await renderReady();
    await user.click(startButton());
    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBeUndefined();
  });
});

describe("cleanup", () => {
  it("stops the tracks and closes the audio context on unmount", async () => {
    const { unmount } = render(<RecordSession topic={topic} speakSeconds={60} mode="audio" />);
    await waitFor(() => expect(startButton()).toBeEnabled());

    unmount();

    expect(track.stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
  });

  it("stops a stream that arrives after unmount", async () => {
    let grant!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const { unmount } = render(<RecordSession topic={topic} speakSeconds={60} mode="video" />);

    unmount();
    grant(fakeStream());

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });

  it("attaches a fresh stream when the page is hidden and shown again", async () => {
    const streams = [fakeStream("first"), fakeStream("second")];
    getUserMedia.mockImplementation(() => Promise.resolve(streams.shift()));

    const page = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <RecordSession topic={topic} speakSeconds={60} mode="video" />
      </Activity>
    );
    const { container, rerender } = render(page("visible"));
    await waitFor(() => expect(startButton()).toBeEnabled());
    const video = container.querySelector("video")!;
    // The stream is attached in an effect, which can run after the Start button is enabled.
    await waitFor(() => expect((video.srcObject as unknown as { id: string } | null)?.id).toBe("first"));

    // Next.js hides the page when navigating away, then shows it again on return.
    rerender(page("hidden"));
    rerender(page("visible"));

    await waitFor(() => expect((video.srcObject as unknown as { id: string } | null)?.id).toBe("second"));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("closes the audio context when hidden and opens a new one when shown again", async () => {
    const page = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <RecordSession topic={topic} speakSeconds={60} mode="audio" />
      </Activity>
    );
    const { rerender } = render(page("visible"));
    await waitFor(() => expect(FakeAudioContext.instances).toHaveLength(1));

    rerender(page("hidden"));
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
    rerender(page("visible"));

    await waitFor(() => expect(FakeAudioContext.instances).toHaveLength(2));
  });
});
