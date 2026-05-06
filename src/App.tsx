import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Filter,
  Gauge,
  LineChart,
  Menu,
  RefreshCcw,
  Search,
  ShieldCheck,
  Star,
  StarOff,
  Target,
  TrendingUp,
  Trash2,
  WalletCards,
} from 'lucide-react'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import './App.css'
import { CandlestickChart } from './components/CandlestickChart'
import { ProfileDrawer } from './components/ProfileDrawer'
import { ProfileGate } from './components/ProfileGate'
import { PhysicalPanel } from './components/PhysicalPanel'
import { useAStockMarket } from './hooks/useAStockMarket'
import {
  buildAdaptiveReview,
  buildDailyPicks,
  buildMarketOverview,
  buildWatchlistInsights,
  scoreStock,
} from './lib/analysisEngine'
import {
  loadLearningRecords,
  loadTrainedCalibration,
  refreshLearningRecords,
  saveLearningRecords,
} from './lib/learningEngine'
import { buildPresetWatchlist } from './lib/personalization'
import {
  buildUserProfile,
  clearUserProfile,
  defaultProfileDraft,
  loadProfileWatchlist,
  loadUserProfile,
  makeInitialUserDraft,
  saveProfileWatchlist,
  saveUserProfile,
  type UserProfileDraft,
} from './lib/profileStore'
import { filterByWatchOnly } from './lib/marketData'
import type {
  ChartPeriod,
  LearningCalibration,
  RiskProfile,
  ScoredStock,
  UserProfile,
} from './types/market'

const profileConfig = {
  low: {
    label: '低风险',
    caption: '稳健',
    accent: '#2277ff',
    description: '回撤优先，等待支撑确认。',
  },
  medium: {
    label: '中风险',
    caption: '均衡',
    accent: '#16a36a',
    description: '趋势与安全边际并重。',
  },
  high: {
    label: '高风险',
    caption: '进攻',
    accent: '#db3f36',
    description: '追踪强势题材，快进快出。',
  },
} satisfies Record<
  RiskProfile,
  {
    label: string
    caption: string
    accent: string
    description: string
  }
>

const sectorFilters = ['全部', '电池', '智能汽车', '算力芯片', '银行', '高端消费']

const chartPeriods = [
  { key: 'minute', label: '分时', hint: '1分钟' },
  { key: 'day', label: '日线', hint: '日K' },
  { key: 'week', label: '周线', hint: '周K' },
  { key: 'month', label: '月线', hint: '月K' },
] satisfies Array<{ key: ChartPeriod; label: string; hint: string }>

function formatPrice(value: number) {
  return value >= 100 ? value.toFixed(2) : value.toFixed(3)
}

function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatClock(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatProbability(value: number | null) {
  return value === null ? '待校准' : `${value}%`
}

function getProfileBadge(name: string) {
  return name
    .trim()
    .slice(0, 2)
    .toUpperCase() || '我'
}

function MarketMetric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity
  label: string
  value: string
  hint: string
}) {
  return (
    <PhysicalPanel className="market-metric" intensity="soft">
      <Icon aria-hidden="true" size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </PhysicalPanel>
  )
}

function StockRow({
  stock,
  active,
  watched,
  onSelect,
  onToggleWatch,
}: {
  stock: ScoredStock
  active: boolean
  watched: boolean
  onSelect: () => void
  onToggleWatch: () => void
}) {
  return (
    <button
      type="button"
      className={`stock-row${active ? ' is-active' : ''}`}
      onClick={onSelect}
    >
      <span className="stock-row__rank">{stock.hotRank}</span>
      <span className="stock-row__identity">
        <strong>{stock.name}</strong>
        <small>{stock.symbol}</small>
      </span>
      <span className="stock-row__price">
        <strong>{formatPrice(stock.price)}</strong>
        <small className={stock.changePct >= 0 ? 'up' : 'down'}>
          {formatPercent(stock.changePct)}
        </small>
      </span>
      <span className="stock-row__score">
        <strong>{stock.signalScore}</strong>
        <small>信号分</small>
      </span>
      <span
        className="icon-button stock-row__watch"
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation()
          onToggleWatch()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            onToggleWatch()
          }
        }}
      >
        {watched ? <Star size={17} /> : <StarOff size={17} />}
      </span>
    </button>
  )
}

