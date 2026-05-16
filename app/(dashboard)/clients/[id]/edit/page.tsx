import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ClientForm } from "@/components/clients/ClientForm";

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
    <div className="flex flex-col h-full">
      <Header title={`Edit — ${client.name}`} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full animate-fade-in">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Edit Client</h2>
          <p className="text-sm text-muted-foreground">
            Update settings for <strong>{client.name}</strong>.
          </p>
        </div>
        <ClientForm client={client} mode="edit" />
      </div>
    </div>
  );
}
