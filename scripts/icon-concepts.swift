// Treasure State Eats icon concepts (2026-11-06), drawn in the shared Eats Ranked style (state-prompts/ICON-STYLE.md): one flat, level,
// centred food on a plain background in the state's colours (the palette in Design/Theme.swift), no backing shape, no text or texture,
// no state seal or flag, no team marks, and distinct from Idaho Eats' huckleberry cluster.
//   A  a huckleberry milkshake in a soda glass with whipped cream and two berries, on Yogo sapphire #23408E: shake #6B3FA0 with a lighter
//      top #8E63C2, glass rim #DCE6F2, cream #F7F3EA, berries #3B2470
//   B  a ribeye steak with grill marks, top view, on Glacier teal #0B6E75: steak #8C3A2B with a lighter top #A95441, fat cap #F1DCC4,
//      grill marks #4A1E16
//   C  a Butte pasty (a crimped half-moon pastry), side view, on Butte copper #A0522D: pastry #E2B867 with a lighter top #F0D08F, crimp #C8963F
// Usage, from mt-eats/: swift scripts/icon-concepts.swift <out dir>   -> concept-{a,b,c}-1024.png
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
let SAPPHIRE: UInt32 = 0x23408E, TEAL: UInt32 = 0x0B6E75, COPPER: UInt32 = 0xA0522D
let SHAKE: UInt32 = 0x6B3FA0, SHAKETOP: UInt32 = 0x8E63C2, RIM: UInt32 = 0xDCE6F2, CREAM: UInt32 = 0xF7F3EA, BERRY: UInt32 = 0x3B2470
let STEAK: UInt32 = 0x8C3A2B, STEAKTOP: UInt32 = 0xA95441, FAT: UInt32 = 0xF1DCC4, MARK: UInt32 = 0x4A1E16
let PASTRY: UInt32 = 0xE2B867, PASTRYTOP: UInt32 = 0xF0D08F, CRIMP: UInt32 = 0xC8963F

/// A: the huckleberry milkshake. CoreGraphics y-up, s = canvas size. Identical to make-brand.swift's shake().
func shake(_ c: CGContext, _ s: CGFloat) {
    func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
    c.saveGState(); defer { c.restoreGState() }
    c.translateBy(x: s / 2, y: s / 2 - 0.012 * s); c.scaleBy(x: 1.04, y: 1.04); c.translateBy(x: -s / 2, y: -s / 2)   // size band, mass a little low
    // the glass: a tapered soda glass, the shake filling it, a short foot
    let glass = CGMutablePath()
    glass.move(to: P(0.33, 0.66)); glass.addLine(to: P(0.67, 0.66)); glass.addLine(to: P(0.60, 0.24)); glass.addLine(to: P(0.40, 0.24)); glass.closeSubpath()
    c.setFillColor(rgb(SHAKE)); c.addPath(glass); c.fillPath()
    let top = CGMutablePath()
    top.move(to: P(0.355, 0.64)); top.addLine(to: P(0.645, 0.64)); top.addLine(to: P(0.635, 0.58)); top.addLine(to: P(0.365, 0.58)); top.closeSubpath()
    c.setFillColor(rgb(SHAKETOP)); c.addPath(top); c.fillPath()
    c.setFillColor(rgb(RIM)); c.fill(CGRect(x: 0.42 * s, y: 0.17 * s, width: 0.16 * s, height: 0.07 * s))
    // whipped cream, three puffs, and two berries on top
    c.setFillColor(rgb(CREAM))
    for (x, y, r) in [(0.40, 0.69, 0.065), (0.50, 0.72, 0.08), (0.60, 0.69, 0.065)] as [(CGFloat, CGFloat, CGFloat)] {
        c.fillEllipse(in: CGRect(x: (x - r) * s, y: (y - r) * s, width: 2 * r * s, height: 2 * r * s))
    }
    c.setFillColor(rgb(BERRY))
    for (x, y) in [(0.47, 0.80), (0.555, 0.795)] as [(CGFloat, CGFloat)] {
        c.fillEllipse(in: CGRect(x: (x - 0.035) * s, y: (y - 0.035) * s, width: 0.07 * s, height: 0.07 * s))
    }
}

/// B: a ribeye, top view: the steak, its fat cap, grill marks.
func ribeye(_ c: CGContext, _ s: CGFloat) {
    c.setFillColor(rgb(FAT)); c.fillEllipse(in: CGRect(x: 0.14 * s, y: 0.30 * s, width: 0.72 * s, height: 0.40 * s))
    c.setFillColor(rgb(STEAK)); c.fillEllipse(in: CGRect(x: 0.18 * s, y: 0.32 * s, width: 0.64 * s, height: 0.34 * s))
    c.setFillColor(rgb(STEAKTOP)); c.fillEllipse(in: CGRect(x: 0.26 * s, y: 0.44 * s, width: 0.48 * s, height: 0.16 * s))
    c.setStrokeColor(rgb(MARK)); c.setLineWidth(0.03 * s); c.setLineCap(.round)
    for x in [0.34, 0.46, 0.58] as [CGFloat] {
        c.move(to: CGPoint(x: x * s, y: 0.38 * s)); c.addLine(to: CGPoint(x: (x + 0.08) * s, y: 0.60 * s)); c.strokePath()
    }
}

/// C: a pasty, side view: a half-moon of pastry with its lighter top and a crimped edge along the curve.
func pasty(_ c: CGContext, _ s: CGFloat) {
    let body = CGMutablePath()
    body.move(to: CGPoint(x: 0.14 * s, y: 0.34 * s))
    body.addLine(to: CGPoint(x: 0.86 * s, y: 0.34 * s))
    body.addCurve(to: CGPoint(x: 0.14 * s, y: 0.34 * s), control1: CGPoint(x: 0.84 * s, y: 0.80 * s), control2: CGPoint(x: 0.16 * s, y: 0.80 * s))
    c.setFillColor(rgb(PASTRY)); c.addPath(body); c.fillPath()
    let top = CGMutablePath()
    top.move(to: CGPoint(x: 0.30 * s, y: 0.52 * s))
    top.addCurve(to: CGPoint(x: 0.70 * s, y: 0.52 * s), control1: CGPoint(x: 0.36 * s, y: 0.66 * s), control2: CGPoint(x: 0.64 * s, y: 0.66 * s))
    top.addCurve(to: CGPoint(x: 0.30 * s, y: 0.52 * s), control1: CGPoint(x: 0.62 * s, y: 0.58 * s), control2: CGPoint(x: 0.38 * s, y: 0.58 * s))
    c.setFillColor(rgb(PASTRYTOP)); c.addPath(top); c.fillPath()
    c.setFillColor(rgb(CRIMP))
    for i in 0..<9 {
        let t = CGFloat(i) / 8, x = 0.20 + 0.60 * t, y = 0.34 + 0.29 * sin(t * .pi)
        c.fillEllipse(in: CGRect(x: (x - 0.03) * s, y: (y - 0.02) * s, width: 0.06 * s, height: 0.04 * s))
    }
}

func render(_ n: Int, _ bg: UInt32, _ path: String, _ draw: (CGContext, CGFloat) -> Void) {
    let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.setFillColor(rgb(bg)); ctx.fill(CGRect(x: 0, y: 0, width: n, height: n))
    draw(ctx, CGFloat(n))
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(d) else { fatalError("could not write \(path)") }
    print("wrote", path)
}
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "playbook/brand"
render(1024, SAPPHIRE, out + "/concept-a-1024.png", shake)
render(1024, TEAL, out + "/concept-b-1024.png", ribeye)
render(1024, COPPER, out + "/concept-c-1024.png", pasty)
