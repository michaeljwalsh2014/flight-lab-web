import SwiftUI
import WebKit

/// Keeps the current Flight Lab tools available alongside the native offline tools.
/// WebKit's persistent store retains this app's login and browser-local history.
@MainActor
final class FlightLabBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    static let home = URL(string: "https://flight-lab-airplane.mikewalsh3119.chatgpt.site")!
    let webView: WKWebView
    @Published var loading = true
    @Published var errorMessage: String?
    @Published var canGoBack = false
    @Published var canGoForward = false
    private var observations: [NSKeyValueObservation] = []

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = false
        observations = [
            webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoBack = view.canGoBack }
            },
            webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoForward = view.canGoForward }
            }
        ]
        webView.load(URLRequest(url: Self.home))
    }

    func retry() {
        errorMessage = nil
        loading = true
        if webView.url == nil { webView.load(URLRequest(url: Self.home)) }
        else { webView.reload() }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loading = true
        errorMessage = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        show(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        show(error)
    }

    private func show(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        loading = false
        errorMessage = "Flight Lab could not connect. Check your internet connection and try again. Your saved data is still on this device."
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loading = false
        errorMessage = "Flight Lab needs to reload. Your saved data has not been cleared."
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        // Local media previews are legitimate parts of the photo/video tools.
        if ["blob", "about", "data"].contains(url.scheme ?? "") {
            decisionHandler(.allow)
            return
        }
        let host = url.host?.lowercased() ?? ""
        let isAppOrSignIn = host == Self.home.host || host == "chatgpt.com"
            || host.hasSuffix(".chatgpt.com") || host == "auth.openai.com"
            || host == "auth0.openai.com" || host == "auth.openai.com"
        if url.scheme == "https" && isAppOrSignIn {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated,
               ["https", "http", "mailto", "tel"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Route new-window links through the same navigation policy.
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }
}

struct FlightLabWebView: View {
    @StateObject private var browser = FlightLabBrowser()

    var body: some View {
        NavigationStack {
            ZStack {
                FlightLabWebSurface(browser: browser)
                if let message = browser.errorMessage {
                    ContentUnavailableView {
                        Label("Unable to load Flight Lab", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(message + " You can also use Offline Planes, Measure, and Offline Scan without a connection.")
                    } actions: {
                        Button("Try Again") { browser.retry() }
                            .buttonStyle(.borderedProminent)
                    }
                    .background(FlightTheme.paper)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if browser.loading {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Opening Flight Lab…").font(.footnote)
                        Spacer()
                    }
                    .padding(10)
                    .background(.regularMaterial)
                    .accessibilityElement(children: .combine)
                }
            }
            .navigationTitle("Flight Lab")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left") }
                        .disabled(!browser.canGoBack)
                        .accessibilityLabel("Back")
                    Button { browser.webView.goForward() } label: { Image(systemName: "chevron.right") }
                        .disabled(!browser.canGoForward)
                        .accessibilityLabel("Forward")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { browser.retry() } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Reload Flight Lab")
                }
            }
        }
    }
}

private struct FlightLabWebSurface: UIViewRepresentable {
    let browser: FlightLabBrowser
    func makeUIView(context: Context) -> WKWebView { browser.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
