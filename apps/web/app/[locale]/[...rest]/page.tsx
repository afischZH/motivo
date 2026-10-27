import { notFound } from "next/navigation";

// Routes unknown paths to the localized not-found page inside the layout.
export default function CatchAllPage() {
  notFound();
}
