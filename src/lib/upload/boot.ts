/**
 * Facts about this server process that uploads depend on. Server-only.
 */

/** Hosts without Python (Vercel, Lambda) cannot read documents or run
 *  analyses. */
export const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
