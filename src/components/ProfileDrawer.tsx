import { LogOut, Save } from 'lucide-react'
import { PhysicalPanel } from './PhysicalPanel'
import type { UserProfileDraft } from '../lib/profileStore'
import type { FocusPreset, RiskProfile, UiDensity } from '../types/market'

const riskOptions: Array<{
  value: RiskProfile
  label: string
}> = [
  { value: 'low', label: '低风险' },
  { value: 'medium', label: '中风险' },
  { value: 'high', label: '高风险' },
]

const focusOptions: Array<{
  value: FocusPreset
  label: string
}> = [
  { value: 'defensive', label: '稳健底仓' },
  { value: 'balanced', label: '均衡跟随' },
  { value: 'aggressive', label: '热点进攻' },
]

const densityOptions: Array<{
  value: UiDensity
  label: string
}> = [
  { value: 'comfortable', label: '标准密度' },
  { value: 'compact', label: '紧凑密度' },
]

export function ProfileDrawer({
  draft,
  onChange,
  onSave,
  onLogout,
}: {
  draft: UserProfileDraft
  onChange: (draft: UserProfileDraft) => void
  onSave: () => void
  onLogout: () => void
}) {
  return (
    <PhysicalPanel as="section" className="profile-drawer" intensity="soft">
      <div className="panel-heading">
        <span>个人设置</span>
        <strong>本机档案</strong>
      </div>

      <label className="auth-field auth-field--drawer">
        <span>称呼</span>
        <input
          value={draft.displayName}
          onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
        />
      </label>

      <div className="drawer-choice">
        <span>默认风险</span>
        <div className="drawer-choice__row">
          {riskOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={draft.riskProfile === option.value ? 'is-active' : ''}
              onClick={() => onChange({ ...draft, riskProfile: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-choice">
        <span>关注方向</span>
        <div className="drawer-choice__row">
          {focusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={draft.focusPreset === option.value ? 'is-active' : ''}
              onClick={() => onChange({ ...draft, focusPreset: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-choice">
        <span>界面密度</span>
        <div className="drawer-choice__row">
          {densityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={draft.density === option.value ? 'is-active' : ''}
              onClick={() => onChange({ ...draft, density: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-drawer__actions">
        <button type="button" className="toolbar-button is-active" onClick={onSave}>
          <Save size={16} />
          <span>保存</span>
        </button>
        <button type="button" className="toolbar-button" onClick={onLogout}>
          <LogOut size={16} />
          <span>退出</span>
        </button>
      </div>
    </PhysicalPanel>
  )
}
