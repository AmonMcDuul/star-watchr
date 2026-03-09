import { SolarSystemBody } from "./solar-system-body.model"

export interface Asteroid extends SolarSystemBody {

  semiMajorAxisAU?: number

  spectralType?: string

}