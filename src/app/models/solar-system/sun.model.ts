import { SolarSystemBody } from "./solar-system-body.model"

export interface Sun extends SolarSystemBody {

  type: 'sun'

  spectralType?: string

  surfaceTemperatureC?: number
  coreTemperatureC?: number

  ageBillionYears?: number
  luminosity?: string

}