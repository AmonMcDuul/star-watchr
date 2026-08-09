const fs = require('fs');
const path = require('path');

const messier = require('../src/assets/data/messier.json').data;
const caldwell = require('../src/assets/data/caldwell.json').data;
const solarFiles = ['star', 'planets', 'moons', 'dwarf-planets', 'asteroids', 'comets'];
const outputDir = path.join(__dirname, '..', 'src', 'assets', 'data', 'generated');
const SIMBAD_TAP = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync';
const VERIFIED_DATE = new Date().toISOString().slice(0, 10);

function normalizeIdentifier(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseRaDegrees(value) {
  const [hours = 0, minutes = 0, seconds = 0] = String(value).split(':').map(Number);
  return (hours + minutes / 60 + seconds / 3600) * 15;
}

function parseDecDegrees(value) {
  const text = String(value);
  const sign = text.trim().startsWith('-') ? -1 : 1;
  const [degrees = 0, minutes = 0, seconds = 0] = text.replace(/[+-]/, '').split(':').map(Number);
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function parseAngularSize(value) {
  const values = String(value ?? '').match(/[0-9.]+/g)?.map(Number) ?? [];
  return {
    majorArcmin: Number.isFinite(values[0]) ? values[0] : null,
    minorArcmin: Number.isFinite(values[1]) ? values[1] : (Number.isFinite(values[0]) ? values[0] : null),
  };
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(Number(value).toFixed(digits));
}

function cleanText(value) {
  return String(value ?? '')
    .replaceAll('???', '?')
    .replaceAll('???', '?')
    .replaceAll('???', '?')
    .replaceAll('???', '?')
    .replaceAll('???', '?')
    .replaceAll('???', '?')
    .replaceAll('??', '?')
    .replaceAll('??', '?');
}

async function tapQuery(query) {
  const body = new URLSearchParams({
    REQUEST: 'doQuery',
    LANG: 'adql',
    FORMAT: 'json',
    QUERY: query,
  });
  const response = await fetch(SIMBAD_TAP, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`SIMBAD TAP request failed: ${response.status} ${response.statusText}`);
  const json = await response.json();
  const columns = json.metadata.map((column) => column.name);
  return json.data.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

const simbadFields = [
  'i.id', 'b.main_id', 'b.ra', 'b.dec', 'b.otype', 'b.otype_txt', 'b.sp_type',
  'b.morph_type', 'b.galdim_majaxis', 'b.galdim_minaxis', 'b.galdim_angle',
  'b.rvz_radvel', 'b.rvz_redshift', 'b.nbref',
].join(',');

function caldwellSourceIdentifier(record) {
  const identifier = record.NGC ?? record.name;
  if (identifier.includes('/')) return identifier.split('/')[0];
  if (identifier === 'Melotte 25') return 'Cl Melotte 25';
  return identifier;
}

function findSimbadRow(rows, identifier) {
  const wanted = normalizeIdentifier(identifier);
  return rows.find((row) => {
    const returned = normalizeIdentifier(row.id);
    return returned === wanted || returned.endsWith(wanted) || wanted.endsWith(returned);
  }) ?? null;
}

function bestViewingMonth(raDeg) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const sunRaAtMidnightTransit = (raDeg + 180) % 360;
  return months[(2 + Math.round(sunRaAtMidnightTransit / 30)) % 12];
}

function visibilityFacts(decDeg) {
  const minLatitude = Math.max(-90, decDeg - 90);
  const maxLatitude = Math.min(90, decDeg + 90);
  const transitAltitude52N = Math.max(0, 90 - Math.abs(52 - decDeg));
  return {
    hemisphereBias: decDeg > 20 ? 'Northern' : decDeg < -20 ? 'Southern' : 'Equatorial',
    observableLatitudeMin: round(minLatitude, 1),
    observableLatitudeMax: round(maxLatitude, 1),
    transitAltitudeAt52N: round(transitAltitude52N, 1),
  };
}

function surfaceBrightness(magnitude, majorArcmin, minorArcmin, type) {
  if (magnitude == null || majorArcmin == null || minorArcmin == null) return null;
  if (!/(galaxy|nebula|supernova)/i.test(type)) return null;
  const areaArcsec2 = Math.PI * (majorArcmin * 60) * (minorArcmin * 60) / 4;
  return round(Number(magnitude) + 2.5 * Math.log10(areaArcsec2), 2);
}

function imagingScale(majorArcmin) {
  if (majorArcmin == null) return 'Confirm the framing in the live sky atlas before choosing a field of view.';
  if (majorArcmin >= 60) return `At roughly ${round(majorArcmin, 1)} arcminutes across, it favors a wide-field imaging setup.`;
  if (majorArcmin >= 20) return `Its roughly ${round(majorArcmin, 1)} arcminute span suits a medium field of view.`;
  return `At roughly ${round(majorArcmin, 1)} arcminutes across, it benefits from a narrower field and adequate image scale.`;
}

function buildDsoEnrichment(record, id, simbad) {
  const parsedSize = parseAngularSize(record.size);
  const raDeg = Number(simbad?.ra ?? record.raDeg ?? parseRaDegrees(record.rightAscension));
  const decDeg = Number(simbad?.dec ?? record.decDeg ?? parseDecDegrees(record.declination));
  const majorArcmin = round(simbad?.galdim_majaxis ?? parsedSize.majorArcmin, 2);
  const minorArcmin = round(simbad?.galdim_minaxis ?? parsedSize.minorArcmin, 2);
  const simbadIdentifier = simbad?.main_id ?? record.NGC ?? `${record.code} ${record.messierNumber}`;
  const catalogIdentifiers = [...new Set([
    `${record.code}${record.messierNumber}`,
    record.NGC,
    ...(record.alternateNames ?? []),
    simbad?.main_id,
  ].filter(Boolean))];
  const visibility = visibilityFacts(decDeg);
  const distanceText = record.distance == null
    ? 'Its distance is not listed consistently in the local catalogue.'
    : `The local catalogue places it about ${Number(record.distance).toLocaleString('en-US')} light-years away.`;
  const sizeText = majorArcmin == null
    ? 'No consistent angular diameter is available in the source record.'
    : `Its referenced angular extent is approximately ${majorArcmin}${minorArcmin ? ` by ${minorArcmin}` : ''} arcminutes.`;
  const simbadType = simbad?.otype_txt || simbad?.otype || record.type;
  const morphology = simbad?.morph_type ? ` SIMBAD records the morphology as ${simbad.morph_type}.` : '';
  const radial = simbad?.rvz_radvel == null ? '' : ` A published radial velocity value is ${round(simbad.rvz_radvel, 1)} km/s.`;
  const references = simbad?.nbref == null ? '' : ` The SIMBAD record currently connects it to ${simbad.nbref} bibliographic references.`;
  const typeArticle = /^[aeiou]/i.test(record.type) ? 'an' : 'a';
  const difficulty = String(record.viewingDifficulty).toLowerCase();
  const difficultyArticle = /^[aeiou]/i.test(difficulty) ? 'an' : 'a';


  return {
    id,
    catalogIdentifiers,
    primaryIdentifier: simbadIdentifier,
    source: {
      name: 'SIMBAD astronomical database (CDS, Strasbourg)',
      url: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(simbadIdentifier)}`,
      license: 'ODbL',
      verified: VERIFIED_DATE,
    },
    coordinates: { raDeg: round(raDeg, 6), decDeg: round(decDeg, 6), epoch: 'J2000/ICRS' },
    classification: {
      catalogType: record.type,
      simbadType,
      simbadTypeCode: simbad?.otype ?? null,
      morphology: simbad?.morph_type ?? null,
      spectralType: simbad?.sp_type ?? null,
    },
    dimensions: {
      majorArcmin,
      minorArcmin,
      positionAngleDeg: round(simbad?.galdim_angle, 0),
      surfaceBrightnessMagArcsec2: surfaceBrightness(record.magnitude, majorArcmin, minorArcmin, record.type),
    },
    motion: {
      radialVelocityKmS: round(simbad?.rvz_radvel, 2),
      redshift: round(simbad?.rvz_redshift, 8),
    },
    bibliographyCount: simbad?.nbref ?? null,
    visibility: {
      ...visibility,
      bestViewingMonth: bestViewingMonth(raDeg),
      catalogSeason: record.viewingSeason,
    },
    overview:
      `${record.name} (${record.code}${record.messierNumber}) is catalogued as ${typeArticle} ${record.type.toLowerCase()} in ${record.constellation}. ` +
      `Its J2000 position is RA ${record.rightAscension}, Dec ${record.declination}, corresponding to ${round(raDeg, 4)} degrees RA and ${round(decDeg, 4)} degrees Dec. ` +
      `${distanceText} ${sizeText}`,
    observingGuide:
      `StarWatchr rates this as ${difficultyArticle} ${difficulty} target at magnitude ${record.magnitude ?? 'not listed'}. ` +
      `It is associated with ${record.viewingSeason.toLowerCase()} observing, with midnight placement typically strongest around ${bestViewingMonth(raDeg)}. ` +
      `From 52 degrees north its theoretical meridian altitude is about ${visibility.transitAltitudeAt52N} degrees; local horizons and the live altitude chart determine the practical window.`,
    scienceContext:
      `The SIMBAD classification for the matched source is ${simbadType}.${morphology}${radial}${references}`,
    imagingGuide:
      `${imagingScale(majorArcmin)} Use the listed ${majorArcmin ?? 'unknown'}${minorArcmin ? ` by ${minorArcmin}` : ''} arcminute extent to check framing, and treat catalogue magnitude as integrated brightness rather than a direct measure of visual contrast.`,
  };
}

function densityGcm3(massKg, radiusKm) {
  if (!massKg || !radiusKm) return null;
  const volumeKm3 = 4 / 3 * Math.PI * Math.pow(radiusKm, 3);
  return round((massKg / volumeKm3) / 1e12, 3);
}

function solarSource(body) {
  if (body.id === 'sun') return 'https://science.nasa.gov/sun/facts/';
  if (body.type === 'planet') return `https://science.nasa.gov/solar-system/planets/${body.id}/facts/`;
  if (body.type === 'moon') return `https://science.nasa.gov/solar-system/moons/${body.id}/facts/`;
  if (body.type === 'dwarf planet') return `https://science.nasa.gov/dwarf-planets/${body.id}/facts/`;
  return `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(body.name)}`;
}

function solarObservingGuide(body) {
  if (body.id === 'sun') return 'Observe the Sun only with a certified front-aperture solar filter or a purpose-built solar telescope; unfiltered viewing can cause permanent eye damage.';
  if (body.id === 'moon') return 'The lunar terminator shows the strongest crater relief. A neutral-density or polarizing filter can improve comfort at higher phases.';
  if (body.type === 'planet') return `${body.name} is best observed near opposition or greatest elongation as appropriate; steady seeing and repeated short observations reveal more than excessive magnification.`;
  if (body.type === 'moon') return `${body.name} is resolved as a separate world mainly through imaging or spacecraft data; visually, its relationship to ${body.planet ?? 'its parent planet'} is the key observing context.`;
  if (body.type === 'comet') return `${body.name} changes in brightness and position around perihelion. Confirm a current ephemeris before observing because catalogue orbital values alone are not a live forecast.`;
  return `${body.name} is generally a challenging visual target. Use a current ephemeris, dark skies, and image stacking when its angular size or brightness is insufficient for direct detail.`;
}

function buildSolarEnrichment(body) {
  const diameterKm = body.diameterKm ?? (body.radiusKm ? body.radiusKm * 2 : null);
  const orbitYears = body.orbitalPeriodDays ? round(body.orbitalPeriodDays / 365.25, 3) : null;
  const lightTimeMinutes = body.semiMajorAxisAU ? round(body.semiMajorAxisAU * 8.3167, 2) : null;
  const comparisons = [];
  if (diameterKm) comparisons.push(`${round(diameterKm / 12742, 3)} Earth diameters`);
  if (body.gravity) comparisons.push(`${round(body.gravity / 9.80665, 3)} g surface gravity`);
  if (orbitYears) comparisons.push(`${orbitYears} Earth years per orbit`);

  return {
    id: body.id,
    source: {
      name: body.type === 'asteroid' || body.type === 'comet' ? 'NASA/JPL Small-Body Database' : 'NASA Science',
      url: solarSource(body),
      verified: VERIFIED_DATE,
    },
    physical: {
      radiusKm: body.radiusKm ?? null,
      diameterKm,
      massKg: body.massKg ?? null,
      densityGcm3: densityGcm3(body.massKg, body.radiusKm),
      gravityMs2: body.gravity ?? null,
      gravityEarthRatio: body.gravity ? round(body.gravity / 9.80665, 3) : null,
      meanTemperatureC: body.meanTemperatureC ?? null,
    },
    orbit: {
      orbitalPeriodDays: body.orbitalPeriodDays ?? null,
      orbitalPeriodYears: orbitYears,
      semiMajorAxisAU: body.semiMajorAxisAU ?? null,
      meanLightTimeFromSunMinutes: lightTimeMinutes,
      parentBody: body.planet ?? null,
    },
    comparisons,
    overview: cleanText(`${body.summary} ${diameterKm ? `${body.name} is approximately ${Number(diameterKm).toLocaleString('en-US')} km across.` : ''}`.trim()),
    observingGuide: solarObservingGuide(body),
    scienceContext:
      comparisons.length > 0
        ? `Useful scale comparisons are ${comparisons.join(', ')}. These values are rounded from the catalogue measurements shown on this page.`
        : `StarWatchr presents ${body.name} as a ${body.type} with its available catalogue measurements and orbital context.`,
  };
}

async function main() {
  console.log('Querying SIMBAD for Messier objects...');
  const messierRows = await tapQuery(`SELECT ${simbadFields} FROM ident AS i JOIN basic AS b ON b.oid=i.oidref WHERE i.id LIKE 'M %'`);

  const caldwellIdentifiers = caldwell.map(caldwellSourceIdentifier);
  const quotedIdentifiers = caldwellIdentifiers.map((identifier) => `'${String(identifier).replaceAll("'", "''")}'`).join(',');
  console.log('Querying SIMBAD for Caldwell cross-identifiers...');
  const caldwellRows = await tapQuery(`SELECT ${simbadFields} FROM ident AS i JOIN basic AS b ON b.oid=i.oidref WHERE i.id IN (${quotedIdentifiers})`);

  const enrichment = {};
  for (const [key, record] of Object.entries(messier)) {
    const number = Number(String(key).replace(/\D/g, ''));
    const simbad = messierRows.find((row) => Number(String(row.id).replace(/\D/g, '')) === number) ?? null;
    enrichment[key.toLowerCase()] = buildDsoEnrichment(record, key.toLowerCase(), simbad);
  }

  let caldwellMatches = 0;
  for (const record of caldwell) {
    const id = `c${record.messierNumber}`;
    const sourceIdentifier = caldwellSourceIdentifier(record);
    const simbad = findSimbadRow(caldwellRows, sourceIdentifier);
    if (simbad) caldwellMatches += 1;
    enrichment[id] = buildDsoEnrichment(record, id, simbad);
  }

  const solarEnrichment = {};
  for (const file of solarFiles) {
    const raw = require(`../src/assets/data/solar-system/${file}.json`);
    const rows = Array.isArray(raw) ? raw : [raw];
    for (const body of rows) solarEnrichment[`${body.type}:${body.id}`] = buildSolarEnrichment(body);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'dso-enrichment.json'), `${JSON.stringify(enrichment, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'solar-system-enrichment.json'), `${JSON.stringify(solarEnrichment, null, 2)}\n`);

  console.log(`Generated ${Object.keys(enrichment).length} DSO enrichment records (${messierRows.length} Messier SIMBAD matches, ${caldwellMatches}/${caldwell.length} Caldwell matches).`);
  console.log(`Generated ${Object.keys(solarEnrichment).length} solar-system enrichment records.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
