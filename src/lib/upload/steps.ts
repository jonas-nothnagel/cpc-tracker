/** The upload page's four steps, in order. Shared by the page and its
 *  server route, which reads the current step from the address. */
export const STEPS = ["documents", "targets", "areas", "start"] as const;
export type StepId = (typeof STEPS)[number];
