import type { ProjectRuntimeMetrics } from "../../lib/project-runtime-metrics";
import RuntimeCellGrid from "./RuntimeCellGrid";
import RuntimeMetricValue from "./RuntimeMetricValue";
import RuntimePanelAtmosphere from "./RuntimePanelAtmosphere";
import RuntimeProjectLogo from "./RuntimeProjectLogo";
import RuntimeSparkline from "./RuntimeSparkline";

interface Props {
  metrics: ProjectRuntimeMetrics;
  sourceUrl?: string;
  detailUrl?: string;
}
export default function ProjectRuntimeDataPanel(props: Props) {
  const { metrics, sourceUrl = "", detailUrl = "" } = props;
  return (
    <div
      className={`project-runtime-panel project-runtime-panel--${metrics.kind}`}
      data-project-runtime-panel=""
      data-runtime-kind={metrics.kind}
      data-runtime-source-url={sourceUrl || undefined}
      data-runtime-state={sourceUrl ? "pending" : "ready"}
    >
      <div className="runtime-panel-body">
        <div className="runtime-panel-art-stage">
          <RuntimePanelAtmosphere kind={metrics.kind} />
        </div>
        <RuntimeProjectLogo kind={metrics.kind} />

        {metrics.kind === "codex-vibe-monitor" && (
          <>
            <div className="runtime-metric-grid runtime-metric-grid--cvm">
              <div
                className="runtime-metric runtime-metric--accent"
                data-runtime-stat-key="tokensPerMinute"
              >
                <span className="runtime-metric-label">实时 Token/分钟</span>
                <RuntimeMetricValue value={metrics.tokensPerMinute.value} />
                <RuntimeSparkline label="实时 Token/分钟" stat={metrics.tokensPerMinute} />
              </div>
              <div className="runtime-metric" data-runtime-stat-key="parallelCalls">
                <span className="runtime-metric-label">并行调用数</span>
                <RuntimeMetricValue value={metrics.parallelCalls.value} />
                <RuntimeSparkline
                  label="并行调用数"
                  stat={metrics.parallelCalls}
                  tone="secondary"
                />
              </div>
              <div className="runtime-metric" data-runtime-stat-key="todayTokens">
                <span className="runtime-metric-label">今日 Token 消耗量</span>
                <RuntimeMetricValue
                  value={metrics.todayTokens.value}
                  className="runtime-metric-value--compact"
                />
                <RuntimeSparkline
                  label="今日 Token 消耗量"
                  stat={metrics.todayTokens}
                  placement="right"
                />
              </div>
            </div>
            <RuntimeCellGrid
              points={metrics.tokenActivity90d}
              label="最近 90 天 Token 消耗量活动图"
              kind="tokens"
            />
          </>
        )}

        {metrics.kind === "tavily-hikari" && (
          <>
            <div className="runtime-metric-grid runtime-metric-grid--hikari">
              <div
                className="runtime-metric runtime-metric--accent"
                data-runtime-stat-key="todayRequests"
              >
                <span className="runtime-metric-label">今日请求次数</span>
                <RuntimeMetricValue value={metrics.todayRequests.value} />
                <RuntimeSparkline label="今日请求次数" stat={metrics.todayRequests} />
              </div>
              <div className="runtime-metric" data-runtime-stat-key="todayCredits">
                <span className="runtime-metric-label">今日积分消耗量</span>
                <RuntimeMetricValue value={metrics.todayCredits.value} />
                <RuntimeSparkline
                  label="今日积分消耗量"
                  stat={metrics.todayCredits}
                  tone="secondary"
                />
              </div>
              <div className="runtime-metric" data-runtime-stat-key="monthCredits">
                <span className="runtime-metric-label">本月积分消耗量</span>
                <RuntimeMetricValue
                  value={metrics.monthCredits.value}
                  className="runtime-metric-value--hikari-lower"
                />
                <RuntimeSparkline
                  label="本月积分消耗量"
                  stat={metrics.monthCredits}
                  tone="secondary"
                  variant="bars"
                />
              </div>
              <div
                className="runtime-metric runtime-metric--quiet"
                data-runtime-stat-key="totalCredits"
              >
                <span className="runtime-metric-label">积分总量</span>
                <RuntimeMetricValue
                  value={metrics.totalCredits.value}
                  className="runtime-metric-value--hikari-lower"
                />
                <RuntimeSparkline
                  label="积分总量"
                  stat={metrics.totalCredits}
                  tone="secondary"
                  variant="bars"
                />
              </div>
            </div>
            <RuntimeCellGrid
              points={metrics.requestActivity90d}
              label="最近 90 天每日请求数活动图"
              kind="requests"
            />
          </>
        )}

        {metrics.kind === "octo-rill" && (
          <>
            <div className="runtime-metric-grid runtime-metric-grid--octo">
              <div
                className="runtime-metric runtime-metric--accent"
                data-runtime-stat-key="deduplicatedRepositories"
              >
                <span className="runtime-metric-label">去重仓库数</span>
                <RuntimeMetricValue value={metrics.deduplicatedRepositories.value} />
                <RuntimeSparkline label="去重仓库数" stat={metrics.deduplicatedRepositories} />
              </div>
              <div className="runtime-metric" data-runtime-stat-key="pressure">
                <span className="runtime-metric-label">压力值</span>
                <RuntimeMetricValue value={metrics.pressure.value} format="fixed-2" />
                <RuntimeSparkline label="压力值" stat={metrics.pressure} tone="warm" />
              </div>
            </div>
            <RuntimeCellGrid
              kind="freshness"
              label="仓库刷新新鲜度热点图"
              freshness={Array.from(metrics.freshness)}
              navigationUrl={detailUrl}
            />
          </>
        )}
      </div>
    </div>
  );
}
