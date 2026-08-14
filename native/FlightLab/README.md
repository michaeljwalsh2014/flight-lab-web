# Flight Lab for iPad

Flight Lab is a native iPad companion for measuring paper-airplane throws with ARKit. It starts empty, keeps separate averages for each plane, accepts photos from the camera or photo library, and offers simple design suggestions.

## Run it on an iPad

1. Install the current version of Xcode from the Mac App Store.
2. Open `FlightLab.xcodeproj`.
3. Select the **FlightLab** project, open **Signing & Capabilities**, and choose your Apple developer team.
4. Connect your iPad by cable, or enable wireless development in Xcode.
5. Choose the iPad as the run destination and press **Run**.
6. On first use, allow camera access.

AR measurement must be tested on a physical iPad. The Simulator can preview the screens but cannot supply real camera tracking.

## Best measuring results

- Throw the airplane, leave it where it lands, and return to the launch point.
- Aim at a well-lit, textured floor and move the iPad slowly until the target turns green.
- Mark the launch point, walk to the airplane while keeping the floor visible, then mark the landing point.
- Measure from the same launch line for every test. Three or more throws make the average more useful.

The measurement is computed from ARKit's world tracking and shown in feet and inches. It is intended for paper-airplane experiments, not surveying or safety-critical measurements.
