export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startRemarkableLibraryWatcher } = await import(
    "@/lib/remarkable-watch-runtime"
  );
  startRemarkableLibraryWatcher();
}
