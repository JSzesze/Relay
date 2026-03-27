import { readState } from "@/lib/state";
import { SendForm } from "@/components/send-form";

export default async function NewSendPage() {
  const state = await readState();

  return <SendForm connected={Boolean(state.connection)} />;
}
