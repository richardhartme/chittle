// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SetupForm } from "./setup-form";

const categories = [
  { slug: "a", name: "Category A" },
  { slug: "b", name: "Category B" },
];
const topicOne = { id: "t1", text: "Describe your best day." };
const topicTwo = { id: "t2", text: "Why do people travel?" };

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handlers: { topics: FetchHandler; next: FetchHandler };
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/topics/next")) return Promise.resolve(handlers.next(url, init));
  if (url.startsWith("/api/topics")) return Promise.resolve(handlers.topics(url, init));
  throw new Error(`Unexpected fetch ${url}`);
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const nextCall = () => fetchMock.mock.calls.find(([url]) => String(url) === "/api/topics/next")!;

const getUserMedia = vi.fn();

beforeEach(() => {
  push.mockReset();
  getUserMedia.mockReset();
  handlers = {
    topics: () => json({ topics: [topicOne, topicTwo] }),
    next: () => json({ topic: topicOne }),
  };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  localStorage.clear();
  window.history.replaceState(null, "", "/practice");
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

const continueButton = () => screen.getByRole("button", { name: "Continue" });

async function getTopic(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Get a topic" }));
  await screen.findByText(topicOne.text, { selector: "p" });
}

describe("continuing to the record page", () => {
  it("goes to the record page with the topic, speaking time and mode", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await getTopic(user);

    await user.click(continueButton());

    expect(push).toHaveBeenCalledWith("/practice/record?topic=t1&speak=120&mode=video");
  });

  it("saves the setup in the setup page's address first, so going back restores it", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await getTopic(user);
    await user.click(screen.getByRole("radio", { name: "Audio only" }));

    await user.click(continueButton());

    expect(window.location.pathname + window.location.search).toBe("/practice?topic=t1&speak=120&mode=audio");
  });
});

describe("the setup page", () => {
  it("never asks for the camera or microphone", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await getTopic(user);
    await user.click(continueButton());

    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("has no prep time setting", () => {
    render(<SetupForm categories={categories} />);
    expect(screen.queryByLabelText(/Prep time/)).not.toBeInTheDocument();
  });

  it("clamps the speaking time to its limits and sends the clamped value", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    const speak = screen.getByLabelText("Speaking time (seconds)");

    fireEvent.change(speak, { target: { value: "1" } });
    expect(speak).toHaveValue(10);
    fireEvent.change(speak, { target: { value: "99999" } });
    expect(speak).toHaveValue(3600);

    await getTopic(user);
    await user.click(continueButton());
    expect(push).toHaveBeenCalledWith("/practice/record?topic=t1&speak=3600&mode=video");
  });
});

describe("choosing a topic", () => {
  it("starts with Continue disabled and a prompt to pick a category", () => {
    render(<SetupForm categories={categories} />);
    expect(screen.getByText(/Choose a category and get a topic/)).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it("fetches a topic for the selected category and enables Continue", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    expect(await screen.findByText(topicOne.text, { selector: "p" })).toBeInTheDocument();
    const [, init] = nextCall();
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ category: "a" });
    expect(continueButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Get another topic" })).toBeInTheDocument();
  });

  it("re-rolls to a different topic", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await getTopic(user);
    handlers.next = () => json({ topic: topicTwo });

    await user.click(screen.getByRole("button", { name: "Get another topic" }));

    expect(await screen.findByText(topicTwo.text, { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText(topicOne.text, { selector: "p" })).not.toBeInTheDocument();
  });

  it("lists the category's existing topics and lets the user pick one", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
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
    expect(continueButton()).toBeEnabled();
  });

  it("hides the picker when the category has no topics, or the list fails to load", async () => {
    handlers.topics = () => json({ topics: [] });
    const { unmount } = render(<SetupForm categories={categories} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Or choose an existing topic")).not.toBeInTheDocument();
    unmount();

    handlers.topics = () => json({ error: "boom" }, 500);
    render(<SetupForm categories={categories} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText("Or choose an existing topic")).not.toBeInTheDocument();
  });

  it("reloads the topic list after a roll, since new topics may have been generated", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === "/api/topics?category=a")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === "/api/topics?category=a")).toHaveLength(2));
  });

  it("shows the server's message when no topic is available", async () => {
    handlers.next = () => json({ error: "You've seen every topic in this category." }, 404);
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    expect(await screen.findByText("You've seen every topic in this category.")).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it("shows a connection message when the request fails", async () => {
    handlers.next = () => {
      throw new TypeError("Failed to fetch");
    };
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Get a topic" }));

    expect(await screen.findByText(/Check your connection and try again/)).toBeInTheDocument();
  });

  it("clears the topic and error and loads that category's topics when the category changes", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await getTopic(user);

    await user.selectOptions(screen.getByLabelText("Category"), "b");

    expect(screen.queryByText(topicOne.text, { selector: "p" })).not.toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/topics?category=b"));
  });
});

