import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login/login-form";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card card-shadow lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[#f6f8fd] p-10 lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, #d9e0ef 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Experience.com</p>
            <p className="mt-1 text-lg font-semibold text-foreground">Vaultline</p>
            <p className="section-label mt-10">Post-quote ops</p>
            <h2 className="mt-2 text-[2rem] font-bold leading-tight tracking-tight text-foreground">
              Turn deals into lasting contracts.
            </h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Internal console for inbound packets, commercial lock, signature, vault, and the 30-day renewal window.
            </p>
          </div>
          <p className="relative text-xs text-muted-foreground">Better insights. Stronger relationships. Real growth.</p>
        </div>

        <div className="flex flex-col justify-center p-10 lg:p-12">
          <p className="mb-8 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground lg:hidden">
            Experience.com · Vaultline
          </p>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">Welcome back</h1>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">Sign in with your Experience.com account.</p>
          <LoginForm />
          <p className="mt-6 text-xs text-muted-foreground">
            Demo login: <span className="font-medium text-foreground">demo@experience.com</span> /{" "}
            <span className="font-medium text-foreground">demo1234</span>
          </p>
        </div>
      </div>
    </div>
  );
}
