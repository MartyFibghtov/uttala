import { test as base, expect } from "@playwright/test";

/**
 * Better Auth rate-limits sign-in/sign-up per IP (30 a minute), and every test runs from 127.0.0.1.
 * Give each test its own client IP through X-Forwarded-For, like separate real visitors.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    const n = () => Math.floor(Math.random() * 250) + 1;
    await provide({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
  },
});
export { expect };
