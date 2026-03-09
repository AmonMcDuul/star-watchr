import { SolarSystemBody } from "./solar-system-body.model"

export interface Comet extends SolarSystemBody {

  orbitalPeriodYears: number

  perihelionAU: number
  aphelionAU: number

  inclinationDeg: number

  lastPerihelion?: number
  nextPerihelion?: number

}