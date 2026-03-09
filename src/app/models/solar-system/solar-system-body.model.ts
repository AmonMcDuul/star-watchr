export interface SolarSystemBody {

  id: string
  name: string

  type: 'sun' | 'planet' | 'moon' | 'dwarf' | 'asteroid' | 'comet'

  radiusKm?: number
  diameterKm?: number
  massKg?: number

  gravity?: number
  orbitalPeriodDays?: number

  rightAscension?: string
  declination?: string

  summary: string
  image: string

}