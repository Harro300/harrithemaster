import { SavedCalculation } from './StorageService'

// jsPDF will be loaded dynamically from CDN
declare global {
  interface Window {
    jsPDF: any
  }
}

export const generatePDF = async (calculation: SavedCalculation): Promise<void> => {
  // Load jsPDF from CDN if not already loaded
  if (!window.jsPDF) {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    document.head.appendChild(script)
    
    await new Promise((resolve, reject) => {
      script.onload = resolve
      script.onerror = reject
      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('jsPDF loading timeout')), 10000)
    })
  }

  const { jsPDF } = window.jsPDF
  const doc = new jsPDF()

  // Colors
  const primaryColor = [196, 30, 58] // Red
  const darkGray = [26, 26, 26]
  const lightGray = [245, 245, 245]
  const borderGray = [224, 224, 224]

  // Header
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, 210, 30, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Teräsovi Mittalaskuri', 105, 20, { align: 'center' })

  // Calculator name
  doc.setTextColor(...darkGray)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(calculation.calculatorType, 20, 45)

  // Saved name
  if (calculation.name) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Tallennettu: ${calculation.name}`, 20, 52)
  }

  // Date
  const date = new Date(calculation.timestamp)
  doc.text(`Päivämäärä: ${date.toLocaleDateString('fi-FI')} ${date.toLocaleTimeString('fi-FI')}`, 20, 58)

  let yPos = 70

  // Input values section
  doc.setFillColor(...lightGray)
  doc.rect(15, yPos - 5, 180, 8, 'F')
  
  doc.setTextColor(...darkGray)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Syötetyt arvot', 20, yPos)

  yPos += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)

  if (calculation.inputs.kayntiovenLeveys) {
    doc.text(`Käyntioven leveys: ${calculation.inputs.kayntiovenLeveys} mm`, 20, yPos)
    yPos += 7
  }

  if (calculation.inputs.lisaovenLeveys) {
    doc.text(`Lisäoven leveys: ${calculation.inputs.lisaovenLeveys} mm`, 20, yPos)
    yPos += 7
  }

  doc.text(`Potkupellin oletuskorkeus: ${calculation.inputs.potkupellinKorkeus} mm`, 20, yPos)
  yPos += 7

  doc.text(`Rako: ${calculation.inputs.gapSize} mm`, 20, yPos)
  yPos += 7

  doc.text(`Ruutujen määrä: ${calculation.inputs.numberOfPanes}`, 20, yPos)
  yPos += 7

  if (Object.keys(calculation.inputs.ruudunKorkeudet).length > 0) {
    doc.text('Ruutujen korkeudet:', 20, yPos)
    yPos += 7
    Object.entries(calculation.inputs.ruudunKorkeudet).forEach(([key, value]) => {
      if (value) {
        doc.text(`  Ruutu ${key}: ${value} mm`, 25, yPos)
        yPos += 6
      }
    })
  }

  yPos += 5

  // Results section
  doc.setFillColor(...lightGray)
  doc.rect(15, yPos - 5, 180, 8, 'F')
  
  doc.setTextColor(...darkGray)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Lasketut tulokset', 20, yPos)

  yPos += 10

  // Lasilista
  if (calculation.results.lasilista.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('Lasilista', 20, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)

    // Yhdistetään samankokoiset pystylistat
    const groupedPystylistat = new Map<number, number>()
    calculation.results.lasilista.forEach((lista) => {
      const korkeus = Math.round(lista.pystylista)
      groupedPystylistat.set(korkeus, (groupedPystylistat.get(korkeus) || 0) + 2)
    })
    
    // Lajitellaan korkeuden mukaan laskevasti ja näytetään
    Array.from(groupedPystylistat.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([korkeus, maara]) => {
        doc.text(`  Pystylista: ${korkeus} x ${maara}`, 25, yPos)
        yPos += 6
      })

    if (calculation.results.lasilista.length > 0) {
      // Pariovissa vaakalistat: käyntioven ja lisäoven vaakalistat erikseen
      const ruutujenMaara = calculation.results.lasilista.length / 2 // Jokainen ruutu tuplattuna
      doc.text(`  Käyntioven vaakalista: ${Math.round(calculation.results.lasilista[0].vaakalista)} x ${ruutujenMaara}`, 25, yPos)
      yPos += 6
      
      // Lisäoven vaakalista (pariovissa)
      if (calculation.results.lisaovenVaakalista) {
        doc.text(`  Lisäoven vaakalista: ${Math.round(calculation.results.lisaovenVaakalista)} x ${ruutujenMaara}`, 25, yPos)
        yPos += 8
      } else {
        yPos += 2
      }
    }
  }

  // Uretaani
  if (calculation.results.uretaani.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('Uretaani', 20, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)

    calculation.results.uretaani.forEach((u, index) => {
      doc.text(`  ${index + 1}. ${Math.round(u.korkeus)} x ${Math.round(u.leveys)} mm`, 25, yPos)
      yPos += 6
    })
    yPos += 2
  }

  // Potkupelti
  if (calculation.results.potkupelti.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('Potkupelti', 20, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)

    calculation.results.potkupelti.forEach((p, index) => {
      doc.text(`  ${index + 1}. ${Math.round(p.korkeus)} x ${Math.round(p.leveys)} mm`, 25, yPos)
      yPos += 6
    })
    yPos += 2
  }

  // Harjalista
  if (calculation.results.harjalista.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('Harjalista', 20, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)

    calculation.results.harjalista.forEach((h, index) => {
      doc.text(`  ${index + 1}. ${Math.round(h)} mm`, 25, yPos)
      yPos += 6
    })
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height
  doc.setDrawColor(...borderGray)
  doc.line(15, pageHeight - 20, 195, pageHeight - 20)
  
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text('Teräsovi Mittalaskuri - Generoitu automaattisesti', 105, pageHeight - 10, { align: 'center' })

  // Save PDF
  const fileName = calculation.name 
    ? `${calculation.name}_${new Date(calculation.timestamp).toISOString().split('T')[0]}.pdf`
    : `terasovi_${calculation.calculatorType.replace(/\s+/g, '_')}_${new Date(calculation.timestamp).toISOString().split('T')[0]}.pdf`
  
  doc.save(fileName)
}

