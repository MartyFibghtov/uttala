import { Skeleton } from "@/components/ui/skeleton";

/** Shown instantly while a page inside the app loads. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
