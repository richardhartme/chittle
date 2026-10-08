// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ requestLoginLink: vi.fn() }));

import { requestLoginLink } from "@/app/actions";
import { LoginForm } from "./login-form";

beforeEach(() => vi.mocked(requestLoginLink).mockReset());

describe("LoginForm", () => {
  it("renders an email field and submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  });

  it("submits the email and then tells the user to check their inbox", async () => {
    vi.mocked(requestLoginLink).mockResolvedValue({ sent: true });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email address"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByText(/Check your email for a sign-in link/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    const formData = vi.mocked(requestLoginLink).mock.calls[0][1];
    expect(formData.get("email")).toBe("a@example.com");
  });

  it("shows an error from the server and keeps the form", async () => {
    vi.mocked(requestLoginLink).mockResolvedValue({ error: "We couldn't send your sign-in link. Please try again." });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email address"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByText("We couldn't send your sign-in link. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("disables the button while sending", async () => {
    let resolve!: (value: { sent: true }) => void;
    vi.mocked(requestLoginLink).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email address"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    resolve({ sent: true });
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });
});
