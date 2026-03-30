import MapKit
import UIKit

/// Custom renderer that colors polylines based on which users walked the street.
class StreetPolylineRenderer: MKPolylineRenderer {
    enum WalkState {
        case unwalked
        case walkedByMe
        case walkedByFriend(color: UIColor)
        case walkedByBoth(myColor: UIColor, friendColor: UIColor)
    }

    var walkState: WalkState = .unwalked {
        didSet { setNeedsDisplay() }
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        switch walkState {
        case .unwalked:
            strokeColor = UIColor.systemGray4
            lineWidth = 2
            alpha = 0.5
        case .walkedByMe:
            strokeColor = UIColor.systemGreen
            lineWidth = 4
            alpha = 0.9
        case .walkedByFriend(let color):
            strokeColor = color
            lineWidth = 4
            alpha = 0.85
        case .walkedByBoth(let myColor, let friendColor):
            // Draw two parallel lines
            drawDualLine(myColor: myColor, friendColor: friendColor,
                         mapRect: mapRect, zoomScale: zoomScale, in: context)
            return
        }
        super.draw(mapRect, zoomScale: zoomScale, in: context)
    }

    private func drawDualLine(myColor: UIColor, friendColor: UIColor,
                               mapRect: MKMapRect, zoomScale: MKZoomScale,
                               in context: CGContext) {
        // Save state and draw two offset strokes
        context.saveGState()

        let path = self.path
        context.addPath(path!)
        context.setLineWidth(2.5 / zoomScale)
        context.setStrokeColor(myColor.cgColor)
        context.setAlpha(0.9)
        context.translateBy(x: 2 / zoomScale, y: -2 / zoomScale)
        context.strokePath()

        context.addPath(path!)
        context.setLineWidth(2.5 / zoomScale)
        context.setStrokeColor(friendColor.cgColor)
        context.setAlpha(0.85)
        context.translateBy(x: -4 / zoomScale, y: 4 / zoomScale)
        context.strokePath()

        context.restoreGState()
    }
}
