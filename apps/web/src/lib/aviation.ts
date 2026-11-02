/**
 * Pure flight-planning math for the operational calculators.
 *
 * Everything here is deliberately free of React and of any I/O: the calculators
 * recompute on every keystroke (no "Calcular" button anywhere in Vector), so
 * these run hundreds of times per session and need to stay cheap and
 * predictable. Keeping them pure also means the constants below can be checked
 * against a POH or an E6B without reading any UI code.
 *
 * Sign conventions used throughout:
 *  - Directions are degrees 0–360, wind expressed as the direction it blows FROM
 *    (the way ATIS and METAR report it).
 *  - Headwind positive = headwind, negative = tailwind.
 *  - Crosswind positive = from the right, negative = from the left.
 *
 * **Estas funciones son agnósticas del marco de referencia: no saben si les están
 * pasando grados magnéticos o verdaderos, y devuelven lo que les dieron.** Hoy los
 * calculadores le pasan lo que el piloto tipea, que ya es magnético, y por eso sale
 * bien. Pero un curso derivado de coordenadas es **verdadero**, y el viento del METAR
 * también: mezclar los dos marcos rompe el resultado en silencio, con todos los
 * números corridos lo mismo. La regla para el planificador es toda la matemática en
 * verdadero y la variación magnética aplicada una sola vez al mostrar.
 */

