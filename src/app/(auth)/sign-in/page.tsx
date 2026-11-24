import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "../auth-screen";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense>
      <AuthScreen mode="sign-in" />
    </Suspense>
  );
}
