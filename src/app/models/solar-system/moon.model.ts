import { SolarSystemBody } from "./solar-system-body.model"

export interface Moon extends SolarSystemBody {

  planet: string
  type: 'moon'

  parentPlanet: string
  distanceFromPlanetKm: number

  orbitalInclinationDeg?: number
  orbitalEccentricity?: number

}