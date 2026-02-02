export function parseRA(raString: string): number {
  const parts = raString.split(':').map(parseFloat);
  if (parts.length !== 3) return 0;
  
  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts[2];
  
  const decimalHours = hours + minutes/60 + seconds/3600;
  
  return decimalHours * 15;
}

export function parseDec(decString: string): number {
  const sign = decString.trim().startsWith('-') ? -1 : 1;
  const clean = decString.replace(/[+-]/, '');
  
  const parts = clean.split(':').map(parseFloat);
  if (parts.length !== 3) return 0;
  
  const degrees = parts[0];
  const minutes = parts[1];
  const seconds = parts[2];
  
  return sign * (degrees + minutes/60 + seconds/3600);
}