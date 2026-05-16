"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ClientFormValues } from "@/types";
import type { Client } from "@prisma/client";
import { Loader2, Save, ArrowLeft, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

interface ClientFormProps {
  client?: Client;
  mode: "create" | "edit";
}

const DEFAULT_VALUES: ClientFormValues = {
  name: "",
  company: "",
  email: "",
  phone: "",
  whatsappPhone: "",
  platform: "GOOGLE",
  accountId: "",
  accessToken: "",
  refreshToken: "",
  notes: "",
};

export function ClientForm({ client, mode }: ClientFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<{ valid: boolean; name?: string; error?: string } | null>(null);

  const [values, setValues] = useState<ClientFormValues>({
    name: client?.name ?? DEFAULT_VALUES.name,
    company: client?.company ?? DEFAULT_VALUES.company,
    email: client?.email ?? DEFAULT_VALUES.email,
    phone: client?.phone ?? DEFAULT_VALUES.phone,
    whatsappPhone: (client as (Client & { whatsappPhone?: string | null }) | undefined)?.whatsappPhone ?? DEFAULT_VALUES.whatsappPhone,
    platform: (client?.platform as "GOOGLE" | "META") ?? DEFAULT_VALUES.platform,
    accountId: client?.accountId ?? DEFAULT_VALUES.accountId,
    accessToken: "",
    refreshToken: "",
    notes: client?.notes ?? DEFAULT_VALUES.notes,
  });

  const set = (field: keyof ClientFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    // Reset verification when accountId or accessToken changes
    if (field === "accountId" || field === "accessToken") {
      setVerification(null);
    }
  };

  const handleVerify = async () => {
    if (!values.accountId) return;
    setVerifying(true);
    setVerification(null);
    try {
      const res = await fetch("/api/clients/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: values.platform,
          accountId: values.accountId,
          accessToken: values.accessToken || undefined,
        }),
      });
      const json = await res.json();
      setVerification(json);
    } catch {
      setVerification({ valid: false, error: "Could not reach validation endpoint" });
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "create" && !verification?.valid) {
      setError("Please verify the Account ID before creating a client.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = mode === "create" ? "/api/clients" : `/api/clients/${client!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const payload = {
        ...values,
        // Only send tokens if they have values
        accessToken: values.accessToken || undefined,
        refreshToken: values.refreshToken || undefined,
        email: values.email || undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "An error occurred");
        return;
      }

      router.push(
        mode === "create" ? `/clients/${json.data.id}` : `/clients/${client!.id}`
      );
      router.refresh();
    } catch {
      setError("Failed to save client. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back button */}
      <Link href="/clients">
        <Button variant="ghost" size="sm" className="gap-2 pl-0">
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Button>
      </Link>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Client Information */}
        <Card>
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
            <CardDescription>Basic contact and company details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Client Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={values.name}
                onChange={set("name")}
                placeholder="e.g. Acme Corp"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={values.company}
                onChange={set("company")}
                placeholder="Legal company name"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={set("email")}
                placeholder="contact@company.com"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={values.phone}
                onChange={set("phone")}
                placeholder="+1-555-0100"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsappPhone">WhatsApp Number</Label>
              <Input
                id="whatsappPhone"
                type="tel"
                value={values.whatsappPhone}
                onChange={set("whatsappPhone")}
                placeholder="+1234567890"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                E.164 format. Receives budget alerts via WhatsApp when configured.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className={cn(
                  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                )}
                value={values.notes}
                onChange={set("notes")}
                placeholder="Internal notes about this client..."
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Platform Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Ad Platform Configuration</CardTitle>
            <CardDescription>Connect to Google Ads or Meta Ads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform">
                Platform <span className="text-red-500">*</span>
              </Label>
              <Select
                value={values.platform}
                onValueChange={(v) =>
                  setValues((prev) => ({ ...prev, platform: v as "GOOGLE" | "META" }))
                }
                disabled={mode === "edit" || loading}
              >
                <SelectTrigger id="platform">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GOOGLE">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-[#4285F4]" />
                      Google Ads
                    </div>
                  </SelectItem>
                  <SelectItem value="META">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-[#1877F2]" />
                      Meta Ads
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">Platform cannot be changed after creation.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountId">
                Account ID <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="accountId"
                  value={values.accountId}
                  onChange={set("accountId")}
                  placeholder={
                    values.platform === "GOOGLE"
                      ? "e.g. 123-456-7890"
                      : "e.g. act_123456789"
                  }
                  required
                  disabled={mode === "edit" || loading}
                />
                {mode === "create" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={!values.accountId || verifying || loading}
                    onClick={handleVerify}
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    {verifying ? "Checking..." : "Verify"}
                  </Button>
                )}
              </div>

              {/* Verification result */}
              {verification && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                    verification.valid
                      ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                      : "border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                  )}
                >
                  {verification.valid ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {verification.valid
                    ? `Account verified: ${verification.name}`
                    : verification.error}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {values.platform === "GOOGLE"
                  ? "Your Google Ads Customer ID (found in the top right of Google Ads)"
                  : "Your Meta Ad Account ID (format: act_XXXXXXX)"}
              </p>
            </div>

            <Separator />

            {values.platform === "GOOGLE" ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-3">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300">MCC Account Sync</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  Google Ads syncs via your MCC (Manager) account. No per-client token needed — just set{" "}
                  <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">GOOGLE_ADS_REFRESH_TOKEN</code>{" "}
                  in <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">.env.local</code>.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Access Token</h4>
                  <p className="text-xs text-muted-foreground">
                    Long-lived Meta access token (60 days). Get it from Meta Business Manager → Graph API Explorer.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accessToken">Access Token</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    value={values.accessToken}
                    onChange={set("accessToken")}
                    placeholder={mode === "edit" ? "Leave blank to keep existing" : "EAAxxxxxxx..."}
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <Link href={mode === "edit" ? `/clients/${client!.id}` : "/clients"}>
          <Button variant="outline" type="button" disabled={loading}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={loading || (mode === "create" && !verification?.valid)} className="min-w-[120px]">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {mode === "create" ? "Create Client" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
