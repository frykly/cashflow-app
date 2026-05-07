import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="py-12">
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Ładowanie…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
