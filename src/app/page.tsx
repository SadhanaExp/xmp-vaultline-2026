import { redirect } from "next/navigation";
import { ReadyToContract } from "@/components/contract/ready-to-contract";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");
  return <ReadyToContract leadId={null} customerId={null} user={user} />;
}
