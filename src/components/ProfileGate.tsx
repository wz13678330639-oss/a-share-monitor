import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { PhysicalPanel } from './PhysicalPanel'
import type { UserProfileDraft } from '../lib/profileStore'
import type { FocusPreset, RiskProfile, UiDensity } from '../types/market'

const focusOptions: Array<{
  value: FocusPreset
  label: string
  hint: string
}> = [
  { value: 'defensive', label: '稳健底仓', hint: '优先防守与低回撤' },
  { value: 'balanced', label: '均衡跟随', hint: '趋势和风控并重' },
  { value: 'aggressive', label: '热点进攻', hint: '高弹性与快进快出' },
]

const densityOptions: Array<{
  value: UiDensity
  label: string
  hint: string
}> = [
  { value: 'comfortable', label: '标准密度', hint: '留出更多阅读空间' },
  { value: 'compact', label: '紧凑密度', hint: '更适合高频扫盘' },
]

const riskOptions: Array<{
  value: RiskProfile
  label: string
  hint: string
}> = [
  { value: 'low', label: '低风险', hint: '更重安全边际' },
  { value: 'medium', label: '中风险', hint: '平衡趋势与回撤' },
  { value: 'high', label: '高风险', hint: '更适合强势题材' },
]

export function ProfileGate({
  draft,
  onChange,
  onSubmit,
}: {
  draft: UserProfileDraft
  onChange: (draft: UserProfileDraft) => void
  onSubmit: () => void
}) {
  return (
    <div className="auth-shell">
      <div className="auth-backdrop" />
      <div className="auth-layout">
        <section className="auth-hero">
          <div className="auth-brand">
            <Sparkles size={18} />
            <span>Canvas Alpha</span>
          </div>
          <h1>进入你的个人工作台</h1>
          <p>
            先创建一个本机档案。每个访问者会保留自己的默认风格、自选池和布局密度。
          </p>
          <div className="auth-notes">
            <div>
              <ShieldCheck size={16} />
              <span>本地保存，先从浏览器开始</span>
            </div>
            <div>
              <ShieldCheck size={16} />
              <span>风格、偏好与自选池独立</span>
            </div>
          </div>
        </section>

        <PhysicalPanel as="section" className="auth-panel">
          <div className="panel-heading">
            <span>个人档案</span>
            <strong>登录 / 进入</strong>
          </div>

          <label className="auth-field">
            <span>称呼</span>
            <input
              value={draft.displayName}
              onChange={(event) =>
                onChange({ ...draft, displayName: event.target.value })
              }
              placeholder="例如：晨风"
              autoComplete="nickname"
            />
          </label>

          <div className="auth-choice-group">
            <span>默认风险</span>
            <div className="choice-grid">
              {riskOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={draft.riskProfile === option.value ? 'is-active' : ''}
                  onClick={() => onChange({ ...draft, riskProfile: option.value })}
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-choice-group">
            <span>关注方向</span>
            <div className="choice-grid">
              {focusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={draft.focusPreset === option.value ? 'is-active' : ''}
                  onClick={() => onChange({ ...draft, focusPreset: option.value })}
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-choice-group">
            <span>界面密度</span>
            <div className="choice-grid choice-grid--dense">
              {densityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={draft.density === option.value ? 'is-active' : ''}
                  onClick={() => onChange({ ...draft, density: option.value })}
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="auth-submit" onClick={onSubmit}>
            <span>进入工作台</span>
            <ArrowRight size={18} />
          </button>
        </PhysicalPanel>
      </div>
    </div>
  )
}
