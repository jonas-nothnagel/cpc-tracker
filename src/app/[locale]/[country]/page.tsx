import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getCountry, isValidCountryId } from "@/config/countries";

// A country's address opens its brief, in the link's language and with the
// choices the link carries. The previous dashboard stays at
// /dashboard?country=<id>, so links shared before keep working there.
interface Props {
  params: Promise<{ locale: string; country: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CountryPage(props: Props) {
  const { locale, country } = await props.params;
  const lower = country.toLowerCase();
  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await props.searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  const q = query.toString();
  redirect({ href: `/${entry.id}/brief${q ? `?${q}` : ""}`, locale });
}