/** Standard sea-level pressure. */
export const ISA_PRESSURE_HPA = 1013.25;
/** Sea-level ISA temperature, °C. */
export const ISA_SEA_LEVEL_TEMP_C = 15;
/** ISA lapse rate, °C per 1000 ft. */
export const ISA_LAPSE_C_PER_1000FT = 2;
/** Feet per nautical mile. */
export const FEET_PER_NM = 6076.115;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Smallest signed angle between two bearings, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = ((to - from + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

/* -------------------------------------------------------------------------- */
/* Unit conversion                                                            */
/* -------------------------------------------------------------------------- */

export type UnitCategory = "distance" | "speed" | "altitude" | "weight" | "volume" | "pressure" | "temperature";

export interface UnitDef {
  id: string;
  label: string;
  /** Multiplier to the category's base unit. Unused for temperature. */
  factor: number;
}

/**
 * Units are defined as a factor against one base unit per category, so a
 * conversion is always `value * from.factor / to.factor`. Temperature is the
 * one exception (it has offsets, not just scale) and is special-cased in
 * `convertUnit`.
 */
export const UNITS: Record<UnitCategory, { label: string; units: UnitDef[] }> = {
  distance: {
    label: "Distancia",
    units: [
      { id: "nm", label: "Millas náuticas (NM)", factor: 1852 },
      { id: "km", label: "Kilómetros (km)", factor: 1000 },
      { id: "sm", label: "Millas terrestres (SM)", factor: 1609.344 },
      { id: "m", label: "Metros (m)", factor: 1 },
      { id: "ft", label: "Pies (ft)", factor: 0.3048 },
    ],
  },
  speed: {
    label: "Velocidad",
    units: [
      { id: "kt", label: "Nudos (kt)", factor: 0.514444 },
      { id: "kmh", label: "km/h", factor: 0.277778 },
      { id: "mph", label: "mph", factor: 0.44704 },
      { id: "ms", label: "m/s", factor: 1 },
      { id: "fpm", label: "Pies/min (ft/min)", factor: 0.00508 },
    ],
  },
  altitude: {
    label: "Altitud",
    units: [
      { id: "ft", label: "Pies (ft)", factor: 0.3048 },
      { id: "m", label: "Metros (m)", factor: 1 },
      { id: "fl", label: "Nivel de vuelo (FL)", factor: 30.48 },
    ],
  },
  weight: {
    label: "Peso",
    units: [
      { id: "kg", label: "Kilogramos (kg)", factor: 1 },
      { id: "lb", label: "Libras (lb)", factor: 0.453592 },
      { id: "t", label: "Toneladas (t)", factor: 1000 },
    ],
  },
  volume: {
    label: "Volumen",
    units: [
      { id: "l", label: "Litros (L)", factor: 1 },
      { id: "galus", label: "Galones US (gal)", factor: 3.785412 },
      { id: "galuk", label: "Galones imp. (gal)", factor: 4.546092 },
      // Avgas 100LL at 15 °C ≈ 0.72 kg/L. Handy because fuel is ordered in
      // litres but weighed for the load sheet.
      { id: "kgavgas", label: "Kg de avgas (0,72 kg/L)", factor: 1 / 0.72 },
      { id: "lbavgas", label: "Lb de avgas (6,0 lb/gal)", factor: 0.453592 / 0.72 },
    ],
  },
  pressure: {
    label: "Presión",
    units: [
      { id: "hpa", label: "Hectopascales (hPa)", factor: 1 },
      { id: "inhg", label: "Pulgadas de Hg (inHg)", factor: 33.863886 },
      { id: "mmhg", label: "Milímetros de Hg (mmHg)", factor: 1.333224 },
      { id: "psi", label: "PSI", factor: 68.947573 },
    ],
  },
  temperature: {
    label: "Temperatura",
    units: [
      { id: "c", label: "Celsius (°C)", factor: 1 },
      { id: "f", label: "Fahrenheit (°F)", factor: 1 },
      { id: "k", label: "Kelvin (K)", factor: 1 },
    ],
  },
};

export function convertUnit(value: number, category: UnitCategory, from: string, to: string): number {
  if (!Number.isFinite(value)) return NaN;
  if (from === to) return value;

  if (category === "temperature") {
    // Normalise to °C first, then out. Offsets make the factor trick unusable.
    const celsius = from === "c" ? value : from === "f" ? (value - 32) / 1.8 : value - 273.15;
    if (to === "c") return celsius;
    if (to === "f") return celsius * 1.8 + 32;
    return celsius + 273.15;
  }

  const units = UNITS[category].units;
  const f = units.find((u) => u.id === from);
  const t = units.find((u) => u.id === to);
  if (!f || !t) return NaN;
  return (value * f.factor) / t.factor;
}

/* -------------------------------------------------------------------------- */
/* Fuel                                                                        */
/* -------------------------------------------------------------------------- */

export interface FuelResult {
  /** Hours of flight available from the usable fuel, before reserve. */
  enduranceHours: number;
  /** Hours left once the reserve is set aside — what you can actually plan on. */
  usableHours: number;
  /** Fuel the reserve consumes, same unit as the input. */
  reserveFuel: number;
  /** Still-air range at the given ground speed, NM. Only if speed > 0. */
  rangeNm: number;
  /** Fuel needed for the planned leg (time × burn), reserve included. */
  requiredForLeg: number;
  /** Fuel left over after the planned leg and its reserve. Negative = short. */
  remainingAfterLeg: number;
}

/**
 * Endurance/range from a burn rate, plus the "can I make this leg?" answer.
 *
 * Fuel quantity and burn rate just have to share a unit (L and L/h, or gal and
 * gph) — nothing here cares which, so the UI lets the pilot pick.
 */
export function computeFuel(params: {
  fuelOnBoard: number;
  burnRate: number;
  reserveMinutes: number;
  legMinutes: number;
  groundSpeed: number;
}): FuelResult {
  const { fuelOnBoard, burnRate, reserveMinutes, legMinutes, groundSpeed } = params;

  if (!(burnRate > 0)) {
    return {
      enduranceHours: 0,
      usableHours: 0,
      reserveFuel: 0,
      rangeNm: 0,
      requiredForLeg: 0,
      remainingAfterLeg: fuelOnBoard,
    };
  }

  const enduranceHours = fuelOnBoard / burnRate;
  const reserveFuel = (reserveMinutes / 60) * burnRate;
  const usableHours = Math.max(0, (fuelOnBoard - reserveFuel) / burnRate);
  const rangeNm = usableHours * (groundSpeed > 0 ? groundSpeed : 0);
  const requiredForLeg = (legMinutes / 60) * burnRate + reserveFuel;

  return {
    enduranceHours,
    usableHours,
    reserveFuel,
    rangeNm,
    requiredForLeg,
    remainingAfterLeg: fuelOnBoard - requiredForLeg,
  };
}

/* -------------------------------------------------------------------------- */
/* Wind                                                                        */
/* -------------------------------------------------------------------------- */

export interface WindComponents {
  /** Positive = headwind, negative = tailwind. */
  headwind: number;
  /** Positive = from the right, negative = from the left. */
  crosswind: number;
}

/** Head/crosswind split of a wind against a runway or course. */
export function windComponents(course: number, windDir: number, windSpeed: number): WindComponents {
  const alpha = toRad(angleDelta(course, windDir));
  return {
    headwind: windSpeed * Math.cos(alpha),
    crosswind: windSpeed * Math.sin(alpha),
  };
}

export interface WindTriangle extends WindComponents {
  /** Wind correction angle, degrees. Positive = crab right of course. */
  wca: number;
  /**
   * Heading to fly to hold the desired course, **en el mismo marco que `course`**.
   * Curso magnético entra, rumbo magnético sale; curso verdadero entra, rumbo
   * verdadero sale. Ver la nota de marco de referencia arriba de todo.
   */
  heading: number;
  /** Resulting ground speed. */
  groundSpeed: number;
  /** True when the wind is stronger than the TAS can crab out. */
  impossible: boolean;
}

/**
 * Full wind triangle: what to steer and what you'll make good.
 *
 * `impossible` covers the case where the crosswind exceeds TAS — asin() would
 * return NaN and the UI needs to say "no alcanza" rather than render blanks.
 */
export function windTriangle(params: {
  course: number;
  tas: number;
  windDir: number;
  windSpeed: number;
}): WindTriangle {
  const { course, tas, windDir, windSpeed } = params;
  const comps = windComponents(course, windDir, windSpeed);

  if (!(tas > 0)) {
    return { ...comps, wca: 0, heading: course, groundSpeed: 0, impossible: false };
  }

  const sinWca = comps.crosswind / tas;
  if (Math.abs(sinWca) > 1) {
    return { ...comps, wca: 0, heading: course, groundSpeed: 0, impossible: true };
  }

  const wca = toDeg(Math.asin(sinWca));
  const groundSpeed = tas * Math.cos(toRad(wca)) - comps.headwind;

  return {
    ...comps,
    wca,
    heading: (course + wca + 360) % 360,
    groundSpeed,
    impossible: groundSpeed <= 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Altitude                                                                    */
/* -------------------------------------------------------------------------- */

export interface AltitudeResult {
  pressureAltitude: number;
  densityAltitude: number;
  /** ISA temperature at the pressure altitude, °C. */
  isaTemp: number;
  /** How far the actual temperature sits off ISA, °C. */
  isaDeviation: number;
}

/**
 * Pressure and density altitude from field elevation, QNH and OAT.
 *
 * Uses the two approximations every POH and every ANAC exam uses — 30 ft per
 * hPa below standard, and 118.8 ft of density altitude per °C above ISA. They
 * hold well at the altitudes light aircraft actually operate at, and matching
 * the numbers a pilot gets off an E6B matters more here than a fully rigorous
 * barometric model that would disagree with the checkride answer.
 */
export function computeAltitude(params: {
  elevationFt: number;
  qnhHpa: number;
  oatC: number;
}): AltitudeResult {
  const { elevationFt, qnhHpa, oatC } = params;

  const pressureAltitude = elevationFt + (ISA_PRESSURE_HPA - qnhHpa) * 30;
  const isaTemp = ISA_SEA_LEVEL_TEMP_C - (ISA_LAPSE_C_PER_1000FT * pressureAltitude) / 1000;
  const isaDeviation = oatC - isaTemp;
  const densityAltitude = pressureAltitude + 118.8 * isaDeviation;

  return { pressureAltitude, densityAltitude, isaTemp, isaDeviation };
}

/* -------------------------------------------------------------------------- */
/* Cloud base                                                                  */
/* -------------------------------------------------------------------------- */

export interface CloudBaseResult {
  /** Height of the convective cloud base above the field, ft. */
  baseAgl: number;
  /** Same base referenced to sea level, ft. */
  baseMsl: number;
  /** Temperature/dewpoint spread, °C. */
  spread: number;
  /** Estimated temperature at the cloud base, °C. */
  tempAtBase: number;
}

/**
 * Convective cloud base from the temperature/dewpoint spread.
 *
 * The 400 ft per °C figure is the standard rule of thumb: temperature falls at
 * ~3 °C/1000 ft in dry air while the dewpoint falls at ~0.5 °C/1000 ft, so the
 * spread closes at ~2.5 °C/1000 ft. Only meaningful for convective cloud —
 * it says nothing about frontal or advection layers.
 */
export function computeCloudBase(params: {
  temperatureC: number;
  dewpointC: number;
  elevationFt: number;
}): CloudBaseResult {
  const { temperatureC, dewpointC, elevationFt } = params;
  const spread = temperatureC - dewpointC;
  const baseAgl = Math.max(0, spread * 400);

  return {
    baseAgl,
    baseMsl: baseAgl + elevationFt,
    spread,
    // Dry lapse of ~3 °C per 1000 ft up to the condensation level.
    tempAtBase: temperatureC - (baseAgl / 1000) * 3,
  };
}

/* -------------------------------------------------------------------------- */
/* Glide                                                                       */
/* -------------------------------------------------------------------------- */

export interface GlideResult {
  /** Still-air distance covered from the given height, NM. */
  glideNm: number;
  /** Distance corrected for the head/tailwind component, NM. */
  glideWithWindNm: number;
  /** Height lost per NM travelled, ft. */
  lossPerNm: number;
  /** Minutes aloft at the given glide speed, still air. */
  minutesAloft: number;
  /** Glide ratio needed to reach `targetNm`; null when no target is set. */
  requiredRatio: number | null;
  /** Whether the target is reachable in still air. */
  reachesTarget: boolean | null;
}

/**
 * Glide range from height AGL and a glide ratio.
 *
 * The wind-corrected figure scales the still-air time aloft by the ground speed
 * the glide actually makes good, which is why it needs the glide speed too: a
 * 10 kt headwind costs far more range at 60 kt best-glide than at 120 kt.
 */
export function computeGlide(params: {
  heightAgl: number;
  glideRatio: number;
  glideSpeedKt: number;
  /** Positive = headwind, negative = tailwind. */
  headwindKt: number;
  targetNm: number;
}): GlideResult {
  const { heightAgl, glideRatio, glideSpeedKt, headwindKt, targetNm } = params;

  if (!(glideRatio > 0) || !(heightAgl > 0)) {
    return {
      glideNm: 0,
      glideWithWindNm: 0,
      lossPerNm: 0,
      minutesAloft: 0,
      requiredRatio: targetNm > 0 && heightAgl > 0 ? (targetNm * FEET_PER_NM) / heightAgl : null,
      reachesTarget: targetNm > 0 ? false : null,
    };
  }

  const glideNm = (heightAgl * glideRatio) / FEET_PER_NM;
  const lossPerNm = FEET_PER_NM / glideRatio;

  // Time aloft is fixed by the sink rate, so wind only moves the ground track.
  const minutesAloft = glideSpeedKt > 0 ? (glideNm / glideSpeedKt) * 60 : 0;
  const groundSpeed = glideSpeedKt > 0 ? glideSpeedKt - headwindKt : 0;
  const glideWithWindNm = glideSpeedKt > 0 ? Math.max(0, (minutesAloft / 60) * groundSpeed) : glideNm;

  return {
    glideNm,
    glideWithWindNm,
    lossPerNm,
    minutesAloft,
    requiredRatio: targetNm > 0 ? (targetNm * FEET_PER_NM) / heightAgl : null,
    reachesTarget: targetNm > 0 ? glideWithWindNm >= targetNm : null,
  };
}
