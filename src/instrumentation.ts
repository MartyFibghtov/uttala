// Runs once when the production server starts (never during `next build`).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    // Create the app and auth tables up front so the first request finds them.
    if (process.env.BETTER_AUTH_SECRET) {
      const { ready } = await import("@/lib/server/auth");
      ready().catch((err) => console.error("database setup failed at startup", err));
    }
    // Load the sound model, so the first learner does not wait for it.
    const { warmPhoneModel } = await import("@/lib/server/phone-model");
    warmPhoneModel();
  }
}
