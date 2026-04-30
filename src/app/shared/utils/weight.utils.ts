import { WeightUnit } from '../../core/models/user-settings.model';

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  if (unit === 'lb') return Math.round(kg * 2.20462 * 10) / 10;
  return kg;
}

export function displayToKg(val: number, unit: WeightUnit): number {
  if (unit === 'lb') return Math.round(val * 0.453592 * 4) / 4;
  return val;
}

export function weightStep(unit: WeightUnit): number {
  return unit === 'lb' ? 5 : 2.5;
}
