import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/homes")({
  beforeLoad: () => {
    throw redirect({ hash: "homes", replace: true, to: "/" });
  },
});
