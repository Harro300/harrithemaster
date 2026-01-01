import React from 'react'
import { useTheme } from '../contexts/ThemeContext'

export type GapSize = 8 | 10 | 15
export type NumberOfPanes = 1 | 2 | 3 | 4 | 5

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  gapSize: GapSize
  onGapSizeChange: (gap: GapSize) => void
  numberOfPanes: NumberOfPanes
  onNumberOfPanesChange: (panes: NumberOfPanes) => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  gapSize,
  onGapSizeChange,
  numberOfPanes,
  onNumberOfPanesChange,
}) => {
  const { colors, theme } = useTheme()
  
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          padding: '30px',
          borderRadius: '12px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: theme === 'dark' 
            ? '0 8px 24px rgba(0, 0, 0, 0.6)' 
            : '0 8px 24px rgba(0, 0, 0, 0.2)',
          border: `1px solid ${colors.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '20px', color: colors.primary, fontSize: '1.5rem', fontWeight: '700' }}>⚙️ Asetukset</h2>
        
        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: colors.text }}>
            Rako:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {([8, 10, 15] as GapSize[]).map((gap) => (
              <label
                key={gap}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: gapSize === gap 
                    ? `${colors.primary}22` 
                    : 'transparent',
                  color: colors.text,
                  transition: 'all 0.2s',
                  border: gapSize === gap 
                    ? `2px solid ${colors.primary}` 
                    : `2px solid transparent`,
                }}
                onMouseOver={(e) => {
                  if (gapSize !== gap) {
                    e.currentTarget.style.backgroundColor = colors.hover
                  }
                }}
                onMouseOut={(e) => {
                  if (gapSize !== gap) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <input
                  type="radio"
                  name="gap"
                  value={gap}
                  checked={gapSize === gap}
                  onChange={() => onGapSizeChange(gap)}
                  style={{ marginRight: '10px', accentColor: colors.primary }}
                />
                {gap}mm rako {gap === 8 && '(default)'}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: colors.text }}>
            Ruutujen määrä:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {([1, 2, 3, 4, 5] as NumberOfPanes[]).map((panes) => (
              <label
                key={panes}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: numberOfPanes === panes 
                    ? `${colors.primary}22` 
                    : 'transparent',
                  color: colors.text,
                  transition: 'all 0.2s',
                  border: numberOfPanes === panes 
                    ? `2px solid ${colors.primary}` 
                    : `2px solid transparent`,
                }}
                onMouseOver={(e) => {
                  if (numberOfPanes !== panes) {
                    e.currentTarget.style.backgroundColor = colors.hover
                  }
                }}
                onMouseOut={(e) => {
                  if (numberOfPanes !== panes) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <input
                  type="radio"
                  name="panes"
                  value={panes}
                  checked={numberOfPanes === panes}
                  onChange={() => onNumberOfPanesChange(panes)}
                  style={{ marginRight: '10px', accentColor: colors.primary }}
                />
                {panes} ruutu{panes === 1 ? '' : 'a'} {panes === 1 && '(default)'}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '20px',
            padding: '12px 20px',
            backgroundColor: colors.primary,
            color: colors.surface,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            width: '100%',
            transition: 'all 0.3s',
            boxShadow: theme === 'dark' 
              ? '0 2px 8px rgba(196, 30, 58, 0.4)' 
              : '0 2px 8px rgba(196, 30, 58, 0.3)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = colors.primaryDark
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = colors.primary
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Sulje
        </button>
      </div>
    </div>
  )
}

export default SettingsModal

