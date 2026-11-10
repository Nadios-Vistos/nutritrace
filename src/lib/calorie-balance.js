// Fork (mode familial) : écart cumulé entre les calories consommées et le
// budget, et son équivalent estimé en poids.
import { localDateStr } from './db.js';

// Même coefficient que l'estimation adaptative (adaptive-tdee-local.js).
export const KCAL_PER_KG = 7700;

function shiftDate(dateStr, offset) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return localDateStr(date);
}

/**
 * Somme, sur les `days` jours précédant `today`, de (consommé − budget).
 * Positif : au-dessus du budget. Négatif : en dessous.
 *
 * Seuls comptent les jours où un repas a été saisi et où un budget existe :
 * un jour vide est un jour inconnu, pas un jour à zéro calorie. Le jour en
 * cours est exclu, car il est encore incomplet.
 *
 * @param {Map<string, number>} kcalByDate  calories consommées par date
 * @param {(date: string) => number|null} budgetFor
 * @param {{ today: string, days: number }} options
 */
export function calorieBalance(kcalByDate, budgetFor, { today, days }) {
  let kcal = 0;
  let counted = 0;
  for (let offset = 1; offset <= days; offset++) {
    const date = shiftDate(today, -offset);
    const consumed = Number(kcalByDate.get(date));
    const budget = Number(budgetFor(date));
    if (!Number.isFinite(consumed) || consumed <= 0 || !Number.isFinite(budget) || budget <= 0) continue;
    kcal += consumed - budget;
    counted++;
  }
  kcal = Math.round(kcal);
  return { kcal, days: counted, kg: Math.round(kcal / KCAL_PER_KG * 10) / 10 };
}