function ScoreBar({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="score-line">
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%`, background: accent }} />
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() =>
    loadUserProfile(),
  )
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>(() =>
    makeInitialUserDraft(loadUserProfile()),
  )
  const [riskProfile, setRiskProfile] = useState<RiskProfile>(
    () => loadUserProfile()?.riskProfile ?? 'medium',
  )
  const [activeSymbol, setActiveSymbol] = useState('300750')
  const [watchSymbols, setWatchSymbols] = useState<string[]>(() => {
    const storedProfile = loadUserProfile()

    if (!storedProfile) {
      return []
    }

    const storedWatchlist = loadProfileWatchlist(storedProfile.id)
    return storedWatchlist.length
      ? storedWatchlist
      : buildPresetWatchlist(storedProfile.focusPreset)
  })
  const [watchOnly, setWatchOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('全部')
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('day')
  const [viewMode, setViewMode] = useState<'dashboard' | 'watchlist'>(
    'dashboard',
  )
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const [learningRecords, setLearningRecords] = useState(loadLearningRecords)
  const [trainedCalibration, setTrainedCalibration] =
    useState<LearningCalibration | null>(null)

  const { stocks, status, isLoading, refreshQuotes } =
    useAStockMarket(activeSymbol, chartPeriod)
  const deferredQuery = useDeferredValue(query)
  const activeProfile = profileConfig[riskProfile]

  const analysisStocks = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    const scoped = filterByWatchOnly(stocks, watchSymbols, watchOnly)

    return scoped
      .filter((stock) => {
        const sectorMatched = sector === '全部' || stock.sector.includes(sector)
        const keywordMatched =
          !keyword ||
          stock.symbol.toLowerCase().includes(keyword) ||
          stock.name.toLowerCase().includes(keyword) ||
          stock.sector.toLowerCase().includes(keyword) ||
          stock.theme.toLowerCase().includes(keyword)

        return sectorMatched && keywordMatched
      })
  }, [deferredQuery, sector, stocks, watchOnly, watchSymbols])
  const recommendationLimit =
    analysisStocks.length >= 24
      ? 8
      : Math.max(3, Math.min(6, Math.floor(analysisStocks.length / 2) || 3))
  const picks = useMemo(
    () =>
      buildDailyPicks(
        analysisStocks,
        riskProfile,
        recommendationLimit,
        learningRecords,
        trainedCalibration,
      ),
    [
      learningRecords,
      recommendationLimit,
      riskProfile,
      trainedCalibration,
      analysisStocks,
    ],
  )
  const watchlist = useMemo(
    () =>
      buildWatchlistInsights(
        stocks,
        watchSymbols,
        riskProfile,
        learningRecords,
        trainedCalibration,
      ),
    [learningRecords, riskProfile, stocks, trainedCalibration, watchSymbols],
  )
  const adaptiveReview = useMemo(
    () => buildAdaptiveReview(watchlist, riskProfile),
    [riskProfile, watchlist],
  )
  const overview = useMemo(
    () =>
      buildMarketOverview(
        analysisStocks.length ? analysisStocks : stocks,
        riskProfile,
        learningRecords,
        trainedCalibration,
      ),
    [analysisStocks, learningRecords, riskProfile, stocks, trainedCalibration],
  )
  const fallbackSymbol = picks[0]?.symbol ?? analysisStocks[0]?.symbol ?? stocks[0]?.symbol
  const selectedSymbol = stocks.some((stock) => stock.symbol === activeSymbol)
    ? activeSymbol
    : fallbackSymbol
  const activeBase =
    stocks.find((stock) => stock.symbol === selectedSymbol) ??
    analysisStocks[0] ??
    stocks[0]
  const activeStock = useMemo(
    () =>
      activeBase
        ? scoreStock(
            activeBase,
            riskProfile,
            learningRecords,
            trainedCalibration,
          )
        : null,
    [activeBase, learningRecords, riskProfile, trainedCalibration],
  )
  const watchlistActiveStock =
    watchlist.find((stock) => stock.symbol === activeSymbol) ??
    watchlist[0] ??
    activeStock
  const alerts = useMemo(
    () =>
      watchlist
        .filter((stock) => stock.signalScore >= 76 || stock.riskScore >= 62)
        .slice(0, 5),
    [watchlist],
  )

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let alive = true

    void loadTrainedCalibration().then((model) => {
      if (alive) {
        setTrainedCalibration(model)
      }
    })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!profile) {
      return
    }

    saveUserProfile(profile)
  }, [profile])

  useEffect(() => {
    if (!profile) {
      return
    }

    saveProfileWatchlist(profile.id, watchSymbols)
  }, [profile, watchSymbols])

  useEffect(() => {
    if (status.mode !== 'live' || !watchlist.length) {
      return
    }

    const timer = window.setTimeout(() => {
      setLearningRecords((current) => {
        const next = refreshLearningRecords(current, watchlist)

        if (JSON.stringify(next) === JSON.stringify(current)) {
          return current
        }

        saveLearningRecords(next)
        return next
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [status.mode, watchlist])

  function changeProfile(nextRisk: RiskProfile) {
    startTransition(() => {
      setRiskProfile(nextRisk)
      setProfile((current) =>
        current
          ? { ...current, riskProfile: nextRisk, updatedAt: new Date().toISOString() }
          : current,
      )
      setProfileDraft((current) => ({ ...current, riskProfile: nextRisk }))
    })
  }

  function toggleWatch(symbol: string) {
    startTransition(() => {
      setWatchSymbols((current) =>
        current.includes(symbol)
          ? current.filter((item) => item !== symbol)
          : [...current, symbol],
      )
    })
  }

  function removeWatch(symbol: string) {
    const nextSymbol =
      watchSymbols.find((item) => item !== symbol) ??
      picks[0]?.symbol ??
      stocks[0]?.symbol

    startTransition(() => {
      setWatchSymbols((current) => current.filter((item) => item !== symbol))

      if (activeSymbol === symbol && nextSymbol) {
        setActiveSymbol(nextSymbol)
      }
    })
  }

  function openStockInDashboard(symbol: string) {
    startTransition(() => {
      setActiveSymbol(symbol)
      setViewMode('dashboard')
    })
  }

  function commitProfile(draft: UserProfileDraft) {
    const nextProfile = buildUserProfile(draft, profile)
    const nextWatchlist = loadProfileWatchlist(nextProfile.id)
    const resolvedWatchlist = nextWatchlist.length
      ? nextWatchlist
      : buildPresetWatchlist(draft.focusPreset)

    saveUserProfile(nextProfile)
    saveProfileWatchlist(nextProfile.id, resolvedWatchlist)

    startTransition(() => {
      setProfile(nextProfile)
      setProfileDraft(makeInitialUserDraft(nextProfile))
      setRiskProfile(draft.riskProfile)
      setWatchSymbols(resolvedWatchlist)
      setActiveSymbol((current) => current || resolvedWatchlist[0] || '300750')
      setProfileDrawerOpen(false)
    })
  }

  function logoutProfile() {
    if (profile) {
      clearUserProfile()
    }

    startTransition(() => {
      setProfile(null)
      setProfileDraft(defaultProfileDraft)
      setRiskProfile('medium')
      setWatchSymbols([])
      setActiveSymbol('300750')
      setProfileDrawerOpen(false)
    })
  }

  if (!profile) {
    return (
      <ProfileGate
        draft={profileDraft}
        onChange={setProfileDraft}
        onSubmit={() => commitProfile(profileDraft)}
      />
    )
  }

  if (!activeStock || !watchlistActiveStock) {
    return (
      <div className="terminal-shell">
        <header className="command-bar">
          <div className="brand-mark">
            <LineChart size={22} />
            <div>
              <strong>Canvas Alpha</strong>
              <span>A股实时监测终端</span>
            </div>
          </div>

          <div className="command-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索股票代码、名称、板块"
            />
          </div>

          <div className="command-actions">
            <button
              type="button"
              className="toolbar-button"
              onClick={() => void refreshQuotes()}
              title="刷新实时行情"
            >
              <RefreshCcw size={18} />
              <span>刷新</span>
            </button>
            <div className="data-status is-unavailable">
              <span />
              真实源 · {formatTime(status.updatedAt)}
            </div>
          </div>
        </header>

        <PhysicalPanel as="section" className="data-empty-state">
          <AlertTriangle size={24} />
          <strong>{isLoading ? '正在连接真实行情源' : '真实行情暂不可用'}</strong>
          <span>{status.message}</span>
        </PhysicalPanel>
      </div>
    )
  }

  return (
    <div className={`terminal-shell terminal-shell--${profile.density}`}>
      <header className="command-bar">
        <div className="brand-mark">
          <LineChart size={22} />
          <div>
            <strong>Canvas Alpha</strong>
            <span>A股实时监测终端</span>
          </div>
        </div>

        <div className="command-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索股票代码、名称、板块"
          />
        </div>

        <div className="command-actions">
          <button
            type="button"
            className="profile-chip"
            onClick={() => setProfileDrawerOpen((value) => !value)}
            title="打开个人设置"
          >
            <span>{getProfileBadge(profile.displayName)}</span>
            <div>
              <strong>{profile.displayName}</strong>
              <small>{profile.focusPreset === 'defensive' ? '稳健底仓' : profile.focusPreset === 'balanced' ? '均衡跟随' : '热点进攻'}</small>
            </div>
            <Menu size={16} />
          </button>
          <button
            type="button"
            className={`toolbar-button${viewMode === 'watchlist' ? ' is-active' : ''}`}
            onClick={() =>
              setViewMode((mode) =>
                mode === 'watchlist' ? 'dashboard' : 'watchlist',
              )
            }
            title={viewMode === 'watchlist' ? '返回监测台' : '进入自选股独立界面'}
          >
            {viewMode === 'watchlist' ? (
              <ArrowLeft size={18} />
            ) : (
              <Star size={18} />
            )}
            <span>{viewMode === 'watchlist' ? '监测台' : '自选股页'}</span>
          </button>
          <button
            type="button"
            className={`toolbar-button${watchOnly ? ' is-active' : ''}`}
            onClick={() => setWatchOnly((value) => !value)}
            title="只看自选股票"
          >
            {watchOnly ? <Eye size={18} /> : <EyeOff size={18} />}
            <span>{watchOnly ? '自选视图' : '全市场'}</span>
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => void refreshQuotes()}
            title="刷新实时行情"
          >
            <RefreshCcw size={18} />
            <span>刷新</span>
          </button>
          <div
            className={`data-status ${
              status.mode === 'live' ? 'is-live' : 'is-unavailable'
            }`}
          >
            <span />
            {status.mode === 'live' ? '公开源' : '未连接'} · {formatTime(status.updatedAt)}
          </div>
        </div>
      </header>

      {viewMode === 'watchlist' ? (
        <>
          <PhysicalPanel as="section" className="watchlist-hero" intensity="soft">
            <div>
              <span>自选股独立工作台</span>
              <p>
                当前沿用 {profileConfig[riskProfile].label} 策略重新计算胜率、风险和操作建议。
              </p>
            </div>
            <div className="watchlist-hero__stats">
              <strong>{watchlist.length}</strong>
              <span>只自选股</span>
              <small>{status.provider} · {formatTime(status.updatedAt)}</small>
            </div>
          </PhysicalPanel>

          <section className="adaptive-review">
            <PhysicalPanel className="adaptive-card adaptive-card--primary">
              <span>校准胜率</span>
              <strong>{formatProbability(adaptiveReview.avgWinRate)}</strong>
              <small>{adaptiveReview.confidence}</small>
            </PhysicalPanel>
            <PhysicalPanel className="adaptive-card">
              <span>系统学习分</span>
              <strong>{adaptiveReview.learningScore}</strong>
              <small>根据真实信号样本逐步校正</small>
            </PhysicalPanel>
            <PhysicalPanel className="adaptive-card adaptive-card--wide">
              <span>今日复盘</span>
              <strong>{adaptiveReview.summary}</strong>
              <small>{adaptiveReview.nextOptimization}</small>
            </PhysicalPanel>
            <PhysicalPanel className="adaptive-card adaptive-card--wide">
              <span>下一轮判断逻辑</span>
              <strong>{adaptiveReview.bias}</strong>
              <div className="learning-tags">
                {adaptiveReview.focus.map((item) => (
                  <em key={item}>{item}</em>
                ))}
              </div>
            </PhysicalPanel>
          </section>

          <main className="watchlist-layout">
            <PhysicalPanel as="section" className="watchlist-table">
              <div className="panel-heading">
                <span>我的自选</span>
                <strong>{watchlist.length}</strong>
              </div>

              <div className="watchlist-rows">
                {watchlist.length ? (
                  watchlist.map((stock) => (
                    <article
                      className={`watchlist-row${
                        stock.symbol === watchlistActiveStock.symbol
                          ? ' is-active'
                          : ''
                      }`}
                      key={stock.symbol}
                    >
                      <button
                        type="button"
                        className="watchlist-row__main"
                        onClick={() => setActiveSymbol(stock.symbol)}
                      >
                        <span>
                          <strong>{stock.name}</strong>
                          <small>{stock.symbol} · {stock.sector}</small>
                        </span>
                        <span>
                          <strong>{formatPrice(stock.price)}</strong>
                          <small className={stock.changePct >= 0 ? 'up' : 'down'}>
                            {formatPercent(stock.changePct)}
                          </small>
                        </span>
                        <span>
                          <strong>{stock.signalScore}</strong>
                          <small>信号分</small>
                        </span>
                        <span>
                          <strong>{stock.riskScore}</strong>
                          <small>风险</small>
                        </span>
                        <span>
                          <strong>{stock.action}</strong>
                          <small>{stock.confidenceLabel}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="watchlist-row__action"
                        onClick={() => openStockInDashboard(stock.symbol)}
                      >
                        查看K线
                      </button>
                      <button
                        type="button"
                        className="watchlist-row__delete"
                        onClick={() => removeWatch(stock.symbol)}
                        aria-label={`删除 ${stock.name}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="empty-watchlist">
                    <StarOff size={22} />
                    <strong>还没有自选股</strong>
                    <span>回到监测台，在左侧股票列表点击星标即可加入。</span>
                  </div>
                )}
              </div>
            </PhysicalPanel>

            <PhysicalPanel as="section" className="watchlist-detail">
              <div className="chart-title-row">
                <div>
                  <span>
                    {watchlistActiveStock.market} · {watchlistActiveStock.sector}
                  </span>
                  <h1>
                    {watchlistActiveStock.name}
                    <small>{watchlistActiveStock.symbol}</small>
                  </h1>
                </div>
                <div className="price-stack">
                  <strong>{formatPrice(watchlistActiveStock.price)}</strong>
                  <span className={watchlistActiveStock.changePct >= 0 ? 'up' : 'down'}>
                    {formatPercent(watchlistActiveStock.changePct)}
                  </span>
                </div>
              </div>

              <div className="timeframe-switch" aria-label="自选股K线周期切换">
                {chartPeriods.map((period) => (
                  <button
                    key={period.key}
                    type="button"
                    className={chartPeriod === period.key ? 'is-active' : ''}
                    onClick={() => setChartPeriod(period.key)}
                  >
                    <span>{period.label}</span>
                    <small>{period.hint}</small>
                  </button>
                ))}
              </div>

              <CandlestickChart
                period={chartPeriod}
                profile={riskProfile}
                stock={watchlistActiveStock}
              />

              {watchlistActiveStock.tradePlan ? (
                <div className="execution-grid">
                  <PhysicalPanel className="execution-card" intensity="soft">
                    <Target size={18} />
                    <span>买入区间</span>
                    <strong>
                      {formatPrice(watchlistActiveStock.tradePlan.entries[0])} /{' '}
                      {formatPrice(watchlistActiveStock.tradePlan.entries[1])}
                    </strong>
                  </PhysicalPanel>
                  <PhysicalPanel className="execution-card" intensity="soft">
                    <WalletCards size={18} />
                    <span>建议仓位</span>
                    <strong>{watchlistActiveStock.tradePlan.positionPct}%</strong>
                  </PhysicalPanel>
                  <PhysicalPanel className="execution-card" intensity="soft">
                    <ShieldCheck size={18} />
                    <span>风控线</span>
                    <strong>
                      {formatPrice(watchlistActiveStock.tradePlan.stopLoss)}
                    </strong>
                  </PhysicalPanel>
                  <PhysicalPanel className="execution-card" intensity="soft">
                    <AlertTriangle size={18} />
                    <span>最大回撤</span>
                    <strong>{watchlistActiveStock.tradePlan.maxDrawdownPct}%</strong>
                  </PhysicalPanel>
                </div>
              ) : (
                <PhysicalPanel className="execution-placeholder" intensity="soft">
                  <AlertTriangle size={18} />
                  <span>等待真实K线补齐后生成操作区间。</span>
                </PhysicalPanel>
              )}
            </PhysicalPanel>
          </main>
        </>
      ) : (
        <>
      <section className="market-strip">
        <MarketMetric
          icon={Activity}
          label="同步股票"
          value={`${status.total || stocks.length}`}
          hint={isLoading ? '正在同步' : status.provider}
        />
        <MarketMetric
          icon={TrendingUp}
          label="上涨/下跌"
          value={`${overview.upCount}/${overview.downCount}`}
          hint={`分析样本 ${overview.total}`}
        />
        <MarketMetric
          icon={Gauge}
          label="信号均分"
          value={`${overview.avgSignalScore}`}
          hint={activeProfile.description}
        />
        <MarketMetric
          icon={ShieldCheck}
          label="平均风险"
          value={`${overview.avgRisk}`}
          hint={overview.dominantTheme}
        />
        <MarketMetric
          icon={BarChart3}
          label="市场热度"
          value={`${overview.mood}`}
          hint={`当前 ${formatClock(clock)}`}
        />
      </section>

      <main className="terminal-grid">
        <PhysicalPanel as="section" className="left-rail">
          <div className="rail-tabs">
            {(['low', 'medium', 'high'] as RiskProfile[]).map((profile) => (
              <button
                key={profile}
                type="button"
                className={riskProfile === profile ? 'is-active' : ''}
                onClick={() => changeProfile(profile)}
                style={
                  riskProfile === profile
                    ? { borderColor: profileConfig[profile].accent }
                    : undefined
                }
              >
                <span>{profileConfig[profile].label}</span>
                <small>{profileConfig[profile].caption}</small>
              </button>
            ))}
          </div>

          <div className="filter-bar">
            <Filter size={16} />
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              {sectorFilters.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="stock-list" aria-label="股票列表">
            {picks.map((stock) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                active={stock.symbol === activeStock.symbol}
                watched={watchSymbols.includes(stock.symbol)}
                onSelect={() => setActiveSymbol(stock.symbol)}
                onToggleWatch={() => toggleWatch(stock.symbol)}
              />
            ))}
          </div>
        </PhysicalPanel>

        <PhysicalPanel as="section" className="chart-workspace">
          <div className="chart-title-row">
            <div>
              <span>{activeStock.market} · {activeStock.sector}</span>
              <h1>
                {activeStock.name}
                <small>{activeStock.symbol}</small>
              </h1>
            </div>
            <div className="price-stack">
              <strong>{formatPrice(activeStock.price)}</strong>
              <span className={activeStock.changePct >= 0 ? 'up' : 'down'}>
                {formatPercent(activeStock.changePct)}
              </span>
            </div>
          </div>

          <div className="timeframe-switch" aria-label="K线周期切换">
            {chartPeriods.map((period) => (
              <button
                key={period.key}
                type="button"
                className={chartPeriod === period.key ? 'is-active' : ''}
                onClick={() => setChartPeriod(period.key)}
              >
                <span>{period.label}</span>
                <small>{period.hint}</small>
              </button>
            ))}
          </div>

          <CandlestickChart
            period={chartPeriod}
            profile={riskProfile}
            stock={activeStock}
          />

          {activeStock.tradePlan ? (
            <div className="execution-grid">
              <PhysicalPanel className="execution-card" intensity="soft">
                <Target size={18} />
                <span>买入区间</span>
                <strong>
                  {formatPrice(activeStock.tradePlan.entries[0])} /{' '}
                  {formatPrice(activeStock.tradePlan.entries[1])}
                </strong>
              </PhysicalPanel>
              <PhysicalPanel className="execution-card" intensity="soft">
                <WalletCards size={18} />
                <span>建议仓位</span>
                <strong>{activeStock.tradePlan.positionPct}%</strong>
              </PhysicalPanel>
              <PhysicalPanel className="execution-card" intensity="soft">
                <ShieldCheck size={18} />
                <span>风控线</span>
                <strong>{formatPrice(activeStock.tradePlan.stopLoss)}</strong>
              </PhysicalPanel>
              <PhysicalPanel className="execution-card" intensity="soft">
                <AlertTriangle size={18} />
                <span>最大回撤</span>
                <strong>{activeStock.tradePlan.maxDrawdownPct}%</strong>
              </PhysicalPanel>
            </div>
          ) : (
            <PhysicalPanel className="execution-placeholder" intensity="soft">
              <AlertTriangle size={18} />
              <span>等待真实K线补齐后生成操作区间。</span>
            </PhysicalPanel>
          )}
        </PhysicalPanel>

        <aside className="right-rail">
          <PhysicalPanel as="section" className="engine-box">
            <div className="panel-heading">
              <span>Alpha 引擎</span>
              <strong>{activeStock.action}</strong>
            </div>
            <div className="win-ring" style={{ borderColor: activeProfile.accent }}>
              <strong>{formatProbability(activeStock.winRate)}</strong>
              <span>{activeStock.confidenceLabel}</span>
            </div>
            <ScoreBar
              label="消息面"
              value={activeStock.breakdown.messageScore}
              accent="#2277ff"
            />
            <ScoreBar
              label="技术面"
              value={activeStock.breakdown.technicalScore}
              accent="#16a36a"
            />
            <ScoreBar
              label="稳定度"
              value={activeStock.breakdown.stabilityScore}
              accent="#7c4dff"
            />
            <ScoreBar
              label="风险匹配"
              value={activeStock.breakdown.profileFit}
              accent={activeProfile.accent}
            />
          </PhysicalPanel>

          <PhysicalPanel as="section" className="watch-box">
            <div className="panel-heading">
              <span>自选股</span>
              <button
                type="button"
                className="mini-action"
                onClick={() => setViewMode('watchlist')}
              >
                独立浏览 {watchlist.length}
              </button>
            </div>
            {watchlist.slice(0, 6).map((stock) => (
              <button
                type="button"
                className="watch-line"
                key={stock.symbol}
                onClick={() => setActiveSymbol(stock.symbol)}
              >
                <span>{stock.name}</span>
                <strong className={stock.changePct >= 0 ? 'up' : 'down'}>
                  {formatPercent(stock.changePct)}
                </strong>
              </button>
            ))}
          </PhysicalPanel>

          <PhysicalPanel as="section" className="alert-box">
            <div className="panel-heading">
              <span>提醒队列</span>
              <Bell size={17} />
            </div>
            {alerts.map((stock) => (
              <div className="alert-line" key={stock.symbol}>
              {stock.signalScore >= 76 ? (
                <CheckCircle2 size={16} />
              ) : (
                  <AlertTriangle size={16} />
                )}
                <span>
                  {stock.name} · {stock.action}
                </span>
              </div>
            ))}
          </PhysicalPanel>
        </aside>
      </main>

      <section className="bottom-console">
        <div>
          <strong>数据说明</strong>
          <span>{status.message}</span>
        </div>
        <div>
          <strong>操作策略</strong>
          <span>
            {activeStock.tradePlan
              ? activeStock.tradePlan.styleNote
              : '真实K线不足，暂不生成操作策略。'}
          </span>
        </div>
        <div>
          <strong>当前逻辑</strong>
          <span>{activeStock.narrative[0]}</span>
        </div>
      </section>
      {profileDrawerOpen ? (
        <div className="profile-drawer-overlay">
          <ProfileDrawer
            draft={profileDraft}
            onChange={setProfileDraft}
            onSave={() => commitProfile(profileDraft)}
            onLogout={logoutProfile}
          />
        </div>
      ) : null}
        </>
      )}
    </div>
  )
}

export default App
