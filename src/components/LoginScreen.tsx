import React, { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'

interface LoginScreenProps {
  onSuccess: () => void
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const { colors, theme } = useTheme()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    // Tarkista onko käyttäjä jo kirjautunut
    const isLoggedIn = localStorage.getItem('terasovi_logged_in')
    if (isLoggedIn === 'true') {
      onSuccess()
    }
  }, [onSuccess])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsChecking(true)

    // Tarkista koodi
    if (code === 'Soma<3') {
      localStorage.setItem('terasovi_logged_in', 'true')
      setTimeout(() => {
        setIsChecking(false)
        onSuccess()
      }, 300)
    } else {
      setIsChecking(false)
      setError('Väärä koodi')
      setCode('')
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: colors.surface,
        padding: '40px',
        borderRadius: '16px',
        boxShadow: theme === 'dark' 
          ? '0 8px 32px rgba(0, 0, 0, 0.6)' 
          : '0 8px 32px rgba(0, 0, 0, 0.2)',
        border: `2px solid ${colors.border}`,
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center'
      }}>
        <h1 style={{
          color: colors.primary,
          fontSize: '2rem',
          fontWeight: '700',
          marginBottom: '10px'
        }}>
          🔒 Teräsovi Mittalaskuri
        </h1>
        <p style={{
          color: colors.textSecondary,
          marginBottom: '30px',
          fontSize: '14px'
        }}>
          Syötä pääsykoodi jatkaaksesi
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError('')
            }}
            placeholder="Pääsykoodi"
            autoFocus
            style={{
              width: '100%',
              padding: '15px',
              border: `2px solid ${error ? '#e74c3c' : colors.border}`,
              borderRadius: '8px',
              fontSize: '18px',
              backgroundColor: theme === 'dark' ? colors.background : colors.surface,
              color: colors.text,
              marginBottom: '15px',
              textAlign: 'center',
              letterSpacing: '2px',
              transition: 'all 0.3s'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = colors.primary
              e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary}33`
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error ? '#e74c3c' : colors.border
              e.currentTarget.style.boxShadow = 'none'
            }}
          />

          {error && (
            <div style={{
              color: '#e74c3c',
              marginBottom: '15px',
              fontSize: '14px',
              fontWeight: '600'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isChecking || !code.trim()}
            style={{
              width: '100%',
              padding: '15px',
              backgroundColor: isChecking || !code.trim() ? colors.border : colors.primary,
              color: colors.surface,
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isChecking || !code.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              boxShadow: theme === 'dark' && !isChecking && code.trim()
                ? '0 4px 12px rgba(196, 30, 58, 0.4)' 
                : 'none'
            }}
            onMouseOver={(e) => {
              if (!isChecking && code.trim()) {
                e.currentTarget.style.backgroundColor = colors.primaryDark
                e.currentTarget.style.transform = 'translateY(-2px)'
              }
            }}
            onMouseOut={(e) => {
              if (!isChecking && code.trim()) {
                e.currentTarget.style.backgroundColor = colors.primary
                e.currentTarget.style.transform = 'translateY(0)'
              }
            }}
          >
            {isChecking ? 'Tarkistetaan...' : 'Kirjaudu'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginScreen



