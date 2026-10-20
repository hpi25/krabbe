import { PersonResponse } from '/src/config/api'

/**
 * Map each person's unique name to the name to show for them.
 * Display names of registered users aren't unique, so when a display name
 * is shared, registered users get their username added, e.g. `Crab (@crab)`
 */
export const getDisplayNames = (people: Pick<PersonResponse, 'name' | 'display_name' | 'username'>[]) => {
  const counts = new Map<string, number>()
  people.forEach(p => {
    const key = p.display_name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  return new Map(people.map(p => [
    p.name,
    p.username && (counts.get(p.display_name.toLowerCase()) ?? 0) > 1
      ? `${p.display_name} (@${p.username})`
      : p.display_name,
  ]))
}
