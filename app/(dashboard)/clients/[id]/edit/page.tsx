import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClientForm } from "@/components/clients/ClientForm";
import { withoutSecrets } from "@/lib/utils";

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  return { title: `Edit ${client?.name ?? "Client"}` };
}

export default async function EditClientPage({ params }: Params) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });

  if (!client) notFound();

  return (
    <div className="flex flex-col">
      <Header title={`Edit ${client.name}`} parent={{ label: "Clients", href: "/clients" }} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Edit client"
          description={<>Update account and notification settings for <strong className="font-medium text-foreground">{client.name}</strong>.</>}
        />
        <ClientForm client={withoutSecrets(client)} mode="edit" />
      </div>
    </div>
  );
}
