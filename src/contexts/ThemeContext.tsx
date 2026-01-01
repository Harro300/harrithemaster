import React, { createContext, useContext, useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  colors: {
    primary: string
    primaryDark: string
    primaryLight: string
    background: string
    surface: string
    text: string
    textSecondary: string
    border: string
    success: string
    hover: string
  }
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

const lightColors = {
  primary: '#c41e3a', // Punainen
  primaryDark: '#a01a2e',
  primaryLight: '#e63950',
  background: '#f5f5f5',
  surface: '#ffffff',
  text: '#1a1a1a',
  textSecondary: '#4a4a4a',
  border: '#e0e0e0',
  success: '#27ae60',
  hover: '#f8f8f8',
}

const darkColors = {
  primary: '#e63950', // Vaaleampi punainen dark modessa
  primaryDark: '#c41e3a',
  primaryLight: '#ff4d6d',
  background: '#1a1a1a',
  surface: '#2d2d2d',
  text: '#f5f5f5',
  textSecondary: '#b0b0b0',
  border: '#404040',
  success: '#2ecc71',
  hover: '#3a3a3a',
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    return (saved === 'dark' || saved === 'light') ? saved : 'light'
  })

  useEffect(() => {
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const colors = theme === 'light' ? lightColors : darkColors

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}



