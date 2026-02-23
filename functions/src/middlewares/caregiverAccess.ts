import { hasAcceptedCaregiverShareAccess } from '../services/shareAccess';

export type EnsureCaregiverAccessOptions = {
    message?: string;
    onForbidden?: () => void;
};

export async function ensureCaregiverAccessOrReject(
    caregiverId: string,
    patientId: string,
    res: {
        status: (statusCode: number) => {
            json: (payload: { code: string; message: string }) => void;
        };
    },
    options: EnsureCaregiverAccessOptions = {},
): Promise<boolean> {
    const hasAccess = await hasAcceptedCaregiverShareAccess(caregiverId, patientId);
    if (hasAccess) {
        return true;
    }

    options.onForbidden?.();

    res.status(403).json({
        code: 'forbidden',
        message: options.message ?? 'You do not have access to this patient\'s data',
    });

    return false;
}
