import React, { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { storageService, SavedCalculation } from '../services/StorageService'
import { generatePDF } from '../services/PDFService'

interface SaveLoadModalProps {
  isOpen: boolean
  onClose: () => void
  onLoad: (calculation: SavedCalculation) => void
  currentCalculation?: {
    calculatorType: string
    inputs: SavedCalculation['inputs']
    results: SavedCalculation['results']
  }
}

const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  isOpen,
  onClose,
  onLoad,
  currentCalculation
}) => {
  const { colors, theme } = useTheme()
  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([])
  const [saveName, setSaveName] = useState('')
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('load')

  useEffect(() => {
    if (isOpen) {
      setSavedCalculations(storageService.getAll())
    }
  }, [isOpen])

  const handleSave = () => {
    if (!currentCalculation || !saveName.trim()) {
      alert('Anna nimi tallennukselle')
      return
    }

    storageService.save({
      name: saveName.trim(),
      calculatorType: currentCalculation.calculatorType,
      inputs: currentCalculation.inputs,
      results: currentCalculation.results
    })

    setSaveName('')
    setSavedCalculations(storageService.getAll())
    setActiveTab('load')
    alert('Tallennettu!')
  }

  const handleLoad = (calculation: SavedCalculation) => {
    onLoad(calculation)
    onClose()
  }

  const handleDelete = (id: string) => {
    if (confirm('Haluatko varmasti poistaa tämän tallennuksen?')) {
      storageService.delete(id)
      setSavedCalculations(storageService.getAll())
    }
  }

  const handleExportPDF = async (calculation: SavedCalculation) => {
    try {
      await generatePDF(calculation)
    } catch (error) {
      console.error('PDF generation error:', error)
      alert('PDF:n luominen epäonnistui')
    }
  }

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
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: theme === 'dark' 
            ? '0 8px 24px rgba(0, 0, 0, 0.6)' 
            : '0 8px 24px rgba(0, 0, 0, 0.2)',
          border: `1px solid ${colors.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '20px', color: colors.primary, fontSize: '1.5rem', fontWeight: '700' }}>
          💾 Tallennukset
        </h2>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: `2px solid ${colors.border}` }}>
          <button
            onClick={() => setActiveTab('load')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'load' ? colors.primary : 'transparent',
              color: activeTab === 'load' ? colors.surface : colors.text,
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'all 0.3s'
            }}
          >
            Lataa
          </button>
          <button
            onClick={() => setActiveTab('save')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'save' ? colors.primary : 'transparent',
              color: activeTab === 'save' ? colors.surface : colors.text,
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'all 0.3s'
            }}
          >
            Tallenna
          </button>
        </div>

        {/* Load Tab */}
        {activeTab === 'load' && (
          <div>
            {savedCalculations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
                Ei tallennettuja laskelmia
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {savedCalculations
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((calc) => (
                    <div
                      key={calc.id}
                      style={{
                        padding: '15px',
                        border: `2px solid ${colors.border}`,
                        borderRadius: '8px',
                        backgroundColor: theme === 'dark' ? colors.background : '#f8f9fa'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', color: colors.text, marginBottom: '5px' }}>
                            {calc.name}
                          </div>
                          <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                            {calc.calculatorType}
                          </div>
                          <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                            {new Date(calc.timestamp).toLocaleString('fi-FI')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button
                            onClick={() => handleLoad(calc)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: colors.primary,
                              color: colors.surface,
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            Lataa
                          </button>
                          <button
                            onClick={() => handleExportPDF(calc)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: colors.success,
                              color: colors.surface,
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => handleDelete(calc.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#e74c3c',
                              color: colors.surface,
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            Poista
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Save Tab */}
        {activeTab === 'save' && (
          <div>
            {!currentCalculation ? (
              <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
                Laske ensin laskelma tallentaaksesi sen
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: colors.text }}>
                  Nimi tallennukselle:
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Esim. Ovi 1, Asiakas X..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${colors.border}`,
                    borderRadius: '8px',
                    fontSize: '16px',
                    backgroundColor: theme === 'dark' ? colors.background : colors.surface,
                    color: colors.text,
                    marginBottom: '20px'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSave()
                    }
                  }}
                />
                <button
                  onClick={handleSave}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: colors.primary,
                    color: colors.surface,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    transition: 'all 0.3s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = colors.primaryDark
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = colors.primary
                  }}
                >
                  💾 Tallenna
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: colors.border,
            color: colors.text,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            width: '100%'
          }}
        >
          Sulje
        </button>
      </div>
    </div>
  )
}

export default SaveLoadModal



