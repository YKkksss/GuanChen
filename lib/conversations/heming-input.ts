import { getRelationshipDefinition } from '@/lib/heming/methodology';
import type { HemingRelationshipContext, RelationshipType } from '@/lib/heming/types';
import type { BirthInfo } from '@/lib/ziwei/types';

export function normalizeHemingTitle(
  value: unknown,
  birthInfoA: BirthInfo | null,
  birthInfoB: BirthInfo | null,
  relationshipType: RelationshipType,
): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  const ownerA = birthInfoA?.name?.trim() || '甲方';
  const ownerB = birthInfoB?.name?.trim() || '乙方';
  return `${ownerA} × ${ownerB} · ${getRelationshipDefinition(relationshipType).label}`.slice(0, 80);
}

export function normalizeRelationshipContext(
  value: unknown,
  relationshipType: RelationshipType,
): HemingRelationshipContext {
  const definition = getRelationshipDefinition(relationshipType);
  const input = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const confirmedFactsInput = input.confirmedFacts && typeof input.confirmedFacts === 'object'
    ? input.confirmedFacts as Record<string, unknown>
    : {};
  const confirmedFacts = Object.fromEntries(
    Object.entries(confirmedFactsInput)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim())
      .slice(0, 20)
      .map(([key, fact]) => [key.slice(0, 60), fact.trim().slice(0, 500)]),
  );

  return {
    ownerARole: normalizeText(input.ownerARole, 40) || definition.roles[0].label,
    ownerBRole: normalizeText(input.ownerBRole, 40) || definition.roles[1].label,
    customRelationshipLabel: relationshipType === 'custom'
      ? normalizeText(input.customRelationshipLabel, 40)
      : null,
    mainConcern: normalizeText(input.mainConcern, 300),
    confirmedFacts,
  };
}

function normalizeText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}
