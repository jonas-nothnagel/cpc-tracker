import { redirect } from "@/i18n/navigation";

// The coherence canvas grew into the coherence brief; old links land there.
interface Props {
  params: Promise<{ locale: string; country: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PulseRedirect(props: Props) {
  const { locale, country } = await props.params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await props.searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  const q = query.toString();
  redirect({ href: `/${country}/brief${q ? `?${q}` : ""}`, locale });
}
