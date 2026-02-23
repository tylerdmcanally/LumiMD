#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const indexesPath = path.resolve(__dirname, '../../firestore.indexes.json');

const REQUIRED_INDEXES = [
  {
    collectionGroup: 'shareInvites',
    fields: [
      { fieldPath: 'ownerId', order: 'ASCENDING' },
      { fieldPath: 'caregiverUserId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'shares',
    fields: [
      { fieldPath: 'caregiverUserId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'visits',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'deletedAt', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'visits',
    fields: [
      { fieldPath: 'processingStatus', order: 'ASCENDING' },
      { fieldPath: 'postCommitStatus', order: 'ASCENDING' },
      { fieldPath: 'postCommitRetryEligible', order: 'ASCENDING' },
      { fieldPath: 'postCommitLastAttemptAt', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'actions',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'completed', order: 'ASCENDING' },
      { fieldPath: 'deletedAt', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'actions',
    fields: [
      { fieldPath: 'visitId', order: 'ASCENDING' },
      { fieldPath: 'userId', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'medications',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'active', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'healthLogs',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'sourceId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'caregiverNotes',
    fields: [
      { fieldPath: 'caregiverId', order: 'ASCENDING' },
      { fieldPath: 'patientId', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'careTasks',
    fields: [
      { fieldPath: 'patientId', order: 'ASCENDING' },
      { fieldPath: 'caregiverId', order: 'ASCENDING' },
      { fieldPath: 'deletedAt', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'medicationReminders',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'enabled', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'medicationReminders',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'medicationId', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'medicationLogs',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'medicationId', order: 'ASCENDING' },
      { fieldPath: 'loggedAt', order: 'DESCENDING' },
    ],
  },
];

const encodeField = (field) => {
  if (field.order) {
    return `${field.fieldPath}:${field.order}`;
  }
  if (field.arrayConfig) {
    return `${field.fieldPath}:${field.arrayConfig}`;
  }
  return `${field.fieldPath}:<unknown>`;
};

const encodeIndex = (index) => {
  const scope = index.queryScope ?? 'COLLECTION';
  const fields = (index.fields ?? []).map(encodeField).join(',');
  return `${index.collectionGroup}|${scope}|${fields}`;
};

const readIndexes = () => {
  if (!fs.existsSync(indexesPath)) {
    throw new Error(`Missing index file: ${indexesPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  if (!Array.isArray(parsed.indexes)) {
    throw new Error('Invalid firestore.indexes.json: "indexes" must be an array.');
  }

  return parsed.indexes;
};

const indexes = readIndexes();
const signatureCount = new Map();
for (const index of indexes) {
  const signature = encodeIndex(index);
  signatureCount.set(signature, (signatureCount.get(signature) ?? 0) + 1);
}

const duplicateSignatures = Array.from(signatureCount.entries())
  .filter(([, count]) => count > 1)
  .map(([signature, count]) => ({ signature, count }));

const existing = new Set(Array.from(signatureCount.keys()));
const missingRequired = REQUIRED_INDEXES
  .map((index) => ({
    definition: index,
    signature: encodeIndex({ ...index, queryScope: 'COLLECTION' }),
  }))
  .filter(({ signature }) => !existing.has(signature));

if (missingRequired.length > 0 || duplicateSignatures.length > 0) {
  if (missingRequired.length > 0) {
    console.error('[index-guardrails] Missing required Firestore indexes:');
    for (const missing of missingRequired) {
      console.error(`  - ${missing.signature}`);
    }
  }

  if (duplicateSignatures.length > 0) {
    console.error('[index-guardrails] Duplicate Firestore index definitions detected:');
    for (const duplicate of duplicateSignatures) {
      console.error(`  - ${duplicate.signature} (x${duplicate.count})`);
    }
  }

  process.exit(1);
}

console.log(
  `[index-guardrails] Verified ${REQUIRED_INDEXES.length} required indexes against ${indexes.length} total definitions.`,
);
