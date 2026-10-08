// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/session";
import { SiteNav } from "./site-nav";

describe("SiteNav", () => {
  it("renders nothing when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { container } = render(await SiteNav());
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the signed-in pages and offers sign-out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u", email: "a@example.com", createdAt: new Date() });
    render(await SiteNav());

    expect(screen.getByRole("link", { name: "Practise" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
