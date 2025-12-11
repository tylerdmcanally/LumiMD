'use client';

import { PageContainer } from '@/components/layout/PageContainer';
import { CaregiverSettings } from '@/components/CaregiverSettings';

export default function SharingPage() {
    return (
        <PageContainer>
            <div className="max-w-3xl mx-auto">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-text-primary mb-2">Sharing</h1>
                    <p className="text-text-secondary">
                        Manage who can view your health information
                    </p>
                </div>

                {/* Caregiver Management */}
                <CaregiverSettings />
            </div>
        </PageContainer>
    );
}
