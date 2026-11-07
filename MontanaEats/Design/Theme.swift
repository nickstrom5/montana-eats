import SwiftUI
import UIKit
import CoreText

/// Montana palette, a landscape one (provisional, 2026-11-06; Nick decides, playbook/05-naming.md), light only, from
/// state-prompts/MONTANA_PROMPT.md (fans split between the Grizzlies and the Bobcats, so no team colors): Yogo sapphire #23408E (8.6:1 on
/// cream) for titles, tint and accents; Butte copper #A0522D (white on it 5.8:1) for the hand-checked guide cards; Glacier teal #0B6E75
/// (white on it 6.0:1) for honors chips; bitterroot pink #E8A3B5 (the state flower) only as a fill under sapphire text; cream #F7F3EA
/// pages. The names `green`/`gold` are kept from Wisconsin Eats so the shared views read the same; here `green` is sapphire and `gold`
/// is copper.
enum Theme {
    static let green = Color(hex: 0x23408E)      // Yogo sapphire: titles, tint, primary text accents
    static let green2 = Color(hex: 0x3D5BA8)
    static let gold = Color(hex: 0xA0522D)       // Butte copper: card fills under white text
    static let goldSoft = Color(hex: 0xF1DDD2)   // soft copper
    static let lime = Color(hex: 0xE8A3B5)       // bitterroot pink, fills only (hand-checked pins, the title shadow), under sapphire text
    static let limeSoft = Color(hex: 0xF8E3E9)
    static let sand = Color(hex: 0xF7F3EA)       // the Home background, cream
    static let red = Color(hex: 0x0B6E75)        // honors chips, Glacier teal
    static let sandstone = Color(hex: 0x7A3E22)  // a darker copper (8.4:1 on white)
    static let teal = Color(hex: 0x2F4A3A)       // ponderosa pine (10.0:1 on white)
    static let ink = Color(hex: 0x1A1A1A)
    static let ink2 = Color(hex: 0x2E3440)
    static let muted = Color(hex: 0x5B6270)
    static let surface = Color.white
    static let surface2 = Color(hex: 0xF1EEE6)
    static let surface3 = Color(hex: 0xE4DFD3)
    static let rule = Color(hex: 0xE4DFD3)
    static let rule2 = Color(hex: 0xCCC4B3)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// A small uppercase label: "STONE CRAB", "1 MICHELIN STAR".
struct Chip: View {
    enum Style { case gold, green, red, plain, dashed }
    let text: String
    var style: Style = .plain

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(0.4)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .foregroundStyle(style == .green || style == .red ? Color.white : style == .dashed ? Theme.muted : style == .gold ? Theme.ink : Theme.green)
            .background {
                RoundedRectangle(cornerRadius: 5).fill(style == .gold ? Theme.goldSoft : style == .green ? Theme.green : style == .red ? Theme.red
                                                       : style == .dashed ? .clear : Theme.surface2)
            }
            .overlay {
                if style == .dashed { RoundedRectangle(cornerRadius: 5).strokeBorder(Theme.rule2, style: StrokeStyle(lineWidth: 1, dash: [3, 2])) }
            }
            .accessibilityLabel(text)
    }
}

/// Treasure State Eats' lettering: the system face drawn compressed and heavy for titles and guide names (like a show poster), and the
/// system monospaced face for numbers, dates and small labels. No bundled fonts.
struct DisplayFont: ViewModifier {
    let size: CGFloat
    var weight: Font.Weight = .black
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    func body(content: Content) -> some View {
        content.font(.system(size: size * min(scale, 1.6), weight: weight).width(.compressed))
    }
}

/// Numbers, dates and small labels in the system monospaced face, scaled like DisplayFont.
struct MonoFont: ViewModifier {
    let size: CGFloat
    var weight: Font.Weight = .semibold
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    func body(content: Content) -> some View {
        content.font(.system(size: size * min(scale, 1.6), weight: weight, design: .monospaced))
    }
}

extension View {
    func displayFont(_ size: CGFloat, weight: Font.Weight = .black) -> some View {
        modifier(DisplayFont(size: size, weight: weight))
    }

    func monoFont(_ size: CGFloat, weight: Font.Weight = .semibold) -> some View {
        modifier(MonoFont(size: size, weight: weight))
    }
}

/// The header band: the Rocky Mountain Front, jagged peaks on the west falling to the plains on the east, in sapphire over a copper
/// baseline, under a wide pale sky. No state seal and no flag.
struct Stripes: View {
    var height: CGFloat = 6

    /// (x, rise) along the Front: 0 is the baseline, 1 the band's top
    static let front: [(CGFloat, CGFloat)] = [(0, 0.40), (0.06, 0.78), (0.10, 0.55), (0.15, 0.95), (0.20, 0.62), (0.26, 1.0), (0.31, 0.70),
                                              (0.36, 0.88), (0.42, 0.50), (0.50, 0.32), (0.62, 0.18), (0.78, 0.10), (1, 0.06)]

    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height, base = h * 0.78
            var p = Path()
            p.move(to: CGPoint(x: 0, y: base))
            for (x, rise) in Self.front { p.addLine(to: CGPoint(x: x * w, y: base - base * rise)) }
            p.addLine(to: CGPoint(x: w, y: base)); p.closeSubpath()
            ctx.fill(p, with: .color(Theme.green))
            ctx.fill(Path(CGRect(x: 0, y: base, width: w, height: h - base)), with: .color(Theme.gold))
        }
        .frame(height: height * 2.4)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .accessibilityHidden(true)
    }
}

extension View {
    /// An inline navigation title in the display type. UINavigationBar.appearance() didn't reach every SwiftUI bar on iOS 27
    /// (the Map title went from compressed blue to plain black after a push and pop; place titles were always plain), so the
    /// title is our own view in the bar. The navigation title is still set, for the back button and VoiceOver.
    func inlineTitle(_ title: String) -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title).displayFont(19, weight: .heavy).foregroundStyle(Theme.green)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .accessibilityAddTraits(.isHeader)
                }
            }
    }
}
