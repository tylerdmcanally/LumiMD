import WidgetKit
import SwiftUI

// MARK: - Record Visit Widget

struct RecordVisitProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecordVisitEntry {
        RecordVisitEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (RecordVisitEntry) -> Void) {
        completion(RecordVisitEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecordVisitEntry>) -> Void) {
        let entry = RecordVisitEntry(date: Date())
        let timeline = Timeline(entries: [entry], policy: .never)
        completion(timeline)
    }
}

struct RecordVisitEntry: TimelineEntry {
    let date: Date
}

struct RecordVisitWidgetView: View {
    var entry: RecordVisitProvider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "mic.fill")
                .font(.system(size: family == .systemSmall ? 36 : 44, weight: .medium))
                .foregroundColor(.white)
            
            Text("Record Visit")
                .font(.system(size: family == .systemSmall ? 14 : 16, weight: .semibold))
                .foregroundColor(.white)
            
            if family != .systemSmall {
                Text("Tap to start recording")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.85))
            }
        }
        .widgetURL(URL(string: "lumimd://record"))
    }
}

struct RecordVisitWidget: Widget {
    let kind: String = "RecordVisitWidget"
    private let brandPrimary = Color(red: 0.03, green: 0.54, blue: 0.58)
    private let brandSecondary = Color(red: 0.25, green: 0.79, blue: 0.82)

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecordVisitProvider()) { entry in
            RecordVisitWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(
                        gradient: Gradient(colors: [brandPrimary, brandSecondary]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
        }
        .configurationDisplayName("Record Visit")
        .description("Quickly start recording your medical visit.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Medication Schedule Widget

struct MedScheduleEntry: TimelineEntry {
    let date: Date
    let medications: [ScheduledMed]
    let isSynced: Bool
    
    struct ScheduledMed: Identifiable {
        let id: String
        let name: String
        let dose: String
        let time: String
        let status: MedStatus
    }
    
    enum MedStatus: String {
        case pending, taken, skipped, overdue
    }
    
    var pendingCount: Int {
        medications.filter { $0.status == .pending || $0.status == .overdue }.count
    }
    
    var takenCount: Int {
        medications.filter { $0.status == .taken }.count
    }
    
    var nextPending: ScheduledMed? {
        medications.first { $0.status == .pending || $0.status == .overdue }
    }
    
    var allDone: Bool {
        medications.allSatisfy { $0.status != .pending && $0.status != .overdue }
    }
    
    static var placeholder: MedScheduleEntry {
        MedScheduleEntry(date: Date(), medications: [
            ScheduledMed(id: "1", name: "Metformin", dose: "500mg", time: "8:00 AM", status: .pending),
            ScheduledMed(id: "2", name: "Lisinopril", dose: "10mg", time: "8:00 AM", status: .taken),
        ], isSynced: true)
    }
}

struct MedScheduleProvider: TimelineProvider {
    private let appGroupID = "group.com.lumimd.app"
    
    func placeholder(in context: Context) -> MedScheduleEntry {
        MedScheduleEntry.placeholder
    }
    
    func getSnapshot(in context: Context, completion: @escaping (MedScheduleEntry) -> Void) {
        completion(loadMedications())
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<MedScheduleEntry>) -> Void) {
        let entry = loadMedications()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    private func loadMedications() -> MedScheduleEntry {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            return MedScheduleEntry(date: Date(), medications: [], isSynced: false)
        }
        
        // Check if we have data at all. If key is missing, we haven't synced yet.
        guard let jsonString = defaults.string(forKey: "medicationSchedule") else {
             return MedScheduleEntry(date: Date(), medications: [], isSynced: false)
        }
              
        guard let data = jsonString.data(using: .utf8) else {
            return MedScheduleEntry(date: Date(), medications: [], isSynced: true)
        }
        
        // Try to decode as new WidgetData format first, fallback to old array format
        let meds: [SharedMedication]
        let lastSyncedAt: String?
        
        if let widgetData = try? JSONDecoder().decode(WidgetData.self, from: data) {
            meds = widgetData.medications
            lastSyncedAt = widgetData.lastSyncedAt
        } else if let oldMeds = try? JSONDecoder().decode([SharedMedication].self, from: data) {
            // Backward compatibility: old format was just an array
            meds = oldMeds
            lastSyncedAt = nil
        } else {
            // Failed to decode - treat as valid empty
            return MedScheduleEntry(date: Date(), medications: [], isSynced: true)
        }
        
        let scheduledMeds = meds.map { med in
            MedScheduleEntry.ScheduledMed(
                id: med.id,
                name: med.name,
                dose: med.dose,
                time: med.time,
                status: MedScheduleEntry.MedStatus(rawValue: med.status) ?? .pending
            )
        }
        
        return MedScheduleEntry(date: Date(), medications: scheduledMeds, isSynced: true)
    }
}

struct SharedMedication: Codable {
    let id: String
    let name: String
    let dose: String
    let time: String
    let status: String
}

struct WidgetData: Codable {
    let medications: [SharedMedication]
    let lastSyncedAt: String?
}

// MARK: - Widget View

struct MedScheduleWidgetView: View {
    var entry: MedScheduleEntry
    @Environment(\.widgetFamily) var family
    
    // LumiMD brand colors
    private let brandPrimary = Color(red: 0.03, green: 0.54, blue: 0.58)
    private let brandSecondary = Color(red: 0.25, green: 0.79, blue: 0.82)
    private let successColor = Color(red: 0.20, green: 0.83, blue: 0.60)
    
    var body: some View {
        Group {
            if !entry.isSynced {
                syncRequiredView
            } else if entry.medications.isEmpty {
                emptyStateView
            } else if entry.allDone {
                allDoneView
            } else {
                pendingView
            }
        }
        .widgetURL(URL(string: "lumimd://medication-schedule"))
    }
    
    // MARK: - Sync Required State
    private var syncRequiredView: some View {
        VStack(spacing: 12) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(
                    LinearGradient(colors: [brandPrimary, brandSecondary], startPoint: .top, endPoint: .bottom)
                )
            
            Text("Sync Required")
                .font(.system(size: 16, weight: .semibold))
            
            Text("Open LumiMD app to sync")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State
    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "pills")
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(
                    LinearGradient(colors: [brandPrimary, brandSecondary], startPoint: .top, endPoint: .bottom)
                )
            
            Text("No Meds Today")
                .font(.system(size: 16, weight: .semibold))
            
            Text("Tap to set up reminders")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - All Done State
    private var allDoneView: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(successColor.opacity(0.15))
                    .frame(width: 56, height: 56)
                
                Image(systemName: "checkmark")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(successColor)
            }
            
            Text("All Done!")
                .font(.system(size: 20, weight: .bold))
            
            Text("\(entry.takenCount) medication\(entry.takenCount == 1 ? "" : "s") taken")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Pending State
    private var pendingView: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Image(systemName: "pills.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(colors: [brandPrimary, brandSecondary], startPoint: .leading, endPoint: .trailing)
                    )
                
                Text("Today's Meds")
                    .font(.system(size: 15, weight: .bold))
                
                Spacer()
            }
            
            Spacer()
            
            // Main content - pending count
            HStack(alignment: .center, spacing: 16) {
                // Large pending number
                Text("\(entry.pendingCount)")
                    .font(.system(size: family == .systemSmall ? 48 : 56, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(colors: [brandPrimary, brandSecondary], startPoint: .top, endPoint: .bottom)
                    )
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("medication\(entry.pendingCount == 1 ? "" : "s")")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.secondary)
                    
                    Text("remaining")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            // Next medication info
            if let next = entry.nextPending {
                HStack(spacing: 6) {
                    Text("Next:")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.secondary)
                    
                    Text(next.name)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                    
                    if family != .systemSmall {
                        Spacer()
                        
                        Text(next.time)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(brandPrimary)
                    }
                }
                .padding(.top, 8)
            }
            

        }
    }
}

struct MedScheduleWidget: Widget {
    let kind: String = "MedScheduleWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MedScheduleProvider()) { entry in
            MedScheduleWidgetView(entry: entry)
                .containerBackground(.fill, for: .widget)
        }
        .configurationDisplayName("Medication Schedule")
        .description("See your daily medication status at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemSmall) {
    RecordVisitWidget()
} timeline: {
    RecordVisitEntry(date: .now)
}

#Preview(as: .systemMedium) {
    MedScheduleWidget()
} timeline: {
    MedScheduleEntry.placeholder
}
