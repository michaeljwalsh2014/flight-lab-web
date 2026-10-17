# Flight Lab for iPhone and iPad

Native iOS/iPadOS project for iOS 17 and later. Payments are paused.

## Included

- **Flight Lab:** the current hosted website inside a persistent WebKit workspace, with native back/forward navigation, reload, loading feedback, and connection recovery. Camera and photo inputs use the website's existing workflows. External links open in the system browser.
- **Offline Planes:** native local plane records and per-plane throw averages.
- **Measure:** native ARKit launch-to-landing measurement, with manual entry on devices without AR support.
- **Offline Scan:** native camera/photo-library analysis.
- Universal iPhone and iPad device support and orientation declarations.

The app's WebKit storage persists between launches but is separate from Safari storage. Native offline records retain the existing `flight-lab-native-data-v1` key and schema. The native records and web records are separate; there is no automatic synchronization or Safari migration. Do not clear either store to resolve a connection error.

## Run

1. Open Xcode and review/accept its license agreement and finish any first-run component installation. This requires the Mac owner's action.
2. Open `FlightLab.xcodeproj` and select the **FlightLab** scheme.
3. For a Simulator, choose an iPhone or iPad destination and Run.
4. For your own device, select your development team in **Signing & Capabilities**, use a bundle identifier registered to that team, connect the device, then Run.
5. Allow camera access when testing AR measurement or taking photos. Allow location/motion only when selecting those website measurement methods.

Command-line Simulator build, after Xcode setup:

```sh
xcodebuild -project native/FlightLab/FlightLab.xcodeproj \
  -scheme FlightLab -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/flightlab-ios-build CODE_SIGNING_ALLOWED=NO build
```

## Verification before TestFlight

- Build and run on both iPhone and iPad, including portrait and landscape.
- Verify the hosted workspace, login and callback redirects, Coach, quick inspection, six-photo inspection, video capture/upload, downloads/backups, and motion/GPS permissions on a real device. Embedded sign-in providers may require a dedicated authentication-session integration; do not consider account access verified until tested.
- Add an offline plane, log a manual throw, relaunch, and confirm records remain. Test AR tracking on a physical device; Simulator cannot validate it.
- Test camera denial and recovery, offline launch, retry, background/resume, and external links.
- Check that switching tabs retains web navigation and stored records.
- Complete app privacy disclosures, privacy policy/support URLs, signing, accessibility/device testing, and App Store review preparation. This project is not yet a verified App Store release.

TestFlight/App Store distribution requires Apple Developer Program membership; installing Xcode alone is not membership. Once enrolled, choose the team, archive for a generic iOS device, and upload through Xcode Organizer. Review Apple's current payment requirements before reintroducing subscriptions.
