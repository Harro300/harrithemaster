import React, { useState } from 'react'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import LoginScreen from './components/LoginScreen'
import CalculatorSelector from './components/CalculatorSelector'
import JanisolParioviCalculator from './calculators/JanisolParioviCalculator'
import JanisolKayntioviCalculator from './calculators/JanisolKayntioviCalculator'
import EconomyParioviCalculator from './calculators/EconomyParioviCalculator'
import EconomyKayntioviCalculator from './calculators/EconomyKayntioviCalculator'

type CalculatorType = 
  | 'janisol-pariovi'
  | 'janisol-kayntiovi'
  | 'economy-pariovi'
  | 'economy-kayntiovi'

const AppContent: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType>('janisol-pariovi')
  const { colors, theme, toggleTheme } = useTheme()

  // Näytä kirjautumisikkuna jos ei ole kirjautunut
  if (!isLoggedIn) {
    return <LoginScreen onSuccess={() => setIsLoggedIn(true)} />
  }

  const renderCalculator = () => {
    switch (activeCalculator) {
      case 'janisol-pariovi':
        return <JanisolParioviCalculator />
      case 'janisol-kayntiovi':
        return <JanisolKayntioviCalculator />
      case 'economy-pariovi':
        return <EconomyParioviCalculator />
      case 'economy-kayntiovi':
        return <EconomyKayntioviCalculator />
      default:
        return <JanisolParioviCalculator />
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '30px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          margin: 0,
          color: colors.primary,
          fontSize: '2.5rem',
          fontWeight: '700',
          textShadow: theme === 'dark' ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'
        }}>
          Teräsovi Mittalaskuri
        </h1>
        <button
          onClick={toggleTheme}
          style={{
            padding: '12px 20px',
            backgroundColor: colors.surface,
            color: colors.text,
            border: `2px solid ${colors.primary}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            transition: 'all 0.3s',
            boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = colors.primary
            e.currentTarget.style.color = colors.surface
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = colors.surface
            e.currentTarget.style.color = colors.text
          }}
        >
          {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
      </div>
      <CalculatorSelector
        activeCalculator={activeCalculator}
        onSelect={setActiveCalculator}
      />
      {renderCalculator()}
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App

