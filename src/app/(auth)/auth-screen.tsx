import { connection } from "next/server";
import { AuthForm } from "@/components/auth-form";
import { googleEnabled } from "@/lib/server/auth";

export async function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  await connection();
  return <AuthForm mode={mode} googleEnabled={googleEnabled()} />;
}
