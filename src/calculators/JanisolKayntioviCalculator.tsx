import React, { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import SettingsModal, { GapSize, NumberOfPanes } from '../components/SettingsModal'
import SaveLoadModal from '../components/SaveLoadModal'
import { SavedCalculation } from '../services/StorageService'

interface CalculationResults {
  lasilista: Array<{ pystylista: number; vaakalista: number }>
  uretaani: Array<{ korkeus: number; leveys: number }>
  potkupelti: Array<{ korkeus: number; leveys: number }>
  harjalista: number[]
}

const JanisolKayntioviCalculator: React.FC = () => {
  const { colors, theme } = useTheme()
  const [kayntiovenLeveys, setKayntiovenLeveys] = useState<string>('')
  const [potkupellinKorkeus, setPotkupellinKorkeus] = useState<string>('')
  const [ruudunKorkeudet, setRuudunKorkeudet] = useState<{ [key: number]: string }>({})
  const [gapSize, setGapSize] = useState<GapSize>(8)
  const [numberOfPanes, setNumberOfPanes] = useState<NumberOfPanes>(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSaveLoadOpen, setIsSaveLoadOpen] = useState(false)
  const [results, setResults] = useState<CalculationResults | null>(null)

  const calculate = () => {
    const kayntioviLeveys = parseFloat(kayntiovenLeveys)
    const potkupellinKorkeusNum = parseFloat(potkupellinKorkeus)

    if (!kayntioviLeveys || !potkupellinKorkeusNum) {
      alert('Täytä kaikki kentät')
      return
    }

    // Gap adjustments
    let sisapeltiKorkeusAdjustment = 0
    let ulkopeltiKorkeusAdjustment = 0

    if (gapSize === 10) {
      sisapeltiKorkeusAdjustment = 32 + 10  // +10mm lisää sisäpeltien korkeuteen
      ulkopeltiKorkeusAdjustment = 7
    } else if (gapSize === 15) {
      sisapeltiKorkeusAdjustment = 17 + 10  // +10mm lisää sisäpeltien korkeuteen
      ulkopeltiKorkeusAdjustment = 2
    }

    // Special logic for potkupellin korkeus > 310mm
    const isExtraNarrow = potkupellinKorkeusNum > 310
    const extraNarrowAdjustment = isExtraNarrow ? -5 : 0
    // Janisol: kaikki pellit ovat aina -2mm matalampia
    const heightAdjustment = -2

    // Uretaani
    const kayntiovenUretaaniKorkeus = potkupellinKorkeusNum - 126
    const kayntiovenUretaaniLeveys = kayntioviLeveys + 46

    // Potkupelti - Käyntiovi
    const kayntiovenSisapeltiKorkeus = potkupellinKorkeusNum - 65 + sisapeltiKorkeusAdjustment + heightAdjustment
    const kayntiovenSisapeltiLeveys = kayntioviLeveys + 115
    const kayntiovenUlkopeltiKorkeus = potkupellinKorkeusNum - 16 + ulkopeltiKorkeusAdjustment + heightAdjustment
    const kayntiovenUlkopeltiLeveys = kayntioviLeveys + 165 + extraNarrowAdjustment

    // Harjalista
    const kayntiovenHarjalista = kayntioviLeveys + 141

    // Lasilista
    const lasilistaResults: Array<{ pystylista: number; vaakalista: number }> = []
    
    if (numberOfPanes === 1) {
      const ruudunKorkeus = parseFloat(ruudunKorkeudet[1] || potkupellinKorkeus)
      if (ruudunKorkeus) {
        lasilistaResults.push({
          pystylista: ruudunKorkeus + 41,
          vaakalista: kayntioviLeveys + 3
        })
      }
    } else {
      for (let i = 1; i <= numberOfPanes; i++) {
        const ruudunKorkeus = parseFloat(ruudunKorkeudet[i] || '0')
        if (ruudunKorkeus) {
          lasilistaResults.push({
            pystylista: ruudunKorkeus + 41,
            vaakalista: kayntioviLeveys + 3
          })
        }
      }
    }

    setResults({
      lasilista: lasilistaResults,
      uretaani: [
        { korkeus: kayntiovenUretaaniKorkeus, leveys: kayntiovenUretaaniLeveys }
      ],
      potkupelti: [
        { korkeus: kayntiovenSisapeltiKorkeus, leveys: kayntiovenSisapeltiLeveys },
        { korkeus: kayntiovenUlkopeltiKorkeus, leveys: kayntiovenUlkopeltiLeveys }
      ],
      harjalista: [kayntiovenHarjalista]
    })
  }

  const handleRuudunKorkeusChange = (paneIndex: number, value: string) => {
    setRuudunKorkeudet(prev => ({
      ...prev,
      [paneIndex]: value
    }))
  }

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

  return (
    <div style={{
      backgroundColor: colors.surface,
      padding: '30px',
      borderRadius: '12px',
      boxShadow: theme === 'dark' 
        ? '0 4px 12px rgba(0,0,0,0.4)' 
        : '0 4px 12px rgba(0,0,0,0.1)',
      border: `1px solid ${colors.border}`,
      transition: 'all 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: colors.primary, fontSize: '1.8rem', fontWeight: '700' }}>Janisol Käyntiovi</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setIsSaveLoadOpen(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: colors.success,
              color: colors.surface,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.3s',
              boxShadow: theme === 'dark' 
                ? '0 2px 8px rgba(46, 204, 113, 0.4)' 
                : '0 2px 8px rgba(39, 174, 96, 0.3)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            💾 Tallenna/Lataa
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
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
            ⚙️ Asetukset
          </button>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        gapSize={gapSize}
        onGapSizeChange={setGapSize}
        numberOfPanes={numberOfPanes}
        onNumberOfPanesChange={(panes) => {
          setNumberOfPanes(panes)
          setRuudunKorkeudet({})
        }}
      />

      <SaveLoadModal
        isOpen={isSaveLoadOpen}
        onClose={() => setIsSaveLoadOpen(false)}
        onLoad={(calc: SavedCalculation) => {
          setKayntiovenLeveys(calc.inputs.kayntiovenLeveys || '')
          setPotkupellinKorkeus(calc.inputs.potkupellinKorkeus)
          setRuudunKorkeudet(calc.inputs.ruudunKorkeudet)
          setGapSize(calc.inputs.gapSize as GapSize)
          setNumberOfPanes(calc.inputs.numberOfPanes as NumberOfPanes)
          setResults(calc.results)
        }}
        currentCalculation={results ? {
          calculatorType: 'Janisol Käyntiovi',
          inputs: {
            potkupellinKorkeus,
            ruudunKorkeudet,
            gapSize,
            numberOfPanes,
            kayntiovenLeveys
          },
          results
        } : undefined}
      />

      <div style={{ display: 'grid', gap: '20px', marginBottom: '20px' }}>
        <div>
          <label style={labelStyle}>
            Käyntioven leveys (mm):
          </label>
          <input
            type="number"
            value={kayntiovenLeveys}
            onChange={(e) => setKayntiovenLeveys(e.target.value)}
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = colors.primary
              e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary}33`
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = colors.border
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        <div>
          <label style={labelStyle}>
            Potkupellin oletuskorkeus (mm):
          </label>
          <input
            type="number"
            value={potkupellinKorkeus}
            onChange={(e) => setPotkupellinKorkeus(e.target.value)}
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = colors.primary
              e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary}33`
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = colors.border
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        {numberOfPanes === 1 ? (
          <div>
            <label style={labelStyle}>
              Ruudun korkeus (mm):
            </label>
            <input
              type="number"
              value={ruudunKorkeudet[1] || ''}
              onChange={(e) => handleRuudunKorkeusChange(1, e.target.value)}
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary}33`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = colors.border
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
        ) : (
          <div>
            <label style={labelStyle}>
              Ruutujen korkeudet (mm):
            </label>
            {Array.from({ length: numberOfPanes }, (_, i) => i + 1).map((paneIndex) => (
              <div key={paneIndex} style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: colors.textSecondary }}>
                  Ruutu {paneIndex} korkeus:
                </label>
                <input
                  type="number"
                  value={ruudunKorkeudet[paneIndex] || ''}
                  onChange={(e) => handleRuudunKorkeusChange(paneIndex, e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = colors.primary
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary}33`
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = colors.border
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={calculate}
        style={{
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
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = theme === 'dark' 
            ? '0 6px 16px rgba(46, 204, 113, 0.4)' 
            : '0 6px 16px rgba(39, 174, 96, 0.4)'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = theme === 'dark' 
            ? '0 4px 12px rgba(46, 204, 113, 0.3)' 
            : '0 4px 12px rgba(39, 174, 96, 0.3)'
        }}
      >
        🧮 Laske
      </button>

      {results && (
        <div style={{
          backgroundColor: theme === 'dark' ? colors.background : '#f8f9fa',
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          boxShadow: theme === 'dark' 
            ? '0 2px 8px rgba(0,0,0,0.3)' 
            : '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '15px', color: colors.primary, fontSize: '1.5rem', fontWeight: '700' }}>📊 Tulokset:</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px', color: colors.text, fontSize: '1.1rem', fontWeight: '600' }}>Lasilista</h4>
            {results.lasilista.length > 0 ? (
              <div>
                {/* Yhdistetään samankokoiset pystylistat */}
                {(() => {
                  const grouped = new Map<number, number>()
                  results.lasilista.forEach((lista) => {
                    const korkeus = Math.round(lista.pystylista)
                    grouped.set(korkeus, (grouped.get(korkeus) || 0) + 2)
                  })
                  return Array.from(grouped.entries())
                    .sort((a, b) => b[0] - a[0]) // Lajitellaan korkeuden mukaan laskevasti
                    .map(([korkeus, maara], index) => (
                      <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace', color: colors.text }}>
                        -{korkeus} X {maara}
                      </div>
                    ))
                })()}
                {results.lasilista.length > 0 && (
                  <div style={{ marginTop: '5px', fontFamily: 'monospace', color: colors.text }}>
                    -{Math.round(results.lasilista[0].vaakalista)} X {results.lasilista.length * 2}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: colors.textSecondary }}>Ei lasilistoja</div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px', color: colors.text, fontSize: '1.1rem', fontWeight: '600' }}>Uretaani</h4>
            {results.uretaani.map((u, index) => (
              <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace', color: colors.text }}>
                -{Math.round(u.korkeus)} X {Math.round(u.leveys)}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px', color: colors.text, fontSize: '1.1rem', fontWeight: '600' }}>Potkupelti</h4>
            {results.potkupelti.map((p, index) => (
              <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace', color: colors.text }}>
                -{Math.round(p.korkeus)} X {Math.round(p.leveys)}
              </div>
            ))}
          </div>

          <div>
            <h4 style={{ marginBottom: '10px', color: colors.text, fontSize: '1.1rem', fontWeight: '600' }}>Harjalista</h4>
            {results.harjalista.map((h, index) => (
              <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace', color: colors.text }}>
                -{Math.round(h)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default JanisolKayntioviCalculator

