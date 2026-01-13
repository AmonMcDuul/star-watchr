export interface PlanetVisibility {
    planet: string;
    date: string;
    riseDateTime: string | null;
    setDateTime: string | null;
    isAboveHorizonNow: boolean;
  }