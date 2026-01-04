export interface AstroDataPoint {
    timepoint: number; // hours from init
    cloudcover: number; // 1-9 (lower = better)
    seeing: number; // 1-8 (higher = better)
    transparency: number; // 1-8 (higher = better)
    lifted_index: number;
    rh2m: number;
    temp2m: number;
    prec_type: 'none' | 'rain' | 'snow';
    wind10m: {
      direction: string;
      speed: number;
    };
  }
  