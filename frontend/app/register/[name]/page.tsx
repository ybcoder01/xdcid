import { RegistrationPageClient } from "../../../components/RegistrationPageClient";
import { isRegistrationTerm } from "../../../lib/pricingPolicy";

export default async function RegisterNamePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ years?: string | string[] }>;
}) {
  const { name } = await params;
  const suppliedYears = (await searchParams).years;
  const parsedYears = Number(Array.isArray(suppliedYears) ? suppliedYears[0] : suppliedYears);
  const initialTermYears = isRegistrationTerm(parsedYears) ? parsedYears : 1;
  return <RegistrationPageClient initialName={name} initialTermYears={initialTermYears} />;
}
