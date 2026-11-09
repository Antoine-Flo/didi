/** What went wrong, for a message to the user. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
