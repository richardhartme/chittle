// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CoachInsights } from "@/lib/assessment/score";
import { CoachInsightsDrawer } from "./coach-insights";

const insights: CoachInsights = {
  howYouSaidIt: ["You described the old system.", "You said you led the migration.", "You mentioned finishing early."],
  betterOrder: ["You led the migration.", "It finished two weeks early.", "The old system was slowing everyone down."],
  orderExplanation: "Lead with what you did, so the result lands straight after it.",
  tryOpeningWith: "I led the migration that finished two weeks early.",
  shorterWays: [
    { original: "So basically what happened was that we were kind of behind.", shorter: "We were behind.", savedWords: 8 },
  ],
  idealVersion: [
    { step: "Situation", text: "Our old billing system was slowing every release." },
    { step: "Task", text: "I was asked to lead its migration." },
    { step: "Action", text: "I split the work into weekly milestones." },
    { step: "Result", text: "We finished two weeks early." },
  ],
};

const openButton = () => screen.getByRole("button", { name: "Coach insights" });
const drawer = () => screen.getByRole("dialog", { name: "Coach insights" });
const section = (name: string) => within(drawer()).getByRole("region", { name });
const items = (list: HTMLElement) => within(list).getAllByRole("listitem").map((li) => li.textContent);

describe("CoachInsightsDrawer", () => {
  it("has no button for an assessment without coach insights", () => {
    const { container } = render(<CoachInsightsDrawer />);

    expect(screen.queryByRole("button", { name: "Coach insights" })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("closes on Esc and from the close button, returning focus to the button", async () => {
    render(<CoachInsightsDrawer insights={insights} />);
    await userEvent.click(openButton());

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton()).toHaveFocus();

    await userEvent.click(openButton());
    await userEvent.click(within(drawer()).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton()).toHaveFocus();
  });

  it("leaves out Shorter ways when none of the suggested sentences were spoken", async () => {
    render(<CoachInsightsDrawer insights={{ ...insights, shorterWays: [] }} />);

    await userEvent.click(openButton());

    expect(within(drawer()).queryByRole("region", { name: "Shorter ways to say it" })).not.toBeInTheDocument();
  });

  it("opens a drawer with how you said it against a better order, and why", async () => {
    render(<CoachInsightsDrawer insights={insights} />);

    await userEvent.click(openButton());

    expect(items(within(section("How you said it")).getByRole("list"))).toEqual(insights.howYouSaidIt);
    const better = section("Better order");
    expect(items(within(better).getByRole("list"))).toEqual(insights.betterOrder);
    expect(within(better).getByText(insights.orderExplanation)).toBeInTheDocument();
  });

  it("shows the suggested opening in quotes, and each shorter way with the words it saves", async () => {
    render(<CoachInsightsDrawer insights={insights} />);

    await userEvent.click(openButton());

    expect(section("Try opening with")).toHaveTextContent("“I led the migration that finished two weeks early.”");
    const [way] = within(section("Shorter ways to say it")).getAllByRole("listitem");
    expect(within(way).getByRole("deletion")).toHaveTextContent("So basically what happened was that we were kind of behind.");
    expect(way).toHaveTextContent("We were behind.");
    expect(way).toHaveTextContent("saved 8 words");
  });

  it("shows the ideal version as a collapsible block for each framework step", async () => {
    render(<CoachInsightsDrawer insights={insights} />);
    await userEvent.click(openButton());
    const ideal = section("Ideal version");

    const steps = within(ideal).getAllByRole("group");
    expect(steps.map((step) => step.querySelector("summary")?.textContent)).toEqual(["Situation", "Task", "Action", "Result"]);
    expect(steps[2]).toHaveTextContent("I split the work into weekly milestones.");

    await userEvent.click(within(steps[2]).getByText("Action"));

    expect(steps[2]).not.toHaveAttribute("open");
  });
});
