import { useCallback, useMemo, useState } from "react";
import { DollarSign, Receipt, BellRing, WalletCards, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useWallet } from "../hooks/use-wallet";
import {
  fetchDashboardActivity,
  fetchDashboardSummary,
  fetchProfile,
  getApiErrorMessage,
  normalizeDecimal,
  type ApiActivityRecord,
  type ApiDashboardSummary,
  type ApiProfile,
} from "../utils/api-client";
import { formatCurrency, formatRelativeTime } from "../utils/format";
import { useAbortableRequest } from "../hooks/useAbortableRequest";
import { useSplits } from "../hooks/useSplits";
import { SplitCardSkeleton } from "../components/Split/LoadingSkeleton";

function describeActivity(
  activity: ApiActivityRecord,
  currency: string,
  t: TFunction,
): { title: string; amount?: string } {
  const amount = normalizeDecimal(activity.metadata.amount as number | string | undefined);
  const totalAmount = normalizeDecimal(activity.metadata.totalAmount as number | string | undefined);
  const titleFromMetadata =
    typeof activity.metadata.title === "string" ? activity.metadata.title : undefined;

  switch (activity.activityType) {
    case "split_created":
      return {
        title: titleFromMetadata
          ? t("dashboard.activity.createdWithTitle", { title: titleFromMetadata })
          : t("dashboard.activity.created"),
        amount: totalAmount > 0 ? formatCurrency(totalAmount, currency) : undefined,
      };
    case "payment_made":
      return {
        title: titleFromMetadata
          ? t("dashboard.activity.paidToward", { title: titleFromMetadata })
          : t("dashboard.activity.paymentSent"),
        amount: amount > 0 ? formatCurrency(amount, currency) : undefined,
      };
    case "payment_received":
      return {
        title: titleFromMetadata
          ? t("dashboard.activity.receivedFor", { title: titleFromMetadata })
          : t("dashboard.activity.paymentReceived"),
        amount: amount > 0 ? formatCurrency(amount, currency) : undefined,
      };
    case "split_completed":
      return {
        title: titleFromMetadata
          ? t("dashboard.activity.completedWithTitle", { title: titleFromMetadata })
          : t("dashboard.activity.splitCompleted"),
      };
    case "split_edited":
      return {
        title: titleFromMetadata
          ? t("dashboard.activity.updatedWithTitle", { title: titleFromMetadata })
          : t("dashboard.activity.splitUpdated"),
      };
    default:
      return {
        title: titleFromMetadata ?? t("dashboard.activity.generic"),
        amount: amount > 0 ? formatCurrency(amount, currency) : undefined,
      };
  }
}

