/**
 * Provider Report PDF Generator
 * 
 * Generates professional PDF reports for healthcare providers
 * with patient health metrics, trends, and active medications.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { BloodPressureValue, GlucoseValue, WeightValue, HealthLogType } from '../types/lumibot';
import { analyzeTrends, TrendInsight } from './trendAnalyzer';

// =============================================================================
// Types
// =============================================================================

interface HealthLogDoc {
    type: HealthLogType;
    value: BloodPressureValue | GlucoseValue | WeightValue;
    alertLevel?: string;
    createdAt: admin.firestore.Timestamp;
    source: string;
}

interface MedicationDoc {
    name: string;
    dosage?: string;
    frequency?: string;
    status?: string;
}

interface ReportData {
    patientName?: string;
    reportPeriod: string;
    generatedAt: string;
    healthLogs: HealthLogDoc[];
    medications: MedicationDoc[];
    trendInsights: TrendInsight[];
}

interface ReportStats {
    bp: {
        count: number;
        latest?: { systolic: number; diastolic: number; date: string };
        avgSystolic?: number;
        avgDiastolic?: number;
        minSystolic?: number;
        maxSystolic?: number;
    };
    glucose: {
        count: number;
        latest?: { reading: number; timing?: string; date: string };
        avg?: number;
        min?: number;
        max?: number;
        outOfRange?: number;
    };
    weight: {
        count: number;
        latest?: { weight: number; date: string };
        startWeight?: number;
        change?: number;
    };
}

// =============================================================================
// Fonts Configuration
// =============================================================================

const fonts = {
    Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};

const printer = new PdfPrinter(fonts);

// =============================================================================
// Brand Colors - LumiMD Teal Palette
// =============================================================================

const BRAND = {
    primary: '#40c9d0',        // LumiMD teal
    primaryDark: '#078a94',    // Darker teal
    primaryLight: '#e1f9fa',   // Pale teal for backgrounds
    text: '#1a202c',
    textSecondary: '#4a5568',
    border: '#e2e8f0',
    success: '#48bb78',
    warning: '#ed8936',
    danger: '#f56565',
    background: '#e1f9fa',     // Use pale teal for card backgrounds
};

// =============================================================================
// Stats Calculator
// =============================================================================

function calculateStats(healthLogs: HealthLogDoc[]): ReportStats {
    const bpLogs = healthLogs.filter(log => log.type === 'bp');
    const glucoseLogs = healthLogs.filter(log => log.type === 'glucose');
    const weightLogs = healthLogs.filter(log => log.type === 'weight');

    // BP Stats
    const bpStats: ReportStats['bp'] = { count: bpLogs.length };
    if (bpLogs.length > 0) {
        const sortedBp = [...bpLogs].sort((a, b) =>
            b.createdAt.toMillis() - a.createdAt.toMillis()
        );
        const latestBp = sortedBp[0].value as BloodPressureValue;
        bpStats.latest = {
            systolic: latestBp.systolic,
            diastolic: latestBp.diastolic,
            date: sortedBp[0].createdAt.toDate().toLocaleDateString(),
        };

        const systolicVals = bpLogs.map(l => (l.value as BloodPressureValue).systolic);
        const diastolicVals = bpLogs.map(l => (l.value as BloodPressureValue).diastolic);

        bpStats.avgSystolic = Math.round(systolicVals.reduce((a, b) => a + b, 0) / systolicVals.length);
        bpStats.avgDiastolic = Math.round(diastolicVals.reduce((a, b) => a + b, 0) / diastolicVals.length);
        bpStats.minSystolic = Math.min(...systolicVals);
        bpStats.maxSystolic = Math.max(...systolicVals);
    }

    // Glucose Stats
    const glucoseStats: ReportStats['glucose'] = { count: glucoseLogs.length };
    if (glucoseLogs.length > 0) {
        const sortedGlucose = [...glucoseLogs].sort((a, b) =>
            b.createdAt.toMillis() - a.createdAt.toMillis()
        );
        const latestGlucose = sortedGlucose[0].value as GlucoseValue;
        glucoseStats.latest = {
            reading: latestGlucose.reading,
            timing: latestGlucose.timing,
            date: sortedGlucose[0].createdAt.toDate().toLocaleDateString(),
        };

        const readings = glucoseLogs.map(l => (l.value as GlucoseValue).reading);
        glucoseStats.avg = Math.round(readings.reduce((a, b) => a + b, 0) / readings.length);
        glucoseStats.min = Math.min(...readings);
        glucoseStats.max = Math.max(...readings);
        glucoseStats.outOfRange = readings.filter(r => r < 70 || r > 180).length;
    }

    // Weight Stats
    const weightStats: ReportStats['weight'] = { count: weightLogs.length };
    if (weightLogs.length > 0) {
        const sortedWeight = [...weightLogs].sort((a, b) =>
            a.createdAt.toMillis() - b.createdAt.toMillis() // Oldest first for change calc
        );
        const latestWeight = sortedWeight[sortedWeight.length - 1].value as WeightValue;
        const startWeight = sortedWeight[0].value as WeightValue;

        weightStats.latest = {
            weight: latestWeight.weight,
            date: sortedWeight[sortedWeight.length - 1].createdAt.toDate().toLocaleDateString(),
        };
        weightStats.startWeight = startWeight.weight;
        weightStats.change = Math.round((latestWeight.weight - startWeight.weight) * 10) / 10;
    }

    return { bp: bpStats, glucose: glucoseStats, weight: weightStats };
}

// =============================================================================
// PDF Document Builder
// =============================================================================

function buildDocumentDefinition(data: ReportData): TDocumentDefinitions {
    const stats = calculateStats(data.healthLogs);

    const content: Content[] = [
        // Header with branding
        {
            columns: [
                {
                    stack: [
                        { text: 'LumiMD', style: 'brand' },
                        { text: 'Patient Health Report', style: 'title' },
                    ],
                },
                {
                    stack: [
                        { text: `Report Period: Last ${data.reportPeriod}`, style: 'meta', alignment: 'right' },
                        { text: `Generated: ${data.generatedAt}`, style: 'meta', alignment: 'right' },
                    ],
                },
            ],
            margin: [0, 0, 0, 20],
        },

        // Divider
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: BRAND.primary }] },
        { text: '', margin: [0, 10, 0, 0] },

        // Health Metrics Summary Section
        { text: 'Health Metrics Summary', style: 'sectionHeader' },
    ];

    // BP Summary Card
    if (stats.bp.count > 0) {
        content.push({
            table: {
                widths: ['*'],
                body: [
                    [{
                        stack: [
                            { text: 'Blood Pressure', style: 'cardTitle' },
                            {
                                columns: [
                                    {
                                        stack: [
                                            { text: 'Latest Reading', style: 'cardLabel' },
                                            { text: `${stats.bp.latest?.systolic}/${stats.bp.latest?.diastolic} mmHg`, style: 'cardValue' },
                                            { text: stats.bp.latest?.date || '', style: 'cardDate' },
                                        ],
                                        width: '33%',
                                    },
                                    {
                                        stack: [
                                            { text: 'Average', style: 'cardLabel' },
                                            { text: `${stats.bp.avgSystolic}/${stats.bp.avgDiastolic} mmHg`, style: 'cardValue' },
                                            { text: `${stats.bp.count} readings`, style: 'cardDate' },
                                        ],
                                        width: '33%',
                                    },
                                    {
                                        stack: [
                                            { text: 'Range (Systolic)', style: 'cardLabel' },
                                            { text: `${stats.bp.minSystolic} - ${stats.bp.maxSystolic} mmHg`, style: 'cardValue' },
                                        ],
                                        width: '33%',
                                    },
                                ],
                            },
                        ],
                        fillColor: BRAND.background,
                        margin: [10, 10, 10, 10],
                    }],
                ],
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => BRAND.border,
                vLineColor: () => BRAND.border,
            },
            margin: [0, 0, 0, 10],
        });
    }

    // Glucose Summary Card
    if (stats.glucose.count > 0) {
        content.push({
            table: {
                widths: ['*'],
                body: [
                    [{
                        stack: [
                            { text: 'Blood Glucose', style: 'cardTitle' },
                            {
                                columns: [
                                    {
                                        stack: [
                                            { text: 'Latest Reading', style: 'cardLabel' },
                                            { text: `${stats.glucose.latest?.reading} mg/dL`, style: 'cardValue' },
                                            { text: `${stats.glucose.latest?.timing || 'Random'} • ${stats.glucose.latest?.date}`, style: 'cardDate' },
                                        ],
                                        width: '33%',
                                    },
                                    {
                                        stack: [
                                            { text: 'Average', style: 'cardLabel' },
                                            { text: `${stats.glucose.avg} mg/dL`, style: 'cardValue' },
                                            { text: `${stats.glucose.count} readings`, style: 'cardDate' },
                                        ],
                                        width: '33%',
                                    },
                                    {
                                        stack: [
                                            { text: 'Range', style: 'cardLabel' },
                                            { text: `${stats.glucose.min} - ${stats.glucose.max} mg/dL`, style: 'cardValue' },
                                            { text: stats.glucose.outOfRange ? `${stats.glucose.outOfRange} out of range` : 'All in range', style: 'cardDate', color: stats.glucose.outOfRange ? BRAND.warning : BRAND.success },
                                        ],
                                        width: '33%',
                                    },
                                ],
                            },
                        ],
                        fillColor: BRAND.background,
                        margin: [10, 10, 10, 10],
                    }],
                ],
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => BRAND.border,
                vLineColor: () => BRAND.border,
            },
            margin: [0, 0, 0, 10],
        });
    }

    // Weight Summary Card
    if (stats.weight.count > 0) {
        const changeText = stats.weight.change !== undefined
            ? (stats.weight.change >= 0 ? `+${stats.weight.change}` : `${stats.weight.change}`)
            : 'N/A';

        content.push({
            table: {
                widths: ['*'],
                body: [
                    [{
                        stack: [
                            { text: 'Weight', style: 'cardTitle' },
                            {
                                columns: [
                                    {
                                        stack: [
                                            { text: 'Current Weight', style: 'cardLabel' },
                                            { text: `${stats.weight.latest?.weight} lbs`, style: 'cardValue' },
                                            { text: stats.weight.latest?.date || '', style: 'cardDate' },
                                        ],
                                        width: '50%',
                                    },
                                    {
                                        stack: [
                                            { text: 'Change (30 days)', style: 'cardLabel' },
                                            { text: `${changeText} lbs`, style: 'cardValue' },
                                            { text: `${stats.weight.count} readings`, style: 'cardDate' },
                                        ],
                                        width: '50%',
                                    },
                                ],
                            },
                        ],
                        fillColor: BRAND.background,
                        margin: [10, 10, 10, 10],
                    }],
                ],
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => BRAND.border,
                vLineColor: () => BRAND.border,
            },
            margin: [0, 0, 0, 10],
        });
    }

    // No data message
    if (stats.bp.count === 0 && stats.glucose.count === 0 && stats.weight.count === 0) {
        content.push({
            text: 'No health readings recorded in this period.',
            style: 'noData',
            margin: [0, 10, 0, 20],
        });
    }

    // Trend Insights Section
    if (data.trendInsights && data.trendInsights.length > 0) {
        content.push({ text: '', margin: [0, 10, 0, 0] });
        content.push({ text: 'Trend Analysis', style: 'sectionHeader' });

        const trendTableBody: TableCell[][] = [
            [
                { text: 'Metric', style: 'tableHeader' },
                { text: 'Pattern', style: 'tableHeader' },
                { text: 'Insight', style: 'tableHeader' },
            ],
        ];

        data.trendInsights.forEach(insight => {
            const metricName = insight.type === 'bp' ? 'Blood Pressure'
                : insight.type === 'glucose' ? 'Blood Glucose'
                    : insight.type === 'weight' ? 'Weight' : insight.type;

            const severityColor = insight.severity === 'concern' ? BRAND.danger
                : insight.severity === 'attention' ? BRAND.warning
                    : insight.severity === 'positive' ? BRAND.success
                        : BRAND.text;

            const trendArrow = insight.data.trend === 'up' ? '↑'
                : insight.data.trend === 'down' ? '↓'
                    : '→';

            trendTableBody.push([
                { text: metricName, style: 'tableCell' },
                { text: `${trendArrow} ${insight.title}`, style: 'tableCell', color: severityColor },
                { text: insight.message, style: 'tableCell' },
            ]);
        });

        content.push({
            table: {
                headerRows: 1,
                widths: ['auto', 'auto', '*'],
                body: trendTableBody,
            },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: (i) => i === 1 ? BRAND.primary : BRAND.border,
                paddingTop: () => 8,
                paddingBottom: () => 8,
                paddingLeft: () => 8,
                paddingRight: () => 8,
            },
            margin: [0, 0, 0, 20],
        });
    }

    // Active Medications Section
    content.push({ text: '', margin: [0, 10, 0, 0] });
    content.push({ text: 'Active Medications', style: 'sectionHeader' });

    if (data.medications.length > 0) {
        const medTableBody: TableCell[][] = [
            [
                { text: 'Medication', style: 'tableHeader' },
                { text: 'Dosage', style: 'tableHeader' },
                { text: 'Frequency', style: 'tableHeader' },
            ],
        ];

        data.medications.forEach(med => {
            medTableBody.push([
                { text: med.name, style: 'tableCell' },
                { text: med.dosage || '-', style: 'tableCell' },
                { text: med.frequency || '-', style: 'tableCell' },
            ]);
        });

        content.push({
            table: {
                headerRows: 1,
                widths: ['*', 'auto', 'auto'],
                body: medTableBody,
            },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: (i) => i === 1 ? BRAND.primary : BRAND.border,
                paddingTop: () => 8,
                paddingBottom: () => 8,
                paddingLeft: () => 8,
                paddingRight: () => 8,
            },
            margin: [0, 0, 0, 20],
        });
    } else {
        content.push({
            text: 'No active medications on file.',
            style: 'noData',
            margin: [0, 10, 0, 20],
        });
    }

    // Readings Detail Table
    if (data.healthLogs.length > 0) {
        content.push({ text: 'Reading History', style: 'sectionHeader' });

        const readingsBody: TableCell[][] = [
            [
                { text: 'Date', style: 'tableHeader' },
                { text: 'Type', style: 'tableHeader' },
                { text: 'Value', style: 'tableHeader' },
                { text: 'Status', style: 'tableHeader' },
            ],
        ];

        // Sort by date descending
        const sortedLogs = [...data.healthLogs].sort((a, b) =>
            b.createdAt.toMillis() - a.createdAt.toMillis()
        ).slice(0, 50); // Limit to 50 readings

        sortedLogs.forEach(log => {
            let valueText = '';
            let typeText = '';

            switch (log.type) {
                case 'bp':
                    const bpVal = log.value as BloodPressureValue;
                    valueText = `${bpVal.systolic}/${bpVal.diastolic} mmHg`;
                    typeText = 'Blood Pressure';
                    break;
                case 'glucose':
                    const gVal = log.value as GlucoseValue;
                    valueText = `${gVal.reading} mg/dL`;
                    typeText = 'Blood Glucose';
                    break;
                case 'weight':
                    const wVal = log.value as WeightValue;
                    valueText = `${wVal.weight} lbs`;
                    typeText = 'Weight';
                    break;
                default:
                    valueText = JSON.stringify(log.value);
                    typeText = log.type;
            }

            const statusColor = log.alertLevel === 'warning' ? BRAND.danger
                : log.alertLevel === 'caution' ? BRAND.warning
                    : BRAND.success;

            readingsBody.push([
                { text: log.createdAt.toDate().toLocaleDateString(), style: 'tableCell' },
                { text: typeText, style: 'tableCell' },
                { text: valueText, style: 'tableCell' },
                { text: log.alertLevel || 'Normal', style: 'tableCell', color: statusColor },
            ]);
        });

        content.push({
            table: {
                headerRows: 1,
                widths: ['auto', '*', 'auto', 'auto'],
                body: readingsBody,
            },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: (i) => i === 1 ? BRAND.primary : BRAND.border,
                paddingTop: () => 6,
                paddingBottom: () => 6,
                paddingLeft: () => 8,
                paddingRight: () => 8,
            },
            margin: [0, 0, 0, 20],
        });
    }

    // Footer
    content.push({
        text: 'This report was generated by LumiMD for healthcare provider review. Data is self-reported by the patient.',
        style: 'footer',
        margin: [0, 20, 0, 0],
    });

    return {
        content,
        defaultStyle: {
            font: 'Helvetica',
            fontSize: 10,
            color: BRAND.text,
        },
        styles: {
            brand: {
                fontSize: 24,
                bold: true,
                color: BRAND.primary,
            },
            title: {
                fontSize: 14,
                color: BRAND.textSecondary,
                margin: [0, 4, 0, 0],
            },
            meta: {
                fontSize: 9,
                color: BRAND.textSecondary,
            },
            sectionHeader: {
                fontSize: 14,
                bold: true,
                color: BRAND.text,
                margin: [0, 10, 0, 10],
            },
            cardTitle: {
                fontSize: 12,
                bold: true,
                color: BRAND.primaryDark,
                margin: [0, 0, 0, 8],
            },
            cardLabel: {
                fontSize: 9,
                color: BRAND.textSecondary,
                margin: [0, 0, 0, 2],
            },
            cardValue: {
                fontSize: 16,
                bold: true,
                color: BRAND.text,
            },
            cardDate: {
                fontSize: 8,
                color: BRAND.textSecondary,
                margin: [0, 2, 0, 0],
            },
            tableHeader: {
                fontSize: 10,
                bold: true,
                color: BRAND.text,
            },
            tableCell: {
                fontSize: 9,
                color: BRAND.text,
            },
            noData: {
                fontSize: 10,
                color: BRAND.textSecondary,
                italics: true,
            },
            footer: {
                fontSize: 8,
                color: BRAND.textSecondary,
                italics: true,
            },
        },
        pageMargins: [40, 40, 40, 40],
    };
}

// =============================================================================
// Public API
// =============================================================================

export async function generateProviderReport(
    userId: string,
    days: number = 30
): Promise<Buffer> {
    const db = admin.firestore();

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch health logs
    const healthLogsSnapshot = await db
        .collection('healthLogs')
        .where('userId', '==', userId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .orderBy('createdAt', 'desc')
        .get();

    const healthLogs: HealthLogDoc[] = healthLogsSnapshot.docs.map(doc => ({
        type: doc.data().type,
        value: doc.data().value,
        alertLevel: doc.data().alertLevel,
        createdAt: doc.data().createdAt,
        source: doc.data().source,
    }));

    // Fetch active medications
    const medicationsSnapshot = await db
        .collection('medications')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .get();

    const medications: MedicationDoc[] = medicationsSnapshot.docs.map(doc => ({
        name: doc.data().name,
        dosage: doc.data().dosage,
        frequency: doc.data().frequency,
        status: doc.data().status,
    }));

    functions.logger.info(`[PDF] Generating report for user ${userId}`, {
        healthLogs: healthLogs.length,
        medications: medications.length,
        days,
    });

    // Run trend analysis on health logs
    const logsForAnalysis = healthLogs.map(log => ({
        type: log.type as string,
        value: log.value as unknown as Record<string, unknown>,
        createdAt: log.createdAt.toDate(),
    }));
    const trendInsights = analyzeTrends(logsForAnalysis);

    functions.logger.info(`[PDF] Trend analysis found ${trendInsights.length} insights`);

    // Build report data
    const reportData: ReportData = {
        reportPeriod: `${days} days`,
        generatedAt: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }),
        healthLogs,
        medications,
        trendInsights,
    };

    // Generate PDF
    const docDefinition = buildDocumentDefinition(reportData);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    // Convert to buffer
    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}
