import { Nutrition } from './nutrition.js';

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const MIN_AUTOMATIC_BUDGET = 1200;

export function adaptiveFamilyBudget(tdee, factor) {
  const budget = Math.round(tdee * factor);
  return Number.isFinite(budget) && budget >= MIN_AUTOMATIC_BUDGET ? budget : null;
}

export function estimateFamilyGoals({ gender, age, height_cm, weight_kg, target_weight, activity }) {
  if (!Number.isInteger(age) || age < 18 || age > 120 ||
      !['female', 'male'].includes(gender) ||
      !Number.isFinite(height_cm) || height_cm < 100 || height_cm > 250 ||
      !Number.isFinite(weight_kg) || weight_kg < 30 || weight_kg > 500 ||
      !Number.isFinite(target_weight) || target_weight < 30 || target_weight > 500 ||
      !ACTIVITY_LEVELS.includes(activity)) return { error: 'invalid' };

  const heightSquared = (height_cm / 100) ** 2;
  const bmi = weight_kg / heightSquared;
  const targetBmi = target_weight / heightSquared;
  if (bmi < 18.5 || targetBmi < 18.5) return { error: 'low_bmi', bmi };

  const maintenance = Nutrition.calculateTDEE({ gender, age, height_cm, weight_kg, activity });
  const difference = target_weight - weight_kg;
  const direction = Math.abs(difference) < 0.5 ? 0 : Math.sign(difference);
  // A starting budget, without a deadline or an assumed rate of weight change.
  const adjustment = Math.min(250, maintenance * 0.10, Math.abs(difference) * 50);
  const calories = Math.round((maintenance + direction * adjustment) / 25) * 25;
  if (calories < MIN_AUTOMATIC_BUDGET) return { error: 'low_energy', bmi };

  return { bmi, maintenance, calories, direction };
}
