import AppKit

// Original Relay vector mark. Regeneration only; the app build uses checked-in PNGs.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let teal = NSColor(srgbRed: 40/255, green: 92/255, blue: 80/255, alpha: 1).cgColor
let paper = NSColor(srgbRed: 247/255, green: 245/255, blue: 239/255, alpha: 1).cgColor
let bars = [CGRect(x: 340, y: 230, width: 100, height: 420), CGRect(x: 560, y: 370, width: 100, height: 420)]
func png(_ file: String, size: Int, background: Bool, rounded: Bool) throws {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
        bytesPerRow: size * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.scaleBy(x: CGFloat(size)/1024, y: CGFloat(size)/1024)
    context.translateBy(x: 0, y: 1024)
    context.scaleBy(x: 1, y: -1)
    if background {
        context.setFillColor(teal)
        context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 1024, height: 1024),
            cornerWidth: rounded ? 260 : 0, cornerHeight: rounded ? 260 : 0, transform: nil))
        context.fillPath()
    }
    context.setFillColor(paper)
    for rect in bars {
        context.addPath(CGPath(roundedRect: rect, cornerWidth: 50, cornerHeight: 50, transform: nil))
        context.fillPath()
    }
    let rep = NSBitmapImageRep(cgImage: context.makeImage()!)
    try rep.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent("assets/" + file))
}
try png("icon.png", size: 1024, background: true, rounded: false)
try png("adaptive-icon.png", size: 1024, background: false, rounded: false)
try png("splash-icon.png", size: 1024, background: true, rounded: true)
try png("favicon.png", size: 64, background: true, rounded: true)
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="260" fill="#285C50"/>
  <g fill="#F7F5EF">
    <rect x="340" y="230" width="100" height="420" rx="50"/>
    <rect x="560" y="370" width="100" height="420" rx="50"/>
  </g>
</svg>
"""
try (svg + "\n").write(to: root.appendingPathComponent("assets/relay-mark.svg"), atomically: true, encoding: .utf8)
