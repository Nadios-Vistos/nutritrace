// Fork (mode familial) : repères visuels de portion pour les aliments Ciqual
// qui n'ont ni mesure ménagère ni photo. Ce sont des ordres de grandeur
// usuels (assiette, paume, verre, cuillère, pot de 125 g, portion de fromage
// de 30 g, portion de fruit ou de légume de 80 g), pas des mesures propres à
// chaque aliment : l'interface les présente comme indicatifs.
import { normalizeReferenceText } from './ciqual.js';

// [pictogramme, quantité en g, clé de libellé]
export const PICTOGRAM_FAMILIES = {
  drink: [['glass', 200, 'glass'], ['mug', 250, 'mug'], ['bowl', 350, 'bowl']],
  soup: [['bowl', 250, 'bowl'], ['bowl-large', 350, 'largeBowl']],
  plate: [['plate-1', 100, 'quarterPlate'], ['plate-2', 200, 'halfPlate'], ['plate-3', 300, 'threeQuarterPlate']],
  palm: [['palm-1', 50, 'halfPalm'], ['palm-2', 100, 'palm'], ['palm-3', 150, 'palmAndHalf']],
  egg: [['egg-1', 50, 'egg'], ['egg-2', 100, 'twoEggs'], ['egg-3', 150, 'threeEggs']],
  cheese: [['cheese-1', 30, 'cheesePortion'], ['cheese-2', 60, 'twoCheesePortions']],
  pot: [['pot-1', 125, 'pot'], ['pot-2', 250, 'twoPots']],
  spoon: [['spoon-1', 5, 'teaspoon'], ['spoon-2', 15, 'tablespoon']],
  spread: [['spoon-1', 7, 'teaspoon'], ['spoon-2', 20, 'tablespoon']],
  bread: [['bread-1', 30, 'breadSlice'], ['bread-2', 60, 'quarterBaguette'], ['bread-3', 125, 'halfBaguette']],
  cereal: [['cereal-1', 30, 'smallBowl'], ['cereal-2', 45, 'bowl'], ['cereal-3', 60, 'largeBowl']],
  handful: [['handful-1', 15, 'halfHandful'], ['handful-2', 30, 'handful']],
  produce: [['produce-1', 80, 'producePortion'], ['produce-2', 160, 'twoProducePortions'], ['produce-3', 240, 'threeProducePortions']],
  scoop: [['scoop-1', 50, 'scoop'], ['scoop-2', 100, 'twoScoops'], ['scoop-3', 150, 'threeScoops']],
};

const COOKED = /\b(cuite?s?|bouillie?s?|vapeur|poelee?s?|braisee?s?|sautee?s?|rotie?s?|grillee?s?|frite?s?|appertisee?s?|egouttee?s?|rissolee?s?|puree)\b/;
const HAND_HELD = /\b(pizza|sandwich|burger|hamburger|cheeseburger|quiche|tarte|tartelette|croque|panini|kebab|wrap|hot dog|nems?|samoussa|sushi|maki|friand|feuillete|crepe|galette|tourte|bagel|tacos?|brochette|beignet|rouleau|bouchee|croquette|accras?|falafel|blini|toast|canape|pate en croute|fajita|burrito|empanada|pain bagnat)\b/;
const CURED = /\b(saucisson|saucisses?|jambon|bacon|lardons?|pate|rillettes|terrine|chorizo|salami|mortadelle|foie gras|boudin|caviar|surimi|tarama|anchois|merguez|chipolata|knack|nuggets?|cordon bleu|panee?s?|beignets?|andouille|andouillette|rosette|coppa|pancetta|galantine|mousse|museau|cervelas|oeufs de|gelatine|bouillon|fume|fumee|seche|sechee|conserve|appertise|appertisee|poudre)\b/;