describe("choosing the recording mode", () => {
  it("offers video and audio, or audio only, with video selected first", () => {
    render(<SetupForm categories={categories} />);
    expect(screen.getByRole("radio", { name: "Video and audio" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Audio only" })).not.toBeChecked();
  });

  it("sends audio only to the record page", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    await getTopic(user);

    await user.click(screen.getByRole("radio", { name: "Audio only" }));
    await user.click(continueButton());

    expect(push).toHaveBeenCalledWith("/practice/record?topic=t1&speak=120&mode=audio");
  });

  it("remembers the last choice in this browser", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SetupForm categories={categories} />);
    await user.click(screen.getByRole("radio", { name: "Audio only" }));
    unmount();

    render(<SetupForm categories={categories} />);

    expect(await screen.findByRole("radio", { name: "Audio only" })).toBeChecked();
  });

  it("still works when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const user = userEvent.setup();
    render(<SetupForm categories={categories} />);
    expect(screen.getByRole("radio", { name: "Video and audio" })).toBeChecked();
    await getTopic(user);

    await user.click(screen.getByRole("radio", { name: "Audio only" }));
    await user.click(continueButton());

    expect(push).toHaveBeenCalledWith("/practice/record?topic=t1&speak=120&mode=audio");
  });
});

describe("coming back from the record page", () => {
  const initial = { category: "b", topic: topicTwo, speakSeconds: 75, mode: "audio" as const };

  it("prefills the category, topic, speaking time and mode", () => {
    render(<SetupForm categories={categories} initial={initial} />);

    expect(screen.getByLabelText("Category")).toHaveValue("b");
    expect(screen.getByText(topicTwo.text, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("Speaking time (seconds)")).toHaveValue(75);
    expect(screen.getByRole("radio", { name: "Audio only" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Get another topic" })).toBeInTheDocument();
  });

  it("continues with the prefilled setup without fetching a topic", async () => {
    const user = userEvent.setup();
    render(<SetupForm categories={categories} initial={initial} />);

    await user.click(continueButton());

    expect(push).toHaveBeenCalledWith("/practice/record?topic=t2&speak=75&mode=audio");
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/topics/next")).toBe(false);
  });

  it("prefers the mode it was given over the one remembered in this browser", () => {
    localStorage.setItem("chittle:practice-mode", "video");
    render(<SetupForm categories={categories} initial={initial} />);
    expect(screen.getByRole("radio", { name: "Audio only" })).toBeChecked();
  });

  it("uses the remembered mode when it isn't given one", () => {
    localStorage.setItem("chittle:practice-mode", "audio");
    render(<SetupForm categories={categories} initial={{ speakSeconds: 75 }} />);
    expect(screen.getByRole("radio", { name: "Audio only" })).toBeChecked();
    expect(screen.getByLabelText("Speaking time (seconds)")).toHaveValue(75);
  });
});
