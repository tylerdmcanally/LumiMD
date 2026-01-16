'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  React.useEffect(() => {
    if (!token) return;
    router.replace(`/care/invite/${token}`);
  }, [router, token]);

  return (
    <PageContainer maxWidth="lg">
      <Card variant="elevated" padding="lg" className="text-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-brand-primary mx-auto mb-4" />
        <h1 className="text-2xl font-semibold text-text-primary mb-2">
          Redirecting...
        </h1>
        <p className="text-text-secondary">Please wait while we update your invite link.</p>
      </Card>
    </PageContainer>
  );
}

