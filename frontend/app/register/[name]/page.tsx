import { RegistrationPageClient } from "../../../components/RegistrationPageClient";

export default async function RegisterNamePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <RegistrationPageClient initialName={name} />;
}
