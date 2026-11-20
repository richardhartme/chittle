// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ saveProviderKey: vi.fn(), removeProviderKey: vi.fn() }));

import { removeProviderKey, saveProviderKey } from "@/app/actions";
import { ProviderKeyForm } from "./provider-key-form";

const props = { provider: "deepgram" as const, label: "Deepgram" };

beforeEach(() => {
  vi.mocked(saveProviderKey).mockReset();
  vi.mocked(removeProviderKey).mockReset();
});

describe("ProviderKeyForm", () => {
  it("asks for a key in a password field when none is saved", () => {
    render(<ProviderKeyForm {...props} hint={null} />);

    expect(screen.getByLabelText("Deepgram key")).toHaveAttribute("type", "password");
  });

  it("submits the key with its provider", async () => {
    vi.mocked(saveProviderKey).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<ProviderKeyForm {...props} hint={null} />);

    await user.type(screen.getByLabelText("Deepgram key"), "dg-secret-abcd");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const formData = vi.mocked(saveProviderKey).mock.calls[0][1];
    expect(formData.get("provider")).toBe("deepgram");
    expect(formData.get("key")).toBe("dg-secret-abcd");
  });

  it("shows the server's error and keeps the form", async () => {
    vi.mocked(saveProviderKey).mockResolvedValue({ error: "The provider rejected that key." });
    const user = userEvent.setup();
    render(<ProviderKeyForm {...props} hint={null} />);

    await user.type(screen.getByLabelText("Deepgram key"), "dg-wrong");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The provider rejected that key.")).toBeInTheDocument();
    expect(screen.getByLabelText("Deepgram key")).toBeInTheDocument();
  });

  it("shows only the last four characters of a saved key, with Replace and Remove", () => {
    render(<ProviderKeyForm {...props} hint="abcd" />);

    expect(screen.getByText(/Saved, ending in/)).toHaveTextContent("Saved, ending in abcd");
    expect(screen.queryByLabelText("Deepgram key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("opens the form to replace a saved key, and can cancel", async () => {
    const user = userEvent.setup();
    render(<ProviderKeyForm {...props} hint="abcd" />);

    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(screen.getByLabelText("Deepgram key")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(/Saved, ending in/)).toBeInTheDocument();
  });

  it("closes the form once a replacement is saved", async () => {
    vi.mocked(saveProviderKey).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<ProviderKeyForm {...props} hint="abcd" />);

    await user.click(screen.getByRole("button", { name: "Replace" }));
    await user.type(screen.getByLabelText("Deepgram key"), "dg-new-wxyz");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved, ending in/)).toBeInTheDocument();
  });

  it("removes the key for its provider", async () => {
    const user = userEvent.setup();
    render(<ProviderKeyForm {...props} hint="abcd" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(vi.mocked(removeProviderKey).mock.calls[0][0].get("provider")).toBe("deepgram");
  });
});
