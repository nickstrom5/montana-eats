import Foundation
import CoreLocation
import UIKit

/// `-screenshot <name>` opens one screen with fixed state for App Store screenshots (scripts/capture-screenshots.sh).
/// Names: home, steakhouses, driveins, honors, oldest, detail, map, saved, about.
enum ScreenshotMode {
    /// Debug builds only: an App Store build ignores the launch argument, so no one can reach seeded screens or fake locations.
    static var name: String? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-screenshot"), i + 1 < args.count else { return nil }
        return args[i + 1]
        #else
        return nil
        #endif
    }
    static var isActive: Bool { name != nil }

    @MainActor
    static func apply(to model: AppModel) {
        guard let name, model.isLoaded else { return }
        model.filters = Filters()
        // Bozeman's Main Street, so "nearest" lists have distances without a permission prompt
        model.screenshotLocation = CLLocation(latitude: 45.6793, longitude: -111.0373)
        // by name and town, ignoring case, so a rebuild with a slightly different casing still finds the place; the hand-checked one first
        let pick = { (n: String, town: String?) -> Place? in
            let hits = model.places.filter { $0.name.caseInsensitiveCompare(n) == .orderedSame && (town == nil || $0.city == town) }
            return hits.first(where: \.handChecked) ?? hits.first
        }
        for p in [pick("Lydia's Supper Club", "Butte"), pick("Red Box Car", "Red Lodge"), pick("Wild Crumb", "Bozeman")]
            .compactMap({ $0 }) where !model.isSaved(p) {
            model.toggleSaved(p)
        }
        let open = { (g: Guide) in model.tab = .guides; model.selectedGuide = g; model.guidesPath = [.guide(g)] }
        switch name {
        case "steakhouses": open(.steakhouses)
        case "driveins": open(.driveIns)
        case "honors": open(.honors)
        case "oldest": open(.oldest)
        case "detail":
            open(.steakhouses)
            if let p = pick("Lydia's Supper Club", "Butte") ?? model.places.first {
                model.selectedPlace = p; model.guidesPath.append(.place(p))
            }
        case "map": model.tab = .map
        case "saved": model.tab = .saved
        case "about": model.tab = .about
        default: model.tab = .guides; model.selectedGuide = nil
        }
        // iPad shows the place column next to every list, so give each shot a place instead of "Pick a place": a different
        // honored or hand-checked one per shot.
        guard UIDevice.current.userInterfaceIdiom == .pad, model.selectedPlace == nil else { return }
        let place: Place? = switch name {
        case "home": pick("J.W. Heist Steakhouse", "Bozeman")
        case "steakhouses": pick("Lydia's Supper Club", "Butte")
        case "driveins": pick("Red Box Car", "Red Lodge")
        case "map": pick("J.W. Heist Steakhouse", "Bozeman")
        case "honors": pick("Wild Crumb", "Bozeman")
        case "oldest": pick("M&M Bar and Cafe", "Butte")
        case "saved": pick("Lydia's Supper Club", "Butte")
        case "about": nil
        default: pick("J.W. Heist Steakhouse", "Bozeman")
        }
        model.selectedPlace = place
    }
}
