import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// What went wrong, in red with its icon: a page's load or an action that failed.
export function ErrorAlert({ children, className = "mt-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
