export interface SavedCalculation {
  id: string
  name: string
  calculatorType: string
  inputs: {
    kayntiovenLeveys?: string
    lisaovenLeveys?: string
    potkupellinKorkeus: string
    ruudunKorkeudet: { [key: number]: string }
    gapSize: number
    numberOfPanes: number
  }
  results: {
    lasilista: Array<{ pystylista: number; vaakalista: number }>
    lisaovenVaakalista?: number
    uretaani: Array<{ korkeus: number; leveys: number }>
    potkupelti: Array<{ korkeus: number; leveys: number }>
    harjalista: number[]
  }
  timestamp: number
}

class StorageService {
  private readonly STORAGE_KEY = 'terasovi_calculations'

  save(calculation: Omit<SavedCalculation, 'id' | 'timestamp'>): string {
    const saved: SavedCalculation = {
      ...calculation,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    }

    const existing = this.getAll()
    existing.push(saved)
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing))
    return saved.id
  }

  getAll(): SavedCalculation[] {
    const data = localStorage.getItem(this.STORAGE_KEY)
    return data ? JSON.parse(data) : []
  }

  getById(id: string): SavedCalculation | null {
    const all = this.getAll()
    return all.find(calc => calc.id === id) || null
  }

  delete(id: string): boolean {
    const all = this.getAll()
    const filtered = all.filter(calc => calc.id !== id)
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))
    return filtered.length < all.length
  }

  update(id: string, updates: Partial<SavedCalculation>): boolean {
    const all = this.getAll()
    const index = all.findIndex(calc => calc.id === id)
    if (index === -1) return false

    all[index] = { ...all[index], ...updates }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all))
    return true
  }
}

export const storageService = new StorageService()

