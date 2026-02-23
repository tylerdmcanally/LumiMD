import type {
  MedicationReminderListByUserOptions,
  MedicationReminderRecord,
  MedicationReminderRepository,
} from './MedicationReminderRepository';

function mapMedicationReminderDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): MedicationReminderRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as MedicationReminderRecord;
}

export class FirestoreMedicationReminderRepository implements MedicationReminderRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private applyFilters(
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    options: MedicationReminderListByUserOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    if (typeof options.enabled === 'boolean') {
      query = query.where('enabled', '==', options.enabled);
    }

    if (options.medicationId) {
      query = query.where('medicationId', '==', options.medicationId);
    }

    return query;
  }

  private filterDeleted(
    reminders: MedicationReminderRecord[],
    options: MedicationReminderListByUserOptions,
  ): MedicationReminderRecord[] {
    if (options.includeDeleted === true) {
      return reminders;
    }

    return reminders.filter((reminder) => !reminder.deletedAt);
  }

  async listByUser(
    userId: string,
    options: MedicationReminderListByUserOptions = {},
  ): Promise<MedicationReminderRecord[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('medicationReminders')
      .where('userId', '==', userId);
    query = this.applyFilters(query, options);

    const snapshot = await query.get();
    const reminders = snapshot.docs.map((doc) => mapMedicationReminderDoc(doc));
    return this.filterDeleted(reminders, options);
  }

  async listByUsers(
    userIds: string[],
    options: MedicationReminderListByUserOptions = {},
  ): Promise<MedicationReminderRecord[]> {
    if (userIds.length === 0) {
      return [];
    }

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('medicationReminders')
      .where('userId', 'in', userIds);
    query = this.applyFilters(query, options);

    const snapshot = await query.get();
    const reminders = snapshot.docs.map((doc) => mapMedicationReminderDoc(doc));
    return this.filterDeleted(reminders, options);
  }
}
