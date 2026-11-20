import { eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { ProgressInsightCard } from "@/components/progress-insight-card";
import { db } from "@/db";
import { recordings, type User } from "@/db/schema";
import { DIMENSION_KEYS, DIMENSIONS } from "@/lib/assessment/dimensions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  dashboardHref,
  dimensionView,
  parseDashboardFilters,
  RANGES,
  scoreHistory,
  type DashboardFilters,
  type Range,
} from "@/lib/dashboard";
import { formatDate } from "@/lib/format";
import { hasProviderKeys } from "@/lib/provider-keys";
import { Landing } from "./_landing/landing";
import { ScoreHistoryChart } from "./score-history-chart";

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  return <Dashboard user={user} filters={parseDashboardFilters(await searchParams)} />;
}

const RANGE_LABELS: Record<Range, string> = { "7": "Last 7", "30": "Last 30", all: "All practices" };

/** The signed-in home page: the average score, the chart of recent scores, and the way to practise (SPEC → Dashboard). */
async function Dashboard({ user, filters }: { user: User; filters: DashboardFilters }) {
  const history = await scoreHistory(user.id, filters);
  const { value, ...view } = dimensionView(filters.dimension);

  return (
    <>
      <div className="dashboard-header">
        <h1>Your progress</h1>
        <Link href="/practice" className="button primary practise-button">
          Practise
        </Link>
      </div>
      {history.average === null ? (
        <NothingAssessed userId={user.id} />
      ) : (
        <>
          <DashboardFilterBar filters={filters} />
          <section className="card stack" aria-labelledby="average-heading">
            <div>
              <h2 id="average-heading" className="dashboard-label">
                Average {view.name.toLowerCase()}
              </h2>
              <p className="score dashboard-average">
                <strong>{history.average.score}</strong>
                <span className="muted">/{history.average.max}</span>
              </p>
              <p className="muted">
                Across your {history.columns.length === 1 ? "one assessed practice" : `last ${history.columns.length} assessed practices`}.
              </p>
            </div>
            <ScoreHistoryChart
              view={view}
              columns={history.columns.map(({ createdAt, ...column }) => ({
                ...column,
                date: formatDate(createdAt),
                value: value(column),
              }))}
            />
          </section>
          <ProgressInsight userId={user.id} />
        </>
      )}
    </>
  );
}

/** Dimension and range, kept in the query string so a reload keeps them. */
function DashboardFilterBar({ filters }: { filters: DashboardFilters }) {
  return (
    <div className="dashboard-filters">
      <FilterGroup
        label="Range"
        options={RANGES.map((range) => ({ label: RANGE_LABELS[range], filters: { ...filters, range }, current: range === filters.range }))}
      />
      <FilterGroup
        label="Dimension"
        options={(["all", ...DIMENSION_KEYS] as const).map((dimension) => ({
          label: dimension === "all" ? "All dimensions" : DIMENSIONS[dimension].name,
          filters: { ...filters, dimension },
          current: dimension === filters.dimension,
        }))}
      />
    </div>
  );
}

function FilterGroup({ label, options }: { label: string; options: { label: string; filters: DashboardFilters; current: boolean }[] }) {
  return (
    <div role="group" aria-label={label} className="filter-group">
      {options.map((option) => (
        <Link
          key={option.label}
          href={dashboardHref(option.filters)}
          scroll={false}
          className="filter-chip"
          aria-current={option.current ? "true" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

/** The progress insight card, streamed in on its own so the rest of the dashboard needn't wait for it. */
function ProgressInsight({ userId }: { userId: string }) {
  return (
    <Suspense fallback={null}>
      <ProgressInsightCard userId={userId} />
    </Suspense>
  );
}

/**
 * No assessed recordings yet: start one, or add the keys assessment needs, or wait for it to finish.
 * Once there are recordings, the coach's insight card says when its insights will appear.
 */
async function NothingAssessed({ userId }: { userId: string }) {
  const recordingCount = await db.$count(recordings, eq(recordings.userId, userId));
  if (recordingCount === 0) {
    return (
      <section className="card stack dashboard-empty">
        <h2>Record your first practice</h2>
        <p className="muted">Your scores over time will appear here.</p>
        <div>
          <Link href="/practice" className="button primary">
            Record your first practice
          </Link>
        </div>
      </section>
    );
  }
  return (
    <>
      {(await hasProviderKeys(userId)) ? (
        <section className="card stack dashboard-empty">
          <h2>No results yet</h2>
          <p className="muted">
            Your scores appear here once Chittle has assessed your recordings. You can check their progress in your{" "}
            <Link href="/library">library</Link>.
          </p>
        </section>
      ) : (
        <section className="card stack dashboard-empty">
          <h2>Your recordings aren&apos;t assessed yet</h2>
          <p className="muted">
            Assessment uses your own Deepgram and Anthropic keys. Add them, and Chittle can score your recordings.
          </p>
          <div>
            <Link href="/account" className="button">
              Add your keys on Account
            </Link>
          </div>
        </section>
      )}
      <ProgressInsight userId={userId} />
    </>
  );
}
