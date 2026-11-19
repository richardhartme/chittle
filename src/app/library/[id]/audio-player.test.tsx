// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./audio-player";

// jsdom has no media playback, so play() and pause() just fire the events a browser would.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: false, configurable: true });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: true, configurable: true });
    this.dispatchEvent(new Event("pause"));
  });
});

const audio = () => document.querySelector("audio")!;
const seekBar = () => screen.getByRole("slider", { name: "Seek" });

describe("AudioPlayer", () => {
  it("shows the stored duration while the browser doesn't know it", () => {
    render(<AudioPlayer src="/a.webm" durationSeconds={120} />);

    expect(screen.getByText("0:00 / 2:00")).toBeInTheDocument();
    expect(seekBar()).toHaveAttribute("max", "120");
  });

  it("switches to the browser's duration once it's known", () => {
    render(<AudioPlayer src="/a.webm" durationSeconds={120} />);

    Object.defineProperty(audio(), "duration", { value: 95.4, configurable: true });
    fireEvent(audio(), new Event("durationchange"));

    expect(screen.getByText("0:00 / 1:35")).toBeInTheDocument();
  });

  it("plays and pauses", async () => {
    render(<AudioPlayer src="/a.webm" durationSeconds={120} />);

    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(audio().play).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(audio().pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("follows the playing time and seeks from the bar", () => {
    render(<AudioPlayer src="/a.webm" durationSeconds={120} />);

    audio().currentTime = 42;
    fireEvent(audio(), new Event("timeupdate"));
    expect(screen.getByText("0:42 / 2:00")).toBeInTheDocument();
    expect(seekBar()).toHaveAttribute("aria-valuetext", "0:42 of 2:00");

    fireEvent.change(seekBar(), { target: { value: "90" } });
    expect(audio().currentTime).toBe(90);
    expect(screen.getByText("1:30 / 2:00")).toBeInTheDocument();
  });

  it("mutes and unmutes", async () => {
    render(<AudioPlayer src="/a.webm" durationSeconds={120} />);

    await userEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(audio().muted).toBe(true);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0");

    await userEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(audio().muted).toBe(false);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("1");
  });
});