/** Famille de repères pour un aliment Ciqual, ou null s'il n'y en a pas de fiable. */
export function pictogramFamily(food) {
  const category = food?.category;
  if (!category || typeof food.name !== 'string') return null;
  const name = normalizeReferenceText(food.name);
  if (food.nutrition?.beverage_ml > 0) return 'drink';
  switch (category) {
    case 'entrées et plats composés':
      if (/^(soupe|potage|veloute|bouillon|gaspacho|minestrone|consomme)\b/.test(name)) {
        return /\bdeshydratee?\b/.test(name) && !/\breconstituee?\b/.test(name) ? null : 'soup';
      }
      return HAND_HELD.test(name) ? null : 'plate';
    case 'produits céréaliers':
      if (/^(pain|baguette)\b/.test(name)) {
        return /\b(chocolat|lait|raisins?|epices?|grille|suedois|azyme|perdu|hamburger|hot dog|pita|panini|brioche|viennois|chapelure)\b/.test(name) ? null : 'bread';
      }
      if (/^(cereales|muesli|flocons?|granola|petales|ble souffle|riz souffle)\b/.test(name)) return 'cereal';
      return COOKED.test(name)
        && /^(pates?|riz|semoule|quinoa|ble|boulgour|couscous|nouilles?|polenta|orge|epeautre|sarrasin|spaghettis?|macaronis?|tagliatelles?|vermicelles?|gnocchis?|raviolis?|coquillettes?|millet|avoine)\b/.test(name)
        ? 'plate' : null;
    case 'fruits, légumes, légumineuses et oléagineux':
      if (/^(huile|jus|nectar|confiture|compote|coulis|concentre|farine|lait|boisson|creme|beurre|pate|puree d amande|puree de sesame|tahin|chips)\b/.test(name)) return null;
      if (/^graines? germees?\b/.test(name)) return 'produce';
      if (/^(noix|amandes?|noisettes?|cacahuetes?|arachides?|pistaches?|pignons?|graines?|sesame|tournesol|chataigne|marron|melange)\b/.test(name)) return 'handful';
      if (/\b(sec|secs|seche|seches|deshydratee?s?|sechee?s?)\b/.test(name)) {
        // Légumineuses et légumes secs se pèsent crus : pas de repère fiable.
        return /^(lentilles?|haricots?|pois|feves?|flageolets?|soja|flocons?|legumes?|champignons?|algues?|oignons?|ail|pomme de terre|puree|lupin|tomates?|echalote|persil|poireau|carotte)\b/.test(name)
          ? null : 'handful';
      }
      return COOKED.test(name) ? 'plate' : 'produce';
    case 'viandes, oeufs, poissons':
      if (/^oeufs?\b/.test(name)) return /\b(poudre|blanc|jaune|de|d|caille|cane|oie|gelee)\b/.test(name) ? null : 'egg';
      return CURED.test(name) ? null : 'palm';
    case 'produits laitiers':
      if (/\b(poudre|concentre|deshydrate)\b/.test(name)) return null;
      if (/^lait\b/.test(name)) return /\b(fermente|gelifie|ribot|caille)\b/.test(name) ? 'pot' : 'drink';
      if (/^(yaourt|fromage blanc|fromage frais|petit suisse|faisselle|skyr|dessert|creme dessert|specialite laitiere|kefir|flan|riz au lait|semoule au lait|mousse|ile flottante|panna cotta|liegeois|creme caramel|creme brulee|creme aux oeufs|entremets|gateau de)\b/.test(name)) return 'pot';
      if (/^(creme|beurre)\b/.test(name)) return 'spoon';
      if (/^(boisson|milk shake|lassi|gateau|specialite|tarte|clafoutis|far|tiramisu|profiteroles?|charlotte|bavarois|crumble|cheesecake|eclair|chou|baba|crepe|gaufre|pudding|sauce|preparation)\b/.test(name)) return null;
      return 'cheese';
    case 'matières grasses':
      return 'spoon';
    case 'produits sucrés':
      if (/^(sucre|edulcorant|fructose|cassonade|vergeoise)\b/.test(name)) return 'spoon';
      return /^(miel|confiture|gelee|marmelade|sirop|pate a tartiner|creme de marrons?)\b/.test(name) ? 'spread' : null;
    case 'aides culinaires et ingrédients divers':
      return /^(sauce|mayonnaise|ketchup|moutarde|vinaigrette|pesto|tapenade|aioli|harissa)\b/.test(name) ? 'spoon' : null;
    case 'glaces et sorbets':
      return /^(glace|sorbet|creme glacee)\b/.test(name)
        && !/\b(cone|cornet|batonnet|esquimau|barre|mini|gateau|buche|pot|givree?)\b/.test(name) ? 'scoop' : null;
    default:
      return null;
  }
}

export function pictogramPortions(food) {
  return (PICTOGRAM_FAMILIES[pictogramFamily(food)] || [])
    .map(([pictogram, amount, label]) => ({ pictogram, amount, label }));
}
