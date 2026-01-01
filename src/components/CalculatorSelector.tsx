import React from 'react'
import { useTheme } from '../contexts/ThemeContext'

type CalculatorType = 
  | 'janisol-pariovi'
  | 'janisol-kayntiovi'
  | 'economy-pariovi'
  | 'economy-kayntiovi'

interface CalculatorSelectorProps {
  activeCalculator: CalculatorType
  onSelect: (calculator: CalculatorType) => void
}

const CalculatorSelector: React.FC<CalculatorSelectorProps> = ({
  activeCalculator,
  onSelect,
}) => {
  const { colors, theme } = useTheme()
  
  const calculators = [
    { id: 'janisol-pariovi' as CalculatorType, name: 'Janisol Pariovi' },
    { id: 'janisol-kayntiovi' as CalculatorType, name: 'Janisol Käyntiovi' },
    { id: 'economy-pariovi' as CalculatorType, name: 'Economy Pariovi' },
    { id: 'economy-kayntiovi' as CalculatorType, name: 'Economy Käyntiovi' },
  ]

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      marginBottom: '30px',
      flexWrap: 'wrap',
      justifyContent: 'center'
    }}>
      {calculators.map((calc) => {
        const isActive = activeCalculator === calc.id
        return (
          <button
            key={calc.id}
            onClick={() => onSelect(calc.id)}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              border: `2px solid ${colors.primary}`,
              borderRadius: '8px',
              backgroundColor: isActive ? colors.primary : colors.surface,
              color: isActive ? colors.surface : colors.primary,
              cursor: 'pointer',
              transition: 'all 0.3s',
              fontWeight: isActive ? 'bold' : '600',
              boxShadow: theme === 'dark' && !isActive 
                ? '0 2px 4px rgba(0,0,0,0.2)' 
                : isActive 
                ? '0 4px 8px rgba(196, 30, 58, 0.3)' 
                : '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = colors.hover
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(196, 30, 58, 0.2)'
              }
            }}
            onMouseOut={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = colors.surface
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = theme === 'dark' 
                  ? '0 2px 4px rgba(0,0,0,0.2)' 
                  : '0 2px 4px rgba(0,0,0,0.1)'
              }
            }}
          >
            {calc.name}
          </button>
        )
      })}
    </div>
  )
}

export default CalculatorSelector

