import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "../auth-screen";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthScreen mode="sign-up" />
    </Suspense>
  );
}
