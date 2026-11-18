// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverallResult } from "./overall-result";

const props = {
  overview: "A well-ordered answer that would land harder with a direct opening.",
  strengths: ["Clear example", "Strong close"],
  areasToImprove: ["Open with your point", "Cut the hedges"],
};

describe("OverallResult", () => {
  it("shows the overview under its heading", () => {
    render(<OverallResult {...props} />);

    expect(screen.getByRole("heading", { name: "Overview" }).nextElementSibling).toHaveTextContent(props.overview);
  });

  it("lists the strengths with ticks and the areas to improve", () => {
    render(<OverallResult {...props} />);

    const strengths = within(screen.getByRole("list", { name: "Strengths" })).getAllByRole("listitem");
    expect(strengths.map((li) => li.textContent)).toEqual(["✓Clear example", "✓Strong close"]);
    const areas = within(screen.getByRole("list", { name: "Areas to improve" })).getAllByRole("listitem");
    expect(areas.map((li) => li.textContent)).toEqual(["Open with your point", "Cut the hedges"]);
  });
});
