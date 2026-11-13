export type FilterJob = { title: string; type?: string; description?: string };
export function titleMatches(title: string, query: string): boolean;
export function durationMatches(job: FilterJob, duration?: string): boolean;
