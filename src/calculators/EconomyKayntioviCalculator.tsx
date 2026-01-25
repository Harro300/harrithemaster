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

const EconomyKayntioviCalculator: React.FC = () => {
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

    // Uretaani
    const kayntiovenUretaaniKorkeus = potkupellinKorkeusNum - 121
    const kayntiovenUretaaniLeveys = kayntioviLeveys + 41

    // Potkupelti - Käyntiovi
    const kayntiovenUlkopeltiKorkeus = potkupellinKorkeusNum - 20 + ulkopeltiKorkeusAdjustment
    const kayntiovenUlkopeltiLeveys = kayntioviLeveys + 160 + extraNarrowAdjustment
    const kayntiovenSisapeltiKorkeus = potkupellinKorkeusNum - 65 + sisapeltiKorkeusAdjustment
    const kayntiovenSisapeltiLeveys = kayntioviLeveys + 110

    // Harjalista
    const kayntiovenHarjalista = kayntioviLeveys + 141

    // Lasilista
    const lasilistaResults: Array<{ pystylista: number; vaakalista: number }> = []
    
    if (numberOfPanes === 1) {
      const ruudunKorkeus = parseFloat(ruudunKorkeudet[1] || potkupellinKorkeus)
      if (ruudunKorkeus) {
        lasilistaResults.push({
          pystylista: ruudunKorkeus + 38,
          vaakalista: kayntioviLeveys - 2
        })
      }
    } else {
      for (let i = 1; i <= numberOfPanes; i++) {
        const ruudunKorkeus = parseFloat(ruudunKorkeudet[i] || '0')
        if (ruudunKorkeus) {
          lasilistaResults.push({
            pystylista: ruudunKorkeus + 38,
            vaakalista: kayntioviLeveys - 2
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
        { korkeus: kayntiovenUlkopeltiKorkeus, leveys: kayntiovenUlkopeltiLeveys },
        { korkeus: kayntiovenSisapeltiKorkeus, leveys: kayntiovenSisapeltiLeveys }
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

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '30px',
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: colors.primary, fontSize: '1.8rem', fontWeight: '700' }}>Economy Käyntiovi</h2>
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
          calculatorType: 'Economy Käyntiovi',
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Käyntioven leveys (mm):
          </label>
          <input
            type="number"
            value={kayntiovenLeveys}
            onChange={(e) => setKayntiovenLeveys(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Potkupellin oletuskorkeus (mm):
          </label>
          <input
            type="number"
            value={potkupellinKorkeus}
            onChange={(e) => setPotkupellinKorkeus(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px'
            }}
          />
        </div>

        {numberOfPanes === 1 ? (
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Ruudun korkeus (mm):
            </label>
            <input
              type="number"
              value={ruudunKorkeudet[1] || ''}
              onChange={(e) => handleRuudunKorkeusChange(1, e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '16px'
              }}
            />
          </div>
        ) : (
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Ruutujen korkeudet (mm):
            </label>
            {Array.from({ length: numberOfPanes }, (_, i) => i + 1).map((paneIndex) => (
              <div key={paneIndex} style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>
                  Ruutu {paneIndex} korkeus:
                </label>
                <input
                  type="number"
                  value={ruudunKorkeudet[paneIndex] || ''}
                  onChange={(e) => handleRuudunKorkeusChange(paneIndex, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '16px'
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
          backgroundColor: '#27ae60',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '30px'
        }}
      >
        Laske
      </button>

      {results && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>Tulokset:</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px', color: '#34495e' }}>Lasilista</h4>
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
                      <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace' }}>
                        -{korkeus} X {maara}
                      </div>
                    ))
                })()}
                {results.lasilista.length > 0 && (
                  <div style={{ marginTop: '5px', fontFamily: 'monospace' }}>
                    -{Math.round(results.lasilista[0].vaakalista)} X {results.lasilista.length * 2}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: '#999' }}>Ei lasilistoja</div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px', color: '#34495e' }}>Uretaani</h4>
            {results.uretaani.map((u, index) => (
              <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace' }}>
                -{Math.round(u.korkeus)} X {Math.round(u.leveys)}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px', color: '#34495e' }}>Potkupelti</h4>
            {results.potkupelti.map((p, index) => (
              <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace' }}>
                -{Math.round(p.korkeus)} X {Math.round(p.leveys)}
              </div>
            ))}
          </div>

          <div>
            <h4 style={{ marginBottom: '10px', color: '#34495e' }}>Harjalista</h4>
            {results.harjalista.map((h, index) => (
              <div key={index} style={{ marginBottom: '5px', fontFamily: 'monospace' }}>
                -{Math.round(h)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default EconomyKayntioviCalculator

