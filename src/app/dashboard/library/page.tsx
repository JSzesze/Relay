import { RemarkableLibrary } from "@/components/remarkable-library";
import { readRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";

export default async function LibraryPage() {
  const store = await readRemarkableSkeleton();

  return <RemarkableLibrary initialStore={store} />;
}
