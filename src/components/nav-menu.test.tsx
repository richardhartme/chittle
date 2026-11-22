// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavMenu } from "./nav-menu";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

const menu = () => screen.getByRole("button", { name: "Menu" });

function renderMenu() {
  return render(
    <div>
      <NavMenu>
        <a href="#library">Library</a>
      </NavMenu>
      <p>Outside</p>
    </div>,
  );
}

beforeEach(() => vi.mocked(usePathname).mockReturnValue("/"));

describe("NavMenu", () => {
  it("opens and closes from the menu button", async () => {
    const user = userEvent.setup();
    renderMenu();
    expect(menu()).toHaveAttribute("aria-expanded", "false");

    await user.click(menu());
    expect(menu()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation")).toHaveAttribute("data-open");

    await user.click(menu());
    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("navigation")).not.toHaveAttribute("data-open");
  });

  it("closes when a link is chosen", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(menu());

    await user.click(screen.getByRole("link", { name: "Library" }));
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and on a tap outside", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(menu());
    await user.keyboard("{Escape}");
    expect(menu()).toHaveAttribute("aria-expanded", "false");

    await user.click(menu());
    await user.click(screen.getByText("Outside"));
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the page changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderMenu();
    await user.click(menu());

    vi.mocked(usePathname).mockReturnValue("/library");
    rerender(
      <div>
        <NavMenu>
          <a href="#library">Library</a>
        </NavMenu>
        <p>Outside</p>
      </div>,
    );
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });
});
