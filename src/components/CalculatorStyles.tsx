import { useTheme } from '../contexts/ThemeContext'

export const useCalculatorStyles = () => {
  const { colors, theme } = useTheme()

  const containerStyle = {
    backgroundColor: colors.surface,
    padding: '30px',
    borderRadius: '12px',
    boxShadow: theme === 'dark' 
      ? '0 4px 12px rgba(0,0,0,0.4)' 
      : '0 4px 12px rgba(0,0,0,0.1)',
    border: `1px solid ${colors.border}`,
    transition: 'all 0.3s ease'
  } as React.CSSProperties

  const headerStyle = {
    color: colors.primary,
    fontSize: '1.8rem',
    fontWeight: '700' as const
  }

  const settingsButtonStyle = {
    padding: '10px 20px',
    backgroundColor: colors.primary,
    color: colors.surface,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s',
    boxShadow: theme === 'dark' 
      ? '0 2px 8px rgba(196, 30, 58, 0.4)' 
      : '0 2px 8px rgba(196, 30, 58, 0.3)'
  } as React.CSSProperties

  const inputStyle = {
    width: '100%',
    padding: '12px',
    border: `2px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '16px',
    backgroundColor: theme === 'dark' ? colors.background : colors.surface,
    color: colors.text,
    transition: 'all 0.3s'
  } as React.CSSProperties

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: colors.text
  } as React.CSSProperties

  const calculateButtonStyle = {
    width: '100%',
    padding: '15px',
    backgroundColor: colors.success,
    color: colors.surface,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '30px',
    transition: 'all 0.3s',
    boxShadow: theme === 'dark' 
      ? '0 4px 12px rgba(46, 204, 113, 0.3)' 
      : '0 4px 12px rgba(39, 174, 96, 0.3)'
  } as React.CSSProperties

  const resultsContainerStyle = {
    backgroundColor: theme === 'dark' ? colors.background : '#f8f9fa',
    padding: '20px',
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    boxShadow: theme === 'dark' 
      ? '0 2px 8px rgba(0,0,0,0.3)' 
      : '0 2px 8px rgba(0,0,0,0.1)'
  } as React.CSSProperties

  const resultsTitleStyle = {
    marginBottom: '15px',
    color: colors.primary,
    fontSize: '1.5rem',
    fontWeight: '700' as const
  }

  const resultsSectionTitleStyle = {
    marginBottom: '10px',
    color: colors.text,
    fontSize: '1.1rem',
    fontWeight: '600' as const
  }

  const resultTextStyle = {
    marginBottom: '5px',
    fontFamily: 'monospace',
    color: colors.text
  } as React.CSSProperties

  return {
    colors,
    theme,
    containerStyle,
    headerStyle,
    settingsButtonStyle,
    inputStyle,
    labelStyle,
    calculateButtonStyle,
    resultsContainerStyle,
    resultsTitleStyle,
    resultsSectionTitleStyle,
    resultTextStyle
  }
}



