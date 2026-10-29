import { Switch } from "@callcastlecare/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  featureSettingsOptions,
  featureSettingsSchema,
  useFeatureSettings,
} from "@/lib/features";
import { getServerUrl } from "@/lib/server-url";

export default function HomesFeatureToggle() {
  const queryClient = useQueryClient();
  const { data, isError } = useFeatureSettings();
  const mutation = useMutation({
    mutationFn: async (homesEnabled: boolean) => {
      const response = await fetch(
        new URL("/api/v1/features", getServerUrl()),
        {
          body: JSON.stringify({ homesEnabled }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        }
      );
      if (!response.ok) {
        throw new Error("Homes availability could not be saved.");
      }
      return featureSettingsSchema.parse(await response.json());
    },
    onError: (error) => toast.error(error.message),
    onSuccess: (settings) => {
      queryClient.setQueryData(featureSettingsOptions.queryKey, settings);
      toast.success(
        settings.homesEnabled
          ? "CastleCare Homes enabled."
          : "CastleCare Homes disabled."
      );
    },
  });

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Feature availability</h2>
      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <label
            className="text-sm font-bold text-slate-950"
            htmlFor="homes-enabled"
          >
            CastleCare Homes
          </label>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            Show the Homes section and navigation, and accept new $5,000
            preorder deposits through Stripe. Disabling this preserves existing
            orders and payments.
          </p>
          {isError ? (
            <p role="alert">Feature settings could not be loaded.</p>
          ) : null}
        </div>
        <Switch
          id="homes-enabled"
          checked={data?.homesEnabled ?? false}
          disabled={!data || mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
      </div>
    </section>
  );
}
