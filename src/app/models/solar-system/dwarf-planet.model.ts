import { SolarSystemBody } from "./solar-system-body.model"

export interface DwarfPlanet extends SolarSystemBody {

  semiMajorAxisAU: number

  numberOfMoons: number

}