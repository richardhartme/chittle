// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_SCRIPT } from "@/lib/theme";
import { ThemeToggle } from "./theme-toggle";

const theme = () => document.documentElement.getAttribute("data-theme");
const button = () => screen.getByRole("button", { name: /^Theme: / });

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("moves from system to light to dark and back, remembering each choice", async () => {
    render(<ThemeToggle />);
    expect(theme()).toBeNull();

    await userEvent.click(button());
    expect(theme()).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");

    await userEvent.click(button());
    expect(theme()).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    await userEvent.click(button());
    expect(theme()).toBeNull();
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("applies the stored theme when it mounts", () => {
    localStorage.setItem("theme", "dark");

    render(<ThemeToggle />);

    expect(theme()).toBe("dark");
  });

  it("follows a theme chosen in another tab", () => {
    render(<ThemeToggle />);

    localStorage.setItem("theme", "light");
    fireEvent(window, new StorageEvent("storage", { key: "theme", newValue: "light" }));

    expect(theme()).toBe("light");
  });

  it("names each state for screen readers", () => {
    render(<ThemeToggle />);

    for (const name of ["Theme: system", "Theme: light", "Theme: dark"]) {
      expect(screen.getByText(name)).toHaveClass("sr-only");
    }
  });
});

describe("THEME_SCRIPT", () => {
  const run = () => new Function(THEME_SCRIPT)();

  it("applies a stored light or dark theme", () => {
    localStorage.setItem("theme", "dark");
    run();
    expect(theme()).toBe("dark");
  });

  it("leaves the system theme for anything else", () => {
    localStorage.setItem("theme", "sepia");
    run();
    expect(theme()).toBeNull();
  });
});
