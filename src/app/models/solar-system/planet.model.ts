import { SolarSystemBody } from "./solar-system-body.model"

export interface Planet extends SolarSystemBody {
  type: 'planet'
  orderFromSun: number

  semiMajorAxisAU: number
  rotationPeriodHours: number
  axialTilt: number
  meanTemperatureC: number

  numberOfMoons: number

  rightAscension?: string
  declination?: string
  apparentMagnitude?: number
  angularSizeArcsec?: number

}