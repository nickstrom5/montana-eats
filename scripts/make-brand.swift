// Treasure State Eats brand (provisional, 2026-11-06; Nick picks the name, icon and palette): the app icon is concept B of
// scripts/icon-concepts.swift, a ribeye with grill marks, on Glacier teal; the shared Eats Ranked icon style, state-prompts/ICON-STYLE.md,
// no backing shape (concept A, a huckleberry shake, would echo Wyoming Eats' soda-fountain shake). No state seal or flag, no team marks.
// Usage, from mt-eats/: swift scripts/make-brand.swift   -> MontanaEats/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png,
// docs/ favicons and touch icons, docs/og.png. scripts/make-site.py draws the same mark as its inline SVG: change both together.
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}

let TEAL: UInt32 = 0x0B6E75, SAPPHIRE: UInt32 = 0x23408E, CREAMBG: UInt32 = 0xF7F3EA, COPPER: UInt32 = 0xA0522D, PINK: UInt32 = 0xE8A3B5
let STEAK: UInt32 = 0x8C3A2B, STEAKTOP: UInt32 = 0xA95441, FAT: UInt32 = 0xF1DCC4, MARK: UInt32 = 0x4A1E16

/// The ribeye (concept B of icon-concepts.swift; keep the two identical), top view: the steak, its fat cap, grill marks.
func ribeye(_ c: CGContext, _ s: CGFloat) {
    c.setFillColor(rgb(FAT)); c.fillEllipse(in: CGRect(x: 0.14 * s, y: 0.30 * s, width: 0.72 * s, height: 0.40 * s))
    c.setFillColor(rgb(STEAK)); c.fillEllipse(in: CGRect(x: 0.18 * s, y: 0.32 * s, width: 0.64 * s, height: 0.34 * s))
    c.setFillColor(rgb(STEAKTOP)); c.fillEllipse(in: CGRect(x: 0.26 * s, y: 0.44 * s, width: 0.48 * s, height: 0.16 * s))
    c.setStrokeColor(rgb(MARK)); c.setLineWidth(0.03 * s); c.setLineCap(.round)
    for x in [0.34, 0.46, 0.58] as [CGFloat] {
        c.move(to: CGPoint(x: x * s, y: 0.38 * s)); c.addLine(to: CGPoint(x: (x + 0.08) * s, y: 0.60 * s)); c.strokePath()
    }
}


func render(_ n: Int, _ path: String, background: Bool) {
    let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: background ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setShouldAntialias(true)
    if background { ctx.setFillColor(rgb(TEAL)); ctx.fill(CGRect(x: 0, y: 0, width: n, height: n)) }
    ribeye(ctx, CGFloat(n))
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(d) else { fatalError("could not write \(path)") }
    print("wrote", path)
}
render(1024, "MontanaEats/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png", background: true)
try? FileManager.default.createDirectory(atPath: "docs", withIntermediateDirectories: true)
for (n, name) in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")] {
    render(n, "docs/" + name, background: true)
}

/// The share image (1200 x 630): Glacier teal, the steak at the left, the name and tagline at the right, and the app's header band along
/// the bottom: the Rocky Mountain Front in sapphire over a copper baseline, on cream (Theme.swift's Stripes).
func og(_ path: String) {
    let W = 1200, H = 630
    let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.setFillColor(rgb(TEAL)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let band: CGFloat = 70, base: CGFloat = 14
    ctx.setFillColor(rgb(CREAMBG)); ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: band))
    let front: [(CGFloat, CGFloat)] = [(0, 0.40), (0.06, 0.78), (0.10, 0.55), (0.15, 0.95), (0.20, 0.62), (0.26, 1.0), (0.31, 0.70),
                                       (0.36, 0.88), (0.42, 0.50), (0.50, 0.32), (0.62, 0.18), (0.78, 0.10), (1, 0.06)]
    let fp = CGMutablePath(); fp.move(to: CGPoint(x: 0, y: base))
    for (x, r) in front { fp.addLine(to: CGPoint(x: x * CGFloat(W), y: base + (band - base) * r)) }
    fp.addLine(to: CGPoint(x: CGFloat(W), y: base)); fp.closeSubpath()
    ctx.setFillColor(rgb(SAPPHIRE)); ctx.addPath(fp); ctx.fillPath()
    ctx.setFillColor(rgb(COPPER)); ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: base))
    ctx.saveGState(); ctx.translateBy(x: 40, y: 90); ribeye(ctx, 500); ctx.restoreGState()
    let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = ns
    let title = NSFont(name: "AvenirNextCondensed-Heavy", size: 80) ?? NSFont.boldSystemFont(ofSize: 70)
    let sub = NSFont(name: "AvenirNextCondensed-DemiBold", size: 34) ?? NSFont.boldSystemFont(ofSize: 30)
    NSAttributedString(string: "TREASURE STATE", attributes: [.font: title, .foregroundColor: NSColor.white]).draw(at: NSPoint(x: 560, y: 380))
    NSAttributedString(string: "EATS", attributes: [.font: title, .foregroundColor: NSColor.white]).draw(at: NSPoint(x: 560, y: 296))
    NSAttributedString(string: "STEAKHOUSES, DRIVE-INS & MORE", attributes: [.font: sub, .foregroundColor: NSColor(srgbRed: 0.910, green: 0.639, blue: 0.710, alpha: 1)]).draw(at: NSPoint(x: 564, y: 246))
    NSGraphicsContext.restoreGraphicsState()
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(d) else { fatalError("could not write \(path)") }
    print("wrote", path)
}
og("docs/og.png")