function DashboardLoadingState() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-theme bg-card-theme p-5 shadow-sm animate-pulse"
          >
            <div className="h-10 w-10 rounded-xl bg-gray-200" />
            <div className="mt-4 h-3 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-8 w-28 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-20 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-theme bg-card-theme p-5 shadow-sm animate-pulse">
        <div className="h-5 w-36 rounded bg-gray-200" />
        <div className="mt-4 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 border-b border-theme pb-4 last:border-b-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="h-4 w-2/3 rounded bg-gray-200" />
                <div className="mt-2 h-3 w-1/3 rounded bg-gray-100" />
              </div>
              <div className="h-4 w-16 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { activeUserId } = useWallet();
  const [profile, setProfile] = useState<ApiProfile | null>(null);

  const { data: dashboardData, loading: isLoading, error, refetch: refetchDashboard } = useAbortableRequest(
    async (signal: AbortSignal) => {
      if (!activeUserId) {
        return { summary: null, activities: [] };
      }

      const [summaryResult, activityResult, profileResult] = await Promise.all([
        fetchDashboardSummary(signal),
        fetchDashboardActivity(1, 6, signal),
        fetchProfile(activeUserId, signal),
      ]);

      setProfile(profileResult);

      return {
        summary: summaryResult,
        activities: activityResult.data,
      };
    },
    [activeUserId],
  );

  const summary = dashboardData?.summary ?? null;
  const activities = dashboardData?.activities ?? [];
  const currency = profile?.preferredCurrency ?? "USD";

  const { data: splits, loading: splitsLoading, error: splitsError, refetch: refetchSplits } = useSplits();

  const loadDashboard = useCallback(() => {
    refetchDashboard();
    refetchSplits();
  }, [refetchDashboard, refetchSplits]);

  const stats = useMemo(() => {
    if (!summary) {
      return [];
    }

    const openSplitLine =
      summary.splitsCreated === 1
        ? t("dashboard.stats.openSplitsYouCreatedOne", { count: summary.splitsCreated })
        : t("dashboard.stats.openSplitsYouCreatedMany", { count: summary.splitsCreated });

    return [
      {
        title: t("dashboard.stats.youOwe"),
        value: formatCurrency(normalizeDecimal(summary.totalOwed), currency),
        change: t("dashboard.stats.acrossActiveSplits"),
        icon: DollarSign,
        color: "bg-rose-500",
      },
      {
        title: t("dashboard.stats.owedToYou"),
        value: formatCurrency(normalizeDecimal(summary.totalOwedToUser), currency),
        change: t("dashboard.stats.waitingToSettle"),
        icon: WalletCards,
        color: "bg-emerald-500",
      },
      {
        title: t("dashboard.stats.pendingSplits"),
        value: String(summary.activeSplits),
        change: t("dashboard.stats.splitsInProgress"),
        icon: Receipt,
        color: "bg-orange-500",
      },
      {
        title: t("dashboard.stats.unreadActivity"),
        value: String(summary.unreadNotifications),
        change: openSplitLine,
        icon: BellRing,
        color: "bg-blue-500",
      },
    ];
  }, [currency, summary, t]);

  return (
    <main
      className="min-h-dvh bg-theme [padding-top:calc(clamp(1rem,3vw,1.5rem)+env(safe-area-inset-top))] [padding-right:calc(clamp(0.75rem,4vw,1.5rem)+env(safe-area-inset-right))] [padding-bottom:calc(clamp(1rem,3vw,1.5rem)+env(safe-area-inset-bottom))] [padding-left:calc(clamp(0.75rem,4vw,1.5rem)+env(safe-area-inset-left))]"
      aria-label={t("dashboard.ariaLabel")}
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-[clamp(1.25rem,4vw,2rem)] flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.375rem,5vw,1.875rem)] font-bold leading-tight text-theme">
              {t("dashboard.title")}
            </h1>
            <p className="text-sm text-muted-theme mt-0.5">
              {activeUserId
                ? profile?.displayName
                  ? t("dashboard.signedInName", { name: profile.displayName })
                  : t("dashboard.signedInWallet", {
                      start: activeUserId.slice(0, 6),
                      end: activeUserId.slice(-4),
                    })
                : t("dashboard.connectToLoad")}
            </p>
          </div>

          {activeUserId ? (
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex items-center gap-2 rounded-xl border border-theme bg-card-theme px-4 py-2 text-sm font-semibold text-theme transition hover:bg-surface"
            >
              <RefreshCw className="h-4 w-4" />
              {t("dashboard.refresh")}
            </button>
          ) : null}
        </header>

        {!activeUserId ? (
          <div className="rounded-2xl border border-theme bg-card-theme p-8 shadow-sm">
            <h2 className="text-xl font-bold text-theme">{t("dashboard.connectToContinue")}</h2>
            <p className="mt-2 text-sm text-muted-theme">
              {t("dashboard.connectToContinueSub")}
            </p>
          </div>
        ) : isLoading ? (
          <DashboardLoadingState />
        ) : error && !dashboardData ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-red-800">{t("dashboard.loadErrorTitle")}</h2>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" />
              {t("dashboard.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.title}
                    className="rounded-2xl border border-theme bg-card-theme p-5 shadow-sm"
                  >
                    <div className={`${stat.color} w-fit rounded-xl p-3`}>
                      <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <h2 className="mt-4 text-sm font-medium text-muted-theme">
                      {stat.title}
                    </h2>
                    <p className="mt-2 text-3xl font-bold text-theme tabular-nums">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm text-muted-theme">{stat.change}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <h2 className="text-lg font-bold text-theme mb-4">{t("dashboard.yourSplits", "Your Active Splits")}</h2>
              {splitsLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SplitCardSkeleton />
                  <SplitCardSkeleton />
                  <SplitCardSkeleton />
                </div>
              ) : splitsError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-red-800">{t("dashboard.failedToLoadSplits", "Failed to load splits")}</h3>
                  <p className="mt-2 text-sm text-red-700">{splitsError}</p>
                  <button
                    type="button"
                    onClick={() => void refetchSplits()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("dashboard.retry", "Retry")}
                  </button>
                </div>
              ) : splits && splits.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {splits.map(split => (
                    <Link to={`/split/${split.id}`} key={split.id} className="block group">
                      <div className="rounded-2xl border border-theme bg-card-theme p-5 shadow-sm transition hover:shadow-md hover:border-blue-500/50">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="font-semibold text-theme text-base truncate pr-4">{split.description || "Untitled Split"}</h3>
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                            split.status === 'active' ? 'bg-blue-100 text-blue-800' :
                            split.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {split.status}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-theme">
                            Total: <span className="font-semibold text-theme">{formatCurrency(normalizeDecimal(split.totalAmount), split.preferredCurrency || "USD")}</span>
                          </p>
                          <p className="text-sm text-muted-theme">
                            Participants: <span className="font-semibold text-theme">{split.participants?.length || 0}</span>
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-theme p-8 text-center">
                  <p className="text-base font-semibold text-theme">
                    {t("dashboard.noSplits", "No active splits")}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-2xl border border-theme bg-card-theme p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-theme">
                    {t("dashboard.recentActivity")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => void loadDashboard()}
                    className="inline-flex items-center gap-2 rounded-lg border border-theme px-3 py-1.5 text-xs font-semibold text-theme transition hover:bg-surface"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("dashboard.retryFetch")}
                  </button>
                </div>

                {activities.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-theme p-8 text-center">
                    <p className="text-base font-semibold text-theme">
                      {t("dashboard.noActivityTitle")}
                    </p>
                    <p className="mt-2 text-sm text-muted-theme">
                      {t("dashboard.noActivitySub")}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 divide-y divide-theme">
                    {activities.map((activity) => {
                      const description = describeActivity(activity, currency, t);
                      const content = (
                        <>
                          <div className="min-w-0">
                            <p className="font-medium text-theme text-sm sm:text-base truncate">
                              {description.title}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-theme mt-0.5 truncate">
                              {activity.splitId
                                ? t("dashboard.splitPrefix", {
                                    id: activity.splitId.slice(0, 8),
                                  })
                                : t("dashboard.accountActivity")}{" "}
                              • {formatRelativeTime(new Date(activity.createdAt))}
                            </p>
                          </div>
                          {description.amount ? (
                            <p className="font-semibold text-theme text-sm sm:text-base tabular-nums shrink-0">
                              {description.amount}
                            </p>
                          ) : null}
                        </>
                      );

                      return activity.splitId ? (
                        <Link
                          to={`/split/${activity.splitId}`}
                          key={activity.id}
                          className="flex items-center justify-between gap-3 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 focus-visible:rounded-md"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div key={activity.id} className="flex items-center justify-between gap-3 py-4">
                          {content}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-theme bg-card-theme p-5 shadow-sm">
                <h2 className="text-lg font-bold text-theme">{t("dashboard.quickActions")}</h2>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <Link
                    to="/create-split"
                    className="inline-flex items-center justify-center rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
                  >
                    {t("dashboard.actions.addExpense")}
                  </Link>
                  <Link
                    to="/history"
                    className="inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-900"
                  >
                    {t("dashboard.viewHistory")}
                  </Link>
                  <Link
                    to="/analytics"
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    {t("dashboard.actions.viewReports")}
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
