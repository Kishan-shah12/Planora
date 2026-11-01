let counter = 0;
/** Short unique id for locally created records (quotes). */
export function newId(): string {
  counter += 1;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(Math.random()).slice(2, 10);
  return `${random}${counter}`;
}
