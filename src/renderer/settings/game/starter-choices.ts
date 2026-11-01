import { matchesOperatorFilters } from '../operators/grid.ts';
import { starterChoice, starterProfessionFilter, starterRarityFilter, starterSearch } from '../dom.ts';
import { text } from '../common.ts';
import { state } from '../state.ts';

export function renderStarterChoices(): void {
  const operators = state.catalog.library?.operators ?? [];
  const selected = starterChoice.value;
  const query = starterSearch.value.trim().toLocaleLowerCase();
  const profession = starterProfessionFilter.value;
  const rarity = starterRarityFilter.value;
  const matching = operators.filter((operator) => matchesOperatorFilters(operator, query, profession, rarity));
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = text('starterChoosePrompt');
  const options = [prompt];
  for (const operator of matching) {
    const option = document.createElement('option');
    option.value = operator.id;
    option.textContent = operator.name;
    options.push(option);
  }
  starterChoice.replaceChildren(...options);
  if (matching.some((operator) => operator.id === selected)) starterChoice.value = selected;
}
